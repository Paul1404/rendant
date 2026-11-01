import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearTenantScope,
	pinTenantScope,
	tenantApiUrl,
	tenantFetch,
	tenantRequestHeaders,
	tenantStorageKey,
} from "@/lib/tenant-client";

const clubA = { tenantId: "club-a", userId: "alice" };
const clubB = { tenantId: "club-b", userId: "alice" };

afterEach(() => {
	clearTenantScope();
	vi.unstubAllGlobals();
});

describe("tenant browser boundaries", () => {
	it("keeps an open tab bound to its club when another tab changes the cookie", async () => {
		vi.stubGlobal("window", {});
		vi.stubGlobal("document", { cookie: "rendant-tenant=club-a" });
		pinTenantScope(clubA);
		vi.stubGlobal("document", { cookie: "rendant-tenant=club-b" });
		const fetch = vi.fn().mockResolvedValue(new Response());
		vi.stubGlobal("fetch", fetch);

		await tenantFetch("/api/import/revenue", { method: "POST" });
		expect(tenantRequestHeaders()).toEqual({ "x-rendant-tenant": "club-a" });
		expect(new Headers(fetch.mock.calls[0]?.[1].headers).get("x-rendant-tenant")).toBe("club-a");
		expect(tenantApiUrl("/api/export?from=2026")).toBe("/api/export?from=2026&tenant=club-a");
	});

	it("separates saved form data by both user and club", () => {
		expect(tenantStorageKey("draft", clubA)).not.toBe(tenantStorageKey("draft", clubB));
		expect(tenantStorageKey("draft", clubA)).not.toBe(tenantStorageKey("draft", { ...clubA, userId: "bob" }));
		expect(tenantStorageKey("draft", null)).toBeNull();
	});

	it("binds server-rendered download links explicitly and preserves existing parameters", () => {
		expect(tenantApiUrl("/api/protokolle/123/pdf?view=1", clubA.tenantId)).toBe("/api/protokolle/123/pdf?view=1&tenant=club-a");
		expect(tenantApiUrl("/api/export?tenant=club-b", clubA.tenantId)).toBe("/api/export?tenant=club-a");
	});

	it("does not keep the previous user's selection after clearing a session", () => {
		vi.stubGlobal("window", {});
		pinTenantScope(clubA);
		clearTenantScope();
		expect(tenantRequestHeaders()).toEqual({});
		expect(tenantStorageKey("draft")).toBeNull();
	});
});
