import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { isIsoCalendarDate } from "@/lib/date";

export const HELPER_HOURS_IMPORT_MAX_BYTES = 5_000_000;
export const HELPER_HOURS_IMPORT_MAX_ROWS = 2_000;

type Allocations = {
	gesamtverein_minuten: number;
	fussball_minuten: number;
	korbball_minuten: number;
	tischtennis_minuten: number;
	darts_minuten: number;
	gymnastik_minuten: number;
	senioren_minuten: number;
	combo_minuten: number;
};
export type HelperHoursImportRow = {
	idempotency_key: string;
	datum: string;
	veranstaltung: string;
	nachname: string;
	vorname: string;
	allocations: Allocations;
	gemeldete_summe_minuten: number;
	bemerkung: string;
	warnings: string[];
	sheet: string;
	rowNumber: number;
	sourceFile: string;
	sourceDigest: string;
};
export type HelperHoursImportResult = {
	rows: HelperHoursImportRow[];
	errors: Array<{ sheet: string; row: number; message: string }>;
	warnings: number;
};

function uuidFor(digest: string, sheet: string, row: number): string {
	const bytes = createHash("sha256")
		.update(`helper-hours:v1:${digest}:${sheet}:${row}`)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 80;
	bytes[8] = (bytes[8] & 63) | 128;
	const h = bytes.toString("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function text(value: ExcelJS.CellValue): string {
	if (value == null) return "";
	if (value instanceof Date)
		return `${String(value.getUTCDate()).padStart(2, "0")}.${String(value.getUTCMonth() + 1).padStart(2, "0")}.${value.getUTCFullYear()}`;
	if (typeof value === "string" || typeof value === "number")
		return String(value).trim();
	if (typeof value === "object" && "result" in value)
		return text(value.result as ExcelJS.CellValue);
	if (typeof value === "object" && "richText" in value)
		return value.richText
			.map((part) => part.text)
			.join("")
			.trim();
	return "";
}
function decimalHours(value: ExcelJS.CellValue): number | null {
	if (value == null || value === "") return 0;
	if (typeof value === "object" && value && "result" in value)
		return decimalHours(value.result as ExcelJS.CellValue);
	const raw =
		typeof value === "number" ? value : Number(text(value).replace(",", "."));
	if (!Number.isFinite(raw) || raw < 0 || raw > 168) return null;
	return Math.round(raw * 60);
}
function sheetYear(name: string): number | null {
	const m = /(20\d{2}|\d{2})(?!.*\d)/.exec(name);
	return m ? (m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1])) : null;
}
function dateValue(value: ExcelJS.CellValue, sheet: string): string | null {
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
	const full = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(raw);
	const short = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(raw);
	const year = full ? Number(full[3]) : sheetYear(sheet);
	const day = Number((full ?? short)?.[1]);
	const month = Number((full ?? short)?.[2]);
	if (!year || !day || !month) return null;
	const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	return isIsoCalendarDate(iso) ? iso : null;
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(bytes.length);
	new Uint8Array(out).set(bytes);
	return out;
}
function normalized(value: string) {
	return value
		.trim()
		.toLocaleLowerCase("de-DE")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9äöü]+/g, "");
}

export async function parseHelperHoursWorkbook(
	bytes: Uint8Array,
	sourceFile: string,
	sourceDigest = createHash("sha256").update(bytes).digest("hex"),
): Promise<HelperHoursImportResult> {
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
			warnings: 0,
		};
	}
	const rows: HelperHoursImportRow[] = [];
	const errors: HelperHoursImportResult["errors"] = [];
	for (const sheet of workbook.worksheets) {
		let headerRow = 0;
		const columns = new Map<string, number>();
		for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
			const values = Array.from({ length: 20 }, (_, i) =>
				normalized(text(sheet.getCell(r, i + 1).value)),
			);
			if (values.includes("datum") && values.includes("veranstaltung")) {
				headerRow = r;
				values.forEach((v, i) => {
					if (v) columns.set(v, i + 1);
				});
				break;
			}
		}
		if (!headerRow) continue;
		const col = (name: string) => columns.get(normalized(name)) ?? 0;
		for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
			const cell = (name: string): ExcelJS.CellValue => {
				const column = col(name);
				return column ? sheet.getCell(r, column).value : null;
			};
			const datumCell = cell("Datum");
			const eventCell = cell("Veranstaltung");
			const last = text(cell("Nachname"));
			const first = text(cell("Vorname"));
			if (!text(datumCell) && !text(eventCell) && !last && !first) continue;
			const datum = dateValue(datumCell, sheet.name);
			let event = text(eventCell);
			if (typeof eventCell === "number" || eventCell instanceof Date)
				event =
					dateValue(eventCell, sheet.name)?.split("-").reverse().join(".") ??
					event;
			const categoryNames = [
				"Gesamtverein",
				"Fußball",
				"Korbball",
				"Tischtennis",
				"Darts",
				"Gymnastik",
				"Senioren",
				"Combo",
			];
			const keys = [
				"gesamtverein_minuten",
				"fussball_minuten",
				"korbball_minuten",
				"tischtennis_minuten",
				"darts_minuten",
				"gymnastik_minuten",
				"senioren_minuten",
				"combo_minuten",
			] as const;
			const allocations = {} as Allocations;
			let invalid = false;
			keys.forEach((key, i) => {
				const parsed = decimalHours(cell(categoryNames[i]));
				if (parsed == null) invalid = true;
				allocations[key] = parsed ?? 0;
			});
			const reported = decimalHours(cell("Summe"));
			const allocated = Object.values(allocations).reduce((a, b) => a + b, 0);
			const warnings: string[] = [];
			if (!datum)
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Datum fehlt oder ist ungültig.",
				});
			if (!event)
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Veranstaltung fehlt.",
				});
			if (invalid || ((reported == null || reported === 0) && allocated === 0))
				errors.push({
					sheet: sheet.name,
					row: r,
					message: "Stunden fehlen oder sind ungültig.",
				});
			if (!last || !first)
				warnings.push("Vor- oder Nachname fehlt in der Quelldatei.");
			const total =
				reported == null || (reported === 0 && allocated > 0)
					? allocated
					: reported;
			if ((reported == null || reported === 0) && allocated > 0)
				warnings.push("Summe fehlte und wurde aus der Zuordnung übernommen.");
			if (allocated === 0 && total > 0) {
				allocations.gesamtverein_minuten = total;
				warnings.push("Ohne Zuordnung dem Gesamtverein zugeteilt.");
			} else if (total !== allocated)
				warnings.push(
					`Gemeldete Summe ${total / 60} h weicht von der Zuordnung ${allocated / 60} h ab.`,
				);
			if (
				datum &&
				event &&
				!invalid &&
				(reported != null || allocated > 0) &&
				total > 0
			)
				rows.push({
					idempotency_key: uuidFor(sourceDigest, sheet.name, r),
					datum,
					veranstaltung: event.slice(0, 160),
					nachname: last.slice(0, 120),
					vorname: first.slice(0, 120),
					allocations,
					gemeldete_summe_minuten: total || allocated,
					bemerkung: text(cell("Sonstiges")).slice(0, 1000),
					warnings,
					sheet: sheet.name,
					rowNumber: r,
					sourceFile: sourceFile.slice(0, 255),
					sourceDigest,
				});
			if (rows.length > HELPER_HOURS_IMPORT_MAX_ROWS)
				return {
					rows: [],
					errors: [
						{
							sheet: "",
							row: 0,
							message: `Die Datei enthält mehr als ${HELPER_HOURS_IMPORT_MAX_ROWS} Einträge.`,
						},
					],
					warnings: 0,
				};
		}
	}
	if (rows.length === 0 && errors.length === 0)
		errors.push({
			sheet: "",
			row: 0,
			message: "Keine Helferstunden-Tabelle gefunden.",
		});
	return {
		rows,
		errors,
		warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
	};
}
