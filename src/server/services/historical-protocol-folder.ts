import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { isIsoCalendarDate, todayIsoDate } from "@/lib/date";
import {
	DENOMINATIONS,
	emptyCounts,
	sumGezaehltCent,
} from "@/lib/denominations";
import type {
	HistoricalProtocolClassification,
	HistoricalProtocolParsedRow,
	HistoricalProtocolPreview,
	HistoricalProtocolSource,
	HistoricalProtocolVatSplit,
} from "@/lib/historical-protocol-import";
import type { Umsatzbereich } from "@/lib/umsatzbereich";

export const HISTORICAL_PROTOCOL_MAX_FILES = 1_500;
export const HISTORICAL_PROTOCOL_MAX_TOTAL_BYTES = 40_000_000;
export const HISTORICAL_PROTOCOL_MAX_FILE_BYTES = 5_000_000;

type GridValue = string | number | Date | null;
type Grid = GridValue[][];

export type HistoricalProtocolUploadFile = {
	index: number;
	path: string;
	bytes: Uint8Array;
	modifiedAt?: string;
};

const XML = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@",
	parseTagValue: false,
	trimValues: false,
});

function arrayOf<T>(value: T | T[] | undefined): T[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

function recordValue(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function cleanText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function objectText(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}
	if (Array.isArray(value)) return value.map(objectText).join("");
	if (!value || typeof value !== "object") return "";
	const object = value as Record<string, unknown>;
	return Object.entries(object)
		.filter(([key]) => !key.startsWith("@"))
		.map(([, child]) => objectText(child))
		.join("");
}

function odsCellValue(cell: Record<string, unknown>): GridValue {
	const type = cell["@office:value-type"];
	if (type === "date") {
		const value = cell["@office:date-value"];
		return typeof value === "string" ? value.slice(0, 10) : null;
	}
	if (type === "float" || type === "currency" || type === "percentage") {
		const value = Number(cell["@office:value"]);
		return Number.isFinite(value) ? value : null;
	}
	if (type === "boolean")
		return cell["@office:boolean-value"] === "true" ? 1 : 0;
	if (type === "string") {
		const direct = cell["@office:string-value"];
		if (typeof direct === "string") return cleanText(direct);
	}
	const text = cleanText(objectText(cell["text:p"]));
	return text || null;
}

function odsRows(table: Record<string, unknown>): Grid {
	const rows: Grid = [];
	for (const row of arrayOf(
		table["table:table-row"] as
			| Record<string, unknown>
			| Record<string, unknown>[],
	)) {
		const repeat = Math.min(
			Number(row["@table:number-rows-repeated"] ?? 1),
			100,
		);
		const values: GridValue[] = [];
		for (const rawCell of arrayOf(
			row["table:table-cell"] as
				| Record<string, unknown>
				| Record<string, unknown>[],
		)) {
			const cell = rawCell as Record<string, unknown>;
			const cellRepeat = Math.min(
				Number(cell["@table:number-columns-repeated"] ?? 1),
				25,
			);
			const value = odsCellValue(cell);
			for (let index = 0; index < cellRepeat; index += 1) values.push(value);
			if (values.length >= 25) break;
		}
		for (let index = 0; index < repeat && rows.length < 100; index += 1) {
			rows.push([...values]);
		}
		if (rows.length >= 100) break;
	}
	return rows;
}

async function odsGrid(bytes: Uint8Array): Promise<Grid> {
	const archive = await JSZip.loadAsync(bytes);
	const content = archive.file("content.xml");
	if (!content) throw new Error("content.xml fehlt");
	const parsed = recordValue(XML.parse(await content.async("string")));
	const document = recordValue(parsed?.["office:document-content"]);
	const body = recordValue(document?.["office:body"]);
	const spreadsheet = recordValue(body?.["office:spreadsheet"]);
	const tables = arrayOf<Record<string, unknown>>(
		spreadsheet?.["table:table"] as
			| Record<string, unknown>
			| Record<string, unknown>[]
			| undefined,
	);
	for (const table of tables) {
		const rows = odsRows(table);
		if (isProtocolGrid(rows)) return rows;
	}
	throw new Error("Kein Zählprotokoll-Blatt gefunden");
}

function excelCellValue(value: ExcelJS.CellValue): GridValue {
	if (value == null) return null;
	if (typeof value === "string" || typeof value === "number") return value;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof Date) return value;
	if ("formula" in value || "sharedFormula" in value) {
		return excelCellValue(value.result ?? null);
	}
	if ("error" in value) return value.error;
	if ("richText" in value)
		return value.richText.map((part) => part.text).join("");
	if ("text" in value) return value.text;
	return null;
}

async function xlsxGrid(bytes: Uint8Array): Promise<Grid> {
	const data = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(data).set(bytes);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(data);
	const worksheet = workbook.worksheets.find((sheet) => {
		const texts: string[] = [];
		for (let row = 1; row <= Math.min(sheet.rowCount, 100); row += 1) {
			for (
				let column = 1;
				column <= Math.min(sheet.columnCount, 25);
				column += 1
			) {
				const value = excelCellValue(sheet.getCell(row, column).value);
				if (typeof value === "string")
					texts.push(value.toLocaleLowerCase("de-DE"));
			}
		}
		return (
			texts.some((text) => text.includes("zählprotokoll")) ||
			(texts.some((text) => text.includes("stückelung")) &&
				texts.some((text) =>
					/tageseinnahmen|kassenendbestand|kassenbericht/iu.test(text),
				))
		);
	});
	if (!worksheet) throw new Error("Kein Zählprotokoll-Blatt gefunden");
	const rows: Grid = [];
	for (let row = 1; row <= Math.min(worksheet.rowCount, 100); row += 1) {
		const values: GridValue[] = [];
		for (
			let column = 1;
			column <= Math.min(worksheet.columnCount, 25);
			column += 1
		) {
			values.push(excelCellValue(worksheet.getCell(row, column).value));
		}
		rows.push(values);
	}
	return rows;
}

function valueText(value: GridValue): string {
	if (typeof value === "string") return cleanText(value);
	return "";
}

function rowText(row: GridValue[]): string {
	return row
		.map(valueText)
		.filter(Boolean)
		.join(" ")
		.toLocaleLowerCase("de-DE");
}

function isProtocolGrid(grid: Grid): boolean {
	const text = grid.map(rowText).join(" ");
	return (
		text.includes("zählprotokoll") ||
		(text.includes("stückelung") &&
			/tageseinnahmen|kassenendbestand|kassenbericht/iu.test(text))
	);
}

function rowWith(grid: Grid, needle: string): GridValue[] | null {
	return (
		grid.find((row) =>
			rowText(row).includes(needle.toLocaleLowerCase("de-DE")),
		) ?? null
	);
}

function countedRow(grid: Grid): GridValue[] | null {
	return (
		grid.find((row) => {
			const text = rowText(row);
			return text.includes("kassenendbestand") && !text.includes("am vortag");
		}) ?? null
	);
}

function numberValues(row: GridValue[] | null): number[] {
	if (!row) return [];
	return row.filter(
		(value): value is number =>
			typeof value === "number" && Number.isFinite(value),
	);
}

function lastNumber(row: GridValue[] | null): number | null {
	return numberValues(row).at(-1) ?? null;
}

function euroCent(value: number | null): number | null {
	return value == null || !Number.isFinite(value)
		? null
		: Math.round(value * 100);
}

function dateFromValue(
	value: GridValue,
	pathYear: string | null,
	allowShort = true,
): string | null {
	let result: string | null = null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		result = [
			String(value.getUTCFullYear()).padStart(4, "0"),
			String(value.getUTCMonth() + 1).padStart(2, "0"),
			String(value.getUTCDate()).padStart(2, "0"),
		].join("-");
	}
	if (typeof value === "string") {
		const text = cleanText(value);
		if (isIsoCalendarDate(text.slice(0, 10))) result = text.slice(0, 10);
		const german = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(text);
		if (german) {
			const year =
				german[3].length === 4
					? german[3]
					: german[3].length === 2
						? String(2000 + Number(german[3]))
						: pathYear && german[3] === pathYear.slice(1)
							? pathYear
							: null;
			if (year) {
				const iso = `${year}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
				if (isIsoCalendarDate(iso)) result = iso;
			}
		}
		const short = /^(\d{1,2})[./](\d{1,2})$/.exec(text);
		if (allowShort && short && pathYear) {
			const iso = `${pathYear}-${short[2].padStart(2, "0")}-${short[1].padStart(2, "0")}`;
			if (isIsoCalendarDate(iso)) result = iso;
		}
	}
	if (result && pathYear && !result.startsWith(`${pathYear}-`)) return null;
	return result;
}

function extractDate(grid: Grid, path: string): string | null {
	const pathYear = /(?:^|\/)(20\d{2})(?:\/|$)/.exec(path)?.[1] ?? null;
	const reportIndex = grid.findIndex((row) =>
		rowText(row).includes("kassenbericht vom"),
	);
	const candidates = reportIndex >= 0 ? grid[reportIndex] : [];
	for (const value of candidates) {
		const date = dateFromValue(value, pathYear);
		if (date) return date;
	}
	for (const row of grid.slice(0, 10)) {
		for (const value of row) {
			const date = dateFromValue(value, pathYear, false);
			if (date) return date;
		}
	}
	const filenameDate = /(\d{1,2})\.(\d{1,2})\.(20\d{2})/.exec(path);
	if (!filenameDate) return null;
	const iso = `${filenameDate[3]}-${filenameDate[2].padStart(2, "0")}-${filenameDate[1].padStart(2, "0")}`;
	return isIsoCalendarDate(iso) ? iso : null;
}

function modifiedDate(file: HistoricalProtocolUploadFile): string | null {
	if (!file.modifiedAt || !isIsoCalendarDate(file.modifiedAt)) return null;
	const pathYear = /(?:^|\/)(20\d{2})(?:\/|$)/.exec(file.path)?.[1];
	if (!pathYear || !file.modifiedAt.startsWith(`${pathYear}-`)) return null;
	return file.modifiedAt <= todayIsoDate() ? file.modifiedAt : null;
}

function protocolNumber(grid: Grid, path: string): string | null {
	const numberRow = grid.find((row) => rowText(row).split(" ").includes("nr."));
	if (numberRow) {
		const labelIndex = numberRow.findIndex(
			(value) => valueText(value).toLocaleLowerCase("de-DE") === "nr.",
		);
		for (const value of numberRow.slice(labelIndex + 1)) {
			if (typeof value === "number") return String(value);
			const text = valueText(value);
			if (/^\d+(?:-\d+)?$/.test(text)) return text;
		}
	}
	const filename = path.split("/").at(-1) ?? path;
	const match = /zählprotokoll\s+(\d+(?:-\d+)?)/iu.exec(
		filename.normalize("NFC"),
	);
	if (!match) return null;
	let value = match[1];
	if (/(?:^|\/)2022(?:\/|$)/.test(path) && value.endsWith("22")) {
		value = value.slice(0, -2);
	}
	return value.replace(/^0+(?=\d)/, "");
}

const IGNORED_DETAIL = [
	"name",
	"kassenbericht vom",
	"nr.",
	"zählprotokoll",
	"kassenprotokoll",
	"stückelung",
	"menge",
	"betrag",
	"summe",
];

function extractHeader(
	grid: Grid,
	path: string,
): {
	detail: string;
	countedBy: string | null;
	cashRegisterNumber: string | null;
	cashRegisterLabel: string | null;
} {
	const denominationIndex = grid.findIndex((row) =>
		rowText(row).includes("stückelung"),
	);
	const headerRows = grid.slice(
		0,
		denominationIndex >= 0 ? denominationIndex : 12,
	);
	const pathYear = /(?:^|\/)(20\d{2})(?:\/|$)/.exec(path)?.[1] ?? null;
	let countedBy: string | null = null;
	const nameRow = headerRows.find((row) => rowText(row).includes("name"));
	if (nameRow) {
		const strings = nameRow.map(valueText).filter(Boolean);
		countedBy =
			strings.find((value) => value.toLocaleLowerCase("de-DE") !== "name") ??
			null;
	}
	let cashRegisterNumber: string | null = null;
	let cashRegisterLabel: string | null = null;
	const candidates: string[] = [];
	for (const row of headerRows) {
		const strings = row.map(valueText).filter(Boolean);
		const joined = strings.join(" ");
		const registerMatch = /kasse\s*:?[ -]*(\d+)/iu.exec(joined);
		if (registerMatch) cashRegisterNumber = registerMatch[1];
		for (const text of strings) {
			const normalized = text.toLocaleLowerCase("de-DE");
			if (
				IGNORED_DETAIL.some(
					(ignored) => normalized.replace(/:$/, "") === ignored,
				)
			)
				continue;
			if (normalized === countedBy?.toLocaleLowerCase("de-DE")) continue;
			if (/^\d+(?:-\d+)?$/.test(text) || dateFromValue(text, pathYear))
				continue;
			if (/^kasse\s*:?$/iu.test(text)) continue;
			candidates.push(text);
		}
	}
	const useful = candidates.filter((value) => value.length >= 2);
	const detail = useful.at(-1) ?? "Kassenprotokoll";
	if (
		detail !== "Kassenprotokoll" &&
		/kasse|theke|essen|sportheim|eintritt|verkauf|biergarten/iu.test(detail)
	) {
		cashRegisterLabel = detail;
	}
	return { detail, countedBy, cashRegisterNumber, cashRegisterLabel };
}

function classification(detail: string): {
	area: Umsatzbereich;
	confidence: "high" | "medium" | "low";
} {
	const key = detail.toLocaleLowerCase("de-DE");
	if (key === "kassenprotokoll") {
		return { area: "sonstiges", confidence: "low" };
	}
	if (key.includes("senior"))
		return { area: "seniorennachmittag", confidence: "high" };
	if (
		key.includes("eintritt") &&
		/essen|theke|getränke|bar|grill/iu.test(key)
	) {
		return { area: "eintrittsgelder", confidence: "medium" };
	}
	if (key.includes("eintritt"))
		return { area: "eintrittsgelder", confidence: "high" };
	if (
		/(combo|fasching).*(probe|bespr)|(?:probe|bespr).*(combo|fasching)/iu.test(
			key,
		)
	) {
		return { area: "veranstaltungen", confidence: "medium" };
	}
	if (
		/schlacht|bierfest|osteressen|neujahrsempfang|martinsumzug|st[.] martin|kinderkleidermarkt|kinderkleiderm|combo|fasching|stiller zecher/iu.test(
			key,
		)
	) {
		return { area: "veranstaltungen", confidence: "high" };
	}
	if (key.includes("verkauf") && /spielfeld|sportplatz|platz/iu.test(key)) {
		return { area: "verkauf_spielfeld", confidence: "high" };
	}
	if (
		/spielfeld|sportplatz|fußball|fussball|korbball|pokalspiel|heimspiel|jugendfußball|jugendfussball|u19/iu.test(
			key,
		)
	) {
		return { area: "verkauf_spielfeld", confidence: "high" };
	}
	if (
		/sommerfest|haxen|kirchweih|fasching|public viewing|bürgerversammlung|frauenbund/iu.test(
			key,
		)
	) {
		return { area: "veranstaltungen", confidence: "high" };
	}
	if (/biergarten|wirtschaftsbetrieb|donnerstag/iu.test(key)) {
		return { area: "wirtschaftsbetrieb", confidence: "high" };
	}
	if (
		/biergarten|theke|essen|sportheim|wirtschaft|darts?|getränke|grill|kaffee|kuchen|geldbeutel|bar|kasse\s*\d*/iu.test(
			key,
		)
	) {
		return { area: "wirtschaftsbetrieb", confidence: "medium" };
	}
	return { area: "sonstiges", confidence: "low" };
}

function extractDenominations(grid: Grid) {
	const counts = emptyCounts();
	let found = 0;
	const header = grid.find((row) => rowText(row).includes("stückelung"));
	const countColumn =
		header?.findIndex(
			(value) => valueText(value).toLocaleLowerCase("de-DE") === "menge",
		) ?? -1;
	for (const denomination of DENOMINATIONS) {
		const euro = denomination.cent / 100;
		const row = grid.find((candidate) => {
			const firstNumber = numberValues(candidate)[0];
			return firstNumber != null && Math.abs(firstNumber - euro) < 0.000_001;
		});
		if (!row) continue;
		const numbers = numberValues(row);
		const columnValue = countColumn >= 0 ? row[countColumn] : null;
		const count =
			countColumn >= 0
				? typeof columnValue === "number"
					? columnValue
					: columnValue == null || valueText(columnValue) === ""
						? 0
						: null
				: numbers[1];
		if (count == null || !Number.isInteger(count) || count < 0) continue;
		counts[denomination.key] = count;
		found += 1;
	}
	return found >= 10 ? counts : null;
}

function normalizedContentFingerprint(input: {
	date: string;
	protocolNumber: string | null;
	cashRegisterNumber: string | null;
	cashRegisterLabel: string | null;
	openingCent: number | null;
	cardCent: number;
	countedCent: number | null;
	cashRevenueCent: number;
	expensesCent: number;
	denominations: HistoricalProtocolSource["denominations"];
	vat: HistoricalProtocolVatSplit[];
}): string {
	return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function extractVat(grid: Grid): HistoricalProtocolVatSplit[] {
	const result: HistoricalProtocolVatSplit[] = [];
	for (const row of grid.filter((candidate) =>
		rowText(candidate).includes("steuersatz"),
	)) {
		const numbers = numberValues(row);
		const rateIndex = numbers.findIndex((value) => value >= 0 && value <= 1);
		if (rateIndex < 0) continue;
		const amount = numbers.slice(rateIndex + 1).at(-1) ?? 0;
		result.push({
			ust_basis_punkte: Math.round(numbers[rateIndex] * 10_000),
			betrag_cent: Math.round(amount * 100),
		});
	}
	return result;
}

function skippedRow(
	file: HistoricalProtocolUploadFile,
	reason: string,
): HistoricalProtocolParsedRow {
	return {
		fileIndex: file.index,
		path: file.path,
		status: "skipped",
		statusReason: reason,
		date: null,
		detail: file.path.split("/").at(-1) ?? file.path,
		classificationKey: "",
		suggestedArea: "sonstiges",
		classificationConfidence: "low",
		revenueCent: null,
		expensesCent: null,
		source: null,
	};
}

export async function parseHistoricalProtocolFile(
	file: HistoricalProtocolUploadFile,
): Promise<HistoricalProtocolParsedRow> {
	const lowerPath = file.path.normalize("NFC").toLocaleLowerCase("de-DE");
	const extension = lowerPath.split(".").at(-1) ?? "";
	if (lowerPath.split("/").some((part) => part === ".ds_store")) {
		return skippedRow(file, "Systemdatei");
	}
	if (extension === "lnk")
		return skippedRow(file, "Windows-Verknüpfung ohne Quelldaten");
	if (extension === "pdf")
		return skippedRow(file, "PDF aus dem aktuellen Rendant-Workflow");
	if (lowerPath.includes("hauptkasse")) {
		return skippedRow(
			file,
			"Hauptkassenabgleich enthält keinen Veranstaltungsumsatz",
		);
	}
	if (extension !== "ods" && extension !== "xlsx") {
		return skippedRow(
			file,
			"Dateityp wird nicht als Kassenprotokoll verwendet",
		);
	}
	if (
		file.bytes.byteLength === 0 ||
		file.bytes.byteLength > HISTORICAL_PROTOCOL_MAX_FILE_BYTES
	) {
		return { ...skippedRow(file, "Dateigröße ist ungültig"), status: "error" };
	}

	const sha256 = createHash("sha256").update(file.bytes).digest("hex");
	let grid: Grid;
	try {
		grid =
			extension === "ods"
				? await odsGrid(file.bytes)
				: await xlsxGrid(file.bytes);
	} catch (error) {
		return {
			...skippedRow(
				file,
				`Datei konnte nicht gelesen werden: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
			),
			status: "error",
		};
	}

	const workbookDate = extractDate(grid, file.path);
	const date = workbookDate ?? modifiedDate(file);
	const header = extractHeader(grid, file.path);
	const sourceNumber = protocolNumber(grid, file.path);
	const cashRevenueCent = euroCent(lastNumber(rowWith(grid, "tageseinnahmen")));
	const cardCent = euroCent(lastNumber(rowWith(grid, "kartenzahlung"))) ?? 0;
	const expensesCent =
		euroCent(lastNumber(rowWith(grid, "betriebliche ausgaben"))) ?? 0;
	const countedCent = euroCent(lastNumber(countedRow(grid)));
	const openingCent = euroCent(
		lastNumber(rowWith(grid, "kassenendbestand am vortag")),
	);
	const denominations = extractDenominations(grid);
	const vat = extractVat(grid);
	const warnings: string[] = [];
	const reviewReasons: string[] = [];

	if (!date || date > todayIsoDate()) {
		return {
			...skippedRow(file, "Veranstaltungsdatum fehlt oder ist ungültig"),
			status: "error",
		};
	}
	if (!workbookDate) {
		warnings.push("Datum aus dem Änderungsdatum der Quelldatei abgeleitet");
		reviewReasons.push("abgeleitetes Datum prüfen");
	}
	if (cashRevenueCent == null || cashRevenueCent < 0) {
		return {
			...skippedRow(
				file,
				"Tageseinnahmen konnten nicht sicher ermittelt werden",
			),
			status: "error",
			date,
		};
	}
	// The remaining amounts land in columns with `>= 0` CHECK constraints and an
	// int4 range. An old sheet that books an outflow as a negative number would
	// otherwise abort the whole folder analysis, or survive review and fail at
	// the final import, in both cases without naming the offending file.
	const outOfRange = (
		[
			["Kartenzahlung", cardCent],
			["Betriebliche Ausgaben", expensesCent],
			["Kassenendbestand", countedCent],
			["Kassenendbestand am Vortag", openingCent],
		] as const
	).find(([, value]) => value != null && (value < 0 || value > 2_147_483_647));
	if (outOfRange) {
		return {
			...skippedRow(
				file,
				`${outOfRange[0]} liegt außerhalb des zulässigen Bereichs`,
			),
			status: "error",
			date,
		};
	}
	if (denominations && countedCent != null) {
		const calculated = sumGezaehltCent(denominations);
		if (calculated !== countedCent) {
			warnings.push("Stückelung stimmt nicht mit dem Kassenendbestand überein");
			reviewReasons.push("Stückelung prüfen");
		}
	}
	const vatTotal = vat.reduce((sum, split) => sum + split.betrag_cent, 0);
	const revenueCent = cashRevenueCent + cardCent;
	if (revenueCent === 0 && expensesCent === 0) {
		return {
			...skippedRow(file, "Leeres Protokoll ohne Umsatz oder Ausgaben"),
			date,
		};
	}
	if (vatTotal > 0 && Math.abs(vatTotal - revenueCent) > 1) {
		warnings.push("USt-Aufteilung stimmt nicht mit dem Gesamtumsatz überein");
		if (Math.abs(vatTotal - revenueCent) > Math.max(100, revenueCent * 0.01)) {
			reviewReasons.push("USt-Summe prüfen");
		}
	}
	if (
		vat.some(
			(split) => split.ust_basis_punkte === 1_100 && split.betrag_cent > 0,
		)
	) {
		warnings.push("Quelle enthält Umsatz mit 11 Prozent USt");
		reviewReasons.push("11 Prozent USt prüfen");
	}
	if (vatTotal === 0 && revenueCent > 0)
		warnings.push("Keine ausgefüllte USt-Aufteilung");
	if (header.detail === "Kassenprotokoll")
		warnings.push("Keine aussagekräftige Kassenbezeichnung");

	const inferred = classification(header.detail);
	if (inferred.confidence !== "high") {
		warnings.push(
			"Umsatzbereich ist aus der Kassenbezeichnung nicht eindeutig",
		);
		reviewReasons.push(
			inferred.confidence === "low"
				? "Umsatzbereich und Details prüfen"
				: "Veranstaltungskontext prüfen",
		);
	}
	const classificationKey = cleanText(header.detail).toLocaleLowerCase("de-DE");
	const source: HistoricalProtocolSource = {
		sha256,
		contentFingerprint: normalizedContentFingerprint({
			date,
			protocolNumber: sourceNumber,
			cashRegisterNumber: header.cashRegisterNumber,
			cashRegisterLabel: header.cashRegisterLabel,
			openingCent,
			cardCent,
			countedCent,
			cashRevenueCent,
			expensesCent,
			denominations,
			vat,
		}),
		path: file.path.slice(0, 1_000),
		format: extension,
		protocolNumber: sourceNumber,
		cashRegisterNumber: header.cashRegisterNumber,
		cashRegisterLabel: header.cashRegisterLabel,
		countedBy: header.countedBy,
		openingCent,
		cardCent,
		countedCent,
		cashRevenueCent,
		denominations,
		vat,
		warnings,
		dateOrigin: workbookDate ? "workbook" : "file_modified",
	};
	return {
		fileIndex: file.index,
		path: file.path,
		status: reviewReasons.length > 0 ? "review" : "ready",
		statusReason:
			reviewReasons.length > 0
				? `Vor Import prüfen: ${reviewReasons.join(", ")}`
				: "Umsatzdaten vollständig erkannt",
		date,
		detail:
			header.detail === "Kassenprotokoll" && sourceNumber
				? `Kassenprotokoll Nr. ${sourceNumber}`
				: header.detail.slice(0, 120),
		classificationKey,
		suggestedArea: inferred.area,
		classificationConfidence: inferred.confidence,
		revenueCent,
		expensesCent,
		source,
	};
}

export function historicalProtocolManifestDigest(
	files: HistoricalProtocolUploadFile[],
): string {
	const hash = createHash("sha256");
	// Keep drafts produced by materially different parser rules separate. This
	// lets an unchanged source folder be re-analysed without silently reopening
	// a stale draft from an earlier parser generation.
	hash.update("historical-protocol-parser:v4\0");
	for (const file of [...files].sort((a, b) =>
		a.path.localeCompare(b.path, "de"),
	)) {
		hash.update(file.path.normalize("NFC"));
		hash.update("\0");
		hash.update(createHash("sha256").update(file.bytes).digest());
		hash.update("\0");
		hash.update(file.modifiedAt ?? "");
		hash.update("\0");
	}
	return hash.digest("hex");
}

type SharedDateContext = "economy" | "event" | "senior" | "sport";

function sharedDateContext(
	row: HistoricalProtocolParsedRow,
): SharedDateContext | null {
	if (row.classificationConfidence !== "high") return null;
	if (row.suggestedArea === "veranstaltungen") return "event";
	if (row.suggestedArea === "seniorennachmittag") return "senior";
	if (
		row.suggestedArea === "eintrittsgelder" ||
		row.suggestedArea === "verkauf_spielfeld"
	)
		return "sport";
	if (row.suggestedArea === "wirtschaftsbetrieb") return "economy";
	return null;
}

function contextArea(context: SharedDateContext): Umsatzbereich {
	if (context === "event") return "veranstaltungen";
	if (context === "senior") return "seniorennachmittag";
	if (context === "sport") return "verkauf_spielfeld";
	return "wirtschaftsbetrieb";
}

function applySharedDateContext(rows: HistoricalProtocolParsedRow[]): void {
	const byDate = new Map<string, HistoricalProtocolParsedRow[]>();
	for (const row of rows) {
		if (!row.date || !row.source) continue;
		const sameDate = byDate.get(row.date) ?? [];
		sameDate.push(row);
		byDate.set(row.date, sameDate);
	}

	for (const sameDate of byDate.values()) {
		const contexts = new Set(
			sameDate.flatMap((row) => {
				const context = sharedDateContext(row);
				return context ? [context] : [];
			}),
		);
		if (contexts.size !== 1) continue;
		const context = contexts.values().next().value as SharedDateContext;
		const area = contextArea(context);
		for (const row of sameDate) {
			if (row.classificationConfidence === "high" || !row.source) continue;
			row.suggestedArea = area;
			row.classificationConfidence = "medium";
			row.classificationKey = `context:${area}:${row.classificationKey}`.slice(
				0,
				160,
			);
			const warning =
				"Umsatzbereich aus weiteren Kassen desselben Veranstaltungstags vorgeschlagen";
			if (!row.source.warnings.includes(warning)) {
				row.source.warnings.push(warning);
			}
			row.status = "review";
			if (!row.statusReason.includes("Tageskontext prüfen")) {
				row.statusReason = `${row.statusReason}; Tageskontext prüfen`;
			}
		}
	}
}

function revisionBasePath(path: string): string {
	return path
		.normalize("NFC")
		.toLocaleLowerCase("de-DE")
		.replace(/[.](?:ods|xlsx)$/u, "")
		.replace(/-\d+$/u, "");
}

function revisionSequence(path: string): number {
	return Number(/-(\d+)[.](?:ods|xlsx)$/iu.exec(path)?.[1] ?? 0);
}

function markSupersededRevisions(
	files: HistoricalProtocolUploadFile[],
	rows: HistoricalProtocolParsedRow[],
): void {
	const modifiedAtByIndex = new Map(
		files.map((file) => [file.index, Date.parse(file.modifiedAt ?? "") || 0]),
	);
	const groups = new Map<string, HistoricalProtocolParsedRow[]>();
	for (const row of rows) {
		if (
			!row.source?.protocolNumber ||
			(row.status !== "ready" && row.status !== "review")
		)
			continue;
		const register = cleanText(
			row.source.cashRegisterLabel ?? row.detail,
		).toLocaleLowerCase("de-DE");
		const key = JSON.stringify([
			revisionBasePath(row.source.path),
			row.date,
			row.source.protocolNumber,
			register,
			row.revenueCent,
			row.expensesCent,
		]);
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}

	for (const group of groups.values()) {
		if (group.length < 2) continue;
		const newest = [...group].sort((a, b) => {
			const modifiedDifference =
				(modifiedAtByIndex.get(b.fileIndex) ?? 0) -
				(modifiedAtByIndex.get(a.fileIndex) ?? 0);
			if (modifiedDifference !== 0) return modifiedDifference;
			const sequenceDifference =
				revisionSequence(b.path) - revisionSequence(a.path);
			if (sequenceDifference !== 0) return sequenceDifference;
			return b.path.localeCompare(a.path, "de");
		})[0];
		for (const row of group) {
			if (row === newest) continue;
			row.status = "duplicate_file";
			row.statusReason =
				"Neuere Dateirevision derselben Protokollnummer ist vorhanden";
		}
	}
}

export function buildHistoricalProtocolPreview(
	files: HistoricalProtocolUploadFile[],
	rows: HistoricalProtocolParsedRow[],
	digest: string,
): HistoricalProtocolPreview {
	applySharedDateContext(rows);
	const seenHashes = new Set<string>();
	for (const row of rows) {
		if (!row.source) continue;
		const fingerprint = row.source.contentFingerprint || row.source.sha256;
		if (seenHashes.has(fingerprint)) {
			row.status = "duplicate_file";
			row.statusReason =
				"Gleicher Protokollinhalt ist im ausgewählten Ordner bereits vorhanden";
		} else {
			seenHashes.add(fingerprint);
		}
	}
	markSupersededRevisions(files, rows);
	const importable = rows.filter(
		(row) => row.status === "ready" || row.status === "review",
	);
	const statusCounts: HistoricalProtocolPreview["statusCounts"] = {
		ready: 0,
		review: 0,
		already_imported: 0,
		existing_protocol: 0,
		duplicate_file: 0,
		skipped: 0,
		error: 0,
	};
	for (const row of rows) statusCounts[row.status] += 1;
	const classificationMap = new Map<string, HistoricalProtocolClassification>();
	for (const row of importable) {
		const key = row.classificationKey || row.detail.toLocaleLowerCase("de-DE");
		const previous = classificationMap.get(key);
		if (previous) previous.count += 1;
		else {
			classificationMap.set(key, {
				key,
				label:
					key === "kassenprotokoll" ? "Ohne Kassenbezeichnung" : row.detail,
				count: 1,
				suggestedArea: row.suggestedArea,
				confidence: row.classificationConfidence,
			});
		}
	}
	const folderName =
		files[0]?.path.split("/").filter(Boolean)[0] ?? "Zählprotokolle";
	return {
		valid: importable.length > 0,
		digest,
		folderName,
		files: files.length,
		spreadsheetFiles: rows.filter((row) => row.source != null).length,
		statusCounts,
		toImport: importable.length,
		reviewRequired: statusCounts.review,
		totals: importable.reduce(
			(sum, row) => ({
				revenueCent: sum.revenueCent + (row.revenueCent ?? 0),
				expensesCent: sum.expensesCent + (row.expensesCent ?? 0),
				cashCent: sum.cashCent + (row.source?.cashRevenueCent ?? 0),
				cardCent: sum.cardCent + (row.source?.cardCent ?? 0),
			}),
			{ revenueCent: 0, expensesCent: 0, cashCent: 0, cardCent: 0 },
		),
		coverage: {
			years: Array.from(
				new Set(
					importable.flatMap((row) =>
						row.date ? [Number(row.date.slice(0, 4))] : [],
					),
				),
			).sort((a, b) => a - b),
			withDenominations: importable.filter((row) => row.source?.denominations)
				.length,
			withVat: importable.filter((row) =>
				row.source?.vat.some((split) => split.betrag_cent > 0),
			).length,
			withCard: importable.filter((row) => (row.source?.cardCent ?? 0) > 0)
				.length,
			withCashRegister: importable.filter(
				(row) =>
					row.source?.cashRegisterLabel || row.source?.cashRegisterNumber,
			).length,
		},
		classifications: Array.from(classificationMap.values()).sort(
			(a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"),
		),
		rows,
	};
}
