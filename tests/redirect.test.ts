import { describe, expect, it } from "vitest";
import { sanitizeAuthRedirect } from "@/lib/redirect";

describe("sanitizeAuthRedirect", () => {
	it("keeps same-origin relative paths", () => {
		expect(sanitizeAuthRedirect("/protokolle")).toBe("/protokolle");
		expect(sanitizeAuthRedirect("/protokolle/abc?x=1")).toBe(
			"/protokolle/abc?x=1",
		);
	});

	it("rejects external and unsafe redirects", () => {
		expect(sanitizeAuthRedirect("//example.com")).toBe("/protokolle");
		expect(sanitizeAuthRedirect("https://example.com")).toBe("/protokolle");
		expect(sanitizeAuthRedirect("javascript:alert(1)")).toBe("/protokolle");
		expect(sanitizeAuthRedirect("/\\example.com")).toBe("/protokolle");
	});

	it("falls back for empty values", () => {
		expect(sanitizeAuthRedirect("")).toBe("/protokolle");
		expect(sanitizeAuthRedirect(undefined)).toBe("/protokolle");
	});
});
