import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import {
	CLUB_ROLES,
	type ClubRole,
	isClubRole,
	normalizeRolePolicy,
	PERMISSION_CATALOG,
	PERMISSION_KEYS,
	type Permission,
	PROTECTED_ADMIN_PERMISSIONS,
	type RolePolicy,
} from "@/lib/permissions";
import { globalDb } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { requireTenant } from "@/server/tenant-context";
import { type RecordAuditInput, recordAuditEventStrict } from "./audit";
import type { GlobalTransaction } from "./tenants";

function denied(): never {
	throw new ORPCError("FORBIDDEN", {
		message: "Für diese Aktion fehlt die Berechtigung",
	});
}
export async function getRolePolicy(tenantId: string, connection = globalDb) {
	const [row] = await connection
		.select({
			policy: tenants.role_permissions,
			version: tenants.role_permissions_version,
		})
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);
	if (!row)
		throw new ORPCError("NOT_FOUND", { message: "Verein nicht gefunden" });
	return {
		version: row.version,
		roles: normalizeRolePolicy(row.policy),
		permissions: PERMISSION_CATALOG,
		locked: {
			user: [] as Permission[],
			admin: PROTECTED_ADMIN_PERMISSIONS,
			board: [] as Permission[],
		},
	};
}
export async function getRolePolicyForCurrentTenant() {
	const tenant = requireTenant();
	const policy = await getRolePolicy(tenant.id);
	return {
		...policy,
		locked: {
			...policy.locked,
			admin:
				tenant.role === "admin"
					? PROTECTED_ADMIN_PERMISSIONS
					: [...PERMISSION_KEYS],
		},
		grantablePermissions:
			tenant.role === "admin"
				? [...PERMISSION_KEYS]
				: [...(tenant.permissions ?? [])],
	};
}
export async function getTenantRolePermissions(
	tenantId: string,
	role: ClubRole,
): Promise<Permission[]> {
	if (!isClubRole(role)) return [];
	return (await getRolePolicy(tenantId)).roles[role];
}
export async function assertTenantPermissionsInTransaction(
	tx: GlobalTransaction,
	tenantId: string,
	userId: string,
	...permissions: Permission[]
): Promise<ClubRole> {
	const [actor] = await tx
		.select({ role: memberships.role })
		.from(memberships)
		.innerJoin(user, eq(user.id, memberships.user_id))
		.where(
			and(
				eq(memberships.tenant_id, tenantId),
				eq(memberships.user_id, userId),
				eq(memberships.banned, false),
				sql`${user.banned} is not true`,
			),
		)
		.for("update", { of: memberships });
	if (!actor || !isClubRole(actor.role)) denied();
	const [club] = await tx
		.select({ policy: tenants.role_permissions })
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);
	if (
		!club ||
		!permissions.every((key) =>
			normalizeRolePolicy(club.policy)[actor.role].includes(key),
		)
	)
		denied();
	return actor.role;
}
export async function assertActiveRoleManager(
	tx: GlobalTransaction,
	tenantId: string,
	policy: RolePolicy,
) {
	const active = await tx
		.select({ role: memberships.role })
		.from(memberships)
		.innerJoin(user, eq(user.id, memberships.user_id))
		.where(
			and(
				eq(memberships.tenant_id, tenantId),
				eq(memberships.banned, false),
				sql`${user.banned} is not true`,
			),
		);
	if (
		!active.some(
			({ role }) =>
				isClubRole(role) &&
				policy[role].includes("roles.manage") &&
				policy[role].includes("users.manage"),
		)
	) {
		throw new ORPCError("CONFLICT", {
			message:
				"Mindestens eine aktive Person muss Benutzer und Rollen verwalten können",
		});
	}
}
export async function updateRolePolicy(
	input: { version: number; roles: RolePolicy },
	actor: NonNullable<RecordAuditInput["actor"]>,
	request?: RecordAuditInput["request"],
) {
	const tenant = requireTenant();
	for (const role of CLUB_ROLES) {
		const values = input.roles[role];
		if (
			!Array.isArray(values) ||
			values.some((key) => !PERMISSION_KEYS.includes(key))
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Bitte gültige Rollenberechtigungen angeben",
			});
		}
		for (const entry of PERMISSION_CATALOG) {
			if (
				values.includes(entry.key) &&
				entry.requires.some((key) => !values.includes(key))
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Für „${entry.label}“ fehlen erforderliche Leserechte`,
				});
			}
		}
	}
	if (
		PROTECTED_ADMIN_PERMISSIONS.some((key) => !input.roles.admin.includes(key))
	) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Admins behalten die Benutzer- und Rollenverwaltung als geschützten Zugang",
		});
	}
	const policy = normalizeRolePolicy(input.roles);
	await globalDb.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`rendant:tenant-admin:${tenant.id}`}, 0))`,
		);
		const actorRole = await assertTenantPermissionsInTransaction(
			tx,
			tenant.id,
			actor.id,
			"roles.manage",
		);
		const [current] = await tx
			.select()
			.from(tenants)
			.where(eq(tenants.id, tenant.id))
			.for("update");
		if (current.role_permissions_version !== input.version) {
			throw new ORPCError("CONFLICT", {
				message:
					"Die Rollen wurden inzwischen geändert. Bitte neu laden und erneut prüfen.",
			});
		}
		const previous = normalizeRolePolicy(current.role_permissions);
		if (actorRole !== "admin") {
			if (JSON.stringify(policy.admin) !== JSON.stringify(previous.admin))
				denied();
			for (const role of CLUB_ROLES) {
				if (
					policy[role].some(
						(key) =>
							!previous[role].includes(key) &&
							!previous[actorRole].includes(key),
					)
				)
					denied();
			}
		}
		await assertActiveRoleManager(tx, tenant.id, policy);
		await tx
			.update(tenants)
			.set({
				role_permissions: policy,
				role_permissions_version: current.role_permissions_version + 1,
			})
			.where(eq(tenants.id, tenant.id));
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		await recordAuditEventStrict(tx, {
			category: "users",
			action: "users.role_permissions_updated",
			actor,
			request,
			subject: { type: "tenant", id: tenant.id, label: tenant.name },
			metadata: {
				previous: normalizeRolePolicy(current.role_permissions),
				current: policy,
				version: current.role_permissions_version + 1,
			},
		});
	});
	return getRolePolicyForCurrentTenant();
}

export async function assertCanDelegateRoleInTransaction(
	tx: GlobalTransaction,
	tenantId: string,
	userId: string,
	targetRole: ClubRole,
	requiredPermission: "roles.manage" | "users.manage" = "roles.manage",
) {
	const actorRole = await assertTenantPermissionsInTransaction(
		tx,
		tenantId,
		userId,
		requiredPermission,
	);
	if (actorRole === "admin") return;
	if (targetRole === "admin") denied();
	const [row] = await tx
		.select({ policy: tenants.role_permissions })
		.from(tenants)
		.where(eq(tenants.id, tenantId));
	const policy = normalizeRolePolicy(row?.policy);
	if (policy[targetRole].some((key) => !policy[actorRole].includes(key)))
		denied();
}
