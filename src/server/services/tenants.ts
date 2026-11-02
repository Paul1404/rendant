import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { type ClubRole, normalizeRolePolicy } from "@/lib/permissions";
import { auth } from "@/server/auth";
import { globalDb } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { appSettings, helperHourCategories } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import {
	isOperatorHost,
	platformAdminEmailAllowed,
} from "@/server/operator-host";
import { requireTenant, SVU_TENANT_ID } from "@/server/tenant-context";
import {
	TenantHostnameError,
	tenantSlugForHost,
} from "@/server/tenant-hostname";
import { type RecordAuditInput, recordAuditEventStrict } from "./audit";
import {
	assertActiveRoleManager,
	assertCanDelegateRoleInTransaction,
	assertTenantPermissionsInTransaction,
	getTenantRolePermissions,
} from "./role-policy";

export { SVU_TENANT_ID } from "@/server/tenant-context";
export const TENANT_COOKIE = "rendant-tenant";
export const TENANT_HEADER = "x-rendant-tenant";

export type TenantMembership = {
	id: string;
	slug: string;
	name: string;
	role: ClubRole;
};

export class TenantAccessError extends ORPCError<"FORBIDDEN", undefined> {
	constructor() {
		super("FORBIDDEN", {
			message: "Für diesen Verein besteht keine Zugriffsberechtigung",
		});
		this.name = "TenantAccessError";
	}
}

export function requestedTenant(headers: Headers): string | null {
	const explicit = headers.get(TENANT_HEADER);
	if (explicit !== null) return explicit.trim();
	const cookie = headers
		.get("cookie")
		?.split(";")
		.find((part) => part.trim().startsWith(`${TENANT_COOKIE}=`));
	if (!cookie) return null;
	try {
		return decodeURIComponent(cookie.trim().slice(TENANT_COOKIE.length + 1));
	} catch {
		throw new TenantAccessError();
	}
}

export async function listUserTenants(
	userId: string,
): Promise<TenantMembership[]> {
	return globalDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			name: tenants.name,
			role: memberships.role,
		})
		.from(memberships)
		.innerJoin(tenants, eq(tenants.id, memberships.tenant_id))
		.innerJoin(userTable, eq(userTable.id, memberships.user_id))
		.where(
			and(
				eq(memberships.user_id, userId),
				eq(memberships.banned, false),
				sql`${userTable.banned} is not true`,
			),
		)
		.orderBy(asc(tenants.name), asc(tenants.id));
}

export function selectTenant(
	available: TenantMembership[],
	requested: string | null,
): TenantMembership | null {
	if (requested !== null) {
		const selected = available.find(
			(tenant) => tenant.id === requested || tenant.slug === requested,
		);
		if (!selected) throw new TenantAccessError();
		return selected;
	}
	return (
		available.find((tenant) => tenant.id === SVU_TENANT_ID) ??
		available[0] ??
		null
	);
}

export async function resolveHostTenant(
	headers: Headers,
): Promise<{ id: string; slug: string; name: string } | null> {
	if (isOperatorHost(headers)) throw new TenantAccessError();
	let slug: string | null;
	try {
		slug = tenantSlugForHost(headers.get("host"));
	} catch (error) {
		if (error instanceof TenantHostnameError) throw new TenantAccessError();
		throw error;
	}
	if (slug === null) return null;
	const [tenant] = await globalDb
		.select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (!tenant) throw new TenantAccessError();
	return tenant;
}

export function selectTenantForHost(
	available: TenantMembership[],
	headers: Headers,
	hostTenant: { id: string; slug: string } | null,
): TenantMembership | null {
	if (!hostTenant) return selectTenant(available, requestedTenant(headers));
	// Host-bound clubs never follow another club's preference or tab selector.
	// A stale host-only cookie can be ignored; an explicit selector is a request
	// contract and must agree, including for users with access to both clubs.
	const explicit = headers.get(TENANT_HEADER);
	if (
		explicit !== null &&
		explicit !== hostTenant.id &&
		explicit !== hostTenant.slug
	)
		throw new TenantAccessError();
	return selectTenant(available, hostTenant.id);
}

export async function resolveTenantSession(headers: Headers) {
	const hostTenant = await resolveHostTenant(headers);
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!session?.user || (session.user as { banned?: boolean | null }).banned)
		return null;
	const tenant = selectTenantForHost(
		await listUserTenants(session.user.id),
		headers,
		hostTenant,
	);
	if (!tenant) return null;
	const permissions = await getTenantRolePermissions(tenant.id, tenant.role);
	const scopedTenant = { ...tenant, permissions };
	const user = { ...session.user, role: tenant.role, permissions };
	return { session: { ...session, user }, tenant: scopedTenant, user };
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
	const [member] = await globalDb
		.select({ role: memberships.role, email: userTable.email })
		.from(memberships)
		.innerJoin(userTable, eq(userTable.id, memberships.user_id))
		.where(
			and(
				eq(memberships.tenant_id, SVU_TENANT_ID),
				eq(memberships.user_id, userId),
				eq(memberships.role, "admin"),
				eq(memberships.banned, false),
				sql`${userTable.banned} is not true`,
			),
		)
		.limit(1);
	return Boolean(member && platformAdminEmailAllowed(member.email));
}

export type GlobalTransaction = Parameters<
	Parameters<typeof globalDb.transaction>[0]
>[0];

export async function assertPlatformAdminInTransaction(
	tx: GlobalTransaction,
	userId: string,
): Promise<void> {
	const [member] = await tx
		.select({ email: userTable.email })
		.from(memberships)
		.innerJoin(userTable, eq(userTable.id, memberships.user_id))
		.where(
			and(
				eq(memberships.tenant_id, SVU_TENANT_ID),
				eq(memberships.user_id, userId),
				eq(memberships.role, "admin"),
				eq(memberships.banned, false),
				sql`${userTable.banned} is not true`,
			),
		)
		.for("update");
	if (!member || !platformAdminEmailAllowed(member.email))
		throw new TenantAccessError();
}

export async function assertPlatformAdmin(userId: string): Promise<void> {
	if (!(await isPlatformAdmin(userId)))
		throw new ORPCError("FORBIDDEN", {
			message: "Nur die Betreiber können weitere Vereine anlegen",
		});
}

// Every club needs the contribution category. Departments are club-specific
// catalogue data and are created explicitly by its administrators.
const DEFAULT_CATEGORIES = [
	["gesamtverein", "Vereinsbeitrag", "verein"],
] as const;

export async function createTenant(opts: {
	name: string;
	slug: string;
	actor: NonNullable<RecordAuditInput["actor"]>;
	audit?: RecordAuditInput["request"];
	grantCreatorMembership?: boolean;
}): Promise<TenantMembership> {
	const name = opts.name.trim();
	const slug = opts.slug.trim().toLowerCase();
	if (
		name.length < 2 ||
		name.length > 120 ||
		!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug) ||
		slug === "admin"
	) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Bitte Vereinsnamen und eine gültige Kennung mit 3 bis 50 Zeichen angeben",
		});
	}
	const baseDomain = process.env.TENANT_BASE_DOMAIN?.trim();
	if (baseDomain && tenantSlugForHost(`${slug}.${baseDomain}`) !== slug) {
		throw new ORPCError("CONFLICT", {
			message:
				"Diese Vereinskennung ist bereits für eine andere Vereinsadresse reserviert",
		});
	}
	await assertPlatformAdmin(opts.actor.id);
	return globalDb.transaction(async (tx) => {
		await assertPlatformAdminInTransaction(tx, opts.actor.id);
		const id = randomUUID();
		const [created] = await tx
			.insert(tenants)
			.values({ id, name, slug })
			.onConflictDoNothing({ target: tenants.slug })
			.returning();
		if (!created)
			throw new ORPCError("CONFLICT", {
				message: "Diese Vereinskennung ist bereits vergeben",
			});
		await tx.execute(sql`select set_config('app.tenant_id', ${id}, true)`);
		if (opts.grantCreatorMembership !== false) {
			await tx
				.insert(memberships)
				.values({ tenant_id: id, user_id: opts.actor.id, role: "admin" });
		}
		await tx
			.insert(appSettings)
			.values({ tenant_id: id, id: 1, vereinsname: name });
		await tx.insert(helperHourCategories).values(
			DEFAULT_CATEGORIES.map(([code, label, art], sortierung) => ({
				tenant_id: id,
				code,
				label,
				art,
				sortierung,
				system: true,
			})),
		);
		await recordAuditEventStrict(tx, {
			category: "settings",
			action: "settings.tenant_created",
			actor: opts.actor,
			subject: { type: "tenant", id, label: name },
			request: opts.audit,
			metadata: { operator: opts.grantCreatorMembership === false },
		});
		return { id, slug, name, role: "admin" };
	});
}

export async function listTenantUsers() {
	const tenant = requireTenant();
	return globalDb
		.select({
			id: userTable.id,
			email: userTable.email,
			name: userTable.name,
			role: memberships.role,
			banned: sql<boolean>`${memberships.banned} OR ${userTable.banned} is true`,
			createdAt: memberships.created_at,
			notifyProtokoll: memberships.notify_protokoll,
		})
		.from(memberships)
		.innerJoin(userTable, eq(userTable.id, memberships.user_id))
		.where(eq(memberships.tenant_id, tenant.id))
		.orderBy(desc(memberships.created_at));
}

export async function changeTenantMember(opts: {
	id: string;
	role?: ClubRole;
	banned?: boolean;
	actor: NonNullable<RecordAuditInput["actor"]>;
	audit?: RecordAuditInput["request"];
	operatorTenant?: { id: string; slug: string; name: string };
}) {
	const tenant = opts.operatorTenant ?? requireTenant();
	if (!opts.operatorTenant && opts.role !== undefined)
		throw new TenantAccessError();
	if (opts.id === opts.actor.id && (opts.role !== undefined || opts.banned))
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Die eigene Admin-Rolle kann nicht entfernt und das eigene Konto nicht gesperrt werden",
		});
	return globalDb.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`rendant:tenant-admin:${tenant.id}`}, 0))`,
		);
		if (opts.operatorTenant) {
			await assertPlatformAdminInTransaction(tx, opts.actor.id);
		} else {
			await assertTenantPermissionsInTransaction(
				tx,
				tenant.id,
				opts.actor.id,
				"users.manage",
			);
		}

		const [target] = await tx
			.select({
				id: userTable.id,
				email: userTable.email,
				role: memberships.role,
				banned: memberships.banned,
				globalBanned: userTable.banned,
			})
			.from(memberships)
			.innerJoin(userTable, eq(userTable.id, memberships.user_id))
			.where(
				and(
					eq(memberships.tenant_id, tenant.id),
					eq(memberships.user_id, opts.id),
				),
			)
			.for("update");
		if (!target)
			throw new ORPCError("NOT_FOUND", { message: "Konto nicht gefunden" });
		if (!opts.operatorTenant) {
			const actualRole = await assertTenantPermissionsInTransaction(
				tx,
				tenant.id,
				opts.actor.id,
				"users.manage",
			);
			if (target.role === "admin" && actualRole !== "admin")
				throw new TenantAccessError();
			if (opts.banned === false && target.banned)
				await assertCanDelegateRoleInTransaction(
					tx,
					tenant.id,
					opts.actor.id,
					target.role,
					"users.manage",
				);
			if (opts.role !== undefined)
				await assertCanDelegateRoleInTransaction(
					tx,
					tenant.id,
					opts.actor.id,
					opts.role,
				);
		}
		if (
			target.role === "admin" &&
			!target.banned &&
			!target.globalBanned &&
			((opts.role !== undefined && opts.role !== "admin") || opts.banned)
		) {
			const [admins] = await tx
				.select({ count: sql<number>`count(*)` })
				.from(memberships)
				.innerJoin(userTable, eq(userTable.id, memberships.user_id))
				.where(
					and(
						eq(memberships.tenant_id, tenant.id),
						eq(memberships.role, "admin"),
						eq(memberships.banned, false),
						sql`${userTable.banned} is not true`,
					),
				);
			if (Number(admins?.count ?? 0) <= 1)
				throw new ORPCError("CONFLICT", {
					message:
						"Der letzte aktive Admin kann nicht herabgestuft oder gesperrt werden",
				});
		}
		// Operator eligibility is outside club RBAC. Protect it in both directions
		// so a club manager cannot disable the only operator or reactivate one.
		if (
			tenant.id === SVU_TENANT_ID &&
			platformAdminEmailAllowed(target.email) &&
			!opts.operatorTenant
		) {
			await assertPlatformAdminInTransaction(tx, opts.actor.id);
		}
		const legacyGlobalBanCleared =
			opts.banned === false && target.globalBanned === true;
		if (legacyGlobalBanCleared) {
			if (
				tenant.id !== SVU_TENANT_ID ||
				(!opts.operatorTenant &&
					(await assertTenantPermissionsInTransaction(
						tx,
						tenant.id,
						opts.actor.id,
						"users.manage",
					)) !== "admin")
			) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Dieses Konto ist vereinsübergreifend gesperrt. Bitte den Betreiber kontaktieren",
				});
			}
			// Historical bans were copied from SVU's global account records. Only
			// its administrators may clear that legacy flag. Retain the original
			// reason and expiry as historical metadata; new bans are membership-only.
			await tx
				.update(userTable)
				.set({ banned: false, updatedAt: new Date() })
				.where(eq(userTable.id, target.id));
		}
		await tx
			.update(memberships)
			.set({
				...(opts.role !== undefined ? { role: opts.role } : {}),
				...(opts.banned !== undefined ? { banned: opts.banned } : {}),
				updated_at: new Date(),
			})
			.where(
				and(
					eq(memberships.tenant_id, tenant.id),
					eq(memberships.user_id, opts.id),
				),
			);
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		const [policyRow] = await tx
			.select({ policy: tenants.role_permissions })
			.from(tenants)
			.where(eq(tenants.id, tenant.id));
		await assertActiveRoleManager(
			tx,
			tenant.id,
			normalizeRolePolicy(policyRow?.policy),
		);

		await recordAuditEventStrict(tx, {
			category: "users",
			action:
				opts.role !== undefined
					? "users.role_changed"
					: opts.banned
						? "users.blocked"
						: "users.unblocked",
			actor: opts.actor,
			subject: { type: "user", id: target.id, label: target.email },
			request: opts.audit,
			metadata: {
				role: opts.role ?? target.role,
				banned: opts.banned ?? target.banned,
				...(opts.operatorTenant ? { operator: true } : {}),
				...(legacyGlobalBanCleared
					? { legacy_global_ban_cleared: true, previous_global_banned: true }
					: {}),
			},
		});
		return {
			ok: true as const,
			role: opts.role ?? target.role,
			banned: opts.banned ?? target.banned,
		};
	});
}

export function setTenantUserRole(
	id: string,
	role: ClubRole,
	actor: NonNullable<RecordAuditInput["actor"]>,
	audit?: RecordAuditInput["request"],
) {
	return changeTenantMember({ id, role, actor, audit });
}

export function setTenantUserBanned(
	id: string,
	banned: boolean,
	actor: NonNullable<RecordAuditInput["actor"]>,
	audit?: RecordAuditInput["request"],
) {
	return changeTenantMember({ id, banned, actor, audit });
}
