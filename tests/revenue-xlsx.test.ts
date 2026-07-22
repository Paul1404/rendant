import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { revenueXlsxDocument } from "@/server/services/revenue-xlsx";

describe("revenueXlsxDocument", () => {
	it("creates a formatted workbook with numeric money cells", async () => {
		const bytes = await revenueXlsxDocument([
			{
				date: "2025-05-03",
				occasion: "Biergarteneröffnung",
				comparisonGroup: "Biergarten",
				revenueCent: 12_345,
				expensesCent: 1_000,
				source: "Altunterlage",
				reference: "Ordner 2025",
				status: "aktiv",
				note: "geprüft",
			},
		]);

		const workbook = new ExcelJS.Workbook();
		const data = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(data).set(bytes);
		await workbook.xlsx.load(data);
		const sheet = workbook.getWorksheet("Umsätze");

		expect(sheet).toBeDefined();
		expect(sheet?.getCell("A1").value).toBe("Datum");
		expect(sheet?.getCell("C2").value).toBe("Biergarteneröffnung");
		expect(sheet?.getCell("E2").value).toBe(123.45);
		expect(sheet?.getCell("G2").value).toBe(113.45);
		expect(sheet?.autoFilter).toBe("A1:K1");
	});
});
