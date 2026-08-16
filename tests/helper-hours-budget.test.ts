import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	HELPER_HOUR_BUDGET_CATEGORY_CODES,
	HELPER_HOUR_CATEGORY_CODES,
	helperHourCategoryLabel,
} from "@/lib/helper-hours";
import {
	HelperHourCreateSchema,
	HelperHourExpenseCreateSchema,
	HelperHourListSchema,
} from "@/lib/schemas";

const baseExpense = {
	idempotency_key: "00000000-0000-4000-8000-000000000001",
	datum: "2026-08-16",
	bezeichnung: "Trainingsmaterial",
	betrag_cent: 2500,
	bemerkung: "",
};

describe("helper-hour club contribution", () => {
	it("validates optional reporting years", () => {
		expect(v.safeParse(HelperHourListSchema, {}).success).toBe(true);
		expect(v.safeParse(HelperHourListSchema, { jahr: 2026 }).success).toBe(true);
		expect(v.safeParse(HelperHourListSchema, { jahr: 1999 }).success).toBe(
			false,
		);
		expect(v.safeParse(HelperHourListSchema, { jahr: 2026.5 }).success).toBe(
			false,
		);
	});

	it("keeps the club contribution as an hour allocation but not a budget", () => {
		expect(HELPER_HOUR_CATEGORY_CODES).toContain("gesamtverein");
		expect(HELPER_HOUR_BUDGET_CATEGORY_CODES).not.toContain("gesamtverein");
		expect(helperHourCategoryLabel("gesamtverein")).toBe("Vereinsbeitrag");
	});

	it("rejects expenses against the club contribution", () => {
		expect(
			v.safeParse(HelperHourExpenseCreateSchema, {
				...baseExpense,
				abteilung: "gesamtverein",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(HelperHourExpenseCreateSchema, {
				...baseExpense,
				abteilung: "fussball",
			}).success,
		).toBe(true);
	});

	it("still accepts new hours as a club contribution", () => {
		expect(
			v.safeParse(HelperHourCreateSchema, {
				idempotency_key: "00000000-0000-4000-8000-000000000002",
				datum: "2026-08-16",
				veranstaltung: "Vereinsfest",
				nachname: "Beispiel",
				vorname: "Erika",
				kategorie: "gesamtverein",
				minuten: 120,
				bemerkung: "",
			}).success,
		).toBe(true);
	});
});
