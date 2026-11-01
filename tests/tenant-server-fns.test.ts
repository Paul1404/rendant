import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvedRequestTenant, SVU_TENANT_ID, withTenantRequest } from "@/server/tenant-context";

const nord = "00000000-0000-4000-8000-000000000002";
const state = vi.hoisted(() => ({ request: new Request("http://localhost"), cookie: vi.fn(), resolve: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
	// SSR invokes the handler locally. Call-option headers do not replace the
	// real page request, matching the behavior that caused the regression.
	createServerFn: () => {
		const builder = { validator: (_schema: unknown) => builder, handler: (fn: (context: { data?: unknown }) => unknown) => (options?: { data?: unknown }) => fn({ data: options?.data }) };
		return builder;
	},
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => state.request, setCookie: state.cookie }));
vi.mock("@/server/services/tenants", () => ({
	resolveTenantSession: state.resolve,
	listUserTenants: async () => [],
	isPlatformAdmin: async () => false,
	createTenant: vi.fn(),
	TenantAccessError: class extends Error {},
}));
vi.mock("@/server/services/settings", async () => {
	const { requireTenant } = await import("@/server/tenant-context");
	return { getVereinsname: async () => requireTenant().name };
});

import { fetchBranding, fetchSession } from "@/lib/server-fns";

beforeEach(() => {
	state.resolve.mockReset();
	state.resolve.mockImplementation(async (headers: Headers) => {
		const id = headers.get("x-rendant-tenant") ?? SVU_TENANT_ID;
		return { user: { id: "synthetic-user", name: "Demo", email: "demo@example.test", role: "admin" }, tenant: { id, slug: id === nord ? "nord" : "svu", name: id === nord ? "Nord Demo" : "SVU Demo", role: "admin" } };
	});
	state.request = new Request(`http://localhost/protokolle/einstellungen?tenant=${nord}`, { headers: { cookie: `rendant-tenant=${SVU_TENANT_ID}` } });
});

describe("tenant selection during server rendering", () => {
	it("uses the page's explicit club instead of the other club's cookie", async () => {
		await withTenantRequest(async () => {
			const session = await fetchSession(nord);
			expect(session?.tenant.id).toBe(nord);
			expect(resolvedRequestTenant()).toBe(nord);
		});
		expect(resolvedRequestTenant()).toBeUndefined();
	});
	it("renders branding from the same explicit club", async () => {
		expect(await fetchBranding(nord)).toEqual({ vereinsname: "Nord Demo" });
	});
	it("rejects conflicting explicit page and header selectors", async () => {
		state.request = new Request(`http://localhost/protokolle?tenant=${nord}`, { headers: { "x-rendant-tenant": SVU_TENANT_ID } });
		await expect(fetchSession()).rejects.toThrow("Widersprüchliche Vereinsauswahl");
		expect(state.resolve).not.toHaveBeenCalled();
	});
});
