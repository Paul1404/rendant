import { describe, expect, it } from "vitest";
import { resolveTrustedOrigins } from "@/server/auth-origins";

describe("trusted authentication origins", () => {
	it("normalizes the primary URL and permits transition aliases", () => {
		expect(
			resolveTrustedOrigins(
				"https://rendant.example.de/",
				" https://svufo.example.de/, https://rendant.example.de ",
			),
		).toEqual([
			"http://localhost:3000",
			"https://rendant.example.de",
			"https://svufo.example.de",
		]);
	});
});

describe("tenant authentication origin boundaries", () => {
	it("allows the exact approved SSV origin without trusting the parent wildcard", () => {
		expect(resolveTrustedOrigins("https://rendant.sv-untereuerheim.de", "https://ssv-gaedheim.rendant.pdcd.net", "production")).toEqual(["https://rendant.sv-untereuerheim.de", "https://ssv-gaedheim.rendant.pdcd.net"]);
	});

	it("rejects wildcard, credential-bearing, non-HTTP and path-bearing origins", () => {
		for (const invalid of ["https://*.rendant.pdcd.net", "https://user:password@ssv-gaedheim.rendant.pdcd.net", "file:///tmp/test", "https://ssv-gaedheim.rendant.pdcd.net/another/path", "https://ssv-gaedheim.rendant.pdcd.net?query=1", "ssv-gaedheim.rendant.pdcd.net"]) {
			expect(() => resolveTrustedOrigins("https://rendant.sv-untereuerheim.de", invalid, "production")).toThrow();
		}
	});
});


describe("product domain authentication continuity", () => {
	it("retains exact old and new origins while using the new shared primary", () => {
		const aliases = ["https://svu.rendant.app", "https://ssv-gaedheim.rendant.app", "https://rendant.sv-untereuerheim.de", "https://svufo.sv-untereuerheim.de", "https://ssv-gaedheim.rendant.pdcd.net"];
		expect(resolveTrustedOrigins("https://rendant.app", aliases.join(","), "production")).toEqual(["https://rendant.app", ...aliases]);
	});
});
