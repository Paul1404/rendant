import { describe, expect, it } from "vitest";
import { revenueCsvDocument } from "@/lib/revenue-csv";

describe("revenueCsvDocument", () => {
	it.each([
		[38_050, 61_800, "380,50;618,00;998,50"],
		[99_850, 0, "998,50;0,00;998,50"],
		[0, 99_850, "0,00;998,50;998,50"],
	])(
		"separates cash %i and card %i including real zeros",
		(cash, card, amounts) => {
			const csv = revenueCsvDocument([
				{
					date: "2024-10-20",
					occasion: "Kirchweih · Theke",
					comparisonGroup: "Kirchweih",
					revenueCent: cash + card,
					revenueCashCent: cash,
					revenueCardCent: card,
					expensesCent: 1_000,
					source: "Kassenzählprotokoll",
					reference: "166",
					status: "storniert",
					note: "Test",
				},
			]);
			expect(csv).toContain(
				"Barumsatz EUR;Kartenumsatz EUR;Gesamtumsatz brutto EUR;Zahlungsaufteilung",
			);
			expect(csv).toContain(
				`Theke;${amounts};Getrennt erfasst;10,00;988,50;Kassenzählprotokoll;166;storniert;Test`,
			);
		},
	);

	it("creates an Excel-compatible combined revenue row", () => {
		const csv = revenueCsvDocument([
			{
				date: "2025-05-03",
				occasion: "Biergarteneröffnung",
				comparisonGroup: "Biergarteneröffnung",
				revenueCent: 12_345,
				revenueCashCent: null,
				revenueCardCent: null,
				expensesCent: 1_000,
				source: "Altunterlage",
				reference: "Ordner 2025",
				status: "aktiv",
				note: "geprüft",
			},
		]);

		expect(csv).toContain(
			"03.05.2025;2025;Biergarteneröffnung;Biergarteneröffnung;;;123,45;Aufteilung unbekannt;10,00;113,45;Altunterlage;Ordner 2025;aktiv;geprüft",
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
				revenueCashCent: null,
				revenueCardCent: null,
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
