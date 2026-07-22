import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AnlassKatalogEntry } from "@/lib/anlass";
import {
	parseRevenueImportWorkbook,
	REVENUE_IMPORT_HEADERS,
	REVENUE_IMPORT_SHEET,
	revenueImportTemplate,
} from "@/server/services/revenue-import-xlsx";

const CATALOG: AnlassKatalogEntry[] = [
	{
		id: "11111111-1111-4111-8111-111111111111",
		name: "Heimspiel",
		typ: "wiederkehrend",
		aktiv: true,
		reihenfolge: 0,
		updatedAt: "2026-07-22T00:00:00.000Z",
	},
	{
		id: "22222222-2222-4222-8222-222222222222",
		name: "Alte Gruppe",
		typ: "einmalig",
		aktiv: false,
		reihenfolge: 1,
		updatedAt: "2026-07-22T00:00:00.000Z",
	},
];

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const data = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(data).set(bytes);
	return data;
}

async function filledTemplate(): Promise<Uint8Array> {
	const template = await revenueImportTemplate(CATALOG);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(asArrayBuffer(template));
	const sheet = workbook.getWorksheet(REVENUE_IMPORT_SHEET);
	if (!sheet) throw new Error("Importblatt fehlt");
	sheet.getCell("A2").value = new Date(Date.UTC(2025, 4, 3));
	sheet.getCell("B2").value = "Heimspiel";
	sheet.getCell("C2").value = "gegen Grettstadt";
	sheet.getCell("D2").value = 123.45;
	sheet.getCell("E2").value = "10,50";
	sheet.getCell("F2").value = "Ordner 2025";
	sheet.getCell("G2").value = "geprüft";
	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer);
}

describe("historical revenue Excel import", () => {
	it("creates an empty formatted template with current active groups", async () => {
		const bytes = await revenueImportTemplate(CATALOG);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(asArrayBuffer(bytes));
		const sheet = workbook.getWorksheet(REVENUE_IMPORT_SHEET);

		expect(sheet).toBeDefined();
		expect(REVENUE_IMPORT_HEADERS.map((_, index) => sheet?.getCell(1, index + 1).value)).toEqual(
			REVENUE_IMPORT_HEADERS,
		);
		expect(sheet?.getCell("A2").value).toBeNull();
		expect(sheet?.getCell("B2").dataValidation.formulae).toEqual([
			"UmsatzgruppenListe",
		]);
		expect(workbook.getWorksheet("Umsatzgruppen")?.state).toBe("veryHidden");
		expect(workbook.getWorksheet("Umsatzgruppen")?.getCell("A2").value).toBe(
			"Heimspiel",
		);
		expect(workbook.getWorksheet("Umsatzgruppen")?.getCell("A3").value).toBeNull();
		expect(workbook.getWorksheet("SVUFO")?.state).toBe("veryHidden");
	});

	it("parses typed dates and money and keeps row idempotency stable", async () => {
		const bytes = await filledTemplate();
		const first = await parseRevenueImportWorkbook(bytes, CATALOG);
		const second = await parseRevenueImportWorkbook(bytes, CATALOG);

		expect(first.errors).toEqual([]);
		expect(first.rows).toHaveLength(1);
		expect(first.rows[0]).toMatchObject({
			rowNumber: 2,
			anlass_datum: "2025-05-03",
			anlass_katalog_id: CATALOG[0].id,
			veranstaltungsbezeichnung: "gegen Grettstadt",
			umsatz_cent: 12_345,
			ausgaben_cent: 1_050,
			quellreferenz: "Ordner 2025",
			bemerkung: "geprüft",
		});
		expect(first.rows[0].idempotency_key).toBe(
			second.rows[0].idempotency_key,
		);
	});

	it("reports unknown groups and invalid values with Excel row numbers", async () => {
		const bytes = await filledTemplate();
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(asArrayBuffer(bytes));
		const sheet = workbook.getWorksheet(REVENUE_IMPORT_SHEET);
		if (!sheet) throw new Error("Importblatt fehlt");
		sheet.getCell("B2").value = "Nicht im Katalog";
		sheet.getCell("D2").value = -1;
		sheet.getCell("A2").value = "31.12.2999";
		const buffer = await workbook.xlsx.writeBuffer();
		const parsed = await parseRevenueImportWorkbook(
			new Uint8Array(buffer),
			CATALOG,
		);

		expect(parsed.rows).toEqual([]);
		expect(parsed.errors).toEqual(
			expect.arrayContaining([
				{ row: 2, message: "Umsatzgruppe „Nicht im Katalog“ ist unbekannt oder inaktiv." },
				{ row: 2, message: "Umsatz ist ungültig." },
				{ row: 2, message: "Datum darf nicht in der Zukunft liegen." },
			]),
		);
	});

	it("rejects empty and structurally modified templates", async () => {
		const empty = await revenueImportTemplate(CATALOG);
		const emptyParsed = await parseRevenueImportWorkbook(empty, CATALOG);
		expect(emptyParsed.errors).toContainEqual({
			row: 0,
			message: "Die Vorlage enthält keine Datenzeilen.",
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(asArrayBuffer(empty));
		const sheet = workbook.getWorksheet(REVENUE_IMPORT_SHEET);
		if (!sheet) throw new Error("Importblatt fehlt");
		sheet.getCell("A1").value = "Tag";
		const buffer = await workbook.xlsx.writeBuffer();
		const modified = await parseRevenueImportWorkbook(
			new Uint8Array(buffer),
			CATALOG,
		);
		expect(modified.errors[0]).toEqual({
			row: 1,
			message: "Spalte 1 muss „Datum“ heißen.",
		});
	});
});
