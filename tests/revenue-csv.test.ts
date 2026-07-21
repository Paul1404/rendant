import { describe, expect, it } from "vitest";
import { revenueCsvDocument } from "@/lib/revenue-csv";

describe("revenueCsvDocument", () => {
	it("creates an Excel-compatible combined revenue row", () => {
		const csv = revenueCsvDocument([
			{
				date: "2025-05-03",
				occasion: "Biergarteneröffnung",
				comparisonGroup: "Biergarteneröffnung",
				revenueCent: 12_345,
				expensesCent: 1_000,
				source: "Altunterlage",
				reference: "Ordner 2025",
				status: "aktiv",
				note: "geprüft",
			},
		]);

		expect(csv).toContain(
			"03.05.2025;2025;Biergarteneröffnung;Biergarteneröffnung;123,45;10,00;113,45;Altunterlage;Ordner 2025;aktiv;geprüft",
		);
		expect(csv.startsWith("﻿Datum;Jahr;")).toBe(true);
	});

	it("neutralizes spreadsheet formulas in free text", () => {
		const csv = revenueCsvDocument([
			{
				date: "2025-01-01",
				occasion: "=1+1",
				comparisonGroup: "Test",
				revenueCent: 100,
				expensesCent: 0,
				source: "Altunterlage",
				reference: "",
				status: "aktiv",
				note: "",
			},
		]);

		expect(csv).toContain("'=1+1");
	});
});
