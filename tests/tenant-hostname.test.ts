import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: {} }));
const registry = vi.hoisted(() => ({ rows: [] as Array<{ id: string; slug: string; name: string }> }));
vi.mock("@/server/db", () => ({ globalDb: { select: () => ({ from: () => ({ where: () => ({ limit: async () => registry.rows }) }) }) } }));
import {
	resolveHostTenant,
	selectTenantForHost,
	TenantAccessError,
	type TenantMembership,
} from "@/server/services/tenants";
import { tenantRequestHeaders } from "@/server/tenant-context";
import { tenantSlugForHost, TenantHostnameError } from "@/server/tenant-hostname";

const base = "rendant.pdcd.net";
const ssv: TenantMembership = { id: "00000000-0000-4000-8000-000000000002", slug: "ssv-gaedheim", name: "SSV Gädheim", role: "admin" };
const svu: TenantMembership = { id: "00000000-0000-4000-8000-000000000001", slug: "svu", name: "SVU", role: "admin" };

beforeEach(() => vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", ""));
afterEach(() => { vi.unstubAllEnvs(); registry.rows = []; });

describe("tenant hostname boundary", () => {
	it("maps only an exact one-level club subdomain", () => {
		expect(tenantSlugForHost("ssv-gaedheim.rendant.pdcd.net", base)).toBe("ssv-gaedheim");
		expect(tenantSlugForHost("SSV-GAEDHEIM.RENDANT.PDCD.NET.:443", base)).toBe("ssv-gaedheim");
		for (const neutral of ["rendant.pdcd.net", "rendant.pdcd.net.attacker.example", "127.0.0.1:3000"]) {
			expect(tenantSlugForHost(neutral, base)).toBeNull();
		}
		expect(tenantSlugForHost("ssv-gaedheim.rendant.pdcd.net", "")).toBe("ssv-gaedheim");
	});

	it("rejects nested or malformed club authorities instead of treating them as a shared host", () => {
		for (const authority of ["other.ssv-gaedheim.rendant.pdcd.net", "-ssv.rendant.pdcd.net", "ssv-.rendant.pdcd.net", "ssv.rendant.pdcd.net,evil.example", "ssv.rendant.pdcd.net/path", "evil@ssv.rendant.pdcd.net"]) {
			expect(() => tenantSlugForHost(authority, base)).toThrow(TenantHostnameError);
		}
	});

	it("pins a bound host even when a different cookie was selected", () => {
		const headers = new Headers({ host: "ssv-gaedheim.rendant.pdcd.net", cookie: `rendant-tenant=${svu.id}` });
		expect(selectTenantForHost([svu, ssv], headers, ssv)).toEqual(ssv);
		expect(() => selectTenantForHost([svu], headers, ssv)).toThrow(TenantAccessError);
	});

	it("denies another club's explicit header or pinned-tab selector even for dual members", () => {
		for (const other of [svu.id, svu.slug, "", "missing"]) {
			expect(() => selectTenantForHost([svu, ssv], new Headers({ "x-rendant-tenant": other }), ssv)).toThrow(TenantAccessError);
		}
		for (const own of [ssv.id, ssv.slug]) {
			expect(selectTenantForHost([svu, ssv], new Headers({ "x-rendant-tenant": own }), ssv)).toEqual(ssv);
		}
	});

	it("denies query selectors that disagree with the actual host", () => {
		const headers = tenantRequestHeaders(new Request(`https://ssv-gaedheim.rendant.pdcd.net/api/export?tenant=${svu.id}`));
		expect(() => selectTenantForHost([svu, ssv], headers, ssv)).toThrow(TenantAccessError);
	});

	it("ignores spoofed forwarded or custom host selectors", () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", base);
		const headers = tenantRequestHeaders(new Request("https://ssv-gaedheim.rendant.pdcd.net/api/export", { headers: { "x-forwarded-host": "svu.rendant.pdcd.net", "x-rendant-host": "svu.rendant.pdcd.net" } }));
		expect(tenantSlugForHost(headers.get("host"))).toBe("ssv-gaedheim");
	});

	it("normalizes absent Host and rejects mismatched request authorities", () => {
		expect(tenantRequestHeaders(new Request("https://ssv-gaedheim.rendant.pdcd.net/api/export")).get("host")).toBe("ssv-gaedheim.rendant.pdcd.net");
		expect(() => tenantRequestHeaders(new Request("https://ssv-gaedheim.rendant.pdcd.net/api/export", { headers: { host: "svu.rendant.pdcd.net" } }))).toThrow("Widersprüchliche Vereinsauswahl");
	});

	it("looks up registered clubs and refuses unknown host slugs without SVU fallback", async () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", base);
		registry.rows = [];
		await expect(resolveHostTenant(new Headers({ host: "unknown.rendant.pdcd.net" }))).rejects.toThrow(TenantAccessError);
		registry.rows = [{ id: ssv.id, slug: ssv.slug, name: ssv.name }];
		await expect(resolveHostTenant(new Headers({ host: "ssv-gaedheim.rendant.pdcd.net" }))).resolves.toEqual({ id: ssv.id, slug: ssv.slug, name: ssv.name });
		await expect(resolveHostTenant(new Headers({ host: "unrelated.example", "x-forwarded-host": "ssv-gaedheim.rendant.pdcd.net" }))).resolves.toBeNull();
	});

	it("retains explicit switching on neutral shared hosts", () => {
		expect(selectTenantForHost([svu, ssv], new Headers({ "x-rendant-tenant": svu.id }), null)).toEqual(svu);
	});
});


describe("legacy host isolation after a product domain change", () => {
	it("keeps all old club hosts bound while the new apex remains shared", () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		expect(tenantSlugForHost("rendant.app")).toBeNull();
		for (const host of ["rendant.sv-untereuerheim.de", "svufo.sv-untereuerheim.de", "svu.rendant.app"]) expect(tenantSlugForHost(host)).toBe("svu");
		for (const host of ["ssv-gaedheim.rendant.pdcd.net", "ssv-gaedheim.rendant.app"]) expect(tenantSlugForHost(host)).toBe("ssv-gaedheim");
	});

	it("does not let old SSV requests follow an SVU cookie or explicit selector", () => {
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		const headers = tenantRequestHeaders(new Request("https://ssv-gaedheim.rendant.pdcd.net/api/export", { headers: { cookie: `rendant-tenant=${svu.id}` } }));
		expect(tenantSlugForHost(headers.get("host"))).toBe(ssv.slug);
		expect(selectTenantForHost([ssv, svu], headers, ssv)).toEqual(ssv);
		headers.set("x-rendant-tenant", svu.id);
		expect(() => selectTenantForHost([ssv, svu], headers, ssv)).toThrow(TenantAccessError);
	});

	it("resolves configured future aliases without new source-specific clubs", () => {
		expect(tenantSlugForHost("club.old.example", "rendant.app", JSON.stringify({ "club.old.example": "future-club" }))).toBe("future-club");
	});

	it("fails closed on wildcard, rebinding or conflicting alias configuration", () => {
		for (const config of [{ "*.old.example": "svu" }, { "ssv-gaedheim.rendant.pdcd.net": "svu" }, { "rendant.app": "svu" }, { "svu.rendant.app": "ssv-gaedheim" }, { "new.example": "Bad Slug" }]) {
			expect(() => tenantSlugForHost(Object.keys(config)[0], "rendant.app", JSON.stringify(config))).toThrow();
		}
	});
});


describe("SVU vanity host uses the existing tenant identity", () => {
	beforeEach(() => {
		vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
		vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", JSON.stringify({ svu: "sv-untereuerheim.rendant.app", "ssv-gaedheim": "ssv-gaedheim.rendant.app" }));
	});

	it("resolves the full public name to the unchanged svu slug and tenant UUID", async () => {
		expect(tenantSlugForHost("sv-untereuerheim.rendant.app")).toBe("svu");
		registry.rows = [{ id: svu.id, slug: "svu", name: "SVU" }];
		await expect(resolveHostTenant(new Headers({ host: "sv-untereuerheim.rendant.app" }))).resolves.toEqual({ id: svu.id, slug: "svu", name: "SVU" });
	});

	it("denies an SSV selector on the preferred SVU host even for dual memberships", () => {
		const headers = tenantRequestHeaders(new Request("https://sv-untereuerheim.rendant.app/api/export", { headers: { "x-rendant-tenant": ssv.id } }));
		expect(tenantSlugForHost(headers.get("host"))).toBe("svu");
		expect(() => selectTenantForHost([svu, ssv], headers, svu)).toThrow(TenantAccessError);
		headers.set("x-rendant-tenant", svu.id);
		expect(selectTenantForHost([svu, ssv], headers, svu)).toEqual(svu);
	});
});
