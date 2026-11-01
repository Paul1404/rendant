import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), select: vi.fn() }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: state.session } } }));
vi.mock("@/server/db", () => ({ globalDb: { select: state.select }, db: {} }));
import { resolveHostTenant, resolveTenantSession } from "@/server/services/tenants";
import { tenantSlugForHost } from "@/server/tenant-hostname";
import { configuredTenantHostBindings, tenantCanonicalHost } from "@/lib/tenant-host-aliases";

beforeEach(() => {
	vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", "");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	state.session.mockReset();
	state.select.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("operator host contains no financial tenant context", () => {
	it("never interprets admin as a club slug", () => {
		expect(tenantSlugForHost("admin.rendant.app")).toBeNull();
		vi.stubEnv("TENANT_ADMIN_HOST", "");
		expect(tenantSlugForHost("admin.rendant.app")).toBeNull();
		expect(() => tenantCanonicalHost("admin", "rendant.app", undefined)).toThrow();
	});

	it("rejects financial tenant resolution even with a valid SVU selector", async () => {
		const headers = new Headers({ host: "admin.rendant.app", "x-rendant-tenant": "00000000-0000-4000-8000-000000000001", cookie: "rendant-tenant=svu" });
		await expect(resolveHostTenant(headers)).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(resolveTenantSession(headers)).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(state.session).not.toHaveBeenCalled();
		expect(state.select).not.toHaveBeenCalled();
	});

	it("rejects aliases or preferred addresses that assign admin to a club", () => {
		expect(() => configuredTenantHostBindings(JSON.stringify({ "admin.rendant.app": "svu" }), undefined, "rendant.app")).toThrow();
		expect(() => configuredTenantHostBindings(undefined, JSON.stringify({ svu: "admin.rendant.app" }), "rendant.app")).toThrow();
	});
});
