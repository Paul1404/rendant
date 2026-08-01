// Pure aggregation behind the Vorjahresvergleich (plans/007 phase 3). Groups
// protocols and historical entries by their anlass catalog entry (falling back
// to normalized free-text for un-mapped legacy rows), folds several till-
// protocols of the same day into one event (Termin), and rolls up per year.
// Kept free of React so it can be unit-tested directly.

import type { AnlassKatalogEntry, AnlassTyp } from "@/lib/anlass";
import type { ProtokollRow } from "@/lib/protokoll-types";
import {
	isUmsatzbereich,
	type Umsatzbereich,
	umsatzbereichLabel,
} from "@/lib/umsatzbereich";

export type HistoricalLike = {
	id: string;
	anlass_datum: string;
	anlass_katalog_id: string | null;
	umsatzbereich?: string | null;
	vergleichsgruppe: string;
	umsatz_cent: number;
	ausgaben_cent: number;
	storniert_am?: Date | null;
};

export type ComparisonEntry = {
	id: string;
	date: string;
	katalogId: string | null;
	umsatzbereich: string | null;
	occasion: string;
	revenueCent: number;
	expensesCent: number;
	source: "historical" | "protocol";
};

export type OccasionYear = {
	year: number;
	revenueCent: number;
	expensesCent: number;
	// One real-world event can be several till-protocols on the same day; the
	// honest "how often" is the count of distinct dates (Termine), not entries.
	dates: Set<string>;
	historicalCount: number;
	protocolCount: number;
	latestDate: string;
};

export type OccasionComparison = {
	key: string;
	label: string;
	typ: AnlassTyp;
	// true when the group has no catalog entry (legacy free-text fallback).
	unmapped: boolean;
	years: Map<number, OccasionYear>;
};

export function occasionKey(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

// Stable grouping key: the catalog id when set, otherwise the normalized
// free-text (prefixed so it can never collide with a uuid).
export function groupKeyFor(
	katalogId: string | null,
	occasion: string,
	umsatzbereich?: Umsatzbereich | null,
): string {
	if (umsatzbereich) return `bereich:${umsatzbereich}`;
	return katalogId ?? `text:${occasionKey(occasion)}`;
}

export function protocolRevenue(protocol: ProtokollRow): number {
	return protocol.tageseinnahmen_cent + protocol.kartenzahlung_cent;
}

export function toComparisonEntries(
	historical: HistoricalLike[],
	protocols: ProtokollRow[],
): ComparisonEntry[] {
	return [
		...historical
			.filter((entry) => !entry.storniert_am)
			.map((entry) => ({
				id: entry.id,
				date: entry.anlass_datum,
				katalogId: entry.anlass_katalog_id,
				umsatzbereich: entry.umsatzbereich ?? null,
				occasion: entry.vergleichsgruppe,
				revenueCent: entry.umsatz_cent,
				expensesCent: entry.ausgaben_cent,
				source: "historical" as const,
			})),
		...protocols
			.filter((protocol) => !protocol.storniert_am)
			.map((protocol) => ({
				id: protocol.id,
				date: protocol.anlass_datum,
				katalogId: protocol.anlass_katalog_id,
				umsatzbereich: protocol.umsatzbereich,
				occasion: protocol.anlass,
				revenueCent: protocolRevenue(protocol),
				expensesCent: protocol.ausgaben_cent,
				source: "protocol" as const,
			})),
	];
}

export function buildComparisons(
	entries: ComparisonEntry[],
	catalogById: Map<string, AnlassKatalogEntry>,
): OccasionComparison[] {
	const groups = new Map<string, OccasionComparison>();
	for (const entry of entries) {
		const catalog = entry.katalogId
			? (catalogById.get(entry.katalogId) ?? null)
			: null;
		// A catalog id that no longer resolves falls back to text grouping.
		const area = isUmsatzbereich(entry.umsatzbereich)
			? entry.umsatzbereich
			: null;
		const key = groupKeyFor(
			catalog ? entry.katalogId : null,
			entry.occasion,
			area,
		);
		if (key === "text:") continue;
		const year = Number(entry.date.slice(0, 4));
		if (!Number.isInteger(year)) continue;
		const group =
			groups.get(key) ??
			({
				key,
				label: area
					? umsatzbereichLabel(area)
					: catalog
						? catalog.name
						: entry.occasion.trim(),
				typ: area ? "wiederkehrend" : catalog ? catalog.typ : "einmalig",
				unmapped: !area && !catalog,
				years: new Map<number, OccasionYear>(),
			} satisfies OccasionComparison);
		const existing = group.years.get(year);
		const dates = existing?.dates ?? new Set<string>();
		dates.add(entry.date);
		group.years.set(year, {
			year,
			revenueCent: (existing?.revenueCent ?? 0) + entry.revenueCent,
			expensesCent: (existing?.expensesCent ?? 0) + entry.expensesCent,
			dates,
			historicalCount:
				(existing?.historicalCount ?? 0) +
				(entry.source === "historical" ? 1 : 0),
			protocolCount:
				(existing?.protocolCount ?? 0) + (entry.source === "protocol" ? 1 : 0),
			latestDate:
				existing && existing.latestDate > entry.date
					? existing.latestDate
					: entry.date,
		});
		groups.set(key, group);
	}
	return Array.from(groups.values()).sort((a, b) =>
		a.label.localeCompare(b.label, "de-DE"),
	);
}
