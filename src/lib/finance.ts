import type { TimeRange } from "@/lib/dashboard-stats";
import { formatDateDe } from "@/lib/date";
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

function monthKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function startOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}
function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Total day revenue for a protokoll: net cash takings plus card payments.
export function revenueOf(p: ProtokollRow): number {
	return p.tageseinnahmen_cent + p.kartenzahlung_cent;
}

export type MonthPoint = {
	key: string;
	label: string;
	longLabel: string;
	total: number;
	count: number;
	isCurrent: boolean;
};

export type AnlassPoint = { anlass: string; count: number; sum: number };

export type PeriodStats = {
	count: number;
	revenueCashNet: number;
	revenueCard: number;
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
export function computePeriod(items: ProtokollRow[]): PeriodStats {
	let revenueCashNet = 0;
	let revenueCard = 0;
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

	const revenueTotal = revenueCashNet + revenueCard;
	const topAnlass = Array.from(anlass.values())
		.sort((a, b) => b.sum - a.sum)
		.slice(0, 5);

	return {
		count: items.length,
		revenueCashNet,
		revenueCard,
		revenueTotal,
		expenses,
		net: revenueTotal - expenses,
		avgPerProtokoll:
			items.length > 0 ? Math.round(revenueTotal / items.length) : 0,
		cardSharePct:
			revenueTotal > 0
				? Math.round((revenueCard / revenueTotal) * 1000) / 10
				: null,
		topAnlass,
	};
}

// Calendar context (12-month trend, month-over-month, recency) from ALL active
// protokolle, independent of the selected period.
export function computeContext(
	allActive: ProtokollRow[],
	now: Date = new Date(),
): FinanceContext {
	const nowMonth = startOfMonth(now);
	const buckets: MonthPoint[] = [];
	for (let i = 11; i >= 0; i--) {
		const d = new Date(nowMonth);
		d.setMonth(d.getMonth() - i);
		buckets.push({
			key: monthKey(d),
			label: MONTH_SHORT[d.getMonth()],
			longLabel: `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`,
			total: 0,
			count: 0,
			isCurrent: i === 0,
		});
	}
	const byKey = new Map(buckets.map((b) => [b.key, b]));

	const thisKey = monthKey(nowMonth);
	const lastMonthDate = new Date(nowMonth);
	lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
	const lastKey = monthKey(lastMonthDate);

	let thisMonthTotal = 0;
	let lastMonthTotal = 0;
	let last: Date | null = null;

	for (const p of allActive) {
		const d = new Date(p.anlass_datum);
		const k = monthKey(d);
		const b = byKey.get(k);
		if (b) {
			b.total += revenueOf(p);
			b.count += 1;
		}
		if (k === thisKey) thisMonthTotal += revenueOf(p);
		else if (k === lastKey) lastMonthTotal += revenueOf(p);
		if (!last || d > last) last = d;
	}

	const momPct =
		lastMonthTotal > 0
			? Math.round(
					((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 1000,
				) / 10
			: null;

	const lastEntryDays = last
		? Math.max(
				0,
				Math.floor(
					(startOfDay(now).getTime() - startOfDay(last).getTime()) / 86_400_000,
				),
			)
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

function isoDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Date window for a selected time range, used to query period-scoped reports.
export function rangeToDates(
	range: TimeRange,
	now: Date = new Date(),
): { von: string; bis: string } {
	const bis = isoDate(now);
	if (range === "year") {
		return { von: isoDate(new Date(now.getFullYear(), 0, 1)), bis };
	}
	if (range === "month") {
		return {
			von: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
			bis,
		};
	}
	if (range === "30d") {
		const start = startOfDay(now);
		start.setDate(start.getDate() - 29);
		return { von: isoDate(start), bis };
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

function isoLocal(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ddmm(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

// Revenue series for the chart at the chosen granularity. Daily shows the last
// 30 days (event days spike, empty days sit at zero), weekly the last 12
// rolling weeks, monthly the last 12 months.
export function computeSeries(
	allActive: ProtokollRow[],
	granularity: Granularity,
	now: Date = new Date(),
): MonthPoint[] {
	if (granularity === "month") {
		return computeContext(allActive, now).monthly;
	}

	if (granularity === "day") {
		const byDay = new Map<string, { total: number; count: number }>();
		for (const p of allActive) {
			const cur = byDay.get(p.anlass_datum) ?? { total: 0, count: 0 };
			cur.total += revenueOf(p);
			cur.count += 1;
			byDay.set(p.anlass_datum, cur);
		}
		const today = startOfDay(now);
		const points: MonthPoint[] = [];
		for (let i = DAY_BUCKETS - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const key = isoLocal(d);
			const agg = byDay.get(key) ?? { total: 0, count: 0 };
			points.push({
				key,
				label: i % 5 === 0 ? ddmm(d) : "",
				longLabel: formatDateDe(d),
				total: agg.total,
				count: agg.count,
				isCurrent: i === 0,
			});
		}
		return points;
	}

	// week: rolling 7-day buckets ending today.
	const today = startOfDay(now);
	const points: MonthPoint[] = [];
	for (let i = WEEK_BUCKETS - 1; i >= 0; i--) {
		const end = new Date(today);
		end.setDate(end.getDate() - i * 7);
		const start = new Date(end);
		start.setDate(start.getDate() - 6);
		const startKey = isoLocal(start);
		const endKey = isoLocal(end);
		let total = 0;
		let count = 0;
		for (const p of allActive) {
			if (p.anlass_datum >= startKey && p.anlass_datum <= endKey) {
				total += revenueOf(p);
				count += 1;
			}
		}
		points.push({
			key: startKey,
			label: ddmm(start),
			longLabel: `Woche ${formatDateDe(start)} bis ${formatDateDe(end)}`,
			total,
			count,
			isCurrent: i === 0,
		});
	}
	return points;
}
