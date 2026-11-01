import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveVereinsname } from "@/server/services/settings";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const svu = { id: SVU_TENANT_ID, slug: "svu", name: "SVU" };
const other = { id: "00000000-0000-4000-8000-000000000002", slug: "other", name: "Anderer Verein" };

afterEach(() => vi.unstubAllEnvs());

describe("tenant-specific club name", () => {
	it("preserves the deployment fallback only for the existing SVU tenant", () => {
		vi.stubEnv("VEREINSNAME", "Sportverein SVU");
		expect(withTenant(svu, () => resolveVereinsname())).toBe("Sportverein SVU");
		expect(withTenant(other, () => resolveVereinsname())).toBe("Verein");
	});

	it("uses each club's configured name on documents", () => {
		vi.stubEnv("VEREINSNAME", "Sportverein SVU");
		expect(withTenant(other, () => resolveVereinsname("  Eigener Verein  "))).toBe("Eigener Verein");
		expect(withTenant(svu, () => resolveVereinsname("Neuer SVU-Name"))).toBe("Neuer SVU-Name");
	});

	it("requires a verified tenant context even when a stored name is supplied", () => {
		expect(() => resolveVereinsname("Verein")).toThrow("Vereinskontext");
	});
});
