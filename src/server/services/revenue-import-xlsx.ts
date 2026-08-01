import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { AnlassKatalogEntry } from "@/lib/anlass";
import { anlassKey } from "@/lib/anlass";
import { isIsoCalendarDate, todayIsoDate } from "@/lib/date";
import { parseGermanAmount } from "@/lib/money";
import type { HistoricalRevenueCreateInput } from "@/lib/schemas";
import { inferUmsatzbereich } from "@/lib/umsatzbereich";

export const REVENUE_IMPORT_MAX_ROWS = 500;
export const REVENUE_IMPORT_MAX_BYTES = 5_000_000;
export const REVENUE_IMPORT_SHEET = "Altumsätze";

export const REVENUE_IMPORT_HEADERS = [
	"Datum",
	"Umsatzgruppe",
	"Veranstaltungsbezeichnung",
	"Umsatz EUR",
	"Ausgaben EUR",
	"Quellreferenz",
	"Bemerkung",
] as const;

const TEMPLATE_VERSION = "1";
const METADATA_SHEET = "Rendant";
const LEGACY_METADATA_SHEET = "SVUFO";
const GROUPS_SHEET = "Umsatzgruppen";

export type RevenueImportRow = HistoricalRevenueCreateInput & {
	rowNumber: number;
	umsatzgruppe: string;
};

export type RevenueImportError = {
	row: number;
	message: string;
};

export type RevenueImportParseResult = {
	importId: string | null;
	rows: RevenueImportRow[];
	errors: RevenueImportError[];
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const data = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(data).set(bytes);
	return data;
}

function deterministicUuid(importId: string, rowNumber: number): string {
	const bytes = createHash("sha256")
		.update(`${importId}:${rowNumber}`)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function plainText(value: ExcelJS.CellValue): string | null {
	if (value == null) return "";
	if (typeof value === "string" || typeof value === "number") {
		return String(value).trim();
	}
	if (typeof value === "boolean" || value instanceof Date) return null;
	if ("formula" in value || "sharedFormula" in value) return null;
	if ("richText" in value) {
		return value.richText
			.map((part) => part.text)
			.join("")
			.trim();
	}
	if ("text" in value) return value.text.trim();
	return null;
}

function dateValue(value: ExcelJS.CellValue): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return [
			String(value.getUTCFullYear()).padStart(4, "0"),
			String(value.getUTCMonth() + 1).padStart(2, "0"),
			String(value.getUTCDate()).padStart(2, "0"),
		].join("-");
	}
	const text = plainText(value);
	if (text == null || !text) return null;
	if (isIsoCalendarDate(text)) return text;
	const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
	if (!german) return null;
	const iso = `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
	return isIsoCalendarDate(iso) ? iso : null;
}

function amountValue(
	value: ExcelJS.CellValue,
	optional: boolean,
): number | null {
	if (value == null || value === "") return optional ? 0 : null;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return null;
		return Math.round(value * 100);
	}
	const text = plainText(value);
	if (text == null || !text) return optional ? 0 : null;
	const cleaned = text.replace(/\s*(EUR|€)\s*$/i, "").trim();
	if (/^-?\d+\.\d{1,2}$/.test(cleaned) && !cleaned.includes(",")) {
		const parsed = Number(cleaned);
		return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
	}
	return parseGermanAmount(cleaned);
}

function isBlankRow(row: ExcelJS.Row): boolean {
	return REVENUE_IMPORT_HEADERS.every((_, index) => {
		const value = row.getCell(index + 1).value;
		return value == null || (typeof value === "string" && value.trim() === "");
	});
}

export async function revenueImportTemplate(
	catalog: AnlassKatalogEntry[],
): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Rendant";
	workbook.created = new Date();

	const sheet = workbook.addWorksheet(REVENUE_IMPORT_SHEET, {
		views: [{ state: "frozen", ySplit: 1 }],
	});
	sheet.addRow(REVENUE_IMPORT_HEADERS);
	sheet.autoFilter = { from: "A1", to: "G1" };
	sheet.columns = [
		{ width: 14 },
		{ width: 28 },
		{ width: 38 },
		{ width: 17 },
		{ width: 17 },
		{ width: 30 },
		{ width: 42 },
	];
	const header = sheet.getRow(1);
	header.height = 26;
	header.font = { bold: true, color: { argb: "FFFFFFFF" } };
	header.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FF1F604A" },
	};
	header.alignment = { vertical: "middle", wrapText: true };

	for (let column = 1; column <= REVENUE_IMPORT_HEADERS.length; column += 1) {
		sheet.getCell(1, column).note =
			column <= 4
				? "Pflichtfeld. Ab Zeile 2 ausfüllen."
				: "Optional. Ab Zeile 2 ausfüllen.";
	}

	const activeGroups = catalog.filter((entry) => entry.aktiv);
	const groups = workbook.addWorksheet(GROUPS_SHEET);
	groups.getCell("A1").value = "Umsatzgruppe";
	activeGroups.forEach((entry, index) => {
		groups.getCell(index + 2, 1).value = entry.name;
	});
	workbook.definedNames.add(
		`${GROUPS_SHEET}!$A$2:$A$${Math.max(2, activeGroups.length + 1)}`,
		"UmsatzgruppenListe",
	);
	groups.state = "veryHidden";

	for (
		let rowNumber = 2;
		rowNumber <= REVENUE_IMPORT_MAX_ROWS + 1;
		rowNumber += 1
	) {
		const row = sheet.getRow(rowNumber);
		row.getCell(1).numFmt = "dd.mm.yyyy";
		row.getCell(4).numFmt = "#,##0.00 [$€-407]";
		row.getCell(5).numFmt = "#,##0.00 [$€-407]";
		row.getCell(2).dataValidation = {
			type: "list",
			allowBlank: false,
			formulae: ["UmsatzgruppenListe"],
			showErrorMessage: true,
			errorTitle: "Umsatzgruppe wählen",
			error: "Bitte eine Umsatzgruppe aus der Liste wählen.",
		};
		row.alignment = { vertical: "top" };
		if (rowNumber % 2 === 0) {
			row.fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: "FFF3F6F4" },
			};
		}
	}

	const metadata = workbook.addWorksheet(METADATA_SHEET);
	metadata.getCell("A1").value = "Vorlagenversion";
	metadata.getCell("B1").value = TEMPLATE_VERSION;
	metadata.getCell("A2").value = "Import-ID";
	metadata.getCell("B2").value = randomUUID();
	metadata.state = "veryHidden";

	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer);
}

export async function parseRevenueImportWorkbook(
	bytes: Uint8Array,
	catalog: AnlassKatalogEntry[],
): Promise<RevenueImportParseResult> {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(toArrayBuffer(bytes));
	} catch {
		return {
			importId: null,
			rows: [],
			errors: [{ row: 0, message: "Die Datei ist keine lesbare Excel-Datei." }],
		};
	}

	const sheet = workbook.getWorksheet(REVENUE_IMPORT_SHEET);
	const metadata =
		workbook.getWorksheet(METADATA_SHEET) ??
		workbook.getWorksheet(LEGACY_METADATA_SHEET);
	const version = plainText(metadata?.getCell("B1").value ?? null);
	const importId = plainText(metadata?.getCell("B2").value ?? null);
	const errors: RevenueImportError[] = [];
	if (
		!sheet ||
		!metadata ||
		version !== TEMPLATE_VERSION ||
		!importId ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			importId,
		)
	) {
		return {
			importId: null,
			rows: [],
			errors: [
				{
					row: 0,
					message: "Bitte die aktuelle Rendant-Importvorlage verwenden.",
				},
			],
		};
	}

	for (let index = 0; index < REVENUE_IMPORT_HEADERS.length; index += 1) {
		if (
			plainText(sheet.getCell(1, index + 1).value) !==
			REVENUE_IMPORT_HEADERS[index]
		) {
			errors.push({
				row: 1,
				message: `Spalte ${index + 1} muss „${REVENUE_IMPORT_HEADERS[index]}“ heißen.`,
			});
		}
	}
	if (errors.length > 0) return { importId, rows: [], errors };

	const activeGroups = new Map<string, AnlassKatalogEntry>();
	for (const entry of catalog.filter((item) => item.aktiv)) {
		activeGroups.set(anlassKey(entry.name), entry);
	}

	const rows: RevenueImportRow[] = [];
	const lastRow = Math.min(sheet.rowCount, REVENUE_IMPORT_MAX_ROWS + 1);
	for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
		const row = sheet.getRow(rowNumber);
		if (isBlankRow(row)) continue;
		const date = dateValue(row.getCell(1).value);
		const groupName = plainText(row.getCell(2).value);
		const eventLabel = plainText(row.getCell(3).value);
		const revenueCent = amountValue(row.getCell(4).value, false);
		const expensesCent = amountValue(row.getCell(5).value, true);
		const sourceReference = plainText(row.getCell(6).value);
		const note = plainText(row.getCell(7).value);
		const group = groupName ? activeGroups.get(anlassKey(groupName)) : null;

		if (!date)
			errors.push({
				row: rowNumber,
				message: "Datum fehlt oder ist ungültig.",
			});
		else if (date > todayIsoDate()) {
			errors.push({
				row: rowNumber,
				message: "Datum darf nicht in der Zukunft liegen.",
			});
		}
		if (!groupName)
			errors.push({ row: rowNumber, message: "Umsatzgruppe fehlt." });
		else if (!group) {
			errors.push({
				row: rowNumber,
				message: `Umsatzgruppe „${groupName}“ ist unbekannt oder inaktiv.`,
			});
		}
		if (!eventLabel) {
			errors.push({
				row: rowNumber,
				message: "Veranstaltungsbezeichnung fehlt.",
			});
		}
		if (revenueCent == null || revenueCent < 0 || revenueCent > 2_147_483_647) {
			errors.push({ row: rowNumber, message: "Umsatz ist ungültig." });
		}
		if (
			expensesCent == null ||
			expensesCent < 0 ||
			expensesCent > 2_147_483_647
		) {
			errors.push({ row: rowNumber, message: "Ausgaben sind ungültig." });
		}
		if (eventLabel && eventLabel.length > 120) {
			errors.push({
				row: rowNumber,
				message: "Veranstaltungsbezeichnung ist zu lang.",
			});
		}
		if (group && eventLabel && `${group.name} · ${eventLabel}`.length > 200) {
			errors.push({
				row: rowNumber,
				message:
					"Umsatzgruppe und Veranstaltungsbezeichnung sind zusammen zu lang.",
			});
		}
		if (sourceReference == null || sourceReference.length > 500) {
			errors.push({
				row: rowNumber,
				message: "Quellreferenz ist ungültig oder zu lang.",
			});
		}
		if (note == null || note.length > 2000) {
			errors.push({
				row: rowNumber,
				message: "Bemerkung ist ungültig oder zu lang.",
			});
		}
		if (
			date &&
			date <= todayIsoDate() &&
			group &&
			eventLabel &&
			revenueCent != null &&
			expensesCent != null &&
			revenueCent >= 0 &&
			expensesCent >= 0 &&
			revenueCent <= 2_147_483_647 &&
			expensesCent <= 2_147_483_647 &&
			eventLabel.length <= 120 &&
			`${group.name} · ${eventLabel}`.length <= 200 &&
			sourceReference != null &&
			sourceReference.length <= 500 &&
			note != null &&
			note.length <= 2000
		) {
			rows.push({
				rowNumber,
				umsatzgruppe: group.name,
				idempotency_key: deterministicUuid(importId, rowNumber),
				anlass_datum: date,
				anlass_katalog_id: group.id,
				umsatzbereich: inferUmsatzbereich(group.name),
				veranstaltungsbezeichnung: eventLabel,
				umsatz_cent: revenueCent,
				ausgaben_cent: expensesCent,
				quellreferenz: sourceReference || null,
				bemerkung: note || null,
			});
		}
	}

	if (sheet.rowCount > REVENUE_IMPORT_MAX_ROWS + 1) {
		errors.push({
			row: REVENUE_IMPORT_MAX_ROWS + 2,
			message: `Pro Datei sind höchstens ${REVENUE_IMPORT_MAX_ROWS} Datenzeilen erlaubt.`,
		});
	}
	if (rows.length === 0 && errors.length === 0) {
		errors.push({ row: 0, message: "Die Vorlage enthält keine Datenzeilen." });
	}
	return { importId, rows, errors };
}
