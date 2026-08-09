import {
	addIsoCalendarDays,
	isIsoCalendarDate,
	todayIsoDate,
} from "@/lib/date";
import type { ProtokollRow } from "@/lib/protokoll-types";

const MONTH_LABELS_LONG = [
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

export type TimeRange = "month" | "30d" | "year" | "all";

export type DateWindow = { von: string; bis: string };

export function parseDateWindow(
	von: unknown,
	bis: unknown,
): DateWindow | undefined {
	if (
		typeof von !== "string" ||
		typeof bis !== "string" ||
		!isIsoCalendarDate(von) ||
		!isIsoCalendarDate(bis) ||
		von > bis
	) {
		return undefined;
	}
	return { von, bis };
}

export function filterByDateWindow<T extends { anlass_datum: string }>(
	items: T[],
	window: DateWindow | undefined,
): T[] {
	if (!window) return items;
	return items.filter(
		(item) =>
			item.anlass_datum >= window.von && item.anlass_datum <= window.bis,
	);
}

export function parseTimeRange(value: string | undefined): TimeRange {
	if (
		value === "month" ||
		value === "30d" ||
		value === "year" ||
		value === "all"
	) {
		return value;
	}
	return "year";
}

export function filterByRange<T extends { anlass_datum: string }>(
	items: T[],
	range: TimeRange,
	now: Date = new Date(),
): T[] {
	if (range === "all") return items;
	const today = todayIsoDate(now);
	let from: string;
	if (range === "month") from = `${today.slice(0, 7)}-01`;
	else if (range === "year") from = `${today.slice(0, 4)}-01-01`;
	else from = addIsoCalendarDays(today, -29);
	return items.filter(
		(item) => item.anlass_datum >= from && item.anlass_datum <= today,
	);
}

export function filterByYear<T extends { anlass_datum: string }>(
	items: T[],
	year: number | undefined,
): T[] {
	if (year === undefined) return items;
	const prefix = `${year}-`;
	return items.filter((item) => item.anlass_datum.startsWith(prefix));
}

export function availableYears(
	items: ReadonlyArray<{ anlass_datum: string }>,
): number[] {
	return Array.from(
		new Set(
			items
				.map((item) => Number(item.anlass_datum.slice(0, 4)))
				.filter(
					(year) => Number.isInteger(year) && year >= 1900 && year <= 9999,
				),
		),
	).sort((a, b) => b - a);
}

export function filterBySearch(
	items: ProtokollRow[],
	query: string | undefined,
): ProtokollRow[] {
	const q = (query ?? "").trim().toLowerCase();
	if (!q) return items;
	return items.filter((p) => {
		return (
			p.belegnummer.toLowerCase().includes(q) ||
			p.anlass.toLowerCase().includes(q) ||
			p.gezaehlt_von.toLowerCase().includes(q) ||
			p.geprueft_von.toLowerCase().includes(q) ||
			p.kassenbezeichnung.toLowerCase().includes(q) ||
			p.kassennummer.toLowerCase().includes(q)
		);
	});
}

export type MonthGroup = {
	key: string;
	label: string;
	count: number;
	sumActiveCent: number;
	items: ProtokollRow[];
};

export function groupByMonth(items: ProtokollRow[]): MonthGroup[] {
	const map = new Map<string, MonthGroup>();
	for (const p of items) {
		const year = Number(p.anlass_datum.slice(0, 4));
		const month = Number(p.anlass_datum.slice(5, 7));
		if (!Number.isInteger(year) || month < 1 || month > 12) continue;
		const k = `${year}-${String(month).padStart(2, "0")}`;
		let g = map.get(k);
		if (!g) {
			g = {
				key: k,
				label: `${MONTH_LABELS_LONG[month - 1]} ${year}`,
				count: 0,
				sumActiveCent: 0,
				items: [],
			};
			map.set(k, g);
		}
		g.items.push(p);
		g.count++;
		if (!p.storniert_am) {
			g.sumActiveCent += p.tageseinnahmen_cent + p.kartenzahlung_cent;
		}
	}
	return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}
