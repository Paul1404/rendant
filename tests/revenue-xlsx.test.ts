import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { revenueXlsxDocument } from "@/server/services/revenue-xlsx";

describe("revenueXlsxDocument", () => {
	it.each([
		[38_050, 61_800],
		[99_850, 0],
		[0, 99_850],
	])(
		"preserves cash %i and card %i as numeric cells after reopening",
		async (cash, card) => {
			const bytes = await revenueXlsxDocument([
				{
					date: "2024-10-20",
					occasion: "Kirchweih · Theke",
					comparisonGroup: "Kirchweih",
					revenueCashCent: cash,
					revenueCardCent: card,
					revenueCent: cash + card,
					expensesCent: 1_000,
					source: "Kassenzählprotokoll",
					reference: "166",
					status: "storniert",
					note: "Test",
				},
			]);
			const workbook = new ExcelJS.Workbook();
			const data = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(data).set(bytes);
			await workbook.xlsx.load(data);
			const sheet = workbook.getWorksheet("Umsätze");
			expect(sheet?.getRow(1).values).toEqual([
				undefined,
				"Datum",
				"Jahr",
				"Umsatzbereich",
				"Details",
				"Barumsatz EUR",
				"Kartenumsatz EUR",
				"Gesamtumsatz brutto EUR",
				"Zahlungsaufteilung",
				"Ausgaben EUR",
				"Überschuss EUR",
				"Quelle",
				"Quellreferenz",
				"Status",
				"Bemerkung",
			]);
			expect(sheet?.getCell("E2").value).toBe(cash / 100);
			expect(sheet?.getCell("F2").value).toBe(card / 100);
			expect(sheet?.getCell("G2").value).toBe(998.5);
			expect(sheet?.getCell("H2").value).toBe("Getrennt erfasst");
			expect(sheet?.getCell("I2").value).toBe(10);
			expect(sheet?.getCell("J2").value).toBe(988.5);
			expect(sheet?.getCell("M2").value).toBe("storniert");
			for (const column of ["E", "F", "G", "I", "J"]) {
				expect(sheet?.getCell(`${column}2`).numFmt).toBe("#,##0.00 [$€-407]");
			}
		},
	);

	it("creates a formatted workbook with numeric money cells", async () => {
		const bytes = await revenueXlsxDocument([
			{
				date: "2025-05-03",
				occasion: "Biergarteneröffnung",
				revenueArea: "Wirtschaftsbetrieb",
				comparisonGroup: "Biergarten",
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

		const workbook = new ExcelJS.Workbook();
		const data = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(data).set(bytes);
		await workbook.xlsx.load(data);
		const sheet = workbook.getWorksheet("Umsätze");

		expect(sheet).toBeDefined();
		expect(sheet?.getCell("A1").value).toBe("Datum");
		expect(sheet?.getCell("C1").value).toBe("Umsatzbereich");
		expect(sheet?.getCell("C2").value).toBe("Wirtschaftsbetrieb");
		expect(sheet?.getCell("D2").value).toBe("Biergarteneröffnung");
		expect(sheet?.getCell("E2").value).toBeNull();
		expect(sheet?.getCell("F2").value).toBeNull();
		expect(sheet?.getCell("G2").value).toBe(123.45);
		expect(sheet?.getCell("H2").value).toBe("Aufteilung unbekannt");
		expect(sheet?.getCell("J2").value).toBe(113.45);
		expect(sheet?.autoFilter).toBe("A1:N1");
	});
});
