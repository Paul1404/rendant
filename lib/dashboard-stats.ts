import type { ProtokollRow } from "@/server/services/protokoll";

const MONTH_LABELS_SHORT = [
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

export type MonthlyBucket = {
  key: string;
  year: number;
  month: number;
  label: string;
  longLabel: string;
  count: number;
  sumCent: number;
  isCurrentMonth: boolean;
};

export type DashboardStats = {
  activeCount: number;
  stornoCount: number;
  sumAllTimeCent: number;
  sumYtdCent: number;
  sumThisMonthCent: number;
  sumLastMonthCent: number;
  countThisMonth: number;
  countLastMonth: number;
  monthOverMonthPct: number | null;
  sumLast30Cent: number;
  countLast30: number;
  averagePerProtokollCent: number;
  lastEntryDate: Date | null;
  daysSinceLastEntry: number | null;
  cardShareBp: number | null;
  monthly: MonthlyBucket[];
  topAnlass: { anlass: string; count: number } | null;
};

export function computeDashboardStats(
  items: ProtokollRow[],
  now: Date = new Date(),
): DashboardStats {
  const active = items.filter((p) => !p.storniert_am);
  const storno = items.length - active.length;

  const today = startOfDay(now);
  const thisMonth = startOfMonth(now);
  const lastMonth = new Date(thisMonth);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const yearStart = startOfYear(now);
  const last30Start = addDays(today, -29);

  let sumAll = 0;
  let sumYtd = 0;
  let sumThis = 0;
  let sumPrev = 0;
  let countThis = 0;
  let countPrev = 0;
  let sumLast30 = 0;
  let countLast30 = 0;
  let sumCardable = 0;
  let sumCard = 0;
  let last: Date | null = null;
  const anlassCounts = new Map<string, number>();

  for (const p of active) {
    const d = new Date(p.anlass_datum);
    sumAll += p.tageseinnahmen_cent;
    if (d >= yearStart) sumYtd += p.tageseinnahmen_cent;
    if (d >= thisMonth) {
      sumThis += p.tageseinnahmen_cent;
      countThis++;
    } else if (d >= lastMonth && d < thisMonth) {
      sumPrev += p.tageseinnahmen_cent;
      countPrev++;
    }
    if (d >= last30Start) {
      sumLast30 += p.tageseinnahmen_cent;
      countLast30++;
    }
    if (p.kartenzahlung_cent > 0) {
      sumCardable += p.tageseinnahmen_cent + p.kartenzahlung_cent;
      sumCard += p.kartenzahlung_cent;
    }
    if (!last || d > last) last = d;
    if (p.anlass) {
      const key = p.anlass.trim();
      if (key) anlassCounts.set(key, (anlassCounts.get(key) ?? 0) + 1);
    }
  }

  let topAnlass: { anlass: string; count: number } | null = null;
  for (const [anlass, count] of anlassCounts) {
    if (!topAnlass || count > topAnlass.count) {
      topAnlass = { anlass, count };
    }
  }

  const daysSinceLastEntry = last
    ? Math.max(
        0,
        Math.floor(
          (today.getTime() - startOfDay(last).getTime()) / 86_400_000,
        ),
      )
    : null;

  const monthOverMonthPct =
    sumPrev > 0
      ? Math.round(((sumThis - sumPrev) / sumPrev) * 1000) / 10
      : sumThis > 0
        ? null
        : 0;

  const cardShareBp = sumCardable > 0
    ? Math.round((sumCard / sumCardable) * 10_000)
    : null;

  const monthly = buildMonthlyBuckets(active, now, 12);

  return {
    activeCount: active.length,
    stornoCount: storno,
    sumAllTimeCent: sumAll,
    sumYtdCent: sumYtd,
    sumThisMonthCent: sumThis,
    sumLastMonthCent: sumPrev,
    countThisMonth: countThis,
    countLastMonth: countPrev,
    monthOverMonthPct,
    sumLast30Cent: sumLast30,
    countLast30,
    averagePerProtokollCent:
      active.length > 0 ? Math.round(sumAll / active.length) : 0,
    lastEntryDate: last,
    daysSinceLastEntry,
    cardShareBp,
    monthly,
    topAnlass,
  };
}

function buildMonthlyBuckets(
  active: ProtokollRow[],
  now: Date,
  months: number,
): MonthlyBucket[] {
  const buckets: MonthlyBucket[] = [];
  const nowMonth = startOfMonth(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(nowMonth);
    d.setMonth(d.getMonth() - i);
    buckets.push({
      key: monthKey(d),
      year: d.getFullYear(),
      month: d.getMonth(),
      label: MONTH_LABELS_SHORT[d.getMonth()],
      longLabel: `${MONTH_LABELS_LONG[d.getMonth()]} ${d.getFullYear()}`,
      count: 0,
      sumCent: 0,
      isCurrentMonth: i === 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const p of active) {
    const d = new Date(p.anlass_datum);
    const k = monthKey(d);
    const b = byKey.get(k);
    if (b) {
      b.count++;
      b.sumCent += p.tageseinnahmen_cent;
    }
  }
  return buckets;
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
