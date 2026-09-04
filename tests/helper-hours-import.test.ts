import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
	HELPER_HOUR_SEED_CATEGORIES,
	type HelperHourCategory,
} from "@/lib/helper-hours";
import {
	applyHelperHoursImportCorrections,
	parseHelperHoursImportCorrections,
	parseHelperHoursWorkbook,
	similarHelperNames,
} from "@/server/services/helper-hours-import";

const CATEGORIES: HelperHourCategory[] = HELPER_HOUR_SEED_CATEGORIES.map(
	(entry, index) => ({
		id: `00000000-0000-4000-8000-00000000000${index}`,
		code: entry.code,
		label: entry.label,
		art: entry.art,
		sortierung: index,
		aktiv: true,
		system: true,
	}),
);
const CODES = new Set(CATEGORIES.map((entry) => entry.code));
const HEADER = [
	"Datum",
	"Veranstaltung",
	"Nachname",
	"Vorname",
	"Gesamtverein",
	"Fußball",
	"Korbball",
	"Tischtennis",
	"Darts",
	"Gymnastik",
	"Senioren",
	"Combo",
	"Summe",
	"Sonstiges",
];

async function workbookBytes(): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Mai_26");
	sheet.addRow(["Helferstunden SVU"]);
	sheet.addRow([]);
	sheet.addRow(HEADER);
	sheet.addRow([
		new Date(Date.UTC(2026, 4, 1)), "Biergarteneröffnung", "Dresch", "Paul",
		4, null, null, null, null, null, null, null, 4, "Aufbau",
	]);
	sheet.addRow([
		"20.05.2026", "Bürgerversammlung", "Greulich", "Katharina",
		null, "3,5", null, null, null, null, null, null, "3,5",
	]);
	sheet.addRow([
		"24.05.2026", "Sonntag", null, "Andreas",
		null, null, null, null, null, 8.5, null, null, 8.5,
	]);
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function parse(bytes: Uint8Array, digest: string) {
	return parseHelperHoursWorkbook(bytes, "Liste.xlsx", CATEGORIES, digest);
}

async function rewrite(
	bytes: Uint8Array,
	sheetName: string,
	edit: (sheet: ExcelJS.Worksheet) => void,
): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	const buffer = new ArrayBuffer(bytes.length);
	new Uint8Array(buffer).set(bytes);
	await workbook.xlsx.load(buffer);
	const sheet = workbook.getWorksheet(sheetName);
	if (!sheet) throw new Error("Blatt fehlt");
	edit(sheet);
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("Helferstunden-Excelimport", () => {
	it("liest Monatsblätter, deutsche Dezimalwerte und Quellhinweise", async () => {
		const result = await parse(await workbookBytes(), "a".repeat(64));
		expect(result.errors).toEqual([]);
		expect(result.rows).toHaveLength(3);
		expect(result.sheets).toEqual(["Mai_26"]);
		expect(result.rows[0]).toMatchObject({
			datum: "2026-05-01",
			veranstaltung: "Biergarteneröffnung",
			nachname: "Dresch",
			vorname: "Paul",
			gemeldete_summe_minuten: 240,
			bemerkung: "Aufbau",
		});
		expect(result.rows[0].allocations).toEqual({ gesamtverein: 240 });
		expect(result.rows[1].allocations.fussball).toBe(210);
		expect(result.rows[2].warnings).toContain(
			"Vor- oder Nachname fehlt in der Quelldatei.",
		);
	});

	it("weist Summenabweichungen aus, ohne die Quelldaten zu überschreiben", async () => {
		const changed = await rewrite(await workbookBytes(), "Mai_26", (sheet) => {
			sheet.getCell("M4").value = 6;
		});
		const result = await parse(changed, "b".repeat(64));
		expect(result.rows[0].gemeldete_summe_minuten).toBe(360);
		expect(result.rows[0].allocations.gesamtverein).toBe(240);
		expect(result.rows[0].issues).toContain("total_mismatch");
		expect(result.rows[0].originalValues.gemeldete_summe_minuten).toBe(360);
	});

	it("liefert Zeilenfehler für unbrauchbare Datensätze", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Jan_26");
		sheet.addRow(HEADER);
		sheet.addRow(["kein Datum", "", "Test", "Person", 1]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"c".repeat(64),
		);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				{ sheet: "Jan_26", row: 2, message: "Datum fehlt oder ist ungültig." },
				{ sheet: "Jan_26", row: 2, message: "Veranstaltung fehlt." },
			]),
		);
	});

	it("korrigiert Namen und Summen, ohne die erkannten Originalwerte zu verlieren", async () => {
		const changed = await rewrite(await workbookBytes(), "Mai_26", (sheet) => {
			sheet.getCell("M4").value = 6;
		});
		const parsed = await parse(changed, "d".repeat(64));
		const mismatch = parsed.rows[0];
		const missingName = parsed.rows[2];
		const reviewed = applyHelperHoursImportCorrections(
			parsed.rows,
			[
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
			],
			CODES,
		);
		expect(reviewed.errors).toEqual([]);
		expect(reviewed.openIssues).toBe(0);
		expect(reviewed.corrected).toBe(2);
		expect(reviewed.rows[0].gemeldete_summe_minuten).toBe(240);
		expect(reviewed.rows[0].originalValues.gemeldete_summe_minuten).toBe(360);
		expect(reviewed.rows[2].nachname).toBe("Beispiel");
		expect(reviewed.rows[2].originalValues.nachname).toBe("");
	});

	it("blockiert offene Hinweise und erlaubt eine bewusste Übernahme", async () => {
		const parsed = await parse(await workbookBytes(), "e".repeat(64));
		const row = parsed.rows[2];
		expect(
			applyHelperHoursImportCorrections(parsed.rows, [], CODES).openIssues,
		).toBe(1);
		const reviewed = applyHelperHoursImportCorrections(
			parsed.rows,
			[
				{
					sheet: row.sheet,
					rowNumber: row.rowNumber,
					vorname: row.vorname,
					nachname: row.nachname,
					allocations: row.allocations,
					gemeldete_summe_minuten: row.gemeldete_summe_minuten,
					acceptedIssues: ["missing_name"],
				},
			],
			CODES,
		);
		expect(reviewed.openIssues).toBe(0);
		expect(reviewed.accepted).toBe(1);
		expect(reviewed.rows[2].warnings.at(-1)).toContain("Bewusst übernommen");
	});

	it("weist eine Korrektur auf einen unbekannten Punkt zurück", async () => {
		const parsed = await parse(await workbookBytes(), "f".repeat(64));
		const row = parsed.rows[2];
		const reviewed = applyHelperHoursImportCorrections(
			parsed.rows,
			[
				{
					sheet: row.sheet,
					rowNumber: row.rowNumber,
					vorname: "Andreas",
					nachname: "Beispiel",
					allocations: { schuetzen: row.gemeldete_summe_minuten },
					gemeldete_summe_minuten: row.gemeldete_summe_minuten,
					acceptedIssues: [],
				},
			],
			CODES,
		);
		expect(reviewed.errors[0]).toContain('Der Punkt "schuetzen" ist unbekannt');
	});
});

describe("Automatische Importkorrekturen", () => {
	it("übernimmt eine fehlende Summe und ordnet ohne Zuordnung dem Verein zu", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow(HEADER);
		// Sum missing, allocation present.
		sheet.addRow([
			"01.06.2026", "Sonntag", "Müller", "Petra",
			null, 3, null, null, null, null, null, null, null,
		]);
		// Sum present, no allocation at all.
		sheet.addRow([
			"02.06.2026", "Sonntag", "Schad", "Elke",
			null, null, null, null, null, null, null, null, 5,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"1".repeat(64),
		);
		expect(result.errors).toEqual([]);
		expect(result.rows[0].repairs).toContain("derived_total");
		expect(result.rows[0].gemeldete_summe_minuten).toBe(180);
		expect(result.rows[1].repairs).toContain("unassigned");
		expect(result.rows[1].allocations).toEqual({ gesamtverein: 300 });
		// Both are repaired, so nothing is left for a person to decide.
		expect(result.rows.flatMap((row) => row.issues)).toEqual([]);
		expect(result.repairs).toBe(2);
	});

	it("korrigiert eine Jahreszahl, die nicht zum Monatsblatt passt", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("August_26");
		sheet.addRow(HEADER);
		sheet.addRow([
			new Date(Date.UTC(2206, 7, 23)), "Biergarten", "Hümpfer", "Lorin",
			8, null, null, null, null, null, null, null, 8,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"2".repeat(64),
		);
		expect(result.rows[0].datum).toBe("2026-08-23");
		expect(result.rows[0].originalValues.datum).toBe("2206-08-23");
		expect(result.rows[0].repairs).toContain("sheet_year");
		expect(result.rows[0].issues).toEqual([]);
	});

	it("meldet ein Datum, das im falschen Monat steht, statt es zu raten", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Sep__25");
		sheet.addRow(HEADER);
		sheet.addRow([
			new Date(Date.UTC(2026, 2, 26)), "Donnerstag", "Ort", "Daniel",
			7, null, null, null, null, null, null, null, 7,
		]);
		// A day in the neighbouring month is normal and stays unflagged.
		sheet.addRow([
			new Date(Date.UTC(2025, 7, 18)), "Donnerstag", "Wolf", "Roman",
			5, null, null, null, null, null, null, null, 5,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"3".repeat(64),
		);
		expect(result.rows[0].issues).toContain("unknown_date");
		expect(result.rows[0].datum).toBe("2026-03-26");
		expect(result.rows[1].issues).toEqual([]);
	});

	it("dreht vertauschte Namen anhand der übrigen Liste um", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow(HEADER);
		for (const day of [1, 2, 3])
			sheet.addRow([
				`0${day}.06.2026`, "Sonntag", "Kuhn", "Manuel",
				3, null, null, null, null, null, null, null, 3,
			]);
		sheet.addRow([
			"04.06.2026", "Sonntag", "Manuel", "Kuhn",
			3, null, null, null, null, null, null, null, 3,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"4".repeat(64),
		);
		expect(result.rows[3]).toMatchObject({
			nachname: "Kuhn",
			vorname: "Manuel",
		});
		expect(result.rows[3].repairs).toContain("name_swapped");
		expect(result.rows[3].originalValues.nachname).toBe("Manuel");
		// The rows that were already right stay untouched.
		for (const row of result.rows.slice(0, 3))
			expect(row.repairs).not.toContain("name_swapped");
	});

	it("dreht gegen einen belegten Nachnamen, auch ohne Gegenzeile", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow(HEADER);
		// "Hutter" führt mehrere Zeilen für mehrere Vornamen.
		for (const [tag, vorname] of [
			["01", "Andreas"],
			["02", "Andreas"],
			["03", "Andreas"],
			["04", "Manuela"],
		])
			sheet.addRow([
				`${tag}.06.2026`, "Sonntag", "Hutter", vorname,
				3, null, null, null, null, null, null, null, 3,
			]);
		// Diese Person steht nur einmal und nur verdreht in der Liste.
		sheet.addRow([
			"05.06.2026", "Sonntag", "Andrea", "Hutter",
			3, null, null, null, null, null, null, null, 3,
		]);
		// Ein seltener Nachname mit gängigem Vornamen bleibt, wie er ist.
		sheet.addRow([
			"06.06.2026", "Sonntag", "Zieloszo", "Andreas",
			3, null, null, null, null, null, null, null, 3,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"9".repeat(64),
		);
		expect(result.rows[4]).toMatchObject({
			nachname: "Hutter",
			vorname: "Andrea",
		});
		expect(result.rows[4].repairs).toContain("name_swapped");
		expect(result.rows[5]).toMatchObject({
			nachname: "Zieloszo",
			vorname: "Andreas",
		});
		expect(result.rows[5].repairs).not.toContain("name_swapped");
	});

	it("dreht eine Person, die je einmal in beiden Schreibweisen steht, nicht doppelt", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow(HEADER);
		// "Namyslo" is an established surname elsewhere in the list, so both rows
		// have to end up spelled that way round, not swapped past each other.
		sheet.addRow([
			"01.06.2026", "Sonntag", "Namyslo", "Sabine",
			3, null, null, null, null, null, null, null, 3,
		]);
		sheet.addRow([
			"02.06.2026", "Sonntag", "Namyslo", "Jessica",
			3, null, null, null, null, null, null, null, 3,
		]);
		sheet.addRow([
			"03.06.2026", "Sonntag", "Jessica", "Namyslo",
			3, null, null, null, null, null, null, null, 3,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"5".repeat(64),
		);
		for (const row of result.rows.slice(1))
			expect(`${row.nachname}, ${row.vorname}`).toBe("Namyslo, Jessica");
		expect(result.rows[1].repairs).not.toContain("name_swapped");
		expect(result.rows[2].repairs).toContain("name_swapped");
	});

	it("ergänzt einen fehlenden Namensteil nur bei eindeutiger Zuordnung", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow(HEADER);
		sheet.addRow([
			"01.06.2026", "Sonntag", "Wolf", "Roman",
			3, null, null, null, null, null, null, null, 3,
		]);
		sheet.addRow([
			"02.06.2026", "Sonntag", null, "Roman",
			3, null, null, null, null, null, null, null, 3,
		]);
		// Two people share this given name, so it stays open for review.
		sheet.addRow([
			"03.06.2026", "Sonntag", "Bauer", "Ralf",
			3, null, null, null, null, null, null, null, 3,
		]);
		sheet.addRow([
			"04.06.2026", "Sonntag", "Müller", "Ralf",
			3, null, null, null, null, null, null, null, 3,
		]);
		sheet.addRow([
			"05.06.2026", "Sonntag", null, "Ralf",
			3, null, null, null, null, null, null, null, 3,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"6".repeat(64),
		);
		expect(result.rows[1].nachname).toBe("Wolf");
		expect(result.rows[1].repairs).toContain("name_completed");
		expect(result.rows[1].issues).toEqual([]);
		expect(result.rows[4].nachname).toBe("");
		expect(result.rows[4].issues).toContain("missing_name");
	});

	it("vereinheitlicht die Schreibweise eines Namens", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow(HEADER);
		sheet.addRow([
			"21.06.2026", "Sonntag", "Göb", "josefine",
			4, null, null, null, null, null, null, null, 4,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"7".repeat(64),
		);
		expect(result.rows[0].vorname).toBe("Josefine");
		expect(result.rows[0].repairs).toContain("name_case");
		expect(result.rows[0].originalValues.vorname).toBe("josefine");
	});

	it("meldet Spalten mit Stunden, die zu keinem Punkt passen", async () => {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Juni_26");
		sheet.addRow([...HEADER, "Schützen", "Leerspalte"]);
		sheet.addRow([
			"01.06.2026", "Sonntag", "Wolf", "Roman",
			null, null, null, null, null, null, null, null, 3, "", 3, null,
		]);
		const result = await parse(
			new Uint8Array(await workbook.xlsx.writeBuffer()),
			"8".repeat(64),
		);
		expect(result.unknownColumns).toEqual(["Schützen"]);
	});
});

describe("Korrekturen aus dem Formular", () => {
	it("weist unbrauchbare Nutzdaten zurück", () => {
		expect(parseHelperHoursImportCorrections(null)).toBeNull();
		expect(parseHelperHoursImportCorrections("kein json")).toBeNull();
		expect(parseHelperHoursImportCorrections("{}")).toBeNull();
		expect(
			parseHelperHoursImportCorrections(
				JSON.stringify([
					{
						sheet: "Mai_26",
						rowNumber: 4,
						vorname: "Paul",
						nachname: "Dresch",
						allocations: { gesamtverein: 2.5 },
						gemeldete_summe_minuten: 240,
						acceptedIssues: [],
					},
				]),
			),
		).toBeNull();
	});

	it("nimmt gültige Korrekturen mit beliebigen Punktcodes an", () => {
		const parsed = parseHelperHoursImportCorrections(
			JSON.stringify([
				{
					sheet: "Mai_26",
					rowNumber: 4,
					vorname: "Paul",
					nachname: "Dresch",
					allocations: { schuetzen: 240 },
					gemeldete_summe_minuten: 240,
					acceptedIssues: ["total_mismatch"],
				},
			]),
		);
		expect(parsed).toHaveLength(1);
		expect(parsed?.[0].allocations).toEqual({ schuetzen: 240 });
	});
});

describe("Mögliche Doppelschreibungen", () => {
	const person = (nachname: string, vorname: string, minutes = 180) => ({
		nachname,
		vorname,
		minutes,
	});

	it("erkennt Tippfehler und Kurzformen", () => {
		const found = similarHelperNames([
			person("Schad", "Mathias"),
			person("Schad", "Matthias"),
			person("Haas", "Monika"),
			person("Haas", "Moni"),
			person("Schmitt", "Wolfgang"),
			person("Schmidt", "Wolfgang"),
			person("Ort", "Daniel"),
			person("Ort", "Daiel"),
		]);
		const paare = found.map((entry) => `${entry.left} / ${entry.right}`);
		expect(paare).toEqual(
			expect.arrayContaining([
				"Schad, Mathias / Schad, Matthias",
				"Haas, Monika / Haas, Moni",
				"Schmitt, Wolfgang / Schmidt, Wolfgang",
				"Ort, Daniel / Ort, Daiel",
			]),
		);
	});

	it("meldet klar verschiedene Personen nicht", () => {
		const found = similarHelperNames([
			person("Wagner", "Peter"),
			person("Wagner", "Martina"),
			person("Schad", "Elke"),
			person("Schad", "Tabea"),
			person("Müller", "Petra"),
			person("Baumann", "Petra"),
		]);
		expect(found).toEqual([]);
	});

	it("zählt Einsätze und Stunden je Schreibweise zusammen", () => {
		const [found] = similarHelperNames([
			person("Kuhn", "Manuel", 120),
			person("Kuhn", "Manuel", 180),
			person("Kuhn", "Manu", 60),
		]);
		expect(found).toMatchObject({
			left: "Kuhn, Manuel",
			leftEntries: 2,
			leftMinutes: 300,
			right: "Kuhn, Manu",
			rightEntries: 1,
			rightMinutes: 60,
		});
	});

	it("ignoriert Zeilen ohne vollständigen Namen", () => {
		expect(similarHelperNames([person("", "Roman"), person("Wolf", "")])).toEqual(
			[],
		);
	});
});
