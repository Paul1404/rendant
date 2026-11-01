import { call, type AnyProcedure } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { permitted, permittedAny, type ORPCContext } from "@/server/orpc/base";
import { router } from "@/server/orpc/router";

function context(permissions: NonNullable<NonNullable<ORPCContext["user"]>["permissions"]>, role = "board"): ORPCContext {
	return { user: { id: "synthetic", email: "synthetic@example.invalid", name: "Synthetisch", role, permissions }, tenant: { id: "00000000-0000-4000-8000-000000000001", slug: "svu", name: "Synthetisch" }, headers: new Headers(), clientIp: "unknown", requestId: "synthetic" };
}

describe("functional RPC permission middleware", () => {
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
});
