import { describe, expect, it } from "vitest";
import { resolveTrustedOrigins } from "@/server/auth-origins";

describe("trusted authentication origins", () => {
	it("normalizes the primary URL and permits transition aliases", () => {
		expect(
			resolveTrustedOrigins(
				"https://rendant.example.de/",
				" https://svufo.example.de/, https://rendant.example.de ",
			),
		).toEqual([
			"http://localhost:3000",
			"https://rendant.example.de",
			"https://svufo.example.de",
		]);
	});
});
