#!/usr/bin/env bun
import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { emptyCounts } from "@/lib/denominations";
import { HELPER_HOUR_CATEGORIES } from "@/lib/helper-hours";
import type { HistoricalProtocolSource } from "@/lib/historical-protocol-import";
import { db, pool } from "@/server/db";
import { helperHours } from "@/server/db/schema";
import { createHistoricalRevenueWithDb } from "@/server/services/historical-revenue";
import {
	archiveHistoricalSource,
	historicalSourceContentType,
} from "@/server/services/historical-source-archive";

const actor = {
	id: "sandbox-seed",
	email: "sandbox-seed@example.test",
	name: "Sandbox Beispieldaten",
	role: "admin",
};

const areas = [
	["veranstaltungen", "Sommerfest"],
	["wirtschaftsbetrieb", "Biergarten"],
	["eintrittsgelder", "Showkappenabend"],
] as const;

const helperNames = [
	["Anna", "Beispiel"],
	["Ben", "Muster"],
	["Clara", "Test"],
	["David", "Demo"],
	["Eva", "Sandbox"],
	["Felix", "Probe"],
] as const;

const helperEvents = [
	"Sommerfest",
	"Sportheimdienst",
	"Vereinsabend",
	"Turnier",
	"Aufbau",
] as const;

async function exampleWorkbook(): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Zählprotokoll");
	sheet.addRow(["Rendant Sandbox", "Unveränderte Beispielquelle"]);
	sheet.addRow(["Datum", "05.07.2025"]);
	sheet.addRow(["Umsatz", 12_345 / 100]);
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function main() {
	for (let index = 0; index < 65; index += 1) {
		const year = 2022 + (index % 5);
		const [area, label] = areas[index % areas.length];
		const month = String((index % 12) + 1).padStart(2, "0");
		const day = String((index % 24) + 1).padStart(2, "0");
		await createHistoricalRevenueWithDb(
			db,
			{
				idempotency_key: randomUUID(),
				anlass_datum: `${year}-${month}-${day}`,
				anlass_katalog_id: null,
				umsatzbereich: area,
				veranstaltungsbezeichnung: `${label} ${year} · Beispiel ${index + 1}`,
				umsatz_cent: 10_000 + index * 137,
				ausgaben_cent: (index % 7) * 125,
				bemerkung: "Ausschließlich lokale, synthetische Beispieldaten",
				quellreferenz: `Sandbox/${year}/Beispiel-${index + 1}.xlsx`,
			},
			actor,
		);
	}

	const bytes = await exampleWorkbook();
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	await archiveHistoricalSource(
		{
			bytes,
			expectedSha256: sha256,
			originalFilename: "Sandbox-Original.xlsx",
			contentType: historicalSourceContentType("Sandbox-Original.xlsx"),
		},
		actor,
	);
	const source: HistoricalProtocolSource = {
		sha256,
		contentFingerprint: sha256,
		path: "Sandbox/2025/Sandbox-Original.xlsx",
		format: "xlsx",
		protocolNumber: "SB-001",
		cashRegisterNumber: "1",
		cashRegisterLabel: "Sandbox Hauptkasse",
		countedBy: "Sandbox Beispieldaten",
		openingCent: 20_000,
		cardCent: 2_345,
		countedCent: 30_000,
		cashRevenueCent: 10_000,
		denominations: emptyCounts(),
		vat: [{ ust_basis_punkte: 1900, betrag_cent: 12_345 }],
		warnings: [],
		dateOrigin: "workbook",
	};
	await createHistoricalRevenueWithDb(
		db,
		{
			idempotency_key: randomUUID(),
			anlass_datum: "2025-07-05",
			anlass_katalog_id: null,
			umsatzbereich: "veranstaltungen",
			veranstaltungsbezeichnung: "Sommerfest 2025 · archivierte Quelle",
			umsatz_cent: 12_345,
			ausgaben_cent: 750,
			bemerkung: "Originaldatei kann lokal geprüft und heruntergeladen werden",
			quellreferenz: source.path,
		},
		actor,
		{ source },
	);

	const helperRows = Array.from({ length: 60 }, (_, index) => {
		const category = HELPER_HOUR_CATEGORIES[index % HELPER_HOUR_CATEGORIES.length];
		const [vorname, nachname] = helperNames[index % helperNames.length];
		const minutes = 60 + (index % 8) * 15;
		const imported = index % 4 === 0;
		const allocations = {
			gesamtverein_minuten: 0,
			fussball_minuten: 0,
			korbball_minuten: 0,
			tischtennis_minuten: 0,
			darts_minuten: 0,
			gymnastik_minuten: 0,
			senioren_minuten: 0,
			combo_minuten: 0,
		};
		allocations[`${category.code}_minuten`] = minutes;
		return {
			idempotency_key: randomUUID(),
			datum: `${2025 + (index % 2)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 24) + 1).padStart(2, "0")}`,
			veranstaltung: helperEvents[index % helperEvents.length],
			vorname,
			nachname,
			...allocations,
			gemeldete_summe_minuten: minutes,
			bemerkung: "Ausschließlich lokale, synthetische Beispieldaten",
			quelle: imported ? "excel" : "manuell",
			quelle_datei: imported ? "Sandbox-Helferstunden.xlsx" : null,
			quelle_sha256: imported ? "a".repeat(64) : null,
			quelle_blatt: imported ? `Monat ${String((index % 12) + 1).padStart(2, "0")}` : null,
			quelle_zeile: imported ? index + 2 : null,
			erstellt_von_user_id: actor.id,
			erstellt_von_name: actor.name,
		};
	});
	await db.insert(helperHours).values(helperRows);
	console.log(
		"[sandbox] 66 synthetische historische Umsätze und 60 Helferstunden angelegt",
	);
}

main()
	.finally(() => pool.end())
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
