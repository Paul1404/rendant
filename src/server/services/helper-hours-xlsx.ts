import ExcelJS from "exceljs";
import type { loadHelperHourExport } from "@/server/services/helper-hours";

type ExportData = Awaited<ReturnType<typeof loadHelperHourExport>>;

const GREEN = "FF1F604A";
const LIGHT_GREEN = "FFEAF2EE";
const LIGHT_GRAY = "FFF3F6F4";
const AMBER = "FFFFF4D6";
const RED = "FFFFE5E5";
const WHITE = "FFFFFFFF";

function excelDate(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function styleHeader(row: ExcelJS.Row): void {
	row.font = { bold: true, color: { argb: WHITE } };
	row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
	row.alignment = { vertical: "middle" };
	row.height = 24;
}

function styleRows(sheet: ExcelJS.Worksheet, start: number, end: number): void {
	for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
		if ((rowNumber - start) % 2 === 1) {
			sheet.getRow(rowNumber).fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: LIGHT_GRAY },
			};
		}
	}
}

export async function helperHoursXlsxDocument(
	data: ExportData,
): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Rendant";
	workbook.created = new Date();
	workbook.modified = new Date();
	workbook.calcProperties.fullCalcOnLoad = true;
	const department = data.categoryLabel;
	const summary = workbook.addWorksheet("Übersicht", {
		views: [{ showGridLines: false }],
		properties: { defaultRowHeight: 22 },
	});

	const hours = workbook.addWorksheet("Helferstunden", {
		views: [{ state: "frozen", ySplit: 1 }],
		properties: { defaultRowHeight: 20 },
	});
	hours.addRow([
		"Datum",
		"Helfer",
		"Veranstaltung",
		"Stunden",
		"Quelle",
		"Bemerkung",
	]);
	for (const row of data.hours) {
		hours.addRow([
			excelDate(row.datum),
			`${row.vorname} ${row.nachname}`.trim() || "Ohne Namen",
			row.veranstaltung,
			row.allocatedMinutes / 60,
			row.quelle === "excel" ? row.quelle_blatt || "Excel" : "Manuell",
			row.bemerkung,
		]);
	}
	const hoursDataEnd = hours.rowCount;
	const hoursTotalRow = hours.addRow([
		"",
		"",
		"",
		{
			formula: hoursDataEnd >= 2 ? `SUM(D2:D${hoursDataEnd})` : "0",
			result: data.budget.earnedMinutes / 60,
		},
		"",
		"",
	]);
	hoursTotalRow.getCell(2).value = "Summe";
	hoursTotalRow.font = { bold: true };
	hoursTotalRow.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: LIGHT_GREEN },
	};
	hours.autoFilter = { from: "A1", to: "F1" };
	hours.columns = [
		{ width: 13 },
		{ width: 26 },
		{ width: 32 },
		{ width: 12 },
		{ width: 15 },
		{ width: 38 },
	];
	hours.getColumn(1).numFmt = "dd.mm.yyyy";
	hours.getColumn(4).numFmt = "#,##0.00";
	styleHeader(hours.getRow(1));
	styleRows(hours, 2, hoursTotalRow.number - 1);

	const expenses = workbook.addWorksheet("Ausgaben", {
		views: [{ state: "frozen", ySplit: 1 }],
		properties: { defaultRowHeight: 20 },
	});
	expenses.addRow([
		"Datum",
		"Bezeichnung",
		"Bemerkung",
		"Abgezogene Stunden",
		"Belegbetrag",
		"Erfasst von",
		"Status",
		"Stornogrund",
	]);
	for (const row of data.expenses) {
		expenses.addRow([
			excelDate(row.datum),
			row.bezeichnung,
			row.bemerkung,
			row.minuten / 60,
			row.betrag_cent / 100,
			row.erstellt_von_name,
			row.storniert_am ? "Storniert" : "Aktiv",
			row.storno_grund ?? "",
		]);
	}
	const expensesDataEnd = expenses.rowCount;
	const expensesTotalRow = expenses.addRow([
		"",
		"Aktive Abzüge",
		"",
		{
			formula:
				expensesDataEnd >= 2
					? `SUMIF(G2:G${expensesDataEnd},"Aktiv",D2:D${expensesDataEnd})`
					: "0",
			result: data.budget.spentMinutes / 60,
		},
		{
			formula:
				expensesDataEnd >= 2
					? `SUMIF(G2:G${expensesDataEnd},"Aktiv",E2:E${expensesDataEnd})`
					: "0",
			result: data.budget.spentCent / 100,
		},
		"",
		"",
		"",
	]);
	expensesTotalRow.font = { bold: true };
	expensesTotalRow.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: AMBER },
	};
	expenses.autoFilter = { from: "A1", to: "H1" };
	expenses.columns = [
		{ width: 13 },
		{ width: 34 },
		{ width: 38 },
		{ width: 20 },
		{ width: 16 },
		{ width: 24 },
		{ width: 13 },
		{ width: 38 },
	];
	expenses.getColumn(1).numFmt = "dd.mm.yyyy";
	expenses.getColumn(4).numFmt = "#,##0.00";
	expenses.getColumn(5).numFmt = "#,##0.00 [$€-407]";
	styleHeader(expenses.getRow(1));
	styleRows(expenses, 2, expensesTotalRow.number - 1);
	for (let rowNumber = 2; rowNumber < expensesTotalRow.number; rowNumber += 1) {
		if (expenses.getRow(rowNumber).getCell(7).value === "Storniert") {
			expenses.getRow(rowNumber).fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: RED },
			};
		}
	}

	summary.mergeCells("A1:C1");
	summary.getCell("A1").value = `Helferstunden · ${department}`;
	summary.getCell("A1").font = { bold: true, size: 20, color: { argb: WHITE } };
	summary.getCell("A1").fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: GREEN },
	};
	summary.getCell("A1").alignment = { vertical: "middle" };
	summary.getRow(1).height = 38;
	summary.mergeCells("A2:C2");
	summary.getCell("A2").value =
		`Erstellt am ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(new Date())} · Quelle: Rendant`;
	summary.getCell("A2").font = { color: { argb: "FF56635E" }, italic: true };
	summary.addRow([]);
	summary.addRow(["Kennzahl", "Wert", "Erläuterung"]);
	styleHeader(summary.getRow(4));
	summary.addRow([
		"Erarbeitete Stunden",
		{
			formula: `'Helferstunden'!D${hoursTotalRow.number}`,
			result: data.budget.earnedMinutes / 60,
		},
		"Der Abteilung zugeordnete Helferstunden",
	]);
	summary.addRow([
		"Abgezogene Stunden",
		{
			formula: `'Ausgaben'!D${expensesTotalRow.number}`,
			result: data.budget.spentMinutes / 60,
		},
		"Nur aktive, nicht stornierte Abzüge",
	]);
	summary.addRow([
		"Verfügbare Stunden",
		{ formula: "B5-B6", result: data.budget.balanceMinutes / 60 },
		"Erarbeitete Stunden abzüglich Abzügen",
	]);
	summary.addRow([
		"Wert je Stunde",
		data.valueCent / 100,
		"Rechnet Belegbeträge in Stunden um",
	]);
	summary.addRow([
		"Belegbeträge der Abzüge",
		{
			formula: `'Ausgaben'!E${expensesTotalRow.number}`,
			result: data.budget.spentCent / 100,
		},
		"Summe der aktiven Belege zum Abgleich mit der Buchhaltung",
	]);
	for (let row = 5; row <= 9; row += 1) {
		for (let column = 1; column <= 3; column += 1) {
			summary.getRow(row).getCell(column).border = {
				top: { style: "thin", color: { argb: "FFE5EAE7" } },
				bottom: { style: "thin", color: { argb: "FFE5EAE7" } },
				left:
					column === 1
						? { style: "thin", color: { argb: "FFD9E1DD" } }
						: undefined,
				right:
					column === 3
						? { style: "thin", color: { argb: "FFD9E1DD" } }
						: undefined,
			};
		}
	}
	summary.getCell("A7").font = { bold: true };
	summary.getCell("B7").font = {
		bold: true,
		color: { argb: data.budget.balanceMinutes < 0 ? "FFB42318" : GREEN },
	};
	for (let column = 1; column <= 3; column += 1) {
		summary.getRow(7).getCell(column).fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: data.budget.balanceMinutes < 0 ? RED : LIGHT_GREEN },
		};
	}
	summary.getColumn(1).width = 29;
	summary.getColumn(2).width = 18;
	summary.getColumn(3).width = 50;
	for (const cell of ["B5", "B6", "B7"]) {
		summary.getCell(cell).numFmt = "#,##0.00";
	}
	for (const cell of ["B8", "B9"]) {
		summary.getCell(cell).numFmt = "#,##0.00 [$€-407]";
	}
	summary.mergeCells("A11:C12");
	summary.getCell("A11").value =
		"Die Detailblätter enthalten alle zugrunde liegenden Helferstunden und Abzüge. Ein Kauf wird mit dem oben genannten Stundenwert in Stunden umgerechnet. Stornierte Abzüge bleiben zur Nachvollziehbarkeit sichtbar, mindern das Guthaben aber nicht.";
	summary.getCell("A11").alignment = { wrapText: true, vertical: "top" };
	summary.getCell("A11").font = { color: { argb: "FF56635E" } };
	summary.pageSetup = {
		orientation: "landscape",
		fitToPage: true,
		fitToWidth: 1,
		fitToHeight: 1,
		printArea: "A1:C12",
		margins: {
			left: 0.35,
			right: 0.35,
			top: 0.45,
			bottom: 0.45,
			header: 0.2,
			footer: 0.2,
		},
	};
	hours.pageSetup = {
		orientation: "landscape",
		fitToPage: true,
		fitToWidth: 1,
		fitToHeight: 0,
		printArea: `A1:F${hoursTotalRow.number}`,
		margins: {
			left: 0.25,
			right: 0.25,
			top: 0.35,
			bottom: 0.35,
			header: 0.15,
			footer: 0.15,
		},
	};
	expenses.pageSetup = {
		orientation: "landscape",
		fitToPage: true,
		fitToWidth: 1,
		fitToHeight: 0,
		printArea: `A1:H${expensesTotalRow.number}`,
		margins: {
			left: 0.25,
			right: 0.25,
			top: 0.35,
			bottom: 0.35,
			header: 0.15,
			footer: 0.15,
		},
	};

	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer);
}
