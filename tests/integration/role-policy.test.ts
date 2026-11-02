import { randomUUID } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { and, eq, sql } from "drizzle-orm";
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
import { appSettings, auditEvents, invitations } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { createORPCContext } from "@/server/orpc/context";
import { type AppRouter, router } from "@/server/orpc/router";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import { createInvite } from "@/server/services/invitations";
import { setOperatorMemberRole } from "@/server/services/operators";
import {
	assertTenantPermissionsInTransaction,
	getOperatorRolePolicy,
	getRolePolicy,
	getRolePolicyForCurrentTenant,
	getTenantRolePermissions,
	updateOperatorRolePolicy,
	updateRolePolicy,
} from "@/server/services/role-policy";
import {
	isPlatformAdmin,
	resolveTenantSession,
	setTenantUserBanned,
	setTenantUserRole,
} from "@/server/services/tenants";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const password = "synthetic-central-role-policy-password";
const legacyUserGrants: Permission[] = [
	"finance.read",
	"protocols.create",
	"exports.download",
	"helpers.read",
	"helpers.write",
];
const cloneDefaults = (): RolePolicy =>
	structuredClone(DEFAULT_ROLE_PERMISSIONS);
const handler = new RPCHandler(router);

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
	const email = `operator-${run}@example.invalid`;
	const name = "Synthetischer zentraler Betreiber";
	const identity = await ensureCredentialUser({
		email,
		name,
		password,
		role: "user",
	});
	const operator = { id: identity.id, email, name, role: "admin" as const };
	await globalDb
		.insert(memberships)
		.values({ tenant_id: SVU_TENANT_ID, user_id: operator.id, role: "admin" });
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", operator.email);
	return { club, other, admin, board, member, operator };
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
function rpc(cookie: string, host: string, extra: Record<string, string> = {}) {
	return createORPCClient<RouterClient<AppRouter>>(
		new RPCLink({
			url: `https://${host}/api/rpc`,
			headers: { host, cookie, ...extra },
			fetch: async (request) => {
				const result = await handler.handle(request, {
					prefix: "/api/rpc",
					context: await createORPCContext(request),
				});
				return result.response ?? new Response("Not found", { status: 404 });
			},
		}),
	);
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

describe("central operator role administration", () => {
	it("preserves legacy User grants and Board business access without a club role-management capability", async () => {
		const { club, board } = await fixture();
		expect(PERMISSION_KEYS).toHaveLength(19);
		expect(PERMISSION_KEYS).not.toContain("roles.manage");
		expect(await getTenantRolePermissions(club.id, "user")).toEqual(
			legacyUserGrants,
		);
		expect(await getTenantRolePermissions(club.id, "board")).toEqual(
			PERMISSION_KEYS,
		);
		await expect(
			globalDb.transaction((tx) =>
				assertTenantPermissionsInTransaction(
					tx,
					club.id,
					board.id,
					"integrations.manage",
					"finance.read",
				),
			),
		).resolves.toBe("board");
		await globalDb
			.insert(memberships)
			.values({ tenant_id: SVU_TENANT_ID, user_id: board.id, role: "board" });
		await globalDb
			.update(user)
			.set({ role: "admin" })
			.where(eq(user.id, board.id));
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", board.email);
		expect(await isPlatformAdmin(board.id)).toBe(false);
	});

	it("lets a verified operator edit a target club without a destination membership or tenant scope and audits the change", async () => {
		const { club, other, operator } = await fixture();
		const member = await globalDb
			.select({ id: memberships.user_id })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, operator.id),
				),
			);
		expect(member).toHaveLength(0);
		const current = await getOperatorRolePolicy(club.id, operator);
		const roles = cloneDefaults();
		roles.user = ["helpers.read"];
		const changed = await updateOperatorRolePolicy(
			{ tenantId: club.id, version: current.version, roles },
			operator,
		);
		expect(changed.version).toBe(2);
		expect(changed.roles.user).toEqual(["helpers.read"]);
		expect(
			await globalDb
				.select({ id: memberships.user_id })
				.from(memberships)
				.where(
					and(
						eq(memberships.tenant_id, club.id),
						eq(memberships.user_id, operator.id),
					),
				),
		).toHaveLength(0);
		expect((await getRolePolicy(other.id)).version).toBe(1);
		expect(await getTenantRolePermissions(other.id, "user")).toEqual(
			legacyUserGrants,
		);
		const events = await withTenant(club, () =>
			db
				.select({
					actor: auditEvents.actor_user_id,
					tenant: auditEvents.tenant_id,
					subject: auditEvents.subject_id,
					metadata: auditEvents.metadata,
				})
				.from(auditEvents)
				.where(eq(auditEvents.action, "users.role_permissions_updated")),
		);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			actor: operator.id,
			tenant: club.id,
			subject: club.id,
			metadata: { version: 2, current: roles },
		});
	});

	it("denies legacy club policy services for Admin, Board, User and even a real operator", async () => {
		const { club, admin, board, member, operator } = await fixture();
		for (const actor of [admin, board, member, operator]) {
			await expect(
				withTenant(club, () =>
					updateRolePolicy({ version: 1, roles: cloneDefaults() }, actor),
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				withTenant({ ...club, role: actor.role }, () =>
					getRolePolicyForCurrentTenant(),
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		expect((await getRolePolicy(club.id)).version).toBe(1);
	});

	it("denies central policy access to unlisted club Admins despite forged role and permission flags", async () => {
		const { club, admin } = await fixture();
		await globalDb
			.insert(memberships)
			.values({ tenant_id: SVU_TENANT_ID, user_id: admin.id, role: "admin" });
		const forged = {
			...admin,
			permissions: [...PERMISSION_KEYS, "roles.manage"],
		};
		await expect(getOperatorRolePolicy(club.id, forged)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			updateOperatorRolePolicy(
				{ tenantId: club.id, version: 1, roles: cloneDefaults() },
				forged,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect((await getRolePolicy(club.id)).version).toBe(1);
	});

	it("requires the actual operator host for policy RPC and rejects forged forwarded hosts", async () => {
		const { club, operator } = await fixture();
		const cookie = await cookieFor(operator.email);
		const central = rpc(cookie, "admin.rendant.app");
		expect(
			(await central.operators.rolePolicy({ tenantId: club.id })).version,
		).toBe(1);
		for (const host of [
			`${club.slug}.rendant.app`,
			"rendant.sv-untereuerheim.de",
		]) {
			const wrong = rpc(cookie, host, {
				"x-forwarded-host": "admin.rendant.app",
			});
			await expect(
				wrong.operators.rolePolicy({ tenantId: club.id }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				wrong.operators.updateRolePolicy({
					tenantId: club.id,
					version: 1,
					roles: cloneDefaults(),
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		await expect(central.roles.get()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect((await getRolePolicy(club.id)).version).toBe(1);
	});

	it("rejects invalid dependencies, unknown grants and removal of core Admin user management", async () => {
		const { club, operator } = await fixture();
		const before = await getRolePolicy(club.id);
		const dependent = cloneDefaults();
		dependent.user = ["protocols.create"];
		const unknown = cloneDefaults();
		unknown.user = ["roles.manage" as Permission];
		const lockout = cloneDefaults();
		lockout.admin = lockout.admin.filter((key) => key !== "users.manage");
		for (const roles of [dependent, unknown, lockout])
			await expect(
				updateOperatorRolePolicy(
					{ tenantId: club.id, version: before.version, roles },
					operator,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(await getRolePolicy(club.id)).toEqual(before);
	});

	it("allows exactly one competing operator update and rejects the stale writer", async () => {
		const { club, operator } = await fixture();
		const first = cloneDefaults();
		first.user = ["helpers.read"];
		const second = cloneDefaults();
		second.user = ["finance.read"];
		const results = await Promise.allSettled([
			updateOperatorRolePolicy(
				{ tenantId: club.id, version: 1, roles: first },
				operator,
			),
			updateOperatorRolePolicy(
				{ tenantId: club.id, version: 1, roles: second },
				operator,
			),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.find((r) => r.status === "rejected")).toMatchObject({
			status: "rejected",
			reason: { code: "CONFLICT" },
		});
		const policy = await getRolePolicy(club.id);
		expect(policy.version).toBe(2);
		expect([first, second]).toContainEqual(policy.roles);
	});

	it("applies central revocation immediately to an existing club session", async () => {
		const { club, operator, member } = await fixture();
		const headers = new Headers({
			host: `${club.slug}.rendant.app`,
			cookie: await cookieFor(member.email),
		});
		expect((await resolveTenantSession(headers))?.user).toMatchObject({
			permissions: legacyUserGrants,
		});
		const roles = cloneDefaults();
		roles.user = ["helpers.read"];
		await updateOperatorRolePolicy(
			{ tenantId: club.id, version: 1, roles },
			operator,
		);
		expect((await resolveTenantSession(headers))?.user).toMatchObject({
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

	it("rechecks operator eligibility for every read and transactional write after revocation", async () => {
		const { club, operator } = await fixture();
		await getOperatorRolePolicy(club.id, operator);
		await globalDb
			.update(memberships)
			.set({ banned: true })
			.where(
				and(
					eq(memberships.tenant_id, SVU_TENANT_ID),
					eq(memberships.user_id, operator.id),
				),
			);
		await expect(
			getOperatorRolePolicy(club.id, operator),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			updateOperatorRolePolicy(
				{ tenantId: club.id, version: 1, roles: cloneDefaults() },
				operator,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect((await getRolePolicy(club.id)).version).toBe(1);
	});

	it("filters legacy roles.manage on reads without rewriting stored JSON or its revision", async () => {
		const { club, operator } = await fixture();
		const legacy = {
			...cloneDefaults(),
			admin: [...DEFAULT_ROLE_PERMISSIONS.admin, "roles.manage"],
			board: [...DEFAULT_ROLE_PERMISSIONS.board, "roles.manage"],
		};
		await globalDb.execute(
			sql`update tenants set role_permissions=${JSON.stringify(legacy)}::jsonb,role_permissions_version=11 where id=${club.id}::uuid`,
		);
		const policy = await getOperatorRolePolicy(club.id, operator);
		expect(policy.version).toBe(11);
		expect(policy.roles.admin).not.toContain("roles.manage");
		expect(policy.roles.board).not.toContain("roles.manage");
		const [stored] = await globalDb
			.select({
				roles: tenants.role_permissions,
				version: tenants.role_permissions_version,
			})
			.from(tenants)
			.where(eq(tenants.id, club.id));
		expect(stored).toEqual({ roles: legacy, version: 11 });
		await updateOperatorRolePolicy(
			{ tenantId: club.id, version: 11, roles: policy.roles },
			operator,
		);
		const [saved] = await globalDb
			.select({
				roles: tenants.role_permissions,
				version: tenants.role_permissions_version,
			})
			.from(tenants)
			.where(eq(tenants.id, club.id));
		expect(saved).toEqual({ roles: policy.roles, version: 12 });
	});

	it("keeps all club role assignment blocked while the operator assigns all three roles and preserves the last Admin", async () => {
		const { club, admin, board, member, operator } = await fixture();
		for (const actor of [admin, board, member, operator])
			await expect(
				withTenant(club, () => setTenantUserRole(member.id, "board", actor)),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			setOperatorMemberRole(
				{ tenantId: club.id, id: admin.id, role: "board" },
				operator,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		for (const role of ["board", "user", "admin"] as const) {
			await setOperatorMemberRole(
				{ tenantId: club.id, id: member.id, role },
				operator,
			);
			const [row] = await globalDb
				.select({ role: memberships.role })
				.from(memberships)
				.where(
					and(
						eq(memberships.tenant_id, club.id),
						eq(memberships.user_id, member.id),
					),
				);
			expect(row.role).toBe(role);
		}
		const [identity] = await globalDb
			.select({ role: user.role })
			.from(user)
			.where(eq(user.id, member.id));
		expect(identity.role).toBe("user");
	});

	it("blocks non-User club invitations but preserves ordinary member invitations", async () => {
		const { club, admin, board } = await fixture();
		for (const actor of [admin, board])
			for (const role of ["admin", "board"] as const)
				await expect(
					withTenant(club, () =>
						createInvite({
							email: `forbidden-role-${randomUUID()}@example.invalid`,
							role,
							invitedBy: actor.email,
							audit: { actor },
						}),
					),
				).rejects.toMatchObject({ code: "FORBIDDEN" });
		const invitation = await withTenant(club, () =>
			createInvite({
				email: `ordinary-${randomUUID()}@example.invalid`,
				role: "user",
				invitedBy: admin.email,
				audit: { actor: admin },
			}),
		);
		expect(invitation.role).toBe("user");
	});

	it("preserves operator membership protection against ordinary SVU club bans", async () => {
		const { admin, operator } = await fixture();
		const svu = { id: SVU_TENANT_ID, slug: "svu", name: "Synthetischer SVU" };
		await globalDb
			.insert(memberships)
			.values({ tenant_id: SVU_TENANT_ID, user_id: admin.id, role: "admin" });
		await expect(
			withTenant(svu, () => setTenantUserBanned(operator.id, true, admin)),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await isPlatformAdmin(operator.id)).toBe(true);
	});

	it("lets a centrally configured users.manage manager invite ordinary members without role administration", async () => {
		const { club, board, operator } = await fixture();
		const roles = cloneDefaults();
		roles.board = [...legacyUserGrants, "users.manage"];
		await updateOperatorRolePolicy(
			{ tenantId: club.id, version: 1, roles },
			operator,
		);
		const invite = await withTenant(club, () =>
			createInvite({
				email: `limited-manager-${randomUUID()}@example.invalid`,
				role: "user",
				invitedBy: board.email,
				audit: { actor: board },
			}),
		);
		expect(invite.role).toBe("user");
		await expect(
			withTenant(club, () => updateRolePolicy({ version: 2, roles }, board)),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("preserves business member bans and prevents reduced club managers reactivating broader members", async () => {
		const { club, board, member, operator } = await fixture();
		await withTenant(club, () => setTenantUserBanned(member.id, true, board));
		const roles = cloneDefaults();
		roles.board = ["users.manage"];
		await updateOperatorRolePolicy(
			{ tenantId: club.id, version: 1, roles },
			operator,
		);
		await expect(
			withTenant(club, () => setTenantUserBanned(member.id, false, board)),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
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
		expect(
			await withTenant(club, () =>
				db
					.select({ id: invitations.id })
					.from(invitations)
					.where(eq(invitations.email, email)),
			),
		).toHaveLength(0);
		const [row] = await globalDb
			.select({ banned: memberships.banned })
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, member.id),
				),
			);
		expect(row.banned).toBe(true);
	});
});
