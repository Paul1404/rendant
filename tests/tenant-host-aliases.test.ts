import { describe, expect, it } from "vitest";
import { configuredTenantHostAliases, configuredTenantCanonicalHosts, configuredTenantHostBindings, tenantCanonicalHost } from "@/lib/tenant-host-aliases";

describe("exact tenant host aliases", () => {
	it("retains the historical club bindings without additional configuration", () => {
		const aliases = configuredTenantHostAliases(undefined);
		expect(aliases.get("rendant.sv-untereuerheim.de")).toBe("svu");
		expect(aliases.get("svufo.sv-untereuerheim.de")).toBe("svu");
		expect(aliases.get("ssv-gaedheim.rendant.pdcd.net")).toBe("ssv-gaedheim");
	});

	it("normalizes exact domains and permits aliases for future clubs", () => {
		const aliases = configuredTenantHostAliases(JSON.stringify({ "CLUB.OLD.EXAMPLE.": "future-club" }));
		expect(aliases.get("club.old.example")).toBe("future-club");
		expect(aliases.get("ssv-gaedheim.rendant.pdcd.net")).toBe("ssv-gaedheim");
	});

	it("rejects invalid mappings and attempts to rebind historical club hosts", () => {
		for (const raw of ["invalid", "null", "[]", '"host"', JSON.stringify({ "*.example.de": "svu" }), JSON.stringify({ "https://old.example": "svu" }), JSON.stringify({ "old.example": "Bad Slug" }), JSON.stringify({ "old.example": null }), JSON.stringify({ "rendant.sv-untereuerheim.de": "ssv-gaedheim" })]) {
			expect(() => configuredTenantHostAliases(raw)).toThrow();
		}
	});
});


describe("stable club slugs and preferred vanity addresses", () => {
	const canonical = JSON.stringify({ svu: "sv-untereuerheim.rendant.app", "ssv-gaedheim": "ssv-gaedheim.rendant.app" });

	it("maps the unchanged SVU slug to its preferred full club hostname", () => {
		expect(tenantCanonicalHost("svu", "rendant.app", canonical)).toBe("sv-untereuerheim.rendant.app");
		expect(tenantCanonicalHost("ssv-gaedheim", "rendant.app", canonical)).toBe("ssv-gaedheim.rendant.app");
		expect(tenantCanonicalHost("future-club", "rendant.app", canonical)).toBe("future-club.rendant.app");
		const bindings = configuredTenantHostBindings(undefined, canonical, "rendant.app");
		expect(bindings.get("sv-untereuerheim.rendant.app")).toBe("svu");
		expect(bindings.get("rendant.sv-untereuerheim.de")).toBe("svu");
	});

	it("does not require duplicate entries in the alias map", () => {
		expect(configuredTenantHostAliases(undefined).has("sv-untereuerheim.rendant.app")).toBe(false);
		expect(configuredTenantHostBindings(undefined, canonical, "rendant.app").get("sv-untereuerheim.rendant.app")).toBe("svu");
	});

	it("rejects duplicate preferred hosts, apex binding and non-exact hostnames", () => {
		for (const config of [{ svu: "rendant.app" }, { svu: "*.rendant.app" }, { svu: "other.example" }, { svu: "nested.club.rendant.app" }, { svu: "https://sv-untereuerheim.rendant.app" }, { svu: "sv-untereuerheim.rendant.app", "ssv-gaedheim": "sv-untereuerheim.rendant.app" }]) {
			expect(() => configuredTenantCanonicalHosts(JSON.stringify(config), "rendant.app")).toThrow();
		}
	});

	it("rejects aliases claiming a canonical address for a different club", () => {
		expect(() => configuredTenantHostBindings(JSON.stringify({ "sv-untereuerheim.rendant.app": "ssv-gaedheim" }), canonical, "rendant.app")).toThrow();
		expect(configuredTenantHostBindings(JSON.stringify({ "sv-untereuerheim.rendant.app": "svu" }), canonical, "rendant.app").get("sv-untereuerheim.rendant.app")).toBe("svu");
	});
});
