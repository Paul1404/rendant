import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { isIsoCalendarDate } from "@/lib/date";
import {
	type HelperHourCategory,
	normalizeHelperHourLabel,
} from "@/lib/helper-hours";
import { text } from "@/server/services/helper-hours-import";

export const HELPER_HOUR_EXPENSE_IMPORT_MAX_BYTES = 2_000_000;
export const HELPER_HOUR_EXPENSE_IMPORT_MAX_ROWS = 1_000;

export type HelperHourExpenseImportRow = {
	idempotency_key: string;
	kategorie_code: string;
	kategorie_label: string;
	datum: string;
	bezeichnung: string;
	betrag_cent: number;
	sheet: string;
	rowNumber: number;
	sourceFile: string;
	sourceDigest: string;
	signature: string;
};
export type HelperHourExpenseImportResult = {
	rows: HelperHourExpenseImportRow[];
	errors: Array<{ sheet: string; row: number; message: string }>;
	sheets: string[];
};

function uuidFor(digest: string, sheet: string, row: number): string {
	const bytes = createHash("sha256")
		.update(`helper-hour-expenses:v1:${digest}:${sheet}:${row}`)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 80;
	bytes[8] = (bytes[8] & 63) | 128;
	const h = bytes.toString("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(bytes.length);
	new Uint8Array(out).set(bytes);
	return out;
}

function dateValue(value: ExcelJS.CellValue): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime()))
		return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
	if (typeof value === "number") {
		const date = new Date(
			Date.UTC(1899, 11, 30) + Math.round(value) * 86400000,
		);
		return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
	}
	const raw = text(value);
	if (isIsoCalendarDate(raw)) return raw;
	const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(raw);
	if (!match) return null;
	const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
	return isIsoCalendarDate(iso) ? iso : null;
}

/** Euro amount to whole cents. Accepts both German and plain decimal input. */
function amountCent(value: ExcelJS.CellValue): number | null {
	if (value == null) return 0;
	if (typeof value === "object" && value && "result" in value)
		return amountCent(value.result as ExcelJS.CellValue);
	if (typeof value === "number")
		return Number.isFinite(value) ? Math.round(value * 100) : null;
	const raw = text(value);
	if (!raw) return 0;
	const cleaned = raw
		.replace(/[€\s ]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(",", ".");
	if (!cleaned) return 0;
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

/** Content identity used to recognise a deduction already stored in Rendant. */
export function helperHourExpenseSignature(input: {
	kategorie_code: string;
	datum: string;
	bezeichnung: string;
	betrag_cent: number;
}): string {
	return [
		input.kategorie_code,
		input.datum,
		input.bezeichnung.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " "),
		input.betrag_cent,
	].join("|");
}

/**
 * Reads the "Verrechnung Stunden Abteilungen" layout: one row per purchase,
 * the amount in the column of the department it is charged to, and the
 * description in a trailing "Inhalt" column.
 */
export async function parseHelperHourExpenseWorkbook(
	bytes: Uint8Array,
	sourceFile: string,
	categories: HelperHourCategory[],
	sourceDigest = createHash("sha256").update(bytes).digest("hex"),
): Promise<HelperHourExpenseImportResult> {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(toArrayBuffer(bytes));
	} catch {
		return {
			rows: [],
			errors: [
				{
					sheet: "",
					row: 0,
					message: "Die Datei ist keine lesbare Excel-Datei.",
				},
			],
			sheets: [],
		};
	}
	const byHeading = new Map<string, HelperHourCategory>();
	for (const category of categories) {
		byHeading.set(normalizeHelperHourLabel(category.code), category);
		byHeading.set(normalizeHelperHourLabel(category.label), category);
	}
	const DESCRIPTION_HEADINGS = ["inhalt", "bezeichnung", "verwendung", "zweck"];
	const rows: HelperHourExpenseImportRow[] = [];
	const errors: HelperHourExpenseImportResult["errors"] = [];
	const sheets: string[] = [];

	for (const sheet of workbook.worksheets) {
		let headerRow = 0;
		const columns = new Map<string, number>();
		const width = Math.min(Math.max(sheet.columnCount, 20), 80);
		for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
			const values = Array.from({ length: width }, (_, i) =>
				normalizeHelperHourLabel(text(sheet.getCell(r, i + 1).value)),
			);
			if (
				values.includes("datum") &&
				values.some((value) => DESCRIPTION_HEADINGS.includes(value))
			) {
				headerRow = r;
				values.forEach((value, i) => {
					if (value && !columns.has(value)) columns.set(value, i + 1);
				});
				break;
			}
		}
		if (!headerRow) continue;
		sheets.push(sheet.name);
		const dateColumn = columns.get("datum") ?? 0;
		const descriptionColumn =
			DESCRIPTION_HEADINGS.map((heading) => columns.get(heading)).find(
				Boolean,
			) ?? 0;
		const categoryColumns: Array<{
			category: HelperHourCategory;
			index: number;
		}> = [];
		for (const [heading, index] of columns) {
			if (heading === "datum" || DESCRIPTION_HEADINGS.includes(heading))
				continue;
			const category = byHeading.get(heading);
			if (category) categoryColumns.push({ category, index });
		}
		if (categoryColumns.length === 0) {
			errors.push({
				sheet: sheet.name,
				row: headerRow,
				message: "Keine Spalte passt zu einem Helferstunden-Punkt.",
			});
			continue;
		}

		for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
			const datumCell = sheet.getCell(r, dateColumn).value;
			const bezeichnung = text(sheet.getCell(r, descriptionColumn).value).slice(
				0,
				200,
			);
			const charged: Array<{ category: HelperHourCategory; cent: number }> = [];
			let invalid = false;
			for (const { category, index } of categoryColumns) {
				const cent = amountCent(sheet.getCell(r, index).value);
				if (cent == null) invalid = true;
				else if (cent > 0) charged.push({ category, cent });
			}
			if (!text(datumCell) && !bezeichnung && charged.length === 0) continue;
			const datum = dateValue(datumCell);
			if (!datum) {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Datum fehlt oder ist ungültig.",
				});
				continue;
			}
			if (!bezeichnung) {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Inhalt fehlt.",
				});
				continue;
			}
			if (invalid) {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Ein Betrag ist keine gültige Zahl.",
				});
				continue;
			}
			if (charged.length === 0) {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Kein Betrag eingetragen.",
				});
				continue;
			}
			// One row is one purchase. Two amounts leave it open which department
			// the entry belongs to, so the list has to say it in two rows.
			if (charged.length > 1) {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: `Beträge in mehreren Spalten (${charged
						.map((entry) => entry.category.label)
						.join(", ")}). Bitte je Abteilung eine eigene Zeile anlegen.`,
				});
				continue;
			}
			const [{ category, cent }] = charged;
			if (category.art !== "abteilung") {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: `"${category.label}" bildet kein Abteilungsguthaben und kann nicht belastet werden.`,
				});
				continue;
			}
			if (!category.aktiv) {
				errors.push({
					sheet: sheet.name,
					row: r,
					message: `"${category.label}" ist deaktiviert.`,
				});
				continue;
			}
			rows.push({
				idempotency_key: uuidFor(sourceDigest, sheet.name, r),
				kategorie_code: category.code,
				kategorie_label: category.label,
				datum,
				bezeichnung,
				betrag_cent: cent,
				sheet: sheet.name,
				rowNumber: r,
				sourceFile: sourceFile.slice(0, 255),
				sourceDigest,
				signature: helperHourExpenseSignature({
					kategorie_code: category.code,
					datum,
					bezeichnung,
					betrag_cent: cent,
				}),
			});
			if (rows.length > HELPER_HOUR_EXPENSE_IMPORT_MAX_ROWS)
				return {
					rows: [],
					errors: [
						{
							sheet: "",
							row: 0,
							message: `Die Datei enthält mehr als ${HELPER_HOUR_EXPENSE_IMPORT_MAX_ROWS} Einträge.`,
						},
					],
					sheets,
				};
		}
	}
	if (rows.length === 0 && errors.length === 0)
		errors.push({
			sheet: "",
			row: 0,
			message: "Keine Verrechnungstabelle gefunden.",
		});
	return { rows, errors, sheets };
}
