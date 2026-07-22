import { describe, expect, it } from "vitest";
import { requestIdFromHeaders } from "@/server/request-id";

describe("request IDs", () => {
	it("preserves a valid upstream UUID", () => {
		const requestId = "123e4567-e89b-42d3-a456-426614174000";
		expect(requestIdFromHeaders(new Headers({ "x-request-id": requestId }))).toBe(
			requestId,
		);
	});

	it.each(["not-a-uuid", "123e4567-e89b-02d3-a456-426614174000", ""]) (
		"replaces an invalid upstream value: %s",
		(value) => {
			const generated = requestIdFromHeaders(
				new Headers({ "x-request-id": value }),
			);
			expect(generated).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
			expect(generated).not.toBe(value);
		},
	);
});
