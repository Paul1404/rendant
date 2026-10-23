import ExcelJS from "exceljs";
import {
	REVENUE_EXPORT_HEADERS,
	type RevenueExportRow,
	revenuePaymentSplitLabel,
} from "@/lib/revenue-csv";

function excelDate(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

export async function revenueXlsxDocument(
	rows: RevenueExportRow[],
): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Rendant";
	workbook.created = new Date();
	const sheet = workbook.addWorksheet("Umsätze", {
		views: [{ state: "frozen", ySplit: 1 }],
	});

	sheet.addRow([...REVENUE_EXPORT_HEADERS]);
	for (const row of rows) {
		sheet.addRow([
			excelDate(row.date),
			Number(row.date.slice(0, 4)),
			row.revenueArea || row.comparisonGroup,
			row.occasion.includes(" · ")
				? row.occasion.slice(row.occasion.indexOf(" · ") + 3)
				: row.occasion,
			row.revenueCashCent === null ? null : row.revenueCashCent / 100,
			row.revenueCardCent === null ? null : row.revenueCardCent / 100,
			row.revenueCent / 100,
			revenuePaymentSplitLabel(row),
			row.expensesCent / 100,
			(row.revenueCent - row.expensesCent) / 100,
			row.source,
			row.reference,
			row.status,
			row.note,
		]);
	}

	sheet.autoFilter = { from: "A1", to: "N1" };
	sheet.columns = [
		{ width: 13 },
		{ width: 9 },
		{ width: 30 },
		{ width: 26 },
		{ width: 19 },
		{ width: 19 },
		{ width: 27 },
		{ width: 25 },
		{ width: 16 },
		{ width: 18 },
		{ width: 22 },
		{ width: 22 },
		{ width: 12 },
		{ width: 36 },
	];
	const header = sheet.getRow(1);
	header.font = { bold: true, color: { argb: "FFFFFFFF" } };
	header.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FF1F604A" },
	};
	header.alignment = { vertical: "middle" };
	header.height = 24;
	sheet.getColumn(1).numFmt = "dd.mm.yyyy";
	for (const column of [5, 6, 7, 9, 10]) {
		sheet.getColumn(column).numFmt = "#,##0.00 [$€-407]";
	}
	for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
		if (rowNumber % 2 === 0) {
			sheet.getRow(rowNumber).fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: "FFF3F6F4" },
			};
		}
	}

	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer);
}
