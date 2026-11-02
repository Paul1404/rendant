import { call, type AnyProcedure } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, normalizeRolePolicy, PERMISSION_KEYS } from "@/lib/permissions";
import { permitted, permittedAny, type ORPCContext } from "@/server/orpc/base";
import { router } from "@/server/orpc/router";

function context(permissions: NonNullable<NonNullable<ORPCContext["user"]>["permissions"]>, role = "board"): ORPCContext {
	return { user: { id: "synthetic", email: "synthetic@example.invalid", name: "Synthetisch", role, permissions }, tenant: { id: "00000000-0000-4000-8000-000000000001", slug: "svu", name: "Synthetisch" }, headers: new Headers(), clientIp: "unknown", requestId: "synthetic" };
}
afterEach(() => vi.unstubAllEnvs());

describe("functional RPC permission middleware", () => {
 it("denies technical configuration and DATEV access for default Board, while honoring explicit operator overrides",async()=>{
  const subject=context([...DEFAULT_ROLE_PERMISSIONS.board]);
  for(const procedure of [router.settings.getEmail,router.settings.getMcp,router.settings.getSumup,router.settings.getDatev,router.settings.testSumup])
   await expect(call(procedure as AnyProcedure,undefined,{context:subject})).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(call(router.protokolle.datevStatus,{id:"00000000-0000-4000-8000-000000000002"},{context:subject})).rejects.toMatchObject({code:"FORBIDDEN"});
  const configured={board:[...DEFAULT_ROLE_PERMISSIONS.board,"integrations.manage","datev.send"]};
  const before=JSON.stringify(configured);
  const grants=normalizeRolePolicy(configured).board;
  expect(JSON.stringify(configured)).toBe(before);
  expect(await call(permitted("integrations.manage").handler(()=>true),undefined,{context:context(grants)})).toBe(true);
  expect(await call(permitted("datev.send","finance.read").handler(()=>true),undefined,{context:context(grants)})).toBe(true);
 });
	it("uses explicitly granted capabilities rather than the global or club role label", async () => {
		const procedure = permitted("users.manage").handler(() => ({ ok: true }));
		for (const role of ["user", "board", "admin"]) {
			await expect(call(procedure, undefined, { context: context([], role) })).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(await call(procedure, undefined, { context: context(["users.manage"], role) })).toEqual({ ok: true });
		}
	});

	it("requires every declared permission and a resolved financial tenant", async () => {
		const procedure = permitted("imports.manage", "finance.read", "helpers.read").handler(() => true);
		await expect(call(procedure, undefined, { context: context(["imports.manage", "finance.read"]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await call(procedure, undefined, { context: context(["imports.manage", "finance.read", "helpers.read"]) })).toBe(true);
		await expect(call(procedure, undefined, { context: { ...context(["imports.manage", "finance.read", "helpers.read"]), tenant: undefined } })).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows an explicit catalogue management grant to read its configuration without general financial access", async () => {
		for (const permission of ["registers.manage", "occasions.manage"] as const) {
			const procedure = permittedAny("finance.read", permission).handler(() => true);
			expect(await call(procedure, undefined, { context: context([permission]) })).toBe(true);
			expect(await call(procedure, undefined, { context: context(["finance.read"]) })).toBe(true);
			await expect(call(procedure, undefined, { context: context([]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
	});

	it("does not let catalogue management alone reassign booked financial records", async () => {
		await expect(call(router.anlassKatalog.bulkAssign, { target_id: "00000000-0000-4000-8000-000000000002", source_id: null, protokoll_ids: ["00000000-0000-4000-8000-000000000003"], historical_ids: [] }, { context: context(["occasions.manage"]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("protects existing finance, helper, member, integration and audit procedures before business reads", async () => {
		const denied = context([], "admin");
		for (const procedure of [router.protokolle.nextBelegnummer, router.historicalRevenue.list, router.registers.list, router.anlassKatalog.list, router.users.list, router.invites.list, router.settings.getEmail, router.settings.getDatev, router.settings.getSumup, router.settings.getMcp, router.roles.get]) {
			await expect(call(procedure as AnyProcedure, undefined, { context: denied })).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		await expect(call(router.helperHours.list, { jahr: 2026 }, { context: denied })).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(call(router.audit.list, {}, { context: denied })).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("does not expose transaction amounts through an integration test without financial read access", async () => {
		await expect(call(router.settings.testSumup, undefined, { context: context(["integrations.manage"]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("does not let user management alone assign elevated invitation roles", async () => {
		await expect(call(router.invites.create, { email: "invited@example.invalid", role: "admin" }, { context: context(["users.manage"]) })).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("keeps legacy role policy and role assignment endpoints closed even with every current or stale role capability", async () => {
		for (const role of ["user", "board", "admin"]) {
			const subject = context([...PERMISSION_KEYS], role);
			Object.assign(subject.user!, { permissions: [...PERMISSION_KEYS, "roles.manage"] });
			const forbidden = { code: "FORBIDDEN", message: "Rollen werden ausschließlich in der Betreiberverwaltung verwaltet" };
			await expect(call(router.roles.get, undefined, { context: subject })).rejects.toMatchObject(forbidden);
			await expect(call(router.roles.update, { version: 1, roles: { user: [], board: [...PERMISSION_KEYS], admin: [...PERMISSION_KEYS] } }, { context: subject })).rejects.toMatchObject(forbidden);
			await expect(call(router.users.setRole, { id: "synthetic-target", role: "board" }, { context: subject })).rejects.toMatchObject(forbidden);
			for (const elevated of ["admin", "board"] as const)
				await expect(call(router.invites.create, { email: "invited@example.invalid", role: elevated }, { context: subject })).rejects.toMatchObject(forbidden);
		}
	});

	it("does not let a fully privileged club user use the new operator role policy endpoints", async () => {
		vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
		const subject = context([...PERMISSION_KEYS], "admin");
		subject.headers.set("host", "sv-untereuerheim.rendant.app");
		await expect(call(router.operators.rolePolicy, { tenantId: subject.tenant!.id }, { context: subject })).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(call(router.operators.updateRolePolicy, { tenantId: subject.tenant!.id, version: 1, roles: { user: [], board: [...PERMISSION_KEYS], admin: [...PERMISSION_KEYS] } }, { context: subject })).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
