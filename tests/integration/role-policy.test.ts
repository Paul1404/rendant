import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_ROLE_PERMISSIONS,
	PERMISSION_KEYS,
	type Permission,
	type RolePolicy,
} from "@/lib/permissions";
import { auth } from "@/server/auth";
import { db, globalDb, pool } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { appSettings, invitations } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import { acceptInvite, createInvite } from "@/server/services/invitations";
import {
	assertTenantPermissionsInTransaction,
	getRolePolicy,
	getTenantRolePermissions,
	updateRolePolicy,
} from "@/server/services/role-policy";
import {
	isPlatformAdmin,
	resolveTenantSession,
	setTenantUserRole,
	setTenantUserBanned,
} from "@/server/services/tenants";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const password = "synthetic-role-policy-password";
const legacyUserGrants: Permission[] = [
	"finance.read",
	"protocols.create",
	"exports.download",
	"helpers.read",
	"helpers.write",
];
const cloneDefaults = (): RolePolicy =>
	structuredClone(DEFAULT_ROLE_PERMISSIONS);

async function fixture() {
	const run = randomUUID();
	const club = {
		id: randomUUID(),
		slug: `roles-${run}`,
		name: "Synthetischer Rollenverein",
	};
	const other = {
		id: randomUUID(),
		slug: `other-roles-${run}`,
		name: "Anderer Rollenverein",
	};
	await globalDb.insert(tenants).values([club, other]);
	const people = await Promise.all(
		(["admin", "board", "user"] as const).map(async (role) => {
			const email = `${role}-${run}@example.invalid`;
			const name = `Synthetische Rolle ${role}`;
			const identity = await ensureCredentialUser({
				email,
				name,
				password,
				role: "user",
			});
			return { id: identity.id, email, name, role };
		}),
	);
	const [admin, board, member] = people;
	for (const target of [club, other]) {
		await globalDb.insert(memberships).values(
			people.map((person) => ({
				tenant_id: target.id,
				user_id: person.id,
				role: person.role,
			})),
		);
		await withTenant(target, () =>
			db
				.insert(appSettings)
				.values({ tenant_id: target.id, id: 1, vereinsname: target.name }),
		);
	}
	return { club, other, admin, board, member };
}

async function cookieFor(email: string) {
	const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
	const response = await auth.handler(
		new Request(`${base}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: base },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(response.status).toBe(200);
	return response.headers
		.getSetCookie()
		.map((part) => part.split(";")[0])
		.join("; ");
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error("Role policy requires an isolated test database");
	const database = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (!database.rows[0]?.name.endsWith("_test"))
		throw new Error("Role policy refuses a database without _test suffix");
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", "");
});
afterAll(async () => {
	vi.unstubAllEnvs();
	await pool.end();
});

describe("club role policy under PostgreSQL authorization", () => {
	it("preserves legacy user grants and gives Board full club access without operator access", async () => {
		const { club, board } = await fixture();
		expect(await getTenantRolePermissions(club.id, "user")).toEqual(
			legacyUserGrants,
		);
		expect(await getTenantRolePermissions(club.id, "board")).toEqual(
			PERMISSION_KEYS,
		);
		await globalDb
			.insert(memberships)
			.values({ tenant_id: SVU_TENANT_ID, user_id: board.id, role: "board" });
		// Even a historical global Admin flag cannot replace actual SVU Admin membership.
		await globalDb
			.update(user)
			.set({ role: "admin" })
			.where(eq(user.id, board.id));
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", board.email);
		expect(await isPlatformAdmin(board.id)).toBe(false);
		await expect(
			globalDb.transaction((tx) =>
				assertTenantPermissionsInTransaction(
					tx,
					club.id,
					board.id,
					"integrations.manage",
					"roles.manage",
				),
			),
		).resolves.toBe("board");
	});

	it("isolates each club matrix and immediately revokes permissions on an existing session", async () => {
		const { club, other, admin, member } = await fixture();
		const cookie = await cookieFor(member.email);
		const headers = new Headers({ host: `${club.slug}.rendant.app`, cookie });
		const original = await resolveTenantSession(headers);
		expect(original?.user).toMatchObject({
			role: "user",
			permissions: DEFAULT_ROLE_PERMISSIONS.user,
		});
		const before = await getRolePolicy(club.id);
		const roles = cloneDefaults();
		roles.user = ["helpers.read"];
		await withTenant(club, () =>
			updateRolePolicy({ version: before.version, roles }, admin),
		);
		expect(await getTenantRolePermissions(club.id, "user")).toEqual([
			"helpers.read",
		]);
		expect(await getTenantRolePermissions(other.id, "user")).toEqual(
			DEFAULT_ROLE_PERMISSIONS.user,
		);
		expect((await getRolePolicy(other.id)).version).toBe(1);
		const refreshed = await resolveTenantSession(headers);
		expect(refreshed?.user).toMatchObject({
			role: "user",
			permissions: ["helpers.read"],
		});
		await expect(
			globalDb.transaction((tx) =>
				assertTenantPermissionsInTransaction(
					tx,
					club.id,
					member.id,
					"protocols.create",
				),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects invalid dependencies and protected-admin removal without changing the policy", async () => {
		const { club, admin } = await fixture();
		const before = await getRolePolicy(club.id);
		const invalid = cloneDefaults();
		invalid.user = ["protocols.create"];
		await expect(
			withTenant(club, () =>
				updateRolePolicy({ version: before.version, roles: invalid }, admin),
			),
		).rejects.toThrow();
		const unknown = cloneDefaults();
		unknown.user = ["unsupported.permission" as Permission];
		await expect(
			withTenant(club, () =>
				updateRolePolicy({ version: before.version, roles: unknown }, admin),
			),
		).rejects.toThrow();
		const lockout = cloneDefaults();
		lockout.admin = lockout.admin.filter((key) => key !== "roles.manage");
		await expect(
			withTenant(club, () =>
				updateRolePolicy({ version: before.version, roles: lockout }, admin),
			),
		).rejects.toThrow();
		expect(await getRolePolicy(club.id)).toEqual(before);
	});

	it("allows one concurrent policy write and rejects its stale competitor", async () => {
		const { club, admin } = await fixture();
		const before = await getRolePolicy(club.id);
		const first = cloneDefaults();
		first.user = ["helpers.read"];
		const second = cloneDefaults();
		second.user = ["finance.read"];
		const results = await Promise.allSettled([
			withTenant(club, () =>
				updateRolePolicy({ version: before.version, roles: first }, admin),
			),
			withTenant(club, () =>
				updateRolePolicy({ version: before.version, roles: second }, admin),
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect(rejected).toMatchObject({
			status: "rejected",
			reason: { code: "CONFLICT" },
		});
		const current = await getRolePolicy(club.id);
		expect(current.version).toBe(before.version + 1);
		expect([first, second]).toContainEqual(current.roles);
	});

	it("prevents Board from restoring its own revoked grants or promoting itself to Admin", async () => {
		const { club, admin, board } = await fixture();
		const before = await getRolePolicy(club.id);
		const restricted = cloneDefaults();
		restricted.board = restricted.board.filter(
			(key) => key !== "integrations.manage",
		);
		await withTenant(club, () =>
			updateRolePolicy({ version: before.version, roles: restricted }, admin),
		);
		const current = await getRolePolicy(club.id);
		for (const actor of [board, { ...board, role: "admin" }]) {
			await expect(
				withTenant(club, () =>
					updateRolePolicy(
						{ version: current.version, roles: cloneDefaults() },
						actor,
					),
				),
			).rejects.toThrow();
		}
		await expect(
			withTenant(club, () => setTenantUserRole(board.id, "admin", board)),
		).rejects.toThrow();
		expect(await getRolePolicy(club.id)).toEqual(current);
		const row = await globalDb
			.select({ role: memberships.role })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, board.id),
				),
			);
		expect(row[0].role).toBe("board");
	});

	it("lets Board delegate held permissions but protects Admin policy and membership", async () => {
		const { club, board, member } = await fixture();
		const allowed = cloneDefaults();
		allowed.user.push("protocols.cancel");
		await withTenant(club, () =>
			updateRolePolicy({ version: 1, roles: allowed }, board),
		);
		expect(await getTenantRolePermissions(club.id, "user")).toContain(
			"protocols.cancel",
		);
		const current = await getRolePolicy(club.id);
		const adminChange = structuredClone(current.roles);
		adminChange.admin = adminChange.admin.filter((key) => key !== "audit.read");
		await expect(
			withTenant(club, () =>
				updateRolePolicy(
					{ version: current.version, roles: adminChange },
					board,
				),
			),
		).rejects.toThrow();
		await expect(
			withTenant(club, () => setTenantUserRole(member.id, "admin", board)),
		).rejects.toThrow();
		await expect(
			withTenant(club, () =>
				createInvite({
					email: `admin-alternate-${randomUUID()}@example.invalid`,
					role: "admin",
					invitedBy: board.email,
					audit: { actor: board },
				}),
			),
		).rejects.toThrow();
		expect(await getRolePolicy(club.id)).toEqual(current);
	});

	it("does not let a reduced Board grant missing permissions to another role", async () => {
		const { club, admin, board } = await fixture();
		const reduced = cloneDefaults();
		reduced.board = reduced.board.filter(
			(key) => key !== "integrations.manage",
		);
		await withTenant(club, () =>
			updateRolePolicy({ version: 1, roles: reduced }, admin),
		);
		const current = await getRolePolicy(club.id);
		const escalated = structuredClone(current.roles);
		escalated.user.push("integrations.manage");
		await expect(
			withTenant(club, () =>
				updateRolePolicy({ version: current.version, roles: escalated }, board),
			),
		).rejects.toThrow();
		expect(await getRolePolicy(club.id)).toEqual(current);
	});

	it("protects the actual last Admin when Board has every club permission", async () => {
		const { club, admin, board } = await fixture();
		await expect(
			withTenant(club, () => setTenantUserRole(admin.id, "board", board)),
		).rejects.toThrow();
		await expect(
			withTenant(club, () => setTenantUserRole(admin.id, "board", admin)),
		).rejects.toThrow();
		const row = await globalDb
			.select({ role: memberships.role })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, admin.id),
				),
			);
		expect(row[0].role).toBe("admin");
	});

	it("rechecks actual membership and bans instead of trusting a cached actor", async () => {
		const { club, other, admin } = await fixture();
		await globalDb
			.delete(memberships)
			.where(
				and(
					eq(memberships.tenant_id, other.id),
					eq(memberships.user_id, admin.id),
				),
			);
		await expect(
			withTenant(other, () =>
				updateRolePolicy({ version: 1, roles: cloneDefaults() }, admin),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await globalDb
			.update(memberships)
			.set({ banned: true })
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, admin.id),
				),
			);
		await expect(
			withTenant(club, () =>
				updateRolePolicy({ version: 1, roles: cloneDefaults() }, admin),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect((await getRolePolicy(club.id)).version).toBe(1);
		expect((await getRolePolicy(other.id)).version).toBe(1);
	});

	it("does not let a reduced Board invite a User with broader configured rights", async () => {
		const { club, admin, board } = await fixture();
		const reduced = cloneDefaults();
		reduced.board = ["users.manage", "roles.manage"];
		await withTenant(club, () =>
			updateRolePolicy({ version: 1, roles: reduced }, admin),
		);
		const email = `broader-user-${randomUUID()}@example.invalid`;
		await expect(
			withTenant(club, () =>
				createInvite({
					email,
					role: "user",
					invitedBy: board.email,
					audit: { actor: board },
				}),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const rows = await withTenant(club, () =>
			db
				.select({ id: invitations.id })
				.from(invitations)
				.where(eq(invitations.email, email)),
		);
		expect(rows).toHaveLength(0);
	});

	it("does not let a reduced Board reactivate a banned User with broader rights", async () => {
		const { club, admin, board, member } = await fixture();
		await withTenant(club, () => setTenantUserBanned(member.id, true, admin));
		const reduced = cloneDefaults();
		reduced.board = ["users.manage", "roles.manage"];
		await withTenant(club, () =>
			updateRolePolicy({ version: 1, roles: reduced }, admin),
		);
		await expect(
			withTenant(club, () => setTenantUserBanned(member.id, false, board)),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const rows = await globalDb
			.select({ banned: memberships.banned })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, member.id),
				),
			);
		expect(rows).toEqual([{ banned: true }]);
	});

	it("allows ordinary invitations with users.manage and the target User grants, without roles.manage", async () => {
		const { club, admin, board } = await fixture();
		const policy = cloneDefaults();
		policy.board = [...legacyUserGrants, "users.manage"];
		await withTenant(club, () =>
			updateRolePolicy({ version: 1, roles: policy }, admin),
		);
		expect(await getTenantRolePermissions(club.id, "board")).not.toContain(
			"roles.manage",
		);
		const invite = await withTenant(club, () =>
			createInvite({
				email: `ordinary-user-${randomUUID()}@example.invalid`,
				role: "user",
				invitedBy: board.email,
				audit: { actor: board },
			}),
		);
		expect(invite.role).toBe("user");
		const rows = await withTenant(club, () =>
			db
				.select({ role: invitations.role })
				.from(invitations)
				.where(eq(invitations.id, invite.id)),
		);
		expect(rows).toEqual([{ role: "user" }]);
	});

	it("prevents an ordinary SVU Admin from demoting or banning an allowlisted operator", async () => {
		const { admin: manager, board: operator } = await fixture();
		const svu = { id: SVU_TENANT_ID, slug: "svu", name: "Synthetischer SVU" };
		await globalDb.insert(memberships).values([
			{ tenant_id: SVU_TENANT_ID, user_id: manager.id, role: "admin" },
			{ tenant_id: SVU_TENANT_ID, user_id: operator.id, role: "admin" },
		]);
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", operator.email);
		expect(await isPlatformAdmin(manager.id)).toBe(false);
		expect(await isPlatformAdmin(operator.id)).toBe(true);
		for (const targetRole of ["user", "board"] as const) {
			await expect(
				withTenant(svu, () =>
					setTenantUserRole(operator.id, targetRole, manager),
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		await expect(
			withTenant(svu, () => setTenantUserBanned(operator.id, true, manager)),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const rows = await globalDb
			.select({ role: memberships.role, banned: memberships.banned })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, SVU_TENANT_ID),
					eq(memberships.user_id, operator.id),
				),
			);
		expect(rows).toEqual([{ role: "admin", banned: false }]);
		expect(await isPlatformAdmin(operator.id)).toBe(true);
	});

	it("prevents an ordinary SVU Admin from minting an Admin invitation for an allowlisted future operator", async () => {
		const { admin: manager } = await fixture();
		const svu = { id: SVU_TENANT_ID, slug: "svu", name: "Synthetischer SVU" };
		await globalDb
			.insert(memberships)
			.values({ tenant_id: SVU_TENANT_ID, user_id: manager.id, role: "admin" });
		const email = `future-operator-${randomUUID()}@example.invalid`;
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", email);
		await expect(
			withTenant(svu, () =>
				createInvite({
					email,
					role: "admin",
					invitedBy: manager.email,
					audit: { actor: manager },
				}),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const rows = await withTenant(svu, () =>
			db
				.select({ id: invitations.id })
				.from(invitations)
				.where(eq(invitations.email, email)),
		);
		expect(rows).toHaveLength(0);
	});

	it("accepts a Board invitation without raising the global identity role", async () => {
		const { club, board } = await fixture();
		const invitation = await withTenant(club, () =>
			createInvite({
				email: `invited-board-${randomUUID()}@example.invalid`,
				role: "board",
				invitedBy: board.email,
				audit: { actor: board },
			}),
		);
		const accepted = await acceptInvite({
			token: invitation.token,
			name: "Synthetischer Vorstand",
			password,
			headers: new Headers({ host: `${club.slug}.rendant.app` }),
			audit: {},
		});
		expect(accepted.role).toBe("board");
		const identity = await globalDb
			.select({ role: user.role })
			.from(user)
			.where(eq(user.id, accepted.userId));
		expect(identity[0].role).toBe("user");
		expect(await isPlatformAdmin(accepted.userId)).toBe(false);
	});
});
