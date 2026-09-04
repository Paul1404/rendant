import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { isIsoCalendarDate } from "@/lib/date";
import {
	HELPER_HOUR_CONTRIBUTION_CODE,
	type HelperHourCategory,
	normalizeHelperHourLabel,
} from "@/lib/helper-hours";

export const HELPER_HOURS_IMPORT_MAX_BYTES = 5_000_000;
export const HELPER_HOURS_IMPORT_MAX_ROWS = 2_000;

/** Minutes per category code. Categories without minutes are omitted. */
export type HelperHoursAllocations = Record<string, number>;

/**
 * Issues split in two: `repairs` were fixed automatically because the source
 * list itself makes the correct value unambiguous, and `issues` still need a
 * person to decide. Both stay visible on the imported row.
 */
export type HelperHoursImportIssueCode =
	| "missing_name"
	| "total_mismatch"
	| "unknown_date";
export type HelperHoursImportRepairCode =
	| "derived_total"
	| "unassigned"
	| "name_case"
	| "name_swapped"
	| "name_completed"
	| "sheet_year";

export type HelperHoursImportOriginalValues = {
	vorname: string;
	nachname: string;
	datum: string;
	allocations: HelperHoursAllocations;
	gemeldete_summe_minuten: number;
};
export type HelperHoursImportCorrection = {
	sheet: string;
	rowNumber: number;
	vorname: string;
	nachname: string;
	allocations: HelperHoursAllocations;
	gemeldete_summe_minuten: number;
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
	repairs: HelperHoursImportRepairCode[];
	originalValues: HelperHoursImportOriginalValues;
	correction: HelperHoursImportCorrection | null;
	sheet: string;
	rowNumber: number;
	sourceFile: string;
	sourceDigest: string;
};
/** Two spellings the list uses that look like the same person. */
export type HelperHoursSimilarName = {
	left: string;
	right: string;
	leftEntries: number;
	rightEntries: number;
	leftMinutes: number;
	rightMinutes: number;
};
export type HelperHoursImportResult = {
	rows: HelperHoursImportRow[];
	errors: Array<{ sheet: string; row: number; message: string }>;
	sheets: string[];
	unknownColumns: string[];
	similarNames: HelperHoursSimilarName[];
	repairs: number;
	warnings: number;
};

const ISSUE_MESSAGES: Record<HelperHoursImportIssueCode, string> = {
	missing_name: "Vor- oder Nachname fehlt in der Quelldatei.",
	total_mismatch: "Gemeldete Summe weicht von der Zuordnung ab.",
	unknown_date: "Das Datum passt nicht zum Monatsblatt.",
};
const REPAIR_MESSAGES: Record<HelperHoursImportRepairCode, string> = {
	derived_total: "Summe fehlte und wurde aus der Zuordnung übernommen.",
	unassigned: "Ohne Zuordnung als Vereinsbeitrag übernommen.",
	name_case: "Schreibweise des Namens vereinheitlicht.",
	name_swapped: "Vor- und Nachname waren vertauscht und wurden getauscht.",
	name_completed: "Fehlender Namensteil aus der Liste ergänzt.",
	sheet_year: "Jahreszahl an das Monatsblatt angepasst.",
};
const ISSUE_CODES = new Set<HelperHoursImportIssueCode>(
	Object.keys(ISSUE_MESSAGES) as HelperHoursImportIssueCode[],
);

export function parseHelperHoursImportCorrections(
	value: FormDataEntryValue | null,
): HelperHoursImportCorrection[] | null {
	if (typeof value !== "string" || value.length > 400_000) return null;
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
		const allocationEntries = Object.entries(
			allocations as Record<string, unknown>,
		);
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
			allocationEntries.length > 60 ||
			!allocationEntries.every(
				([key, value]) =>
					typeof key === "string" &&
					key.length <= 40 &&
					Number.isInteger(value),
			)
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
				allocationEntries.map(([key, value]) => [key, Number(value)]),
			),
		});
	}
	return corrections;
}

function allocatedMinutes(allocations: HelperHoursAllocations): number {
	return Object.values(allocations).reduce((sum, value) => sum + value, 0);
}

export function helperHoursImportIssueMessage(
	issue: HelperHoursImportIssueCode,
	row?: Pick<HelperHoursImportRow, "gemeldete_summe_minuten" | "allocations">,
): string {
	if (issue !== "total_mismatch" || !row) return ISSUE_MESSAGES[issue];
	return `Gemeldete Summe ${row.gemeldete_summe_minuten / 60} h weicht von der Zuordnung ${allocatedMinutes(row.allocations) / 60} h ab.`;
}

export function helperHoursImportRepairMessage(
	repair: HelperHoursImportRepairCode,
): string {
	return REPAIR_MESSAGES[repair];
}

function correctionKey(sheet: string, rowNumber: number) {
	return `${sheet}:${rowNumber}`;
}

export function applyHelperHoursImportCorrections(
	rows: HelperHoursImportRow[],
	corrections: HelperHoursImportCorrection[],
	categoryCodes: ReadonlySet<string>,
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
		for (const code of Object.keys(correction.allocations)) {
			if (!categoryCodes.has(code))
				errors.push(
					`${correction.sheet} Zeile ${correction.rowNumber}: Der Punkt "${code}" ist unbekannt.`,
				);
		}
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
		const allocations = Object.fromEntries(
			Object.entries(correction.allocations).filter(([, value]) => value > 0),
		);
		const allocated = allocatedMinutes(allocations);
		const unresolved = row.issues.filter((issue) => {
			if (acceptedIssues.has(issue)) return false;
			if (issue === "missing_name")
				return !correction.vorname.trim() || !correction.nachname.trim();
			if (issue === "total_mismatch")
				return correction.gemeldete_summe_minuten !== allocated;
			// A questionable date can only be accepted knowingly; the review UI
			// offers no date field, so there is nothing else to resolve here.
			return true;
		});
		openIssues += unresolved.length;
		accepted += row.issues.filter((issue) => acceptedIssues.has(issue)).length;
		const changed =
			correction.vorname.trim() !== row.vorname ||
			correction.nachname.trim() !== row.nachname ||
			correction.gemeldete_summe_minuten !== row.gemeldete_summe_minuten ||
			JSON.stringify(allocations) !== JSON.stringify(row.allocations);
		if (changed) corrected++;
		const next = {
			...row,
			vorname: correction.vorname.trim(),
			nachname: correction.nachname.trim(),
			allocations,
			gemeldete_summe_minuten: correction.gemeldete_summe_minuten,
			correction,
		};
		return {
			...next,
			warnings: [
				...row.repairs.map((repair) => REPAIR_MESSAGES[repair]),
				...row.issues.map((issue) => {
					const message = helperHoursImportIssueMessage(issue, row);
					if (acceptedIssues.has(issue))
						return `${message} Bewusst übernommen.`;
					return `${message} In der Importprüfung korrigiert.`;
				}),
			],
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

export function text(value: ExcelJS.CellValue): string {
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

const SHEET_MONTHS: ReadonlyArray<[RegExp, number]> = [
	[/^jan/i, 1],
	[/^feb/i, 2],
	[/^m(ä|ae|a)r/i, 3],
	[/^apr/i, 4],
	[/^mai/i, 5],
	[/^jun/i, 6],
	[/^jul/i, 7],
	[/^aug/i, 8],
	[/^sep/i, 9],
	[/^okt|^oct/i, 10],
	[/^nov/i, 11],
	[/^dez|^dec/i, 12],
];

/** Year and month a monthly sheet stands for, e.g. "Okt__25" -> 2025-10. */
export function sheetPeriod(
	name: string,
): { year: number; month: number } | null {
	const yearMatch = /(20\d{2}|\d{2})(?!.*\d)/.exec(name);
	if (!yearMatch) return null;
	const year =
		yearMatch[1].length === 2
			? 2000 + Number(yearMatch[1])
			: Number(yearMatch[1]);
	const label = name.replace(/[_\s]+/g, " ").trim();
	const month = SHEET_MONTHS.find(([pattern]) => pattern.test(label))?.[1];
	return month ? { year, month } : null;
}

function sheetYear(name: string): number | null {
	return sheetPeriod(name)?.year ?? null;
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

/**
 * Title case that leaves deliberate inner capitals and particles alone:
 * "josefine" becomes "Josefine", "McDonald" and "von Au" stay as typed.
 */
export function tidyName(value: string): string {
	const cleaned = value.trim().replace(/\s+/g, " ");
	if (!cleaned) return "";
	return cleaned
		.split(/(\s|-)/)
		.map((part) => {
			if (part === " " || part === "-") return part;
			const isLower = part === part.toLocaleLowerCase("de-DE");
			const isUpper = part === part.toLocaleUpperCase("de-DE");
			if (!isLower && !isUpper) return part;
			if (isUpper && part.length <= 3) return part;
			return (
				part.charAt(0).toLocaleUpperCase("de-DE") +
				part.slice(1).toLocaleLowerCase("de-DE")
			);
		})
		.join("");
}

function nameKey(value: string): string {
	return value.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

type RawRow = {
	sheet: string;
	rowNumber: number;
	datum: string | null;
	rawDatum: string | null;
	veranstaltung: string;
	nachname: string;
	vorname: string;
	allocations: HelperHoursAllocations;
	reported: number | null;
	bemerkung: string;
	invalid: boolean;
};

/**
 * Decides one canonical spelling per person, then reports it for every row.
 *
 * Swapping a row purely because the list writes it differently elsewhere is
 * symmetric, and would flip both rows of a person recorded once each way. So
 * the orientation is chosen once per unordered name pair and applied to all of
 * that person's rows: majority wins, and an even split is broken by how the
 * rest of the list uses those two tokens. With no evidence either way the rows
 * are left exactly as typed.
 */
function canonicalNames(rows: RawRow[]) {
	const ordered = new Map<string, number>();
	for (const row of rows) {
		const last = nameKey(row.nachname);
		const first = nameKey(row.vorname);
		if (!last || !first || last === first) continue;
		const key = `${last}|${first}`;
		ordered.set(key, (ordered.get(key) ?? 0) + 1);
	}
	const groups = new Map<string, { a: string; b: string }>();
	for (const key of ordered.keys()) {
		const [last, first] = key.split("|");
		const unordered = [last, first].sort().join("|");
		if (!groups.has(unordered)) groups.set(unordered, { a: last, b: first });
	}
	// Only people the list spells consistently get to vote on how a token is
	// normally used, so an ambiguous pair cannot reinforce its own confusion.
	const surnameScore = new Map<string, number>();
	const givenScore = new Map<string, number>();
	// Which given names a token is used as a surname for. Sets rather than
	// counts, so one person entered many times is still a single witness.
	const surnameOf = new Map<string, { names: Set<string>; rows: number }>();
	for (const [unordered, { a, b }] of groups) {
		const forward = ordered.get(`${a}|${b}`) ?? 0;
		const backward = ordered.get(`${b}|${a}`) ?? 0;
		if (forward > 0 && backward > 0) continue;
		const [last, first] = forward > 0 ? [a, b] : [b, a];
		const count = forward || backward;
		surnameScore.set(last, (surnameScore.get(last) ?? 0) + count);
		givenScore.set(first, (givenScore.get(first) ?? 0) + count);
		const entry = surnameOf.get(last) ?? { names: new Set<string>(), rows: 0 };
		entry.names.add(first);
		entry.rows += count;
		surnameOf.set(last, entry);
	}
	/**
	 * A name pair the list only ever writes one way still gets swapped when that
	 * one way contradicts an established surname: "Andrea, Hutter" against a
	 * "Hutter" the list heads eight rows with, and an "Andrea" it heads two.
	 *
	 * Only positive evidence counts, and it is compared rather than required to
	 * be absent: a row that is itself swapped ("Andrea, Kral") lends the wrong
	 * token a little surname weight, so the rule asks for a clear margin over
	 * that noise instead of demanding silence. Two distinct given names stop a
	 * single mistyped row from establishing a surname on its own, and the pair
	 * is excluded from its own evidence.
	 */
	function contradictsEstablishedSurname(last: string, first: string) {
		const forFirst = surnameOf.get(first);
		if (!forFirst) return false;
		const names = new Set(forFirst.names);
		names.delete(last);
		const rows = forFirst.rows - (ordered.get(`${first}|${last}`) ?? 0);
		if (names.size < 2 || rows < 3) return false;
		const forLast = surnameOf.get(last);
		const reverseRows =
			(forLast?.rows ?? 0) - (ordered.get(`${last}|${first}`) ?? 0);
		return rows >= 3 * Math.max(reverseRows, 1);
	}

	const canonical = new Map<string, { last: string; first: string }>();
	for (const [unordered, { a, b }] of groups) {
		const forward = ordered.get(`${a}|${b}`) ?? 0;
		const backward = ordered.get(`${b}|${a}`) ?? 0;
		if (forward === 0 || backward === 0) {
			const [last, first] = forward > 0 ? [a, b] : [b, a];
			canonical.set(
				unordered,
				contradictsEstablishedSurname(last, first)
					? { last: first, first: last }
					: { last, first },
			);
			continue;
		}
		if (forward !== backward) {
			const [last, first] = forward > backward ? [a, b] : [b, a];
			canonical.set(unordered, { last, first });
			continue;
		}
		const forwardScore = (surnameScore.get(a) ?? 0) + (givenScore.get(b) ?? 0);
		const backwardScore = (surnameScore.get(b) ?? 0) + (givenScore.get(a) ?? 0);
		if (forwardScore === backwardScore) continue;
		const [last, first] = forwardScore > backwardScore ? [a, b] : [b, a];
		canonical.set(unordered, { last, first });
	}
	// Name completion looks up the canonical counterpart of a lone name part.
	const byGiven = new Map<string, Set<string>>();
	const bySurname = new Map<string, Set<string>>();
	for (const { last, first } of canonical.values()) {
		if (!byGiven.has(first)) byGiven.set(first, new Set());
		byGiven.get(first)?.add(last);
		if (!bySurname.has(last)) bySurname.set(last, new Set());
		bySurname.get(last)?.add(first);
	}
	return {
		/** Canonical orientation for a person, or null when unproven. */
		orientation(last: string, first: string) {
			if (!last || !first || last === first) return null;
			return canonical.get([last, first].sort().join("|")) ?? null;
		},
		byGiven,
		bySurname,
	};
}

function editDistance(a: string, b: string): number {
	const rows = a.length;
	const cols = b.length;
	let previous = Array.from({ length: cols + 1 }, (_, i) => i);
	for (let i = 1; i <= rows; i++) {
		const current = [i, ...Array<number>(cols).fill(0)];
		for (let j = 1; j <= cols; j++)
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		previous = current;
	}
	return previous[cols];
}

/**
 * Names that differ by a typo or a short form, e.g. "Schad, Mathias" against
 * "Schad, Matthias" or "Haas, Monika" against "Haas, Moni". These split one
 * helper's hours across two people without anyone noticing, and no rule can
 * safely merge them, so they are reported for a person to judge rather than
 * repaired. Deliberately conservative: one name part must match exactly.
 */
export function similarHelperNames(
	rows: Array<{ nachname: string; vorname: string; minutes: number }>,
): HelperHoursSimilarName[] {
	const people = new Map<
		string,
		{ label: string; entries: number; minutes: number }
	>();
	for (const row of rows) {
		const last = nameKey(row.nachname);
		const first = nameKey(row.vorname);
		if (!last || !first) continue;
		const key = `${last}|${first}`;
		const current = people.get(key) ?? {
			label: `${row.nachname}, ${row.vorname}`,
			entries: 0,
			minutes: 0,
		};
		current.entries++;
		current.minutes += row.minutes;
		people.set(key, current);
	}
	const keys = [...people.keys()];
	const found: HelperHoursSimilarName[] = [];
	for (let i = 0; i < keys.length; i++) {
		for (let j = i + 1; j < keys.length; j++) {
			const [leftLast, leftFirst] = keys[i].split("|");
			const [rightLast, rightFirst] = keys[j].split("|");
			const sameLast = leftLast === rightLast;
			const sameFirst = leftFirst === rightFirst;
			if (sameLast === sameFirst) continue;
			const suspect = sameLast
				? // A one or two letter difference is a typo; a clean prefix is a
					// short form like "Manu" for "Manuel".
					editDistance(leftFirst, rightFirst) <= 2 ||
					((leftFirst.startsWith(rightFirst) ||
						rightFirst.startsWith(leftFirst)) &&
						Math.min(leftFirst.length, rightFirst.length) >= 3)
				: editDistance(leftLast, rightLast) <= 1;
			if (!suspect) continue;
			const left = people.get(keys[i]);
			const right = people.get(keys[j]);
			if (!left || !right) continue;
			found.push({
				left: left.label,
				right: right.label,
				leftEntries: left.entries,
				rightEntries: right.entries,
				leftMinutes: left.minutes,
				rightMinutes: right.minutes,
			});
		}
	}
	return found.sort(
		(a, b) =>
			Math.min(b.leftEntries, b.rightEntries) -
			Math.min(a.leftEntries, a.rightEntries),
	);
}

export async function parseHelperHoursWorkbook(
	bytes: Uint8Array,
	sourceFile: string,
	categories: HelperHourCategory[],
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
			sheets: [],
			unknownColumns: [],
			similarNames: [],
			repairs: 0,
			warnings: 0,
		};
	}
	const categoryByHeading = new Map<string, HelperHourCategory>();
	for (const category of categories) {
		categoryByHeading.set(normalizeHelperHourLabel(category.code), category);
		categoryByHeading.set(normalizeHelperHourLabel(category.label), category);
	}
	const contribution =
		categories.find((entry) => entry.code === HELPER_HOUR_CONTRIBUTION_CODE) ??
		categories.find((entry) => entry.art === "verein");
	const RESERVED = new Set(
		["datum", "veranstaltung", "nachname", "vorname", "summe", "sonstiges"].map(
			normalizeHelperHourLabel,
		),
	);

	const raw: RawRow[] = [];
	const errors: HelperHoursImportResult["errors"] = [];
	const sheets: string[] = [];
	const unknownColumns = new Set<string>();

	for (const sheet of workbook.worksheets) {
		let headerRow = 0;
		const columns = new Map<string, number>();
		const width = Math.min(Math.max(sheet.columnCount, 20), 80);
		for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
			const values = Array.from({ length: width }, (_, i) =>
				normalizeHelperHourLabel(text(sheet.getCell(r, i + 1).value)),
			);
			if (values.includes("datum") && values.includes("veranstaltung")) {
				headerRow = r;
				values.forEach((v, i) => {
					if (v && !columns.has(v)) columns.set(v, i + 1);
				});
				break;
			}
		}
		if (!headerRow) continue;
		sheets.push(sheet.name);
		// A heading that matches no category would silently drop hours, so it is
		// reported instead of ignored.
		const categoryColumns: Array<{
			category: HelperHourCategory;
			index: number;
		}> = [];
		const strayColumns: Array<{ heading: string; index: number }> = [];
		for (const [heading, index] of columns) {
			if (RESERVED.has(heading)) continue;
			const category = categoryByHeading.get(heading);
			if (category) categoryColumns.push({ category, index });
			else
				strayColumns.push({
					heading: text(sheet.getCell(headerRow, index).value),
					index,
				});
		}
		// A leftover heading only matters when hours are actually booked under it;
		// empty helper columns in the sheet are not worth reporting.
		for (const stray of strayColumns) {
			for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
				const minutes = decimalHours(sheet.getCell(r, stray.index).value);
				if (minutes) {
					unknownColumns.add(stray.heading);
					break;
				}
			}
		}
		const col = (name: string) =>
			columns.get(normalizeHelperHourLabel(name)) ?? 0;
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
			const allocations: HelperHoursAllocations = {};
			let invalid = false;
			for (const { category, index } of categoryColumns) {
				const parsed = decimalHours(sheet.getCell(r, index).value);
				if (parsed == null) invalid = true;
				else if (parsed > 0) allocations[category.code] = parsed;
			}
			const reported = decimalHours(cell("Summe"));
			const allocated = allocatedMinutes(allocations);
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
			if (
				datum &&
				event &&
				!invalid &&
				(reported != null || allocated > 0) &&
				(reported || allocated) > 0
			)
				raw.push({
					sheet: sheet.name,
					rowNumber: r,
					datum,
					rawDatum: datum,
					veranstaltung: event.slice(0, 160),
					nachname: last.slice(0, 120),
					vorname: first.slice(0, 120),
					allocations,
					reported,
					bemerkung: text(cell("Sonstiges")).slice(0, 1000),
					invalid,
				});
			if (raw.length > HELPER_HOURS_IMPORT_MAX_ROWS)
				return {
					rows: [],
					errors: [
						{
							sheet: "",
							row: 0,
							message: `Die Datei enthält mehr als ${HELPER_HOURS_IMPORT_MAX_ROWS} Einträge.`,
						},
					],
					sheets,
					unknownColumns: [...unknownColumns],
					similarNames: [],
					repairs: 0,
					warnings: 0,
				};
		}
	}

	const names = canonicalNames(raw);
	const rows: HelperHoursImportRow[] = [];
	for (const entry of raw) {
		const issues: HelperHoursImportIssueCode[] = [];
		const repairs: HelperHoursImportRepairCode[] = [];
		const originalValues: HelperHoursImportOriginalValues = {
			vorname: entry.vorname,
			nachname: entry.nachname,
			datum: entry.rawDatum ?? "",
			allocations: { ...entry.allocations },
			gemeldete_summe_minuten: entry.reported ?? 0,
		};

		// --- date -----------------------------------------------------------
		let datum = entry.datum as string;
		const period = sheetPeriod(entry.sheet);
		if (period) {
			const [year, month, day] = datum.split("-").map(Number);
			if (month === period.month && year !== period.year) {
				// Right day and month, wrong year: a mistyped year in a monthly
				// sheet, e.g. 2206-08-23 or 2026-09-05 on the September 2025 sheet.
				datum = `${period.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
				repairs.push("sheet_year");
			} else if (month !== period.month) {
				const monthsApart = Math.abs(
					(year - period.year) * 12 + (month - period.month),
				);
				// One month either side is normal: events at a month boundary are
				// booked on the neighbouring sheet. Anything further is flagged.
				if (monthsApart > 1) issues.push("unknown_date");
			}
		}

		// --- name -----------------------------------------------------------
		let nachname = tidyName(entry.nachname);
		let vorname = tidyName(entry.vorname);
		if (
			(nachname !== entry.nachname.trim() ||
				vorname !== entry.vorname.trim()) &&
			nachname &&
			vorname
		)
			repairs.push("name_case");
		if (nachname && vorname) {
			const orientation = names.orientation(
				nameKey(nachname),
				nameKey(vorname),
			);
			if (orientation && orientation.last === nameKey(vorname)) {
				[nachname, vorname] = [vorname, nachname];
				repairs.push("name_swapped");
			}
		} else if (vorname && !nachname) {
			const candidates = names.byGiven.get(nameKey(vorname));
			if (candidates?.size === 1) {
				const only = [...candidates][0];
				nachname = tidyName(
					raw.find((row) => nameKey(row.nachname) === only)?.nachname ?? "",
				);
				repairs.push("name_completed");
			}
		} else if (nachname && !vorname) {
			const candidates = names.bySurname.get(nameKey(nachname));
			if (candidates?.size === 1) {
				const only = [...candidates][0];
				vorname = tidyName(
					raw.find((row) => nameKey(row.vorname) === only)?.vorname ?? "",
				);
				repairs.push("name_completed");
			}
		}
		if (!nachname || !vorname) issues.push("missing_name");

		// --- hours ----------------------------------------------------------
		const allocations = { ...entry.allocations };
		const allocated = allocatedMinutes(allocations);
		const reported = entry.reported;
		const total =
			reported == null || (reported === 0 && allocated > 0)
				? allocated
				: reported;
		if ((reported == null || reported === 0) && allocated > 0)
			repairs.push("derived_total");
		if (allocated === 0 && total > 0) {
			// The list states this rule in its own notes: unassigned hours are the
			// club's. Applying it is a repair, not a question.
			if (contribution) {
				allocations[contribution.code] = total;
				repairs.push("unassigned");
			} else issues.push("total_mismatch");
		} else if (total !== allocated) issues.push("total_mismatch");

		const row: HelperHoursImportRow = {
			idempotency_key: uuidFor(sourceDigest, entry.sheet, entry.rowNumber),
			datum,
			veranstaltung: entry.veranstaltung,
			nachname,
			vorname,
			allocations,
			gemeldete_summe_minuten: total || allocated,
			bemerkung: entry.bemerkung,
			warnings: [],
			issues,
			repairs,
			originalValues,
			correction: null,
			sheet: entry.sheet,
			rowNumber: entry.rowNumber,
			sourceFile: sourceFile.slice(0, 255),
			sourceDigest,
		};
		row.warnings = [
			...repairs.map((repair) => REPAIR_MESSAGES[repair]),
			...issues.map((issue) => helperHoursImportIssueMessage(issue, row)),
		];
		rows.push(row);
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
		sheets,
		unknownColumns: [...unknownColumns].filter(Boolean).slice(0, 20),
		// Judged on the repaired rows, so a swapped or completed name does not
		// show up as a second person.
		similarNames: similarHelperNames(
			rows.map((row) => ({
				nachname: row.nachname,
				vorname: row.vorname,
				minutes: row.gemeldete_summe_minuten,
			})),
		).slice(0, 40),
		repairs: rows.reduce((sum, row) => sum + row.repairs.length, 0),
		warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
	};
}
