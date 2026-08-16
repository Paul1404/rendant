import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseHelperHoursWorkbook } from "@/server/services/helper-hours-import";

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
});
