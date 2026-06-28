import { beforeAll, describe, expect, it } from "vitest";
import {
	decryptSecret,
	encryptSecret,
} from "@/server/services/secret-box";

beforeAll(() => {
	process.env.BETTER_AUTH_SECRET ||= "test-secret-please-ignore-32-bytes-long";
	// email.ts pulls in the db client, which constructs a pg Pool at import time
	// and needs a connection string. The Pool does not connect until queried, so
	// a dummy URL is enough for the pure helpers under test here.
	process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
});

describe("secret-box", () => {
	it("round-trips a secret", () => {
		const enc = encryptSecret("hunter2");
		expect(enc).not.toBe("hunter2");
		expect(enc.startsWith("v1:")).toBe(true);
		expect(decryptSecret(enc)).toBe("hunter2");
	});

	it("treats empty input as empty output", () => {
		expect(encryptSecret("")).toBe("");
		expect(decryptSecret("")).toBe("");
	});

	it("returns empty string for malformed payloads", () => {
		expect(decryptSecret("not-a-valid-payload")).toBe("");
		expect(decryptSecret("v1:only:three")).toBe("");
	});

	it("produces a different ciphertext each time", () => {
		const a = encryptSecret("same");
		const b = encryptSecret("same");
		expect(a).not.toBe(b);
		expect(decryptSecret(a)).toBe("same");
		expect(decryptSecret(b)).toBe("same");
	});
});

describe("parseRecipients", () => {
	it("splits, validates and de-duplicates addresses", async () => {
		const { parseRecipients } = await import("@/server/services/email");
		const { valid, invalid } = parseRecipients(
			"a@example.de, b@example.de\nA@EXAMPLE.DE; not-an-email",
		);
		expect(valid).toEqual(["a@example.de", "b@example.de"]);
		expect(invalid).toEqual(["not-an-email"]);
	});

	it("returns empty arrays for an empty string", async () => {
		const { parseRecipients } = await import("@/server/services/email");
		expect(parseRecipients("")).toEqual({ valid: [], invalid: [] });
		expect(parseRecipients("   \n  ")).toEqual({ valid: [], invalid: [] });
	});
});

describe("mergeRecipients", () => {
	it("unions lists and de-duplicates case-insensitively, first spelling wins", async () => {
		const { mergeRecipients } = await import("@/server/services/email");
		expect(
			mergeRecipients(
				["user@example.de", "Shared@example.de"],
				["shared@EXAMPLE.de", "extern@example.de"],
			),
		).toEqual(["user@example.de", "Shared@example.de", "extern@example.de"]);
	});

	it("drops empty and whitespace-only tokens", async () => {
		const { mergeRecipients } = await import("@/server/services/email");
		expect(mergeRecipients([" a@example.de ", "", "   "], [])).toEqual([
			"a@example.de",
		]);
	});

	it("returns an empty list when nothing is opted in", async () => {
		const { mergeRecipients } = await import("@/server/services/email");
		expect(mergeRecipients([], [])).toEqual([]);
	});
});
