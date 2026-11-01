import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: {} }));
vi.mock("@/server/db", () => ({ globalDb: {} }));
import {
	requestedTenant,
	selectTenant,
	SVU_TENANT_ID,
	TenantAccessError,
	type TenantMembership,
} from "@/server/services/tenants";

const available: TenantMembership[] = [
	{ id: "other-tenant", slug: "another-club", name: "Another Club", role: "user" },
	{ id: SVU_TENANT_ID, slug: "svu", name: "SVU", role: "admin" },
];

describe("tenant selection", () => {
	it("keeps SVU as the default for existing members", () => {
		expect(selectTenant(available, null)?.id).toBe(SVU_TENANT_ID);
		expect(selectTenant([available[0]], null)?.id).toBe("other-tenant");
		expect(selectTenant([], null)).toBeNull();
	});

	it("requires membership for every explicit selector instead of falling back", () => {
		expect(selectTenant(available, "another-club")?.role).toBe("user");
		expect(selectTenant(available, SVU_TENANT_ID)?.role).toBe("admin");
		for (const selector of ["unrelated-club", "", "svu "]) {
			expect(() => selectTenant(available, selector)).toThrow(TenantAccessError);
		}
		expect(() => selectTenant([], "svu")).toThrow(TenantAccessError);
	});

	it("uses the request header ahead of a stale cookie", () => {
		expect(requestedTenant(new Headers({ "x-rendant-tenant": "another-club", cookie: "rendant-tenant=svu" }))).toBe("another-club");
		expect(requestedTenant(new Headers({ "x-rendant-tenant": "", cookie: "rendant-tenant=svu" }))).toBe("");
	});

	it("reads only the exact tenant cookie and rejects malformed encodings", () => {
		expect(requestedTenant(new Headers({ cookie: "another=1; rendant-tenant=another%2Dclub; session=2" }))).toBe("another-club");
		expect(requestedTenant(new Headers({ cookie: "not-rendant-tenant=svu" }))).toBeNull();
		expect(() => requestedTenant(new Headers({ cookie: "rendant-tenant=%zz" }))).toThrow(TenantAccessError);
	});
});
