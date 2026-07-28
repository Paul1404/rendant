import type { TimeRange } from "@/lib/dashboard-stats";
import {
	addIsoCalendarDays,
	formatDateDe,
	isoCalendarDayDifference,
	todayIsoDate,
} from "@/lib/date";
import type { ProtokollRow } from "@/lib/protokoll-types";

const MONTH_SHORT = [
	"Jan",
	"Feb",
	"Mär",
	"Apr",
	"Mai",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Okt",
	"Nov",
	"Dez",
];
const MONTH_LONG = [
	"Januar",
	"Februar",
	"März",
	"April",
	"Mai",
	"Juni",
	"Juli",
	"August",
	"September",
	"Oktober",
	"November",
	"Dezember",
];

function addMonthsToKey(key: string, months: number): string {
	const year = Number(key.slice(0, 4));
	const month = Number(key.slice(5, 7));
	const absoluteMonth = year * 12 + month - 1 + months;
	const resultYear = Math.floor(absoluteMonth / 12);
	const resultMonth = ((absoluteMonth % 12) + 12) % 12;
	return `${String(resultYear).padStart(4, "0")}-${String(resultMonth + 1).padStart(2, "0")}`;
}

// Total day revenue for a protokoll: net cash takings plus card payments.
export function revenueOf(p: ProtokollRow): number {
	return p.tageseinnahmen_cent + p.kartenzahlung_cent;
}

export type MonthPoint = {
	key: string;
	label: string;
	longLabel: string;
	from: string;
	to: string;
	total: number;
	count: number;
	isCurrent: boolean;
};

export type AnlassPoint = { anlass: string; count: number; sum: number };

export type HistoricalRevenueLike = {
	id?: string;
	anlass_datum: string;
	anlass: string;
	vergleichsgruppe: string;
	umsatz_cent: number;
	ausgaben_cent: number;
	quellreferenz?: string | null;
};

export type PeriodStats = {
	count: number;
	revenueCashNet: number;
	revenueCard: number;
	revenueHistorical: number;
	revenueTotal: number;
	expenses: number;
	net: number;
	avgPerProtokoll: number;
	cardSharePct: number | null;
	topAnlass: AnlassPoint[];
};

export type FinanceContext = {
	thisMonthTotal: number;
	lastMonthTotal: number;
	momPct: number | null;
	monthly: MonthPoint[];
	lastEntryDays: number | null;
	stornoCount: number;
};

// Period KPIs from an already range-filtered list of ACTIVE protokolle.
export function computePeriod(
	items: ProtokollRow[],
	historical: HistoricalRevenueLike[] = [],
): PeriodStats {
	let revenueCashNet = 0;
	let revenueCard = 0;
	let revenueHistorical = 0;
	let expenses = 0;
	const anlass = new Map<string, AnlassPoint>();

	for (const p of items) {
		revenueCashNet += p.tageseinnahmen_cent;
		revenueCard += p.kartenzahlung_cent;
		expenses += p.ausgaben_cent;
		const key = p.anlass.trim();
		if (key) {
			const cur = anlass.get(key) ?? { anlass: key, count: 0, sum: 0 };
			cur.count += 1;
			cur.sum += revenueOf(p);
			anlass.set(key, cur);
		}
	}
	for (const item of historical) {
		revenueHistorical += item.umsatz_cent;
		expenses += item.ausgaben_cent;
		const key = item.anlass.trim();
		if (key) {
			const cur = anlass.get(key) ?? { anlass: key, count: 0, sum: 0 };
			cur.count += 1;
			cur.sum += item.umsatz_cent;
			anlass.set(key, cur);
		}
	}

	const revenueTotal = revenueCashNet + revenueCard + revenueHistorical;
	const revenueWithKnownPaymentMethod = revenueCashNet + revenueCard;
	const topAnlass = Array.from(anlass.values())
		.sort((a, b) => b.sum - a.sum)
		.slice(0, 5);

	return {
		count: items.length + historical.length,
		revenueCashNet,
		revenueCard,
		revenueHistorical,
		revenueTotal,
		expenses,
		net: revenueTotal - expenses,
		avgPerProtokoll:
			items.length + historical.length > 0
				? Math.round(revenueTotal / (items.length + historical.length))
				: 0,
		cardSharePct:
			revenueWithKnownPaymentMethod > 0
				? Math.round((revenueCard / revenueWithKnownPaymentMethod) * 1000) / 10
				: null,
		topAnlass,
	};
}

// Calendar context (12-month trend, month-over-month, recency) from ALL active
// protokolle, independent of the selected period.
export function computeContext(
	allActive: ProtokollRow[],
	now: Date = new Date(),
	historical: HistoricalRevenueLike[] = [],
): FinanceContext {
	const today = todayIsoDate(now);
	const thisKey = today.slice(0, 7);
	const buckets: MonthPoint[] = [];
	for (let i = 11; i >= 0; i--) {
		const key = addMonthsToKey(thisKey, -i);
		const year = Number(key.slice(0, 4));
		const month = Number(key.slice(5, 7));
		buckets.push({
			key,
			label: MONTH_SHORT[month - 1],
			longLabel: `${MONTH_LONG[month - 1]} ${year}`,
			from: `${key}-01`,
			to: addIsoCalendarDays(`${addMonthsToKey(key, 1)}-01`, -1),
			total: 0,
			count: 0,
			isCurrent: i === 0,
		});
	}
	const byKey = new Map(buckets.map((b) => [b.key, b]));

	const lastKey = addMonthsToKey(thisKey, -1);

	let thisMonthTotal = 0;
	let lastMonthTotal = 0;
	let last: string | null = null;

	for (const p of allActive) {
		if (p.anlass_datum > today) continue;
		const k = p.anlass_datum.slice(0, 7);
		const b = byKey.get(k);
		if (b) {
			b.total += revenueOf(p);
			b.count += 1;
		}
		if (k === thisKey) thisMonthTotal += revenueOf(p);
		else if (k === lastKey) lastMonthTotal += revenueOf(p);
		if (!last || p.anlass_datum > last) last = p.anlass_datum;
	}
	for (const item of historical) {
		if (item.anlass_datum > today) continue;
		const k = item.anlass_datum.slice(0, 7);
		const b = byKey.get(k);
		if (b) {
			b.total += item.umsatz_cent;
			b.count += 1;
		}
		if (k === thisKey) thisMonthTotal += item.umsatz_cent;
		else if (k === lastKey) lastMonthTotal += item.umsatz_cent;
		if (!last || item.anlass_datum > last) last = item.anlass_datum;
	}

	const momPct =
		lastMonthTotal > 0
			? Math.round(
					((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 1000,
				) / 10
			: null;

	const lastEntryDays = last
		? Math.max(0, isoCalendarDayDifference(today, last))
		: null;

	return {
		thisMonthTotal,
		lastMonthTotal,
		momPct,
		monthly: buckets,
		lastEntryDays,
		stornoCount: 0,
	};
}

// Date window for a selected time range, used to query period-scoped reports.
export function rangeToDates(
	range: TimeRange,
	now: Date = new Date(),
): { von: string; bis: string } {
	const bis = todayIsoDate(now);
	if (range === "year") {
		return { von: `${bis.slice(0, 4)}-01-01`, bis };
	}
	if (range === "month") {
		return { von: `${bis.slice(0, 7)}-01`, bis };
	}
	if (range === "30d") {
		return { von: addIsoCalendarDays(bis, -29), bis };
	}
	return { von: "2000-01-01", bis };
}

export const RANGE_LABELS: Record<TimeRange, string> = {
	all: "Gesamt",
	year: "Dieses Jahr",
	"30d": "Letzte 30 Tage",
	month: "Dieser Monat",
};

export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = {
	day: "Tag",
	week: "Woche",
	month: "Monat",
};

const DAY_BUCKETS = 30;
const WEEK_BUCKETS = 12;

function ddmm(value: string): string {
	return `${value.slice(8, 10)}.${value.slice(5, 7)}.`;
}

// Revenue series for the chart at the chosen granularity. Daily shows the last
// 30 days (event days spike, empty days sit at zero), weekly the last 12
// rolling weeks, monthly the last 12 months.
export function computeSeries(
	allActive: ProtokollRow[],
	granularity: Granularity,
	now: Date = new Date(),
	historical: HistoricalRevenueLike[] = [],
): MonthPoint[] {
	if (granularity === "month") {
		return computeContext(allActive, now, historical).monthly;
	}

	if (granularity === "day") {
		const byDay = new Map<string, { total: number; count: number }>();
		for (const p of allActive) {
			const cur = byDay.get(p.anlass_datum) ?? { total: 0, count: 0 };
			cur.total += revenueOf(p);
			cur.count += 1;
			byDay.set(p.anlass_datum, cur);
		}
		for (const item of historical) {
			const cur = byDay.get(item.anlass_datum) ?? { total: 0, count: 0 };
			cur.total += item.umsatz_cent;
			cur.count += 1;
			byDay.set(item.anlass_datum, cur);
		}
		const today = todayIsoDate(now);
		const points: MonthPoint[] = [];
		for (let i = DAY_BUCKETS - 1; i >= 0; i--) {
			const key = addIsoCalendarDays(today, -i);
			const agg = byDay.get(key) ?? { total: 0, count: 0 };
			points.push({
				key,
				label: i % 5 === 0 ? ddmm(key) : "",
				longLabel: formatDateDe(key),
				from: key,
				to: key,
				total: agg.total,
				count: agg.count,
				isCurrent: i === 0,
			});
		}
		return points;
	}

	// week: rolling 7-day buckets ending today.
	const today = todayIsoDate(now);
	const points: MonthPoint[] = [];
	for (let i = WEEK_BUCKETS - 1; i >= 0; i--) {
		const endKey = addIsoCalendarDays(today, -i * 7);
		const startKey = addIsoCalendarDays(endKey, -6);
		let total = 0;
		let count = 0;
		for (const p of allActive) {
			if (p.anlass_datum >= startKey && p.anlass_datum <= endKey) {
				total += revenueOf(p);
				count += 1;
			}
		}
		for (const item of historical) {
			if (item.anlass_datum >= startKey && item.anlass_datum <= endKey) {
				total += item.umsatz_cent;
				count += 1;
			}
		}
		points.push({
			key: startKey,
			label: ddmm(startKey),
			longLabel: `Woche ${formatDateDe(startKey)} bis ${formatDateDe(endKey)}`,
			from: startKey,
			to: endKey,
			total,
			count,
			isCurrent: i === 0,
		});
	}
	return points;
}

export type OccasionYearValue = {
	year: number;
	revenue: number;
	expenses: number;
	count: number;
};

export type OccasionComparison = {
	key: string;
	anlass: string;
	years: OccasionYearValue[];
};

function occasionKey(value: string): string {
	return value.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

export function computeOccasionComparisons(
	protokolle: ProtokollRow[],
	historical: HistoricalRevenueLike[] = [],
): OccasionComparison[] {
	const groups = new Map<
		string,
		{ anlass: string; years: Map<number, OccasionYearValue> }
	>();
	const add = (
		anlass: string,
		date: string,
		revenue: number,
		expenses: number,
	) => {
		const key = occasionKey(anlass);
		const year = Number(date.slice(0, 4));
		if (!key || !Number.isInteger(year)) return;
		const group = groups.get(key) ?? {
			anlass: anlass.trim(),
			years: new Map(),
		};
		const value = group.years.get(year) ?? {
			year,
			revenue: 0,
			expenses: 0,
			count: 0,
		};
		value.revenue += revenue;
		value.expenses += expenses;
		value.count += 1;
		group.years.set(year, value);
		groups.set(key, group);
	};

	for (const item of protokolle) {
		add(item.anlass, item.anlass_datum, revenueOf(item), item.ausgaben_cent);
	}
	for (const item of historical) {
		add(
			item.vergleichsgruppe,
			item.anlass_datum,
			item.umsatz_cent,
			item.ausgaben_cent,
		);
	}

	return Array.from(groups, ([key, group]) => ({
		key,
		anlass: group.anlass,
		years: Array.from(group.years.values()).sort((a, b) => a.year - b.year),
	}))
		.filter((group) => group.years.length >= 2)
		.sort((a, b) => {
			const latestA = a.years.at(-1)?.revenue ?? 0;
			const latestB = b.years.at(-1)?.revenue ?? 0;
			return latestB - latestA || a.anlass.localeCompare(b.anlass, "de");
		});
}
