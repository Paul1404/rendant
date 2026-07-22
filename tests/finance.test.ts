import { describe, expect, it } from "vitest";
import {
	availableYears,
	filterByRange,
	filterByYear,
} from "@/lib/dashboard-stats";
import {
	computeContext,
	computeOccasionComparisons,
	computePeriod,
	computeSeries,
	rangeToDates,
} from "@/lib/finance";
import type { ProtokollRow } from "@/lib/protokoll-types";

function protokoll(
	anlass: string,
	anlassDatum: string,
	tageseinnahmenCent: number,
	kartenzahlungCent = 0,
	ausgabenCent = 0,
): ProtokollRow {
	return {
		anlass,
		anlass_datum: anlassDatum,
		tageseinnahmen_cent: tageseinnahmenCent,
		kartenzahlung_cent: kartenzahlungCent,
		ausgaben_cent: ausgabenCent,
	} as ProtokollRow;
}

describe("combined finance calculations", () => {
	it("includes historical revenue without inventing a payment method", () => {
		const period = computePeriod(
			[protokoll("Biergarteneröffnung", "2026-05-01", 10_000, 2_000, 500)],
			[
				{
					anlass: "Biergarteneröffnung",
					vergleichsgruppe: "Biergarteneröffnung",
					anlass_datum: "2025-05-01",
					umsatz_cent: 8_000,
					ausgaben_cent: 300,
				},
			],
		);

		expect(period).toMatchObject({
			count: 2,
			revenueCashNet: 10_000,
			revenueCard: 2_000,
			revenueHistorical: 8_000,
			revenueTotal: 20_000,
			expenses: 800,
			net: 19_200,
			avgPerProtokoll: 10_000,
		});
	});

	it("compares the same occasion across years ignoring case and whitespace", () => {
		const result = computeOccasionComparisons(
			[protokoll("Biergarteneröffnung", "2026-05-01", 12_000)],
			[
				{
					anlass: "Eröffnung bei gutem Wetter",
					vergleichsgruppe: "  biergarteneröffnung ",
					anlass_datum: "2025-05-03",
					umsatz_cent: 9_000,
					ausgaben_cent: 1_000,
				},
			],
		);

		expect(result).toHaveLength(1);
		expect(result[0].years).toEqual([
			{ year: 2025, revenue: 9_000, expenses: 1_000, count: 1 },
			{ year: 2026, revenue: 12_000, expenses: 0, count: 1 },
		]);
	});
});

describe("year filters", () => {
	const rows = [
		{ anlass_datum: "2024-01-01" },
		{ anlass_datum: "2026-02-01" },
		{ anlass_datum: "2025-03-01" },
		{ anlass_datum: "2026-04-01" },
	];

	it("lists unique years newest first", () => {
		expect(availableYears(rows)).toEqual([2026, 2025, 2024]);
	});

	it("filters a selected business year", () => {
		expect(filterByYear(rows, 2026)).toEqual([rows[1], rows[3]]);
		expect(filterByYear(rows, undefined)).toEqual(rows);
	});
});

describe("Berlin reporting ranges", () => {
	const afterMidnightBerlin = new Date("2026-03-31T22:30:00.000Z");

	it("derives report dates in Berlin instead of the process timezone", () => {
		expect(rangeToDates("month", afterMidnightBerlin)).toEqual({
			von: "2026-04-01",
			bis: "2026-04-01",
		});
		expect(rangeToDates("30d", afterMidnightBerlin)).toEqual({
			von: "2026-03-03",
			bis: "2026-04-01",
		});
	});

	it("uses the Berlin month for monthly totals and chart buckets", () => {
		const rows = [protokoll("Silvester", "2026-04-01", 12_300)];
		const context = computeContext(rows, afterMidnightBerlin);
		expect(context.thisMonthTotal).toBe(12_300);
		expect(context.monthly.at(-1)).toMatchObject({
			key: "2026-04",
			total: 12_300,
			isCurrent: true,
		});
		expect(computeSeries(rows, "day", afterMidnightBerlin).at(-1)).toMatchObject(
			{
				key: "2026-04-01",
				total: 12_300,
				isCurrent: true,
			},
		);
	});

	it("excludes future-dated entries from current ranges", () => {
		const rows = [
			{ anlass_datum: "2026-03-31" },
			{ anlass_datum: "2026-04-01" },
			{ anlass_datum: "2026-04-02" },
		];
		expect(filterByRange(rows, "month", afterMidnightBerlin)).toEqual([
			rows[1],
		]);
	});

	it("excludes future-dated entries from current context and monthly charts", () => {
		const current = protokoll("Frühlingsfest", "2026-04-01", 12_300);
		const future = protokoll("Zukunft", "2026-04-02", 99_900);

		const context = computeContext([current, future], afterMidnightBerlin);
		expect(context.thisMonthTotal).toBe(12_300);
		expect(context.lastEntryDays).toBe(0);
		expect(context.monthly.at(-1)).toMatchObject({
			key: "2026-04",
			total: 12_300,
			count: 1,
		});
		expect(
			computeSeries([current, future], "month", afterMidnightBerlin).at(-1),
		).toMatchObject({ total: 12_300, count: 1 });
	});
});
