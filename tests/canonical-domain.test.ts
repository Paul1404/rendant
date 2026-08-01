import { describe, expect, it } from "vitest";
import {
	CANONICAL_HOST,
	legacyDomainRedirect,
} from "@/lib/canonical-domain";

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

	it("uses Railway's forwarded host when the internal request URL differs", () => {
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

		expect(response?.headers.get("location")).toBe(
			`https://${CANONICAL_HOST}/login?from=%2Fprotokolle`,
		);
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
