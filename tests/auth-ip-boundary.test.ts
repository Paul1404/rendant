import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth";

function probe() {
	const path = `/sign-in/probe-${randomUUID()}`;
	// Run the installed native limiter using exactly the application's IP/host
	// trust configuration. The probe endpoint performs no credential or DB work.
	const instance = betterAuth({
		baseURL: "https://club-a.example.invalid",
		secret: "synthetic-rate-limit-secret-at-least-32-characters",
		advanced: {
			ipAddress: auth.options.advanced?.ipAddress,
			trustedProxyHeaders: auth.options.advanced?.trustedProxyHeaders,
		},
		rateLimit: { enabled: true },
		plugins: [{ id: "synthetic-ip-probe", endpoints: { probe: createAuthEndpoint(path, { method: "POST" }, async (context) => context.json({ ok: true })) } }],
	});
	return async (headers: Record<string, string>, host = "club-a.example.invalid") => (await instance.handler(new Request(`https://${host}/api/auth${path}`, { method: "POST", headers }))).status;
}

describe("native auth client IP boundary", () => {
	it("preserves host isolation and trusts only the documented Railway client address", () => {
		expect(auth.options.advanced?.trustedProxyHeaders).toBe(false);
		expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(["x-real-ip"]);
	});

	it("gives concurrent distinct clients independent unchanged sign-in limits across clubs", async () => {
		const request = probe();
		const clients = ["198.51.100.1", "198.51.100.2", "198.51.100.3"];
		const results = await Promise.all(clients.flatMap((ip, index) => Array.from({ length: 3 }, () => request({ "x-real-ip": ip }, `club-${index}.example.invalid`))));
		expect(results).toEqual(Array(9).fill(200));
		expect(await request({ "x-real-ip": clients[0] })).toBe(429);
		expect(await request({ "x-real-ip": "198.51.100.4" }, "club-3.example.invalid")).toBe(200);
	});

	it("cannot change its bucket using spoofed forwarded chains or other IP headers", async () => {
		const request = probe();
		for (let attempt = 0; attempt < 4; attempt++) {
			const result = await request({ "x-real-ip": "198.51.100.10", "x-forwarded-for": `203.0.113.${attempt + 1}, 192.0.2.${attempt + 1}`, "cf-connecting-ip": `192.0.2.${attempt + 10}`, "x-forwarded-host": "attacker.example.invalid" });
			expect(result).toBe(attempt < 3 ? 200 : 429);
		}
		expect(await request({ "x-real-ip": "198.51.100.11", "x-forwarded-for": "203.0.113.1, 192.0.2.1" })).toBe(200);
	});

	it("keeps the shared restrictive fallback when the platform address is missing", async () => {
		const request = probe();
		for (let attempt = 0; attempt < 4; attempt++) {
			expect(await request({ "x-forwarded-for": `203.0.113.${attempt + 1}` })).toBe(attempt < 3 ? 200 : 429);
		}
	});

	it("keeps a single caller's limit when they switch club hosts", async () => {
		const request = probe();
		for (let attempt = 0; attempt < 4; attempt++) {
			expect(await request({ "x-real-ip": "198.51.100.20" }, `club-${attempt}.example.invalid`)).toBe(attempt < 3 ? 200 : 429);
		}
	});
});
