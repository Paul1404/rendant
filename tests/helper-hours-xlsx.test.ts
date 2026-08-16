import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { helperHoursXlsxDocument } from "@/server/services/helper-hours-xlsx";

function exportData() {
	return {
		category: "fussball" as const,
		budget: {
			code: "fussball" as const,
			label: "Fußball" as const,
			minutes: 330,
			earnedCent: 3300,
			spentCent: 1250,
			balanceCent: 2050,
		},
		valueCent: 600,
		hours: [
			{
				id: "00000000-0000-4000-8000-000000000001",
				idempotency_key: "00000000-0000-4000-8000-000000000002",
				datum: "2026-07-12",
				veranstaltung: "Sportfest",
				nachname: "Beispiel",
				vorname: "Erika",
				gesamtverein_minuten: 0,
				fussball_minuten: 330,
				korbball_minuten: 0,
				tischtennis_minuten: 0,
				darts_minuten: 0,
				gymnastik_minuten: 0,
				senioren_minuten: 0,
				combo_minuten: 0,
				gemeldete_summe_minuten: 330,
				bemerkung: "Aufbau",
				quelle: "manuell",
				quelle_datei: null,
				quelle_sha256: null,
				quelle_blatt: null,
				quelle_zeile: null,
				import_warnungen: [],
				erstellt_von_user_id: "user-1",
				erstellt_von_name: "Admin",
				erstellt_am: new Date("2026-07-12T12:00:00Z"),
				allocatedMinutes: 330,
			},
		],
		expenses: [
			{
				id: "00000000-0000-4000-8000-000000000003",
				idempotency_key: "00000000-0000-4000-8000-000000000004",
				abteilung: "fussball",
				datum: "2026-07-15",
				bezeichnung: "Trainingsbälle",
				betrag_cent: 1250,
				bemerkung: "Beleg 17",
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

describe("helperHoursXlsxDocument", () => {
	it("creates a readable, formula-backed department budget workbook", async () => {
		const bytes = await helperHoursXlsxDocument(exportData());
		const workbook = new ExcelJS.Workbook();
		const data = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(data).set(bytes);
		await workbook.xlsx.load(data);

		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			"Übersicht",
			"Helferstunden",
			"Ausgaben",
		]);
		const summary = workbook.getWorksheet("Übersicht");
		expect(summary?.getCell("A1").value).toBe(
			"Helferstunden-Budget · Fußball",
		);
		expect(summary?.getCell("B6").value).toBe(6);
		expect(summary?.getCell("B9").value).toEqual({
			formula: "B7-B8",
			result: 20.5,
		});

		const hours = workbook.getWorksheet("Helferstunden");
		expect(hours?.getCell("B2").value).toBe("Erika Beispiel");
		expect(hours?.getCell("F2").value).toEqual({
			formula: "ROUND(D2*E2,2)",
			result: 33,
		});
		expect(hours?.autoFilter).toBe("A1:H1");

		const expenses = workbook.getWorksheet("Ausgaben");
		expect(expenses?.getCell("B2").value).toBe("Trainingsbälle");
		expect(expenses?.getCell("D2").value).toBe(12.5);
		expect(expenses?.autoFilter).toBe("A1:G1");
	});

	it("does not create circular totals for empty departments", async () => {
		const input = exportData();
		input.budget = { ...input.budget, minutes: 0, earnedCent: 0 };
		input.hours = [];
		const bytes = await helperHoursXlsxDocument(input);
		const workbook = new ExcelJS.Workbook();
		const data = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(data).set(bytes);
		await workbook.xlsx.load(data);
		expect(workbook.getWorksheet("Helferstunden")?.getCell("D2").value).toEqual({
			formula: "0",
		});
	});
});
