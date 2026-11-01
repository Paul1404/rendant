import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvedRequestTenant, SVU_TENANT_ID, withTenantRequest } from "@/server/tenant-context";

const nord = "00000000-0000-4000-8000-000000000002";
const state = vi.hoisted(() => ({ request: new Request("http://localhost"), cookie: vi.fn(), resolve: vi.fn(), host: vi.fn(), list: vi.fn(), platform: vi.fn(), create: vi.fn(), settingsRead: vi.fn(), operatorHost: vi.fn(), operatorResolve: vi.fn(), identity: vi.fn() }));

vi.mock("@/server/auth", () => ({ auth: { api: { getSession: state.identity } } }));
vi.mock("@tanstack/react-start", () => ({
	// SSR invokes the handler locally. Call-option headers do not replace the
	// real page request, matching the behavior that caused the regression.
	createServerFn: () => {
		const builder = { validator: (_schema: unknown) => builder, handler: (fn: (context: { data?: unknown }) => unknown) => (options?: { data?: unknown }) => fn({ data: options?.data }) };
		return builder;
	},
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => state.request, setCookie: state.cookie }));
vi.mock("@/server/services/operator-auth", () => ({
	isOperatorHost: state.operatorHost,
	resolveOperatorSession: state.operatorResolve,
}));
vi.mock("@/server/services/tenants", () => ({
	resolveTenantSession: state.resolve,
	resolveHostTenant: state.host,
	listUserTenants: state.list,
	isPlatformAdmin: state.platform,
	createTenant: state.create,
	TenantAccessError: class extends Error {},
}));
vi.mock("@/server/services/settings", async () => {
	const { requireTenant } = await import("@/server/tenant-context");
	return { getVereinsname: async () => { state.settingsRead(); return requireTenant().name; } };
});

import { addTenant, fetchBranding, fetchClubEntry, fetchOperatorSession, fetchSession } from "@/lib/server-fns";

beforeEach(() => {
	state.resolve.mockReset();
	state.identity.mockReset().mockResolvedValue(null);
	state.operatorHost.mockReset().mockReturnValue(false);
	state.operatorResolve.mockReset();
	state.host.mockReset().mockResolvedValue(null);
	state.list.mockReset().mockResolvedValue([]);
	state.platform.mockReset().mockResolvedValue(false);
	state.create.mockReset();
	state.settingsRead.mockClear();
	state.cookie.mockClear();
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


describe("hostname-bound tenant presentation", () => {
	const boundClub = { id: nord, slug: "nord", name: "Nord Demo" };
	const otherClub = { id: SVU_TENANT_ID, slug: "svu", name: "SVU Demo", role: "admin" };

	it("uses only the public registry name for an anonymous bound-host login", async () => {
		state.request = new Request("https://nord.rendant.example/login", { headers: { host: "nord.rendant.example" } });
		state.resolve.mockResolvedValue(null);
		state.host.mockResolvedValue(boundClub);

		expect(await fetchBranding()).toEqual({ vereinsname: "Nord Demo" });
		expect(state.host.mock.calls[0]?.[0].get("host")).toBe("nord.rendant.example");
		expect(state.settingsRead).not.toHaveBeenCalled();
		expect(state.list).not.toHaveBeenCalled();
		expect(state.platform).not.toHaveBeenCalled();
	});

	it("keeps anonymous shared-host branding generic", async () => {
		state.resolve.mockResolvedValue(null);
		expect(await fetchBranding()).toEqual({ vereinsname: "Verein" });
		expect(state.settingsRead).not.toHaveBeenCalled();
	});

	it("does not expose other clubs or operator creation controls on a bound host", async () => {
		state.host.mockResolvedValue(boundClub);
		state.list.mockResolvedValue([otherClub, { ...boundClub, role: "admin" }]);
		state.platform.mockResolvedValue(true);

		const session = await fetchSession(nord);
		expect(session).toMatchObject({ tenantHostBound: true, canCreateTenant: false });
		expect(session?.tenants).toEqual([{ ...boundClub, role: "admin" }]);
		expect(state.list).not.toHaveBeenCalled();
		expect(state.platform).not.toHaveBeenCalled();
	});

	it("retains authorized club choices and operator controls on the shared host", async () => {
		state.list.mockResolvedValue([otherClub, { ...boundClub, role: "admin" }]);
		state.platform.mockResolvedValue(true);

		const session = await fetchSession(nord);
		expect(session).toMatchObject({ tenantHostBound: false, canCreateTenant: true });
		expect(session?.tenants).toHaveLength(2);
		expect(state.list).toHaveBeenCalledWith("synthetic-user");
		expect(state.platform).toHaveBeenCalledWith("synthetic-user");
	});

	it("rejects club creation from a bound hostname before any mutation", async () => {
		state.host.mockResolvedValue(boundClub);
		await expect(addTenant({ name: "Other Club", slug: "other-club" })).rejects.toThrow();
		expect(state.create).not.toHaveBeenCalled();
	});
});


describe("operator realm entry", () => {
	it("renders neutral branding without resolving a club or reading its settings", async () => {
		state.operatorHost.mockReturnValue(true);
		expect(await fetchBranding()).toEqual({ vereinsname: "Vereinsverwaltung", operatorHost: true });
		expect(state.resolve).not.toHaveBeenCalled();
		expect(state.host).not.toHaveBeenCalled();
		expect(state.settingsRead).not.toHaveBeenCalled();
	});

	it("keeps operator identity separate from any club membership payload", async () => {
		const user = { id: "operator", email: "operator@example.invalid", name: "Operator Demo", role: "admin" };
		state.operatorHost.mockReturnValue(true);
		state.operatorResolve.mockResolvedValue({ user, session: {} });
		expect(await fetchOperatorSession()).toEqual({ operatorHost: true, user, forbidden: false });
		expect(state.resolve).not.toHaveBeenCalled();
		expect(state.list).not.toHaveBeenCalled();
	});

	it("distinguishes anonymous access from authenticated access denial", async () => {
		state.operatorHost.mockReturnValue(true);
		state.operatorResolve.mockResolvedValueOnce(null);
		expect(await fetchOperatorSession()).toEqual({ operatorHost: true, user: null, forbidden: false });
		state.operatorResolve.mockRejectedValueOnce(new ORPCError("FORBIDDEN", { message: "Keine Betreiberberechtigung" }));
		expect(await fetchOperatorSession()).toEqual({ operatorHost: true, user: null, forbidden: true });
	});

	it("does not consult operator authentication on a club hostname", async () => {
		expect(await fetchOperatorSession()).toEqual({ operatorHost: false, user: null, forbidden: false });
		expect(state.operatorResolve).not.toHaveBeenCalled();
	});
});


describe("club access recovery", () => {
	it("offers recovery when a valid identity has no active membership for the bound club", async () => {
		const { TenantAccessError } = await import("@/server/services/tenants");
		state.request = new Request("https://nord.rendant.example/login", { headers: { host: "nord.rendant.example", cookie: "existing-session=synthetic" } });
		state.resolve.mockRejectedValue(new TenantAccessError());
		state.host.mockResolvedValue({ id: nord, slug: "nord", name: "Nord Demo" });
		state.identity.mockResolvedValue({ user: { id: "wrong-account", role: "admin" } });
		expect(await fetchClubEntry()).toEqual({ user: null, forbidden: true });
		expect(state.identity).toHaveBeenCalledWith(expect.objectContaining({ query: { disableCookieCache: true } }));
		expect(state.list).not.toHaveBeenCalled();
		expect(state.settingsRead).not.toHaveBeenCalled();
		expect(await fetchBranding()).toEqual({ vereinsname: "Nord Demo" });
		await expect(fetchSession()).rejects.toThrow();
	});

	it("keeps anonymous login available", async () => {
		state.resolve.mockResolvedValue(null);
		expect(await fetchClubEntry()).toEqual({ user: null, forbidden: false });
	});

	it("does not turn an unknown or unbound host denial into a club entry", async () => {
		const { TenantAccessError } = await import("@/server/services/tenants");
		state.resolve.mockRejectedValue(new TenantAccessError());
		await expect(fetchClubEntry()).rejects.toThrow();
		expect(state.identity).not.toHaveBeenCalled();
	});
});
