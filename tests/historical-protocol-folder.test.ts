import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
	buildHistoricalProtocolPreview,
	historicalProtocolManifestDigest,
	parseHistoricalProtocolFile,
	type HistoricalProtocolUploadFile,
} from "@/server/services/historical-protocol-folder";

async function protocolFile(options: {
	path?: string;
	date?: Date | null;
	revenue?: number;
	card?: number;
	detail?: string;
	modifiedAt?: string;
	vat11?: number;
} = {}): Promise<HistoricalProtocolUploadFile> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Kasse");
	sheet.addRow(["Kassenbericht vom", options.date === null ? null : (options.date ?? new Date(Date.UTC(2025, 4, 3)))]);
	sheet.addRow(["Nr.", 17, options.detail ?? "Theke"]);
	sheet.addRow(["Stückelung", "Menge", "Betrag"]);
	sheet.addRow(["Kassenendbestand am Vortag", 160]);
	sheet.addRow(["Kassenendbestand", 160 + (options.revenue ?? 123.45)]);
	sheet.addRow(["Tageseinnahmen", options.revenue ?? 123.45]);
	sheet.addRow(["Kartenzahlung", options.card ?? 0]);
	sheet.addRow(["Betriebliche Ausgaben", 10]);
	sheet.addRow([
		"Steuersatz",
		0.19,
		(options.revenue ?? 123.45) + (options.card ?? 0),
	]);
	if (options.vat11) sheet.addRow(["Steuersatz", 0.11, options.vat11]);
	const buffer = await workbook.xlsx.writeBuffer();
	return {
		index: 0,
		path: options.path ?? "Zählprotokolle/2025/Zählprotokoll 17.xlsx",
		bytes: new Uint8Array(buffer),
		modifiedAt: options.modifiedAt ?? "2025-05-04",
	};
}

describe("historical protocol folder import", () => {
	it("reads the legacy ODS structure", async () => {
		const zip = new JSZip();
		zip.file(
			"content.xml",
			`<?xml version="1.0" encoding="UTF-8"?>
			<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
			<office:body><office:spreadsheet><table:table table:name="Kasse">
			<table:table-row><table:table-cell office:value-type="string"><text:p>Zählprotokoll</text:p></table:table-cell></table:table-row>
			<table:table-row><table:table-cell office:value-type="string"><text:p>Kassenbericht vom</text:p></table:table-cell><table:table-cell office:value-type="date" office:date-value="2024-06-15"><text:p>15.06.2024</text:p></table:table-cell></table:table-row>
			<table:table-row><table:table-cell office:value-type="string"><text:p>Stückelung</text:p></table:table-cell></table:table-row>
			<table:table-row><table:table-cell office:value-type="string"><text:p>Tageseinnahmen</text:p></table:table-cell><table:table-cell office:value-type="currency" office:value="250.50"><text:p>250,50</text:p></table:table-cell></table:table-row>
			<table:table-row><table:table-cell office:value-type="string"><text:p>Betriebliche Ausgaben</text:p></table:table-cell><table:table-cell office:value-type="currency" office:value="12"><text:p>12,00</text:p></table:table-cell></table:table-row>
			</table:table></office:spreadsheet></office:body></office:document-content>`,
		);
		const bytes = await zip.generateAsync({ type: "uint8array" });
		const row = await parseHistoricalProtocolFile({
			index: 0,
			path: "Zählprotokolle/2024/Kassen/Zählprotokoll 42.ods",
			bytes,
			modifiedAt: "2024-06-16",
		});

		expect(row).toMatchObject({
			status: "ready",
			date: "2024-06-15",
			revenueCent: 25_050,
			expensesCent: 1_200,
		});
		expect(row.source?.format).toBe("ods");
	});

	it("recognizes modern workbooks by their accounting structure", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ card: 25, detail: "Eintritt Fußball" }),
		);

		expect(row).toMatchObject({
			status: "ready",
			date: "2025-05-03",
			detail: "Eintritt Fußball",
			suggestedArea: "eintrittsgelder",
			revenueCent: 14_845,
			expensesCent: 1_000,
		});
		expect(row.source).toMatchObject({
			format: "xlsx",
			protocolNumber: "17",
			cashRevenueCent: 12_345,
			cardCent: 2_500,
			dateOrigin: "workbook",
		});
	});

	it("offers a matching file timestamp as an explicit review case", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ date: null, modifiedAt: "2025-02-08" }),
		);

		expect(row.status).toBe("review");
		expect(row.date).toBe("2025-02-08");
		expect(row.statusReason).toContain("abgeleitetes Datum prüfen");
		expect(row.source?.dateOrigin).toBe("file_modified");
		expect(row.source?.warnings).toContain(
			"Datum aus dem Änderungsdatum der Quelldatei abgeleitet",
		);
	});

	it("does not invent a date across year boundaries", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ date: null, modifiedAt: "2024-12-31" }),
		);

		expect(row.status).toBe("error");
		expect(row.statusReason).toBe("Veranstaltungsdatum fehlt oder ist ungültig");
	});

	it("marks duplicate content and keeps the preview totals single-source", async () => {
		const first = await protocolFile();
		const duplicate = { ...first, index: 1, path: "Zählprotokolle/2025/Kopie.xlsx" };
		const rows = await Promise.all([
			parseHistoricalProtocolFile(first),
			parseHistoricalProtocolFile(duplicate),
		]);
		const files = [first, duplicate];
		const preview = buildHistoricalProtocolPreview(
			files,
			rows,
			historicalProtocolManifestDigest(files),
		);

		expect(preview.statusCounts.duplicate_file).toBe(1);
		expect(preview.toImport).toBe(1);
		expect(preview.totals.revenueCent).toBe(12_345);
	});

	it("keeps exceptional VAT data out of the automatic set", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ revenue: 100, vat11: 5 }),
		);

		expect(row.status).toBe("review");
		expect(row.statusReason).toContain("11 Prozent USt prüfen");
	});
});
