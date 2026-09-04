import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { helperHoursXlsxDocument } from "@/server/services/helper-hours-xlsx";

function exportData() {
	return {
		category: "fussball",
		categoryLabel: "Fußball",
		budget: {
			id: "00000000-0000-4000-8000-000000000009",
			code: "fussball",
			label: "Fußball",
			aktiv: true,
			minutes: 330,
			earnedMinutes: 330,
			// 12,50 EUR at 6,00 EUR per hour deducts 125 minutes.
			spentMinutes: 125,
			spentCent: 1250,
			balanceMinutes: 205,
		},
		valueCent: 600,
		hours: [
			{
				id: "00000000-0000-4000-8000-000000000001",
				datum: "2026-07-12",
				veranstaltung: "Sportfest",
				nachname: "Beispiel",
				vorname: "Erika",
				bemerkung: "Aufbau",
				quelle: "manuell",
				quelle_blatt: null,
				allocatedMinutes: 330,
			},
		],
		expenses: [
			{
				id: "00000000-0000-4000-8000-000000000003",
				idempotency_key: "00000000-0000-4000-8000-000000000004",
				kategorie_id: "00000000-0000-4000-8000-000000000009",
				datum: "2026-07-15",
				bezeichnung: "Trainingsbälle",
				betrag_cent: 1250,
				minuten: 125,
				bemerkung: "Beleg 17",
				quelle: "manuell",
				quelle_datei: null,
				quelle_sha256: null,
				quelle_blatt: null,
				quelle_zeile: null,
				storniert_am: null,
				storno_grund: null,
				storniert_von_user_id: null,
				storniert_von_name: null,
				erstellt_von_user_id: "user-1",
				erstellt_von_name: "Admin",
				erstellt_am: new Date("2026-07-15T12:00:00Z"),
			},
		],
	};
}

async function readWorkbook(bytes: Uint8Array) {
	const workbook = new ExcelJS.Workbook();
	const data = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(data).set(bytes);
	await workbook.xlsx.load(data);
	return workbook;
}

describe("helperHoursXlsxDocument", () => {
	it("leads with hours and keeps the receipt amount for reconciliation", async () => {
		const workbook = await readWorkbook(
			await helperHoursXlsxDocument(exportData()),
		);
		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			"Übersicht",
			"Helferstunden",
			"Ausgaben",
		]);
		const summary = workbook.getWorksheet("Übersicht");
		expect(summary?.getCell("A1").value).toBe("Helferstunden · Fußball");
		expect(summary?.getCell("A5").value).toBe("Erarbeitete Stunden");
		expect(summary?.getCell("A6").value).toBe("Abgezogene Stunden");
		// Available hours are earned minus deducted, computed in the sheet.
		expect(summary?.getCell("B7").value).toEqual({
			formula: "B5-B6",
			result: 205 / 60,
		});
		expect(summary?.getCell("B8").value).toBe(6);

		const hours = workbook.getWorksheet("Helferstunden");
		expect(hours?.getCell("B2").value).toBe("Erika Beispiel");
		expect(hours?.getCell("D2").value).toBe(5.5);
		expect(hours?.autoFilter).toBe("A1:F1");

		const expenses = workbook.getWorksheet("Ausgaben");
		expect(expenses?.getCell("B2").value).toBe("Trainingsbälle");
		expect(expenses?.getCell("D2").value).toBeCloseTo(125 / 60, 10);
		expect(expenses?.getCell("E2").value).toBe(12.5);
		expect(expenses?.autoFilter).toBe("A1:H1");
	});

	it("does not create circular totals for empty departments", async () => {
		const input = exportData();
		input.budget = { ...input.budget, minutes: 0, earnedMinutes: 0 };
		input.hours = [];
		const workbook = await readWorkbook(await helperHoursXlsxDocument(input));
		expect(workbook.getWorksheet("Helferstunden")?.getCell("D2").value).toEqual({
			formula: "0",
		});
	});
});
