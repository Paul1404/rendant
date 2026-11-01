import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => { vi.unstubAllEnvs(); registry.rows = []; });

describe("tenant hostname boundary", () => {
	it("maps only an exact one-level club subdomain", () => {
		expect(tenantSlugForHost("ssv-gaedheim.rendant.pdcd.net", base)).toBe("ssv-gaedheim");
		expect(tenantSlugForHost("SSV-GAEDHEIM.RENDANT.PDCD.NET.:443", base)).toBe("ssv-gaedheim");
		for (const neutral of ["rendant.pdcd.net", "rendant.sv-untereuerheim.de", "svufo.sv-untereuerheim.de", "rendant.pdcd.net.attacker.example", "127.0.0.1:3000"]) {
			expect(tenantSlugForHost(neutral, base)).toBeNull();
		}
		expect(tenantSlugForHost("ssv-gaedheim.rendant.pdcd.net", "")).toBeNull();
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
		await expect(resolveHostTenant(new Headers({ host: "rendant.sv-untereuerheim.de", "x-forwarded-host": "ssv-gaedheim.rendant.pdcd.net" }))).resolves.toBeNull();
	});

	it("retains explicit switching on neutral shared hosts", () => {
		expect(selectTenantForHost([svu, ssv], new Headers({ "x-rendant-tenant": svu.id }), null)).toEqual(svu);
	});
});
