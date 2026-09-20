import { ORPCError } from "@orpc/client";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { orpcMessage } from "@/lib/orpc-error";
import {
	EmailSettingsSchema,
	SumupDaysSchema,
	SumupSettingsSchema,
	TestEmailSchema,
} from "@/lib/schemas";
import {
	GENERIC_VALIDATION_MESSAGE,
	validationIssueFields,
	validationMessage,
} from "@/lib/validation-message";

// The issues the middleware sees are exactly what Valibot hands to oRPC through
// the standard-schema entry point, so the tests go through the real schemas.
function issuesOf(schema: unknown, input: unknown) {
	const result = (
		schema as {
			"~standard": { validate: (i: unknown) => { issues?: unknown[] } };
		}
	)["~standard"].validate(input);
	return (result.issues ?? []) as Array<{ message?: string }>;
}

describe("validationMessage", () => {
	it("names the field and the limit instead of the English frame message", () => {
		const issues = issuesOf(SumupSettingsSchema, {
			enabled: true,
			api_key: "x".repeat(600),
			clear_api_key: false,
		});
		expect(validationMessage(issues)).toBe(
			"Eingabe abgelehnt. API-Key: höchstens 500 Zeichen.",
		);
	});

	it("explains a malformed address", () => {
		const issues = issuesOf(TestEmailSchema, { to: "kassier@example" });
		expect(validationMessage(issues)).toBe(
			"Eingabe abgelehnt. Empfänger: keine gültige E-Mail-Adresse.",
		);
	});

	it("explains a port outside the allowed range", () => {
		const issues = issuesOf(EmailSettingsSchema, {
			enabled: true,
			port: 0,
			security: "starttls",
			notify_new_protokoll: true,
		});
		expect(validationMessage(issues)).toBe(
			"Eingabe abgelehnt. Port: mindestens 1.",
		);
	});

	it("reports a missing field as missing", () => {
		const issues = issuesOf(EmailSettingsSchema, {
			enabled: true,
			security: "starttls",
			notify_new_protokoll: true,
		});
		expect(validationMessage(issues)).toBe("Eingabe abgelehnt. Port: fehlt.");
	});

	it("keeps a message the schema itself formulated", () => {
		const issues = issuesOf(SumupDaysSchema, {
			von: "2026-09-20",
			bis: "2026-09-01",
		});
		expect(validationMessage(issues)).toBe(
			"Eingabe abgelehnt. Das Startdatum muss vor dem Enddatum liegen.",
		);
	});

	it("lists at most three fields and counts the rest", () => {
		const schema = v.object({
			host: v.pipe(v.string(), v.maxLength(1)),
			user: v.pipe(v.string(), v.maxLength(1)),
			from: v.pipe(v.string(), v.maxLength(1)),
			prefix: v.pipe(v.string(), v.maxLength(1)),
			name: v.pipe(v.string(), v.maxLength(1)),
		});
		const issues = issuesOf(schema, {
			host: "aa",
			user: "aa",
			from: "aa",
			prefix: "aa",
			name: "aa",
		});
		expect(validationMessage(issues)).toBe(
			"Eingabe abgelehnt. Server: höchstens 1 Zeichen; Benutzer: höchstens 1 Zeichen; Absender: höchstens 1 Zeichen; und 2 weitere.",
		);
	});

	it("falls back when nothing can be described", () => {
		expect(validationMessage([])).toBe(GENERIC_VALIDATION_MESSAGE);
		expect(validationMessage(undefined)).toBe(GENERIC_VALIDATION_MESSAGE);
	});

	it("contains no submitted value", () => {
		const issues = issuesOf(SumupSettingsSchema, {
			enabled: true,
			api_key: "sup_sk_geheim".padEnd(600, "x"),
			clear_api_key: false,
		});
		expect(validationMessage(issues)).not.toContain("sup_sk_geheim");
	});
});

describe("validationIssueFields", () => {
	it("keeps the technical path and the rule, never the value", () => {
		const issues = issuesOf(SumupSettingsSchema, {
			enabled: true,
			api_key: "sup_sk_geheim".padEnd(600, "x"),
			clear_api_key: false,
		});
		const fields = validationIssueFields(issues);
		expect(fields).toEqual([{ field: "api_key", rule: "max_length" }]);
		expect(JSON.stringify(fields)).not.toContain("sup_sk_geheim");
	});
});

describe("orpcMessage", () => {
	it("never shows the English frame message", () => {
		const err = new ORPCError("BAD_REQUEST", {
			message: "Input validation failed",
		});
		expect(orpcMessage(err, "Speichern fehlgeschlagen")).toBe(
			GENERIC_VALIDATION_MESSAGE,
		);
	});

	it("translates frame-message issues when they are attached", () => {
		const err = new ORPCError("BAD_REQUEST", {
			message: "Input validation failed",
			data: {
				issues: issuesOf(TestEmailSchema, { to: "kassier@example" }),
			},
		});
		expect(orpcMessage(err, "Test-E-Mail fehlgeschlagen")).toBe(
			"Eingabe abgelehnt. Empfänger: keine gültige E-Mail-Adresse.",
		);
	});

	it("passes a German procedure message through", () => {
		const err = new ORPCError("BAD_REQUEST", {
			message: "SumUp lehnt den API-Key ab.",
		});
		expect(orpcMessage(err, "Speichern fehlgeschlagen")).toBe(
			"SumUp lehnt den API-Key ab.",
		);
	});
});
