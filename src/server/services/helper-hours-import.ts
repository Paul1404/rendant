import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { isIsoCalendarDate } from "@/lib/date";

export const HELPER_HOURS_IMPORT_MAX_BYTES = 5_000_000;
export const HELPER_HOURS_IMPORT_MAX_ROWS = 2_000;

export type HelperHoursAllocations = {
	gesamtverein_minuten: number;
	fussball_minuten: number;
	korbball_minuten: number;
	tischtennis_minuten: number;
	darts_minuten: number;
	gymnastik_minuten: number;
	senioren_minuten: number;
	combo_minuten: number;
};
export type HelperHoursImportIssueCode =
	| "missing_name"
	| "derived_total"
	| "unassigned"
	| "total_mismatch";
export type HelperHoursImportOriginalValues = {
	vorname: string;
	nachname: string;
	allocations: HelperHoursAllocations;
	gemeldete_summe_minuten: number;
};
export type HelperHoursImportCorrection = HelperHoursImportOriginalValues & {
	sheet: string;
	rowNumber: number;
	acceptedIssues: HelperHoursImportIssueCode[];
};
export type HelperHoursImportRow = {
	idempotency_key: string;
	datum: string;
	veranstaltung: string;
	nachname: string;
	vorname: string;
	allocations: HelperHoursAllocations;
	gemeldete_summe_minuten: number;
	bemerkung: string;
	warnings: string[];
	issues: HelperHoursImportIssueCode[];
	originalValues: HelperHoursImportOriginalValues;
	correction: HelperHoursImportCorrection | null;
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

const ISSUE_MESSAGES: Record<HelperHoursImportIssueCode, string> = {
	missing_name: "Vor- oder Nachname fehlt in der Quelldatei.",
	derived_total: "Summe fehlte und wurde aus der Zuordnung übernommen.",
	unassigned: "Ohne Zuordnung dem Gesamtverein zugeteilt.",
	total_mismatch: "Gemeldete Summe weicht von der Zuordnung ab.",
};
const ISSUE_CODES = new Set<HelperHoursImportIssueCode>(
	Object.keys(ISSUE_MESSAGES) as HelperHoursImportIssueCode[],
);
const ALLOCATION_KEYS = [
	"gesamtverein_minuten",
	"fussball_minuten",
	"korbball_minuten",
	"tischtennis_minuten",
	"darts_minuten",
	"gymnastik_minuten",
	"senioren_minuten",
	"combo_minuten",
] as const;

export function parseHelperHoursImportCorrections(
	value: FormDataEntryValue | null,
): HelperHoursImportCorrection[] | null {
	if (typeof value !== "string" || value.length > 100_000) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || parsed.length > HELPER_HOURS_IMPORT_MAX_ROWS)
		return null;
	const corrections: HelperHoursImportCorrection[] = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== "object") return null;
		const candidate = entry as Record<string, unknown>;
		const allocations = candidate.allocations;
		if (!allocations || typeof allocations !== "object") return null;
		const allocationRecord = allocations as Record<string, unknown>;
		if (
			typeof candidate.sheet !== "string" ||
			candidate.sheet.length > 120 ||
			!Number.isInteger(candidate.rowNumber) ||
			Number(candidate.rowNumber) <= 0 ||
			typeof candidate.vorname !== "string" ||
			typeof candidate.nachname !== "string" ||
			!Number.isInteger(candidate.gemeldete_summe_minuten) ||
			!Array.isArray(candidate.acceptedIssues) ||
			!candidate.acceptedIssues.every(
				(issue) =>
					typeof issue === "string" &&
					ISSUE_CODES.has(issue as HelperHoursImportIssueCode),
			) ||
			!ALLOCATION_KEYS.every((key) => Number.isInteger(allocationRecord[key]))
		)
			return null;
		corrections.push({
			sheet: candidate.sheet,
			rowNumber: Number(candidate.rowNumber),
			vorname: candidate.vorname,
			nachname: candidate.nachname,
			gemeldete_summe_minuten: Number(candidate.gemeldete_summe_minuten),
			acceptedIssues: candidate.acceptedIssues as HelperHoursImportIssueCode[],
			allocations: Object.fromEntries(
				ALLOCATION_KEYS.map((key) => [key, Number(allocationRecord[key])]),
			) as HelperHoursAllocations,
		});
	}
	return corrections;
}

export function helperHoursImportIssueMessage(
	issue: HelperHoursImportIssueCode,
	row?: Pick<HelperHoursImportRow, "gemeldete_summe_minuten" | "allocations">,
): string {
	if (issue !== "total_mismatch" || !row) return ISSUE_MESSAGES[issue];
	const allocated = Object.values(row.allocations).reduce((a, b) => a + b, 0);
	return `Gemeldete Summe ${row.gemeldete_summe_minuten / 60} h weicht von der Zuordnung ${allocated / 60} h ab.`;
}

function correctionKey(sheet: string, rowNumber: number) {
	return `${sheet}:${rowNumber}`;
}

export function applyHelperHoursImportCorrections(
	rows: HelperHoursImportRow[],
	corrections: HelperHoursImportCorrection[],
): {
	rows: HelperHoursImportRow[];
	errors: string[];
	openIssues: number;
	corrected: number;
	accepted: number;
} {
	const errors: string[] = [];
	const byRow = new Map<string, HelperHoursImportCorrection>();
	for (const correction of corrections) {
		const key = correctionKey(correction.sheet, correction.rowNumber);
		if (byRow.has(key))
			errors.push(
				`${correction.sheet} Zeile ${correction.rowNumber}: Korrektur ist doppelt vorhanden.`,
			);
		byRow.set(key, correction);
	}
	let openIssues = 0;
	let corrected = 0;
	let accepted = 0;
	const knownRows = new Set(
		rows.map((row) => correctionKey(row.sheet, row.rowNumber)),
	);
	for (const correction of corrections) {
		if (!knownRows.has(correctionKey(correction.sheet, correction.rowNumber)))
			errors.push(
				`${correction.sheet} Zeile ${correction.rowNumber}: Gehört nicht zu dieser Importprüfung.`,
			);
	}
	const nextRows = rows.map((row) => {
		if (row.issues.length === 0) return row;
		const correction = byRow.get(correctionKey(row.sheet, row.rowNumber));
		if (!correction) {
			openIssues += row.issues.length;
			return row;
		}
		const values = [
			correction.gemeldete_summe_minuten,
			...Object.values(correction.allocations),
		];
		if (
			values.some(
				(value) => !Number.isInteger(value) || value < 0 || value > 10_080,
			) ||
			correction.gemeldete_summe_minuten <= 0
		) {
			errors.push(
				`${row.sheet} Zeile ${row.rowNumber}: Stunden sind ungültig.`,
			);
			return row;
		}
		if (correction.vorname.length > 120 || correction.nachname.length > 120) {
			errors.push(`${row.sheet} Zeile ${row.rowNumber}: Der Name ist zu lang.`);
			return row;
		}
		const acceptedIssues = new Set(correction.acceptedIssues);
		if (correction.acceptedIssues.some((issue) => !row.issues.includes(issue)))
			errors.push(
				`${row.sheet} Zeile ${row.rowNumber}: Eine übernommene Abweichung gehört nicht zu dieser Zeile.`,
			);
		const allocated = Object.values(correction.allocations).reduce(
			(sum, value) => sum + value,
			0,
		);
		const unresolved = row.issues.filter((issue) => {
			if (acceptedIssues.has(issue)) return false;
			if (issue === "missing_name")
				return !correction.vorname.trim() || !correction.nachname.trim();
			if (issue === "total_mismatch")
				return correction.gemeldete_summe_minuten !== allocated;
			if (issue === "unassigned")
				return (
					correction.allocations.gesamtverein_minuten ===
					correction.gemeldete_summe_minuten
				);
			return true;
		});
		openIssues += unresolved.length;
		accepted += row.issues.filter((issue) => acceptedIssues.has(issue)).length;
		const changed =
			correction.vorname.trim() !== row.vorname ||
			correction.nachname.trim() !== row.nachname ||
			correction.gemeldete_summe_minuten !== row.gemeldete_summe_minuten ||
			Object.entries(correction.allocations).some(
				([key, value]) =>
					value !== row.allocations[key as keyof HelperHoursAllocations],
			);
		if (changed) corrected++;
		const next = {
			...row,
			vorname: correction.vorname.trim(),
			nachname: correction.nachname.trim(),
			allocations: correction.allocations,
			gemeldete_summe_minuten: correction.gemeldete_summe_minuten,
			correction,
		};
		return {
			...next,
			warnings: row.issues.map((issue) => {
				const message = helperHoursImportIssueMessage(issue, row);
				if (acceptedIssues.has(issue)) return `${message} Bewusst übernommen.`;
				return `${message} In der Importprüfung korrigiert.`;
			}),
		};
	});
	return { rows: nextRows, errors, openIssues, corrected, accepted };
}

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
			const allocations = {} as HelperHoursAllocations;
			let invalid = false;
			keys.forEach((key, i) => {
				const parsed = decimalHours(cell(categoryNames[i]));
				if (parsed == null) invalid = true;
				allocations[key] = parsed ?? 0;
			});
			const reported = decimalHours(cell("Summe"));
			const allocated = Object.values(allocations).reduce((a, b) => a + b, 0);
			const sourceAllocations = { ...allocations };
			const issues: HelperHoursImportIssueCode[] = [];
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
			if (!last || !first) issues.push("missing_name");
			const total =
				reported == null || (reported === 0 && allocated > 0)
					? allocated
					: reported;
			if ((reported == null || reported === 0) && allocated > 0)
				issues.push("derived_total");
			if (allocated === 0 && total > 0) {
				allocations.gesamtverein_minuten = total;
				issues.push("unassigned");
			} else if (total !== allocated) issues.push("total_mismatch");
			if (
				datum &&
				event &&
				!invalid &&
				(reported != null || allocated > 0) &&
				total > 0
			) {
				const originalValues = {
					vorname: first.slice(0, 120),
					nachname: last.slice(0, 120),
					allocations: sourceAllocations,
					gemeldete_summe_minuten: reported ?? 0,
				};
				const row = {
					idempotency_key: uuidFor(sourceDigest, sheet.name, r),
					datum,
					veranstaltung: event.slice(0, 160),
					nachname: last.slice(0, 120),
					vorname: first.slice(0, 120),
					allocations,
					gemeldete_summe_minuten: total || allocated,
					bemerkung: text(cell("Sonstiges")).slice(0, 1000),
					warnings: [] as string[],
					issues,
					originalValues,
					correction: null,
					sheet: sheet.name,
					rowNumber: r,
					sourceFile: sourceFile.slice(0, 255),
					sourceDigest,
				};
				row.warnings = issues.map((issue) =>
					helperHoursImportIssueMessage(issue, row),
				);
				rows.push(row);
			}
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
