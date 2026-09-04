import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
	HELPER_HOUR_SEED_CATEGORIES,
	type HelperHourCategory,
	minutesFromCent,
} from "@/lib/helper-hours";
import {
	helperHourExpenseSignature,
	parseHelperHourExpenseWorkbook,
} from "@/server/services/helper-hour-expense-import";

const CATEGORIES: HelperHourCategory[] = HELPER_HOUR_SEED_CATEGORIES.map(
	(entry, index) => ({
		id: `00000000-0000-4000-8000-00000000000${index}`,
		code: entry.code,
		label: entry.label,
		art: entry.art,
		sortierung: index,
		aktiv: true,
		system: true,
	}),
);
const HEADER = [
	"Datum",
	"Gesamtverein",
	"Fußball",
	"Korbball",
	"Tischtennis",
	"Darts",
	"Gymnastik",
	"Senioren",
	"Combo",
	"Inhalt",
];

async function parse(
	rows: Array<Array<string | number | Date | null>>,
	categories = CATEGORIES,
	extraHeadings: string[] = [],
) {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Tabelle1");
	sheet.addRow(["Verrechnung Stunden Abteilungen"]);
	sheet.addRow([]);
	sheet.addRow([...HEADER, ...extraHeadings]);
	for (const row of rows) sheet.addRow(row);
	return parseHelperHourExpenseWorkbook(
		new Uint8Array(await workbook.xlsx.writeBuffer()),
		"Verrechnung.xlsx",
		categories,
		"a".repeat(64),
	);
}

describe("Verrechnungsimport", () => {
	it("liest Datum, Abteilungsspalte und Inhalt", async () => {
		const result = await parse([
			[new Date(Date.UTC(2025, 10, 15)), null, null, null, 294, null, null, null, null, "Taschen für Schläger"],
			["28.11.2025", null, null, null, "137,50", null, null, null, null, "Reinigungsmittel"],
		]);
		expect(result.errors).toEqual([]);
		expect(result.sheets).toEqual(["Tabelle1"]);
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0]).toMatchObject({
			datum: "2025-11-15",
			kategorie_code: "tischtennis",
			betrag_cent: 29_400,
			bezeichnung: "Taschen für Schläger",
		});
		// 294,00 EUR at 6,00 EUR per hour is 49 hours deducted.
		expect(minutesFromCent(result.rows[0].betrag_cent, 600)).toBe(2_940);
		expect(result.rows[1].betrag_cent).toBe(13_750);
	});

	it("ignoriert leere Zellen und Zellen mit reinem Leerzeichen", async () => {
		const result = await parse([
			["10.02.2025", " ", 55, null, null, null, null, null, null, "Training Fitnessstudio"],
		]);
		expect(result.errors).toEqual([]);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].kategorie_code).toBe("fussball");
	});

	it("verlangt eine eigene Zeile je Abteilung", async () => {
		const result = await parse([
			["10.02.2025", null, 55, null, 20, null, null, null, null, "Sammelbeleg"],
		]);
		expect(result.rows).toHaveLength(0);
		expect(result.errors[0].message).toContain("mehreren Spalten");
	});

	it("lehnt eine Belastung des Vereinsbeitrags ab", async () => {
		const result = await parse([
			["10.02.2025", 55, null, null, null, null, null, null, null, "Vereinskauf"],
		]);
		expect(result.rows).toHaveLength(0);
		expect(result.errors[0].message).toContain("kein Abteilungsguthaben");
	});

	it("meldet fehlendes Datum, fehlenden Inhalt und fehlenden Betrag", async () => {
		const result = await parse([
			["kein Datum", null, 55, null, null, null, null, null, null, "Ohne Datum"],
			["10.02.2025", null, 55, null, null, null, null, null, null, null],
			["11.02.2025", null, null, null, null, null, null, null, null, "Ohne Betrag"],
		]);
		expect(result.rows).toHaveLength(0);
		expect(result.errors.map((entry) => entry.message)).toEqual([
			"Datum fehlt oder ist ungültig.",
			"Inhalt fehlt.",
			"Kein Betrag eingetragen.",
		]);
	});

	it("lehnt eine deaktivierte Abteilung ab", async () => {
		const result = await parse(
			[["10.02.2025", null, 55, null, null, null, null, null, null, "Kauf"]],
			CATEGORIES.map((entry) =>
				entry.code === "fussball" ? { ...entry, aktiv: false } : entry,
			),
		);
		expect(result.errors[0].message).toContain("ist deaktiviert");
	});

	it("erkennt eine Spalte eines neu angelegten Punkts", async () => {
		const result = await parse(
			[["10.02.2025", null, null, null, null, null, null, null, null, "Kauf", 90]],
			[
				...CATEGORIES,
				{
					id: "00000000-0000-4000-8000-000000000099",
					code: "schuetzen",
					label: "Schützen",
					art: "abteilung",
					sortierung: 9,
					aktiv: true,
					system: false,
				},
			],
			["Schützen"],
		);
		expect(result.errors).toEqual([]);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]).toMatchObject({
			kategorie_code: "schuetzen",
			kategorie_label: "Schützen",
			betrag_cent: 9_000,
		});
	});

	it("bildet eine inhaltliche Signatur für den Abgleich", () => {
		const signature = helperHourExpenseSignature({
			kategorie_code: "tischtennis",
			datum: "2025-11-15",
			bezeichnung: "  Taschen  für Schläger ",
			betrag_cent: 29_400,
		});
		expect(signature).toBe(
			"tischtennis|2025-11-15|taschen für schläger|29400",
		);
	});
});
