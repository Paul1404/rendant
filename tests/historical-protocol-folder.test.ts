import { createHash } from "node:crypto";
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
	date?: Date | string | null;
	revenue?: number;
	card?: number;
	detail?: string | null;
	modifiedAt?: string;
	vat11?: number;
	withDenominations?: boolean;
} = {}): Promise<HistoricalProtocolUploadFile> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Kasse");
	sheet.addRow(["Kassenbericht vom", options.date === null ? null : (options.date ?? new Date(Date.UTC(2025, 4, 3)))]);
	sheet.addRow([
		"Nr.",
		17,
		options.detail === null ? null : (options.detail ?? "Theke"),
	]);
	sheet.addRow(["Stückelung", "Stückelung", "Menge", "Summe"]);
	if (options.withDenominations) {
		const counts = new Map<number, number>([
			[100, 2],
			[50, 1],
			[20, 1],
			[10, 1],
			[2, 1],
			[1, 1],
			[0.1, 4],
			[0.05, 1],
		]);
		for (const denomination of [
			500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02,
			0.01,
		]) {
			const count = counts.get(denomination) ?? 0;
			sheet.addRow([
				denomination,
				denomination,
				count === 0 ? null : count,
				denomination * count,
			]);
		}
	}
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
			status: "review",
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

	it("reads XLSX denomination counts from the Menge column", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ withDenominations: true }),
		);

		expect(row.status).toBe("review");
		expect(row.source?.denominations).toMatchObject({
			anzahl_100_eur: 2,
			anzahl_50_eur: 1,
			anzahl_5_cent: 1,
		});
		expect(row.source?.warnings).not.toContain(
			"Stückelung stimmt nicht mit dem Kassenendbestand überein",
		);
	});

	it("accepts a three-digit year when the folder year disambiguates it", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({
				date: "18.05.025",
				detail: null,
				modifiedAt: "2025-05-19",
			}),
		);

		expect(row.date).toBe("2025-05-18");
		expect(row.detail).toBe("Kassenprotokoll Nr. 17");
		expect(row.source?.dateOrigin).toBe("workbook");
		expect(row.source?.warnings).not.toContain(
			"Datum aus dem Änderungsdatum der Quelldatei abgeleitet",
		);
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
		const archive = await JSZip.loadAsync(first.bytes);
		archive.file("docProps/import-copy.txt", "Andere Paketmetadaten");
		const duplicate = {
			...first,
			index: 1,
			path: "Zählprotokolle/2025/Kopie.xlsx",
			bytes: await archive.generateAsync({ type: "uint8array" }),
		};
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

		expect(rows[0].source?.sha256).not.toBe(rows[1].source?.sha256);
		expect(rows[0].source?.contentFingerprint).toBe(
			rows[1].source?.contentFingerprint,
		);
		expect(preview.statusCounts.duplicate_file).toBe(1);
		expect(preview.toImport).toBe(1);
		expect(preview.totals.revenueCent).toBe(12_345);
	});

	it("keeps only the newest corrected revision of one protocol", async () => {
		const files = await Promise.all([
			protocolFile({
				path: "Zählprotokolle/2025/Zählprotokoll 17.xlsx",
				revenue: 100,
				modifiedAt: "2025-05-04T10:00:00Z",
			}),
			protocolFile({
				path: "Zählprotokolle/2025/Zählprotokoll 17-1.xlsx",
				revenue: 90,
				card: 10,
				modifiedAt: "2025-05-04T10:01:00Z",
			}),
		]);
		files[1].index = 1;
		const rows = await Promise.all(files.map(parseHistoricalProtocolFile));
		const preview = buildHistoricalProtocolPreview(
			files,
			rows,
			historicalProtocolManifestDigest(files),
		);

		expect(rows[0]).toMatchObject({
			status: "duplicate_file",
			statusReason:
				"Neuere Dateirevision derselben Protokollnummer ist vorhanden",
		});
		expect(rows[1].status).toBe("review");
		expect(preview.statusCounts.duplicate_file).toBe(1);
		expect(preview.toImport).toBe(1);
		expect(preview.totals.revenueCent).toBe(10_000);
	});

	it("uses a versioned and deterministic manifest digest", async () => {
		const files = [await protocolFile()];
		const digest = historicalProtocolManifestDigest(files);

		expect(historicalProtocolManifestDigest(files)).toBe(digest);
		expect(digest).toHaveLength(64);
		expect(digest).not.toBe(
			createHash("sha256")
				.update(files[0].path.normalize("NFC"))
				.update("\0")
				.update(createHash("sha256").update(files[0].bytes).digest())
				.update("\0")
				.update(files[0].modifiedAt ?? "")
				.update("\0")
				.digest("hex"),
		);
	});

	it("uses an unambiguous same-day anchor only as a reviewable suggestion", async () => {
		const files = await Promise.all([
			protocolFile({ detail: "Eintritt Fußball" }),
			protocolFile({ detail: "Theke", path: "Zählprotokolle/2025/Zählprotokoll 18.xlsx" }),
		]);
		files[1].index = 1;
		const rows = await Promise.all(files.map(parseHistoricalProtocolFile));
		const preview = buildHistoricalProtocolPreview(
			files,
			rows,
			historicalProtocolManifestDigest(files),
		);
		const theke = preview.rows.find((row) => row.detail === "Theke");

		expect(theke).toMatchObject({
			status: "review",
			suggestedArea: "verkauf_spielfeld",
			classificationConfidence: "medium",
		});
		expect(theke?.source?.warnings).toContain(
			"Umsatzbereich aus weiteren Kassen desselben Veranstaltungstags vorgeschlagen",
		);
	});

	it("keeps mixed entry and catering labels in review", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ detail: "Eintritt/Essen" }),
		);

		expect(row).toMatchObject({
			status: "review",
			suggestedArea: "eintrittsgelder",
			classificationConfidence: "medium",
		});
	});

	it("keeps exceptional VAT data out of the automatic set", async () => {
		const row = await parseHistoricalProtocolFile(
			await protocolFile({ revenue: 100, vat11: 5 }),
		);

		expect(row.status).toBe("review");
		expect(row.statusReason).toContain("11 Prozent USt prüfen");
	});
});
