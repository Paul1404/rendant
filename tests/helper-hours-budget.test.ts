import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
	formatMinutes,
	HELPER_HOUR_SEED_CATEGORIES,
	helperHourCategoryCode,
	helperHourCategoryLabel,
	minutesFromCent,
	normalizeHelperHourLabel,
} from "@/lib/helper-hours";
import {
	HelperHourCategoryCreateSchema,
	HelperHourCategoryUpdateSchema,
	HelperHourCreateSchema,
	HelperHourEntriesSchema,
	HelperHourEntryDeleteSchema,
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

describe("helper-hour categories", () => {
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

	it("requires a reason before an entry may be deleted", () => {
		const id = "00000000-0000-4000-8000-000000000002";
		expect(
			v.safeParse(HelperHourEntryDeleteSchema, {
				id,
				grund: "  Doppelt erfasst  ",
			}),
		).toMatchObject({ success: true, output: { grund: "Doppelt erfasst" } });
		expect(
			v.safeParse(HelperHourEntryDeleteSchema, { id, grund: "ups" }).success,
		).toBe(false);
		expect(
			v.safeParse(HelperHourEntryDeleteSchema, {
				id: "keine-uuid",
				grund: "Doppelt erfasst",
			}).success,
		).toBe(false);
	});

	it("validates server-side entry table controls", () => {
		expect(
			v.safeParse(HelperHourEntriesSchema, {
				jahr: 2026,
				page: 2,
				page_size: 50,
				query: "Sommerfest",
				quelle: "excel",
				kategorie: "fussball",
				sort: "hours",
				direction: "asc",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(HelperHourEntriesSchema, { page: 0, page_size: 250 }).success,
		).toBe(false);
		expect(
			v.safeParse(HelperHourEntriesSchema, { quelle: "unbekannt" }).success,
		).toBe(false);
	});

	it("keeps the club contribution among the seeded categories", () => {
		const contribution = HELPER_HOUR_SEED_CATEGORIES.find(
			(entry) => entry.code === "gesamtverein",
		);
		expect(contribution).toMatchObject({ label: "Vereinsbeitrag", art: "verein" });
		expect(
			HELPER_HOUR_SEED_CATEGORIES.filter((entry) => entry.art === "abteilung"),
		).toHaveLength(7);
		expect(
			helperHourCategoryLabel(
				[{ code: "gesamtverein", label: "Vereinsbeitrag" }],
				"gesamtverein",
			),
		).toBe("Vereinsbeitrag");
	});

	// Categories are rows now, so the code only has to be well formed here; the
	// service resolves it and rejects a contribution category for a purchase.
	it("accepts any well-formed category code and rejects malformed ones", () => {
		for (const code of ["gesamtverein", "fussball", "schuetzen_2"])
			expect(
				v.safeParse(HelperHourExpenseCreateSchema, {
					...baseExpense,
					abteilung: code,
				}).success,
			).toBe(true);
		for (const code of ["", "Fußball", "-abteilung", "a".repeat(41)])
			expect(
				v.safeParse(HelperHourExpenseCreateSchema, {
					...baseExpense,
					abteilung: code,
				}).success,
			).toBe(false);
	});

	// Helfer und Veranstaltung kommen aus dem Katalog, nicht aus Freitext.
	it("verlangt Katalogverweise statt getippter Namen", () => {
		const gueltig = {
			idempotency_key: "00000000-0000-4000-8000-000000000002",
			datum: "2026-08-16",
			veranstaltung_id: "00000000-0000-4000-8000-000000000010",
			person_id: "00000000-0000-4000-8000-000000000011",
			kategorie: "gesamtverein",
			minuten: 120,
			bemerkung: "",
		};
		expect(v.safeParse(HelperHourCreateSchema, gueltig).success).toBe(true);
		for (const kaputt of [
			{ ...gueltig, person_id: "Erika Beispiel" },
			{ ...gueltig, veranstaltung_id: "Vereinsfest" },
		])
			expect(v.safeParse(HelperHourCreateSchema, kaputt).success).toBe(false);
	});

	it("validates creating and updating a category", () => {
		expect(
			v.safeParse(HelperHourCategoryCreateSchema, {
				label: "Schützen",
				art: "abteilung",
			}).success,
		).toBe(true);
		expect(
			v.safeParse(HelperHourCategoryCreateSchema, { label: "", art: "abteilung" })
				.success,
		).toBe(false);
		expect(
			v.safeParse(HelperHourCategoryCreateSchema, {
				label: "Schützen",
				art: "sonstiges",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(HelperHourCategoryUpdateSchema, {
				id: "00000000-0000-4000-8000-000000000003",
				label: "Schützen",
				art: "abteilung",
				aktiv: false,
				sortierung: 9,
			}).success,
		).toBe(true);
	});

	it("derives a storable code from a category name", () => {
		expect(helperHourCategoryCode("Schützen")).toBe("schuetzen");
		expect(helperHourCategoryCode("Tischtennis Jugend")).toBe(
			"tischtennis_jugend",
		);
		expect(helperHourCategoryCode("Fußball")).toBe("fussball");
		expect(helperHourCategoryCode("!!!")).toBe("");
	});

	it("matches Excel headings against codes and labels alike", () => {
		expect(normalizeHelperHourLabel(" Fußball ")).toBe("fussball");
		expect(normalizeHelperHourLabel("Gesamtverein")).toBe("gesamtverein");
	});

	it("converts a purchase into the hours it consumes", () => {
		// 294,00 EUR at 6,00 EUR per hour is exactly 49 hours.
		expect(minutesFromCent(29_400, 600)).toBe(2_940);
		expect(formatMinutes(minutesFromCent(29_400, 600))).toBe("49");
		// Rounds to the nearest minute rather than truncating.
		expect(minutesFromCent(2_994, 600)).toBe(299);
		expect(minutesFromCent(1_000, 0)).toBe(0);
	});
});
