import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legacyDomainRedirect } from "@/lib/canonical-domain";
const CANONICAL_HOST = "svu.rendant.app";

beforeEach(() => { vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app"); vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app"); vi.stubEnv("TENANT_HOST_ALIASES_JSON", ""); vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("legacy domain redirect", () => {
	it("preserves the path and query string", () => {
		const response = legacyDomainRedirect(
			new Request(
				"https://svufo.sv-untereuerheim.de/protokolle/abc?view=1&year=2026",
			),
		);

		expect(response?.status).toBe(308);
		expect(response?.headers.get("location")).toBe(
			`https://${CANONICAL_HOST}/protokolle/abc?view=1&year=2026`,
		);
	});

	it("ignores a forwarded host that differs from the actual request authority", () => {
		const response = legacyDomainRedirect(
			new Request(
				"http://rendant-app.railway.internal:8080/login?from=%2Fprotokolle",
				{
					headers: {
						"x-forwarded-host": "svufo.sv-untereuerheim.de:443",
					},
				},
			),
		);

		expect(response).toBeNull();
	});

	it("does not redirect the canonical or unrelated hosts", () => {
		expect(
			legacyDomainRedirect(
				new Request(`https://${CANONICAL_HOST}/protokolle`),
			),
		).toBeNull();
		expect(
			legacyDomainRedirect(
				new Request("https://svufo.example.de/protokolle"),
			),
		).toBeNull();
	});

	it.each([
		"/api/health",
		"/api/rpc/dashboard.stats",
		"/_serverFn/branding",
		"/assets/app.js",
		"/favicon.svg",
		"/manifest.webmanifest",
	])("keeps compatibility request %s on the legacy host", (pathname) => {
		expect(
			legacyDomainRedirect(
				new Request(`https://svufo.sv-untereuerheim.de${pathname}`),
			),
		).toBeNull();
	});

	it("keeps non-navigation writes on the legacy host", () => {
		expect(
			legacyDomainRedirect(
				new Request("https://svufo.sv-untereuerheim.de/protokolle", {
					method: "POST",
				}),
			),
		).toBeNull();
	});
});


describe("product domain transition", () => {
	beforeEach(() => vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app"));

	it.each([
		["rendant.sv-untereuerheim.de", "svu"],
		["svufo.sv-untereuerheim.de", "svu"],
		["ssv-gaedheim.rendant.pdcd.net", "ssv-gaedheim"],
	])("redirects %s normal pages to their existing club", (host, slug) => {
		const response = legacyDomainRedirect(new Request(`https://${host}/protokolle/abc?view=1&year=2026`));
		expect(response?.status).toBe(308);
		expect(response?.headers.get("location")).toBe(`https://${slug}.rendant.app/protokolle/abc?view=1&year=2026`);
	});

	it.each(["rendant.sv-untereuerheim.de", "svufo.sv-untereuerheim.de", "ssv-gaedheim.rendant.pdcd.net"])("keeps compatibility requests on %s", (host) => {
		for (const path of ["/api/rpc/settings.verein", "/api/mcp", "/api/auth/sign-in/email", "/assets/app.js", "/_serverFn/session", "/favicon.svg"]) {
			expect(legacyDomainRedirect(new Request(`https://${host}${path}`))).toBeNull();
		}
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			expect(legacyDomainRedirect(new Request(`https://${host}/protokolle`, { method }))).toBeNull();
		}
	});

	it.each(["rendant.app", "svu.rendant.app", "ssv-gaedheim.rendant.app", "unknown.rendant.app", "unrelated.example"])("does not redirect current or unknown host %s", (host) => {
		expect(legacyDomainRedirect(new Request(`https://${host}/login`))).toBeNull();
	});

	it("supports future legacy aliases through exact public configuration", () => {
		vi.stubEnv("TENANT_HOST_ALIASES_JSON", JSON.stringify({ "club.old.example": "another-club" }));
		expect(legacyDomainRedirect(new Request("https://club.old.example/settings"))?.headers.get("location")).toBe("https://another-club.rendant.app/settings");
	});

	it("does not redirect on a spoofed forwarded or mismatched Host", () => {
		expect(legacyDomainRedirect(new Request("https://rendant.app/login", { headers: { "x-forwarded-host": "ssv-gaedheim.rendant.pdcd.net" } }))).toBeNull();
		expect(legacyDomainRedirect(new Request("https://rendant.app/login", { headers: { host: "ssv-gaedheim.rendant.pdcd.net" } }))).toBeNull();
	});
});


describe("safe canonical redirect activation", () => {
	it("keeps old club navigation live until the DNS and TLS redirect gate is enabled", () => {
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "");
		for (const host of ["rendant.sv-untereuerheim.de", "svufo.sv-untereuerheim.de", "ssv-gaedheim.rendant.pdcd.net"]) {
			expect(legacyDomainRedirect(new Request(`https://${host}/protokolle`))).toBeNull();
		}
	});

	it("refuses a redirect target outside the configured tenant base", () => {
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "another.example");
		expect(() => legacyDomainRedirect(new Request("https://ssv-gaedheim.rendant.pdcd.net/protokolle"))).toThrow("Die Weiterleitungsdomain muss");
	});

	it("refuses malformed canonical domains", () => {
		for (const invalid of ["https://rendant.app", "*.rendant.app", "rendant.app/path"]) {
			vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", invalid);
			expect(() => legacyDomainRedirect(new Request("https://ssv-gaedheim.rendant.pdcd.net/protokolle"))).toThrow();
		}
	});
});


describe("preferred club addresses without database slug changes", () => {
	beforeEach(() => vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", JSON.stringify({ svu: "sv-untereuerheim.rendant.app", "ssv-gaedheim": "ssv-gaedheim.rendant.app" })));

	it.each(["rendant.sv-untereuerheim.de", "svufo.sv-untereuerheim.de"])("redirects %s to the full SVU hostname", (host) => {
		expect(legacyDomainRedirect(new Request(`https://${host}/protokolle/receipt?view=1`))?.headers.get("location")).toBe("https://sv-untereuerheim.rendant.app/protokolle/receipt?view=1");
	});

	it("keeps SSV's requested address and never loops on either canonical host", () => {
		expect(legacyDomainRedirect(new Request("https://ssv-gaedheim.rendant.pdcd.net/settings"))?.headers.get("location")).toBe("https://ssv-gaedheim.rendant.app/settings");
		for (const host of ["sv-untereuerheim.rendant.app", "ssv-gaedheim.rendant.app"]) expect(legacyDomainRedirect(new Request(`https://${host}/protokolle`))).toBeNull();
	});

	it("keeps both old club hosts live before redirect activation and preserves compatibility afterwards", () => {
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "");
		expect(legacyDomainRedirect(new Request("https://rendant.sv-untereuerheim.de/protokolle"))).toBeNull();
		expect(legacyDomainRedirect(new Request("https://ssv-gaedheim.rendant.pdcd.net/protokolle"))).toBeNull();
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app");
		for (const host of ["rendant.sv-untereuerheim.de", "ssv-gaedheim.rendant.pdcd.net"]) {
			for (const path of ["/api/mcp", "/assets/app.js", "/_serverFn/session"]) expect(legacyDomainRedirect(new Request(`https://${host}${path}`))).toBeNull();
			expect(legacyDomainRedirect(new Request(`https://${host}/protokolle`, { method: "POST" }))).toBeNull();
		}
	});
});
