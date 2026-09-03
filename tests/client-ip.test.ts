import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/server/orpc/context";

const headers = (init: Record<string, string>) => new Headers(init);

describe("clientIpFromHeaders", () => {
	// This value gates the login rate limiter and is written to every audit row,
	// so the hop assumption is pinned rather than left implicit.
	it("takes the last forwarded address, appended by the trusted proxy", () => {
		expect(
			clientIpFromHeaders(headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" })),
		).toBe("203.0.113.7");
	});

	it("ignores a client-supplied first entry", () => {
		// A caller can put anything in the first position; it must not become the
		// bucket key, or the per-IP limit is trivially evaded.
		expect(
			clientIpFromHeaders(
				headers({ "x-forwarded-for": "127.0.0.1, 198.51.100.4" }),
			),
		).toBe("198.51.100.4");
	});

	it("handles a single address and stray whitespace", () => {
		expect(clientIpFromHeaders(headers({ "x-forwarded-for": " 198.51.100.9 " }))).toBe(
			"198.51.100.9",
		);
	});

	it("falls back to x-real-ip, then cf-connecting-ip", () => {
		expect(clientIpFromHeaders(headers({ "x-real-ip": "203.0.113.1" }))).toBe(
			"203.0.113.1",
		);
		expect(
			clientIpFromHeaders(headers({ "cf-connecting-ip": "203.0.113.2" })),
		).toBe("203.0.113.2");
	});

	it("returns a stable placeholder when nothing identifies the caller", () => {
		expect(clientIpFromHeaders(headers({}))).toBe("unknown");
		expect(clientIpFromHeaders(headers({ "x-forwarded-for": " , " }))).toBe(
			"unknown",
		);
	});
});
