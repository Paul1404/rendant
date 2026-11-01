import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBaseUrl, tenantPublicBaseUrl } from "@/server/services/public-url";

const primary = "https://rendant.sv-untereuerheim.de";
const legacySsv = "https://ssv-gaedheim.rendant.pdcd.net";
const ssv = "https://ssv-gaedheim.rendant.app";
const svu = "https://sv-untereuerheim.rendant.app";
const ssvTenant = { id: "00000000-0000-4000-8000-000000000002", slug: "ssv-gaedheim" };
const svuTenant = { id: "00000000-0000-4000-8000-000000000001", slug: "svu" };

beforeEach(() => {
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv("BETTER_AUTH_URL", primary);
	vi.stubEnv("AUTH_TRUSTED_ORIGINS", `${svu},${ssv},${legacySsv}`);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", JSON.stringify({ svu: "sv-untereuerheim.rendant.app", "ssv-gaedheim": "ssv-gaedheim.rendant.app" }));
});
afterEach(() => vi.unstubAllEnvs());

describe("trusted public links", () => {
	it("keeps invitation tokens on the exact approved request origin", () => {
		expect(publicBaseUrl(new Headers({ host: "ssv-gaedheim.rendant.app" }))).toBe(ssv);
		expect(publicBaseUrl(new Headers({ host: "SSV-GAEDHEIM.RENDANT.APP:443" }))).toBe(ssv);
		expect(publicBaseUrl(new Headers({ host: "rendant.sv-untereuerheim.de" }))).toBe(primary);
	});

	it("ignores forwarded-host, forwarded-proto and Origin spoofing", () => {
		expect(publicBaseUrl(new Headers({ host: "rendant.sv-untereuerheim.de", "x-forwarded-host": "ssv-gaedheim.rendant.app", "x-forwarded-proto": "http", origin: "https://evil.example" }))).toBe(primary);
		expect(publicBaseUrl(new Headers({ host: "ssv-gaedheim.rendant.app", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }))).toBe(ssv);
		expect(publicBaseUrl(new Headers({ "x-forwarded-host": "ssv-gaedheim.rendant.app" }))).toBe(primary);
	});

	it("falls back to the configured primary for unknown or malformed authorities", () => {
		for (const host of ["evil.example", "ssv-gaedheim.rendant.app.evil.example", "ssv-gaedheim.rendant.app:444", "ssv-gaedheim.rendant.app@evil.example", "ssv-gaedheim.rendant.app/path", "ssv-gaedheim.rendant.app,evil.example"]) {
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

describe("tenant public links", () => {
	it("uses each club's exact canonical hostname after the cutover gate is active", () => {
		expect(tenantPublicBaseUrl(ssvTenant)).toBe(ssv);
		expect(tenantPublicBaseUrl(svuTenant)).toBe(svu);
		expect(tenantPublicBaseUrl(ssvTenant, new Headers({ host: "rendant.sv-untereuerheim.de" }))).toBe(ssv);
	});

	it("keeps working SVU and SSV legacy links while DNS and TLS are being staged", () => {
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "");
		expect(tenantPublicBaseUrl(svuTenant)).toBe(primary);
		expect(tenantPublicBaseUrl(ssvTenant)).toBe(legacySsv);
		expect(tenantPublicBaseUrl(ssvTenant, new Headers({ host: "rendant.sv-untereuerheim.de", "x-forwarded-host": "ssv-gaedheim.rendant.app" }))).toBe(legacySsv);
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "unready.example");
		expect(tenantPublicBaseUrl(svuTenant)).toBe(primary);
		expect(tenantPublicBaseUrl(ssvTenant)).toBe(legacySsv);
	});

	it("can retain an exact trusted working request origin for that same club", () => {
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "");
		expect(tenantPublicBaseUrl(ssvTenant, new Headers({ host: "ssv-gaedheim.rendant.app" }))).toBe(ssv);
		expect(tenantPublicBaseUrl(ssvTenant, new Headers({ host: "sv-untereuerheim.rendant.app" }))).toBe(legacySsv);
	});

	it("requires exact origin approval for the preferred long SVU hostname", () => {
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", `https://svu.rendant.app,${ssv},${legacySsv}`);
		expect(tenantPublicBaseUrl(svuTenant)).toBe(primary);
		expect(tenantPublicBaseUrl(ssvTenant)).toBe(ssv);
	});

	it("falls back to the club's legacy address when its new origin is missing", () => {
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", `${svu},${legacySsv}`);
		expect(tenantPublicBaseUrl(ssvTenant)).toBe(legacySsv);
		expect(tenantPublicBaseUrl(svuTenant)).toBe(svu);
	});

	it("never sends SSV links to a primary address bound to SVU", () => {
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", svu);
		expect(tenantPublicBaseUrl(ssvTenant)).toBeNull();
		expect(tenantPublicBaseUrl(ssvTenant, new Headers({ host: "sv-untereuerheim.rendant.app" }))).toBeNull();
		expect(tenantPublicBaseUrl({ id: "another-id", slug: "another-club" })).toBeNull();
	});

	it("may use a neutral primary fallback without inventing a club hostname", () => {
		vi.stubEnv("BETTER_AUTH_URL", "https://shared.example");
		vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
		expect(tenantPublicBaseUrl(ssvTenant)).toBe("https://shared.example");
	});

	it("moves links created on legacy domains to the approved canonical club after activation", () => {
		for (const host of ["rendant.sv-untereuerheim.de", "svufo.sv-untereuerheim.de", "ssv-gaedheim.rendant.pdcd.net"]) {
			const headers = new Headers({ host });
			expect(tenantPublicBaseUrl(ssvTenant, headers)).toBe(ssv);
			expect(tenantPublicBaseUrl(svuTenant, headers)).toBe(svu);
		}
	});

	it("rejects malicious canonical maps even while the cutover gate is disabled", () => {
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "");
		for (const value of ["not-json", JSON.stringify({ svu: "evil.example" }), JSON.stringify({ svu: "https://sv-untereuerheim.rendant.app" }), JSON.stringify({ svu: "sv-untereuerheim.rendant.app/path" }), JSON.stringify({ svu: "*.rendant.app" }), JSON.stringify({ svu: "ssv-gaedheim.rendant.app", "ssv-gaedheim": "ssv-gaedheim.rendant.app" })]) {
			vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", value);
			expect(() => tenantPublicBaseUrl(svuTenant)).toThrow();
		}
	});

	it("rejects wildcard and credential-bearing origin configurations", () => {
		for (const configured of ["https://*.rendant.app", "https://username:password@ssv-gaedheim.rendant.app"]) {
			vi.stubEnv("AUTH_TRUSTED_ORIGINS", configured);
			expect(() => publicBaseUrl(new Headers({ host: "ssv-gaedheim.rendant.app" }))).toThrow();
			expect(() => tenantPublicBaseUrl(ssvTenant)).toThrow();
		}
	});
});
