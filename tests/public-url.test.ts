import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBaseUrl, tenantPublicBaseUrl } from "@/server/services/public-url";

const primary = "https://rendant.sv-untereuerheim.de";
const ssv = "https://ssv-gaedheim.rendant.pdcd.net";
const tenant = { id: "00000000-0000-4000-8000-000000000002", slug: "ssv-gaedheim" };

beforeEach(() => {
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv("BETTER_AUTH_URL", primary);
	vi.stubEnv("AUTH_TRUSTED_ORIGINS", ssv);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.pdcd.net");
});
afterEach(() => vi.unstubAllEnvs());

describe("trusted public links", () => {
	it("keeps invitation tokens on the exact approved request origin", () => {
		expect(publicBaseUrl(new Headers({ host: "ssv-gaedheim.rendant.pdcd.net" }))).toBe(ssv);
		expect(publicBaseUrl(new Headers({ host: "SSV-GAEDHEIM.RENDANT.PDCD.NET:443" }))).toBe(ssv);
		expect(publicBaseUrl(new Headers({ host: "rendant.sv-untereuerheim.de" }))).toBe(primary);
	});

	it("ignores forwarded-host, forwarded-proto and Origin spoofing", () => {
		expect(publicBaseUrl(new Headers({ host: "rendant.sv-untereuerheim.de", "x-forwarded-host": "ssv-gaedheim.rendant.pdcd.net", "x-forwarded-proto": "http", origin: "https://evil.example" }))).toBe(primary);
		expect(publicBaseUrl(new Headers({ host: "ssv-gaedheim.rendant.pdcd.net", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }))).toBe(ssv);
		expect(publicBaseUrl(new Headers({ "x-forwarded-host": "ssv-gaedheim.rendant.pdcd.net" }))).toBe(primary);
	});

	it("falls back to the configured primary for unknown or malformed authorities", () => {
		for (const host of ["evil.example", "ssv-gaedheim.rendant.pdcd.net.evil.example", "ssv-gaedheim.rendant.pdcd.net:444", "ssv-gaedheim.rendant.pdcd.net@evil.example", "ssv-gaedheim.rendant.pdcd.net/path", "ssv-gaedheim.rendant.pdcd.net,evil.example"]) {
			expect(publicBaseUrl(new Headers({ host }))).toBe(primary);
		}
	});

	it("never invents a production link without a trusted configured origin", () => {
		vi.stubEnv("BETTER_AUTH_URL", "");
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
		expect(publicBaseUrl(new Headers({ host: "evil.example" }))).toBeNull();
		expect(publicBaseUrl(new Headers({ host: "localhost:3000" }))).toBeNull();
	});

	it("permits localhost development previews without trusting external hosts", () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("BETTER_AUTH_URL", "");
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
		expect(publicBaseUrl(new Headers({ host: "localhost:3001", "x-forwarded-proto": "https" }))).toBe("http://localhost:3001");
		expect(publicBaseUrl(new Headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
		expect(publicBaseUrl(new Headers({ host: "localhost.evil.example:3000" }))).toBeNull();
	});
});

describe("tenant notification links", () => {
	it("uses the registered SSV alias even when the action came from the shared host", () => {
		expect(tenantPublicBaseUrl(tenant)).toBe(ssv);
		expect(tenantPublicBaseUrl(tenant, new Headers({ host: "rendant.sv-untereuerheim.de" }))).toBe(ssv);
	});

	it("keeps the primary address when the tenant alias has not been approved", () => {
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
		expect(tenantPublicBaseUrl(tenant)).toBe(primary);
		expect(tenantPublicBaseUrl(tenant, new Headers({ host: "ssv-gaedheim.rendant.pdcd.net" }))).toBe(primary);
	});

	it("never uses another club's alias or invents DNS for other tenant slugs", () => {
		expect(tenantPublicBaseUrl({ id: "another-id", slug: "another-club" }, new Headers({ host: "ssv-gaedheim.rendant.pdcd.net" }))).toBe(primary);
		expect(tenantPublicBaseUrl({ id: "svu-id", slug: "svu" })).toBe(primary);
		vi.stubEnv("TENANT_BASE_DOMAIN", "unapproved.example");
		expect(tenantPublicBaseUrl(tenant)).toBe(primary);
	});

	it("rejects wildcard and credential-bearing configurations before generating links", () => {
		for (const configured of ["https://*.rendant.pdcd.net", "https://username:password@ssv-gaedheim.rendant.pdcd.net"]) {
			vi.stubEnv("AUTH_TRUSTED_ORIGINS", configured);
			expect(() => publicBaseUrl(new Headers({ host: "ssv-gaedheim.rendant.pdcd.net" }))).toThrow();
			expect(() => tenantPublicBaseUrl(tenant)).toThrow();
		}
	});
});
