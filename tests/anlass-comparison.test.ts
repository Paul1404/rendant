import { describe, expect, test } from "vitest";
import type { AnlassKatalogEntry } from "@/lib/anlass";
import {
	buildComparisons,
	type HistoricalLike,
	toComparisonEntries,
} from "@/lib/anlass-comparison";
import type { ProtokollRow } from "@/lib/protokoll-types";

function proto(p: {
	id: string;
	date: string;
	katalogId: string | null;
	anlass: string;
	tageseinnahmen: number;
	karten?: number;
	ausgaben?: number;
	storniert?: boolean;
	umsatzbereich?: ProtokollRow["umsatzbereich"];
}): ProtokollRow {
	return {
		id: p.id,
		anlass_datum: p.date,
		anlass_katalog_id: p.katalogId,
		anlass: p.anlass,
		umsatzbereich: p.umsatzbereich ?? null,
		tageseinnahmen_cent: p.tageseinnahmen,
		kartenzahlung_cent: p.karten ?? 0,
		ausgaben_cent: p.ausgaben ?? 0,
		storniert_am: p.storniert ? new Date() : null,
		// unused-by-aggregation fields
	} as unknown as ProtokollRow;
}

const CATALOG: AnlassKatalogEntry[] = [
	{ id: "b", name: "Biergarten", typ: "wiederkehrend", aktiv: true, reihenfolge: 0, updatedAt: "2026-07-22T00:00:00.000Z" },
	{ id: "k", name: "Korbball", typ: "wiederkehrend", aktiv: true, reihenfolge: 1, updatedAt: "2026-07-22T00:00:00.000Z" },
	{ id: "s", name: "Sommerfest", typ: "einmalig", aktiv: true, reihenfolge: 2, updatedAt: "2026-07-22T00:00:00.000Z" },
];
const byId = new Map(CATALOG.map((k) => [k.id, k]));

function build(protocols: ProtokollRow[], historical: HistoricalLike[] = []) {
	const groups = buildComparisons(
		toComparisonEntries(historical, protocols),
		byId,
	);
	return new Map(groups.map((g) => [g.key, g]));
}

describe("anlass comparison aggregation", () => {
	test("collapses different spellings into one catalog group", () => {
		const groups = build([
			proto({ id: "1", date: "2026-06-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 10000 }),
			proto({ id: "2", date: "2026-06-08", katalogId: "b", anlass: "Sonntag Biergarten", tageseinnahmen: 3000 }),
		]);
		expect(groups.size).toBe(1);
		expect(groups.get("b")?.label).toBe("Biergarten");
		expect(groups.get("b")?.typ).toBe("wiederkehrend");
	});

	test("multiple tills on the same day count as one Termin", () => {
		const groups = build([
			proto({ id: "1", date: "2026-06-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 10000 }),
			proto({ id: "2", date: "2026-06-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 5000 }),
			proto({ id: "3", date: "2026-06-08", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 3000 }),
		]);
		const y = groups.get("b")?.years.get(2026);
		expect(y?.dates.size).toBe(2); // two distinct dates = two Termine
		expect(y?.protocolCount).toBe(3); // three till-protocols
		expect(y?.revenueCent).toBe(18000);
	});

	test("new rows group by Umsatzbereich before the legacy catalog", () => {
		const groups = build([
			proto({ id: "1", date: "2025-06-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 1000, umsatzbereich: "wirtschaftsbetrieb" }),
			proto({ id: "2", date: "2026-06-01", katalogId: null, anlass: "Wirtschaftsbetrieb · Donnerstag", tageseinnahmen: 2000, umsatzbereich: "wirtschaftsbetrieb" }),
		]);
		const group = groups.get("bereich:wirtschaftsbetrieb");
		expect(group?.label).toBe("Wirtschaftsbetrieb");
		expect(group?.years.size).toBe(2);
		expect(groups.has("b")).toBe(false);
	});

	test("keeps different Umsatzbereiche separate on the same date", () => {
		const groups = build([
			proto({ id: "1", date: "2026-07-04", katalogId: null, anlass: "Sommerfest", tageseinnahmen: 1000, umsatzbereich: "veranstaltungen" }),
			proto({ id: "2", date: "2026-07-04", katalogId: null, anlass: "Eintritt", tageseinnahmen: 500, umsatzbereich: "eintrittsgelder" }),
		]);
		expect(groups.size).toBe(2);
		expect(groups.has("bereich:veranstaltungen")).toBe(true);
		expect(groups.has("bereich:eintrittsgelder")).toBe(true);
	});

	test("revenue includes card payments; Ø per Termin is revenue/Termine", () => {
		const groups = build([
			proto({ id: "1", date: "2026-06-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 8000, karten: 2000 }),
			proto({ id: "2", date: "2026-06-08", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 5000 }),
		]);
		const y = groups.get("b")?.years.get(2026);
		expect(y?.revenueCent).toBe(15000); // 8000+2000 + 5000
		expect(y ? Math.round(y.revenueCent / y.dates.size) : 0).toBe(7500);
	});

	test("keeps Fußball and Korbball separate; groups per year", () => {
		const groups = build([
			proto({ id: "1", date: "2025-05-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 1000 }),
			proto({ id: "2", date: "2026-05-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 2000 }),
			proto({ id: "3", date: "2026-05-02", katalogId: "k", anlass: "Korbball", tageseinnahmen: 500 }),
		]);
		expect(groups.get("b")?.years.size).toBe(2);
		expect(groups.get("k")).toBeDefined();
		expect(groups.get("b")).not.toBe(groups.get("k"));
	});

	test("un-mapped free text falls back to its own text group, typ einmalig", () => {
		const groups = build([
			proto({ id: "1", date: "2026-06-01", katalogId: null, anlass: "Testabend", tageseinnahmen: 100 }),
		]);
		const g = groups.get("text:testabend");
		expect(g?.unmapped).toBe(true);
		expect(g?.typ).toBe("einmalig");
		expect(g?.label).toBe("Testabend");
	});

	test("cancelled protocols are excluded", () => {
		const groups = build([
			proto({ id: "1", date: "2026-06-01", katalogId: "b", anlass: "Biergarten", tageseinnahmen: 100, storniert: true }),
		]);
		expect(groups.size).toBe(0);
	});

	test("cancelled historical entries are excluded", () => {
		const groups = build([], [
			{
				id: "historical-1",
				anlass_datum: "2025-06-01",
				anlass_katalog_id: "b",
				vergleichsgruppe: "Biergarten",
				umsatz_cent: 10_000,
				ausgaben_cent: 1_000,
				storniert_am: new Date("2026-01-01T00:00:00Z"),
			},
		]);
		expect(groups.size).toBe(0);
	});
});
