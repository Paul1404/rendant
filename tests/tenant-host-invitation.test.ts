import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
	hostTenant: null as { id: string; slug: string; name: string } | null,
	row: null as Record<string, unknown> | null,
}));
vi.mock("@/server/auth", () => ({ auth: {} }));
vi.mock("@/server/db", () => ({
	db: {},
	globalDb: {
		select: () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => state.row ? [state.row] : [] }) }) }) }) }),
	},
}));
vi.mock("@/server/services/tenants", () => ({
	resolveHostTenant: async () => state.hostTenant,
	TenantAccessError: class TenantAccessError extends Error {},
}));
import { getValidInvite } from "@/server/services/invitations";

beforeEach(() => {
	state.hostTenant = { id: "ssv-id", slug: "ssv-gaedheim", name: "SSV Gädheim" };
	state.row = {
		invite: { id: "invite-id", tenant_id: "ssv-id", email: "member@example.invalid", role: "user", invited_by: null, expires_at: new Date("2099-01-01"), accepted_at: null, created_at: new Date() },
		tenantName: "SSV Gädheim",
		existingUserId: null,
	};
});

describe("host-bound invitation lookup", () => {
	it("allows the invitation for the bound club", async () => {
		await expect(getValidInvite("capability", new Headers())).resolves.toMatchObject({ tenant_id: "ssv-id", tenantName: "SSV Gädheim", existingAccount: false });
	});

	it("rejects a different club's invitation before acceptance can mutate it", async () => {
		state.hostTenant = { id: "svu-id", slug: "svu", name: "SVU" };
		await expect(getValidInvite("capability", new Headers())).rejects.toThrow();
	});

	it("allows shared-host invitation capabilities and returns null for missing tokens", async () => {
		state.hostTenant = null;
		await expect(getValidInvite("capability", new Headers())).resolves.toMatchObject({ tenant_id: "ssv-id" });
		state.row = null;
		await expect(getValidInvite("missing", new Headers())).resolves.toBeNull();
	});
});
