import { describe, expect, it } from "vitest";
import { currentTenant, requireTenant, SVU_TENANT_ID, withTenant, withTenantRequest, pinResolvedRequestTenant, resolvedRequestTenant, tenantRequestHeaders } from "@/server/tenant-context";

const svu = { id: SVU_TENANT_ID, slug: "svu", name: "SVU" };

describe("tenant async context", () => {
	it("executes lazy thenables inside the selected tenant and clears the outer scope", async () => {
		const result = withTenant(svu, () => ({
			then(resolve: (value: string) => unknown) {
				return Promise.resolve(resolve(requireTenant().id));
			},
		}));
		expect(currentTenant()).toBeUndefined();
		expect(await result).toBe(SVU_TENANT_ID);
		expect(currentTenant()).toBeUndefined();
	});

	it("preserves synchronous callbacks and rejects unscoped business work", () => {
		expect(withTenant(svu, () => requireTenant().slug)).toBe("svu");
		expect(() => requireTenant()).toThrow("Vereinskontext fehlt");
	});
 it("keeps concurrent SSR selections isolated", async () => {
  const values = await Promise.all(["club-a", "club-b"].map((id) => withTenantRequest(async () => {
   pinResolvedRequestTenant(id);
   await Promise.resolve();
   return resolvedRequestTenant();
  })));
  expect(values).toEqual(["club-a", "club-b"]);
  expect(resolvedRequestTenant()).toBeUndefined();
 });
 it("rejects conflicting explicit download and request selections", () => {
  const request = new Request("http://localhost/api/export?tenant=club-a", {headers:{"x-rendant-tenant":"club-b"}});
  expect(() => tenantRequestHeaders(request)).toThrow("Widersprüchliche Vereinsauswahl");
 });

});
