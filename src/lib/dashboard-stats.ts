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

function startOfYear(d: Date): Date {
	return new Date(d.getFullYear(), 0, 1);
}

function addDays(d: Date, days: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + days);
	return x;
}

export type TimeRange = "month" | "30d" | "year" | "all";

export function parseTimeRange(value: string | undefined): TimeRange {
	if (value === "month" || value === "30d" || value === "year") return value;
	return "all";
}

export function filterByRange(
	items: ProtokollRow[],
	range: TimeRange,
	now: Date = new Date(),
): ProtokollRow[] {
	if (range === "all") return items;
	let from: Date;
	if (range === "month") from = startOfMonth(now);
	else if (range === "year") from = startOfYear(now);
	else from = addDays(startOfDay(now), -29);
	return items.filter((p) => new Date(p.anlass_datum) >= from);
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
		const d = new Date(p.anlass_datum);
		const k = monthKey(d);
		let g = map.get(k);
		if (!g) {
			g = {
				key: k,
				label: `${MONTH_LABELS_LONG[d.getMonth()]} ${d.getFullYear()}`,
				count: 0,
				sumActiveCent: 0,
				items: [],
			};
			map.set(k, g);
		}
		g.items.push(p);
		g.count++;
		if (!p.storniert_am) g.sumActiveCent += p.tageseinnahmen_cent;
	}
	return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}
