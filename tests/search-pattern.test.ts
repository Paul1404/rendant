import { describe, expect, it } from "vitest";
import { ilikeContains } from "@/server/services/search-pattern";

describe("ilikeContains", () => {
	it("wraps a plain term in wildcards", () => {
		expect(ilikeContains("Sommerfest")).toBe("%Sommerfest%");
	});

	it("escapes the ILIKE wildcards so the term stays literal", () => {
		// Without escaping, "10%" matches everything starting with 10 and "5_"
		// matches any 5 followed by one character.
		expect(ilikeContains("10%")).toBe("%10\\%%");
		expect(ilikeContains("5_")).toBe("%5\\_%");
	});

	it("escapes the escape character itself", () => {
		expect(ilikeContains("a\\b")).toBe("%a\\\\b%");
	});

	it("trims and caps the term", () => {
		expect(ilikeContains("  Fest  ")).toBe("%Fest%");
		expect(ilikeContains("x".repeat(200), 10)).toBe(`%${"x".repeat(10)}%`);
	});
});
