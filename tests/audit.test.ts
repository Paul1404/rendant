import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit";

describe("sanitizeAuditMetadata", () => {
	it("redacts secrets recursively and keeps useful context", () => {
		expect(
			sanitizeAuditMetadata({
				format: "csv",
				password: "do-not-store",
				nested: {
					authorization: "Bearer secret",
					count: 4,
				},
			}),
		).toEqual({
			format: "csv",
			password: "[REDACTED]",
			nested: {
				authorization: "[REDACTED]",
				count: 4,
			},
		});
	});

	it("caps strings and collection sizes", () => {
		const result = sanitizeAuditMetadata({
			text: "x".repeat(700),
			items: Array.from({ length: 70 }, (_, index) => index),
		});
		expect(result.text).toBe("x".repeat(500));
		expect(result.items).toHaveLength(50);
	});
});
