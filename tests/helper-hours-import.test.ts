import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
	applyHelperHoursImportCorrections,
	parseHelperHoursImportCorrections,
	parseHelperHoursWorkbook,
} from "@/server/services/helper-hours-import";

async function workbookBytes(): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Mai_26");
	sheet.addRow(["Helferstunden SVU"]);
	sheet.addRow([]);
	sheet.addRow(["Datum", "Veranstaltung", "Nachname", "Vorname", "Gesamtverein", "Fußball", "Korbball", "Tischtennis", "Darts", "Gymnastik", "Senioren", "Combo", "Summe", "Sonstiges"]);
	sheet.addRow([new Date(Date.UTC(2026,4,1)), "Biergarteneröffnung", "Dresch", "Paul", 4, null, null, null, null, null, null, null, 4, "Aufbau"]);
	sheet.addRow(["20.05.2026", "Bürgerversammlung", "Greulich", "Katharina", null, "3,5", null, null, null, null, null, null, "3,5"]);
	sheet.addRow(["24.05.2026", "Sonntag", null, "Andreas", null, null, null, null, null, 8.5, null, null, 8.5]);
	const buffer = await workbook.xlsx.writeBuffer();
	return new Uint8Array(buffer);
}

describe("Helferstunden-Excelimport", () => {
	it("liest Monatsblätter, deutsche Dezimalwerte und Quellhinweise", async () => {
		const result = await parseHelperHoursWorkbook(await workbookBytes(), "Helferstunden SVU.xlsx", "a".repeat(64));
		expect(result.errors).toEqual([]);
		expect(result.rows).toHaveLength(3);
		expect(result.rows[0]).toMatchObject({ datum:"2026-05-01", veranstaltung:"Biergarteneröffnung", nachname:"Dresch", vorname:"Paul", gemeldete_summe_minuten:240, bemerkung:"Aufbau" });
		expect(result.rows[1].allocations.fussball_minuten).toBe(210);
		expect(result.rows[2].warnings).toContain("Vor- oder Nachname fehlt in der Quelldatei.");
	});

	it("weist Summenabweichungen aus, ohne die Quelldaten zu überschreiben", async () => {
		const bytes = await workbookBytes(); const workbook = new ExcelJS.Workbook();
		const buffer = new ArrayBuffer(bytes.length); new Uint8Array(buffer).set(bytes); await workbook.xlsx.load(buffer);
		const sheet=workbook.getWorksheet("Mai_26"); if(!sheet) throw new Error("Blatt fehlt");
		sheet.getCell("M4").value=6; const changed=new Uint8Array(await workbook.xlsx.writeBuffer());
		const result=await parseHelperHoursWorkbook(changed,"Liste.xlsx","b".repeat(64));
		expect(result.rows[0].gemeldete_summe_minuten).toBe(360);
		expect(result.rows[0].allocations.gesamtverein_minuten).toBe(240);
		expect(result.rows[0].warnings[0]).toContain("weicht von der Zuordnung");
	});

	it("liefert Zeilenfehler für unbrauchbare Datensätze", async () => {
		const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet("Jan_26");
		sheet.addRow(["Datum","Veranstaltung","Nachname","Vorname","Gesamtverein","Fußball","Korbball","Tischtennis","Darts","Gymnastik","Senioren","Combo","Summe"]);
		sheet.addRow(["kein Datum","","Test","Person",1]);
		const result=await parseHelperHoursWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()),"Fehler.xlsx","c".repeat(64));
		expect(result.errors).toEqual(expect.arrayContaining([{sheet:"Jan_26",row:2,message:"Datum fehlt oder ist ungültig."},{sheet:"Jan_26",row:2,message:"Veranstaltung fehlt."}]));
	});

	it("korrigiert Namen und Summen, ohne die erkannten Originalwerte zu verlieren", async () => {
		const bytes = await workbookBytes();
		const workbook = new ExcelJS.Workbook();
		const buffer = new ArrayBuffer(bytes.length);
		new Uint8Array(buffer).set(bytes);
		await workbook.xlsx.load(buffer);
		const sheet = workbook.getWorksheet("Mai_26");
		if (!sheet) throw new Error("Blatt fehlt");
		sheet.getCell("M4").value = 6;
		const parsed = await parseHelperHoursWorkbook(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"Liste.xlsx",
			"d".repeat(64),
		);
		const mismatch = parsed.rows[0];
		const missingName = parsed.rows[2];
		const reviewed = applyHelperHoursImportCorrections(parsed.rows, [
			{
				sheet: mismatch.sheet,
				rowNumber: mismatch.rowNumber,
				vorname: mismatch.vorname,
				nachname: mismatch.nachname,
				allocations: mismatch.allocations,
				gemeldete_summe_minuten: 240,
				acceptedIssues: [],
			},
			{
				sheet: missingName.sheet,
				rowNumber: missingName.rowNumber,
				vorname: missingName.vorname,
				nachname: "Beispiel",
				allocations: missingName.allocations,
				gemeldete_summe_minuten: missingName.gemeldete_summe_minuten,
				acceptedIssues: [],
			},
		]);
		expect(reviewed.errors).toEqual([]);
		expect(reviewed.openIssues).toBe(0);
		expect(reviewed.corrected).toBe(2);
		expect(reviewed.rows[0].gemeldete_summe_minuten).toBe(240);
		expect(reviewed.rows[0].originalValues.gemeldete_summe_minuten).toBe(360);
		expect(reviewed.rows[2].nachname).toBe("Beispiel");
		expect(reviewed.rows[2].originalValues.nachname).toBe("");
	});

	it("blockiert offene Hinweise und erlaubt eine bewusste Übernahme", async () => {
		const parsed = await parseHelperHoursWorkbook(
			await workbookBytes(),
			"Liste.xlsx",
			"e".repeat(64),
		);
		const row = parsed.rows[2];
		expect(
			applyHelperHoursImportCorrections(parsed.rows, []).openIssues,
		).toBe(1);
		const reviewed = applyHelperHoursImportCorrections(parsed.rows, [
			{
				sheet: row.sheet,
				rowNumber: row.rowNumber,
				vorname: row.vorname,
				nachname: row.nachname,
				allocations: row.allocations,
				gemeldete_summe_minuten: row.gemeldete_summe_minuten,
				acceptedIssues: ["missing_name"],
			},
		]);
		expect(reviewed.openIssues).toBe(0);
		expect(reviewed.accepted).toBe(1);
		expect(reviewed.rows[2].warnings[0]).toContain("Bewusst übernommen");
	});

	it("validiert Korrekturdaten an der Upload-Grenze", () => {
		const valid = parseHelperHoursImportCorrections(
			JSON.stringify([
				{
					sheet: "Mai_26",
					rowNumber: 4,
					vorname: "Paul",
					nachname: "Dresch",
					gemeldete_summe_minuten: 60,
					acceptedIssues: [],
					allocations: {
						gesamtverein_minuten: 60,
						fussball_minuten: 0,
						korbball_minuten: 0,
						tischtennis_minuten: 0,
						darts_minuten: 0,
						gymnastik_minuten: 0,
						senioren_minuten: 0,
						combo_minuten: 0,
					},
				},
			]),
		);
		expect(valid).toHaveLength(1);
		expect(parseHelperHoursImportCorrections("not-json")).toBeNull();
	});
});
