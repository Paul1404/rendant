import { describe, expect, it } from "vitest";
import type { ComparisonEntry } from "@/lib/anlass-comparison";
import { buildRevenueHighlights } from "@/lib/revenue-highlights";

function entry(
	date: string,
	revenueCent: number,
	options: Partial<ComparisonEntry> = {},
): ComparisonEntry {
	return {
		id: `${date}-${revenueCent}`,
		date,
		katalogId: null,
		umsatzbereich: null,
		occasion: "Sommerfest",
		revenueCent,
		expensesCent: 0,
		source: "protocol",
		...options,
	};
}

describe("buildRevenueHighlights", () => {
	it("returns an empty result without entries", () => {
		const result = buildRevenueHighlights([], "2026-09-08");
		expect(result.totalCent).toBe(0);
		expect(result.entryCount).toBe(0);
		expect(result.bestYear).toBeNull();
		expect(result.yearToDate).toBeNull();
	});

	it("sums every year and separates both sources", () => {
		const result = buildRevenueHighlights(
			[
				entry("2024-05-01", 10_000),
				entry("2024-05-01", 5_000),
				entry("2025-07-12", 30_000, { source: "historical" }),
			],
			"2026-09-08",
		);
		expect(result.totalCent).toBe(45_000);
		expect(result.protocolCent).toBe(15_000);
		expect(result.historicalCent).toBe(30_000);
		expect(result.entryCount).toBe(3);
		// Two protocols on one day are one Termin, as in the Vorjahresvergleich.
		expect(result.dateCount).toBe(2);
		expect(result.averagePerDateCent).toBe(22_500);
		expect(result.firstDate).toBe("2024-05-01");
		expect(result.lastDate).toBe("2025-07-12");
	});

	it("keeps years without turnover so the strip stays a time axis", () => {
		const result = buildRevenueHighlights(
			[entry("2022-03-01", 1_000), entry("2025-03-01", 2_000)],
			"2026-09-08",
		);
		expect(result.years.map((year) => year.year)).toEqual([
			2022, 2023, 2024, 2025,
		]);
		expect(result.years.map((year) => year.revenueCent)).toEqual([
			1_000, 0, 0, 2_000,
		]);
	});

	it("names the strongest day after its strongest entry", () => {
		const result = buildRevenueHighlights(
			[
				entry("2025-08-02", 4_000, { occasion: "Getränke" }),
				entry("2025-08-02", 9_000, { occasion: "Küche" }),
				entry("2025-09-02", 5_000, { occasion: "Kirchweih" }),
			],
			"2026-09-08",
		);
		expect(result.bestDay).toEqual({
			date: "2025-08-02",
			revenueCent: 13_000,
			label: "Küche",
		});
		expect(result.bestYear?.year).toBe(2025);
	});

	it("compares the running year against the same point last year", () => {
		const result = buildRevenueHighlights(
			[
				entry("2025-03-01", 10_000),
				entry("2025-11-01", 90_000),
				entry("2026-03-01", 15_000),
			],
			"2026-09-08",
		);
		expect(result.yearToDate).toMatchObject({
			year: 2026,
			revenueCent: 15_000,
			previousYear: 2025,
			// November lies past the cut-off date and must stay out of it.
			previousRevenueCent: 10_000,
		});
		expect(result.yearToDate?.deltaPct).toBeCloseTo(50);
	});

	it("reports no percentage when the previous year holds nothing", () => {
		const result = buildRevenueHighlights(
			[entry("2026-03-01", 15_000)],
			"2026-09-08",
		);
		expect(result.yearToDate?.deltaPct).toBeNull();
	});
});
