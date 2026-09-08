// Aggregation behind the headline block on the Umsätze page: one all-time
// figure plus the records the club actually talks about. Kept free of React so
// it can be unit-tested directly, like the Vorjahresvergleich next to it.

import type { ComparisonEntry } from "@/lib/anlass-comparison";

export type RevenueYear = {
	year: number;
	revenueCent: number;
	// One real-world event can be several till-protocols on the same day, so
	// the honest "how often" is the count of distinct dates, as in the
	// Vorjahresvergleich.
	dateCount: number;
};

export type RevenueDay = {
	date: string;
	revenueCent: number;
	label: string;
};

export type RevenueHighlights = {
	totalCent: number;
	protocolCent: number;
	historicalCent: number;
	entryCount: number;
	dateCount: number;
	firstDate: string | null;
	lastDate: string | null;
	// Ascending, gap years included with zero so the bar strip keeps a real
	// time axis instead of squeezing a decade into the years that had turnover.
	years: RevenueYear[];
	bestYear: RevenueYear | null;
	bestDay: RevenueDay | null;
	averagePerDateCent: number;
	yearToDate: {
		year: number;
		revenueCent: number;
		previousYear: number;
		previousRevenueCent: number;
		// null when the previous year holds nothing up to this point, because a
		// percentage against zero says nothing.
		deltaPct: number | null;
	} | null;
};

const EMPTY: RevenueHighlights = {
	totalCent: 0,
	protocolCent: 0,
	historicalCent: 0,
	entryCount: 0,
	dateCount: 0,
	firstDate: null,
	lastDate: null,
	years: [],
	bestYear: null,
	bestDay: null,
	averagePerDateCent: 0,
	yearToDate: null,
};

function yearOf(date: string): number {
	return Number(date.slice(0, 4));
}

export function buildRevenueHighlights(
	entries: ComparisonEntry[],
	today: string,
): RevenueHighlights {
	const usable = entries.filter((entry) =>
		Number.isInteger(yearOf(entry.date)),
	);
	if (usable.length === 0) return EMPTY;

	const days = new Map<string, RevenueDay>();
	const perYear = new Map<
		number,
		{ revenueCent: number; dates: Set<string> }
	>();
	let totalCent = 0;
	let protocolCent = 0;
	let historicalCent = 0;
	let firstDate = usable[0].date;
	let lastDate = usable[0].date;

	for (const entry of usable) {
		totalCent += entry.revenueCent;
		if (entry.source === "protocol") protocolCent += entry.revenueCent;
		else historicalCent += entry.revenueCent;
		if (entry.date < firstDate) firstDate = entry.date;
		if (entry.date > lastDate) lastDate = entry.date;

		const day = days.get(entry.date);
		// The day is named after its strongest entry, decided in the second pass:
		// on a day with several tills that is the one people remember it by.
		days.set(entry.date, {
			date: entry.date,
			revenueCent: (day?.revenueCent ?? 0) + entry.revenueCent,
			label: day?.label ?? "",
		});

		const year = yearOf(entry.date);
		const bucket = perYear.get(year) ?? {
			revenueCent: 0,
			dates: new Set<string>(),
		};
		bucket.revenueCent += entry.revenueCent;
		bucket.dates.add(entry.date);
		perYear.set(year, bucket);
	}

	const strongestOfDay = new Map<string, number>();
	for (const entry of usable) {
		const best = strongestOfDay.get(entry.date);
		if (best !== undefined && entry.revenueCent <= best) continue;
		strongestOfDay.set(entry.date, entry.revenueCent);
		const day = days.get(entry.date);
		if (day) days.set(entry.date, { ...day, label: entry.occasion.trim() });
	}

	const firstYear = yearOf(firstDate);
	const lastYear = yearOf(lastDate);
	const years: RevenueYear[] = [];
	for (let year = firstYear; year <= lastYear; year++) {
		const bucket = perYear.get(year);
		years.push({
			year,
			revenueCent: bucket?.revenueCent ?? 0,
			dateCount: bucket?.dates.size ?? 0,
		});
	}

	const bestYear = years.reduce<RevenueYear | null>(
		(best, year) =>
			year.revenueCent > 0 && (!best || year.revenueCent > best.revenueCent)
				? year
				: best,
		null,
	);
	const bestDay = Array.from(days.values()).reduce<RevenueDay | null>(
		(best, day) =>
			day.revenueCent > 0 && (!best || day.revenueCent > best.revenueCent)
				? day
				: best,
		null,
	);

	const dateCount = days.size;
	const currentYear = yearOf(today);
	const monthDay = today.slice(5);
	const inWindow = (entry: ComparisonEntry, year: number) =>
		yearOf(entry.date) === year && entry.date.slice(5) <= monthDay;
	const currentRevenue = usable
		.filter((entry) => inWindow(entry, currentYear))
		.reduce((sum, entry) => sum + entry.revenueCent, 0);
	const previousRevenue = usable
		.filter((entry) => inWindow(entry, currentYear - 1))
		.reduce((sum, entry) => sum + entry.revenueCent, 0);

	return {
		totalCent,
		protocolCent,
		historicalCent,
		entryCount: usable.length,
		dateCount,
		firstDate,
		lastDate,
		years,
		bestYear,
		bestDay,
		averagePerDateCent: dateCount === 0 ? 0 : Math.round(totalCent / dateCount),
		yearToDate:
			currentYear < firstYear || currentYear > lastYear + 1
				? null
				: {
						year: currentYear,
						revenueCent: currentRevenue,
						previousYear: currentYear - 1,
						previousRevenueCent: previousRevenue,
						deltaPct:
							previousRevenue > 0
								? ((currentRevenue - previousRevenue) / previousRevenue) * 100
								: null,
					},
	};
}
