import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ tenantId: "00000000-0000-4000-8000-000000000002" as string | null }));
vi.mock("@/server/tenant-context", () => ({
	SVU_TENANT_ID: "00000000-0000-4000-8000-000000000001",
	requireTenant: () => {
		if (!state.tenantId) throw new Error("Verein fehlt");
		return { id: state.tenantId };
	},
}));

import { assertTenantObjectKey, deleteObject, downloadObject, uploadObject } from "@/server/services/s3";

const ownPrefix = "tenants/00000000-0000-4000-8000-000000000002/";
const otherPrefix = "tenants/00000000-0000-4000-8000-000000000003/";

beforeEach(() => { state.tenantId = "00000000-0000-4000-8000-000000000002"; });

describe("tenant storage isolation", () => {
	it("allows namespaced keys only for the current tenant", () => {
		expect(() => assertTenantObjectKey(`${ownPrefix}protokolle/01.pdf`, "write")).not.toThrow();
		expect(() => assertTenantObjectKey(`${ownPrefix}historical-sources/hash/original.xlsx`, "read")).not.toThrow();
		expect(() => assertTenantObjectKey(`${otherPrefix}protokolle/01.pdf`, "read")).toThrow("Verein");
	});

	it("preserves legacy SVU documents without opening them to other clubs", () => {
		for (const key of ["protokolle/01.pdf", "historical-sources/hash/original.xlsx"]) {
			expect(() => assertTenantObjectKey(key, "read")).toThrow("Verein");
			state.tenantId = "00000000-0000-4000-8000-000000000001";
			expect(() => assertTenantObjectKey(key, "read")).not.toThrow();
			expect(() => assertTenantObjectKey(key, "write")).toThrow("Verein");
			state.tenantId = "00000000-0000-4000-8000-000000000002";
		}
	});

	it("rejects ambiguous paths and missing context", () => {
		for (const key of [`${ownPrefix}../protokolle/x.pdf`, `${ownPrefix}./x.pdf`, `${ownPrefix}/x.pdf`, otherPrefix]) {
			expect(() => assertTenantObjectKey(key, "read")).toThrow();
		}
		state.tenantId = null;
		expect(() => assertTenantObjectKey(`${ownPrefix}protokolle/01.pdf`, "read")).toThrow();
	});

	it("rejects cross-tenant operations before contacting object storage", async () => {
		const key = `${otherPrefix}protokolle/01.pdf`;
		await expect(downloadObject(key)).rejects.toThrow("Verein");
		await expect(deleteObject(key)).rejects.toThrow("Verein");
		await expect(uploadObject(key, new Uint8Array([1]), "application/pdf")).rejects.toThrow("Verein");
	});
});
