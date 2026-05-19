import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Minus,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatCent } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DashboardStats, MonthlyBucket } from "@/lib/dashboard-stats";

type Props = {
  stats: DashboardStats;
};

export function DashboardStatsRow({ stats }: Props) {
  const daysHint = (() => {
    if (stats.daysSinceLastEntry === null) return "Noch kein Eintrag";
    if (stats.daysSinceLastEntry === 0) return "Heute";
    if (stats.daysSinceLastEntry === 1) return "Gestern";
    return `vor ${stats.daysSinceLastEntry} Tagen`;
  })();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          label="Diesen Monat"
          value={formatCent(stats.sumThisMonthCent)}
          mono
          hint={
            <DeltaHint
              pct={stats.monthOverMonthPct}
              countThis={stats.countThisMonth}
              sumPrev={stats.sumLastMonthCent}
            />
          }
        />
        <KpiCard
          icon={CalendarClock}
          label="Letzte 30 Tage"
          value={formatCent(stats.sumLast30Cent)}
          mono
          hint={
            stats.countLast30 > 0
              ? `${stats.countLast30} ${stats.countLast30 === 1 ? "Beleg" : "Belege"}`
              : "keine Belege"
          }
        />
        <KpiCard
          icon={Wallet}
          label="Jahr (YTD)"
          value={formatCent(stats.sumYtdCent)}
          mono
          hint={
            stats.activeCount > 0
              ? `${stats.activeCount} aktive Belege gesamt`
              : "keine aktiven Belege"
          }
        />
        <KpiCard
          icon={Sparkles}
          label="Ø je Beleg"
          value={
            stats.averagePerProtokollCent > 0
              ? formatCent(stats.averagePerProtokollCent)
              : "—"
          }
          mono
          hint={daysHint}
        />
      </div>

      {stats.monthly.some((m) => m.sumCent > 0) ? (
        <TrendCard
          monthly={stats.monthly}
          cardShareBp={stats.cardShareBp}
          topAnlass={stats.topAnlass}
          stornoCount={stats.stornoCount}
        />
      ) : null}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/70 p-4 shadow-sm ring-1 ring-foreground/5 transition-colors hover:border-border/100 hover:bg-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary/80">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-[1.35rem]",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </p>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function DeltaHint({
  pct,
  countThis,
  sumPrev,
}: {
  pct: number | null;
  countThis: number;
  sumPrev: number;
}) {
  if (pct === null) {
    if (sumPrev === 0 && countThis === 0) return <span>kein Vormonat</span>;
    return <span>Vormonat ohne Einnahmen</span>;
  }
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <Minus className="h-3 w-3" />
        unverändert zum Vormonat
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        up ? "text-success" : "text-destructive",
      )}
    >
      {up ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {up ? "+" : ""}
      {pct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}% zum Vormonat
    </span>
  );
}

function TrendCard({
  monthly,
  cardShareBp,
  topAnlass,
  stornoCount,
}: {
  monthly: MonthlyBucket[];
  cardShareBp: number | null;
  topAnlass: { anlass: string; count: number } | null;
  stornoCount: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 shadow-sm ring-1 ring-foreground/5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Verlauf · letzte 12 Monate
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tageseinnahmen je Monat (nur aktive Belege)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {cardShareBp !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Kartenanteil&nbsp;
              <span className="font-medium text-foreground tabular-nums">
                {(cardShareBp / 100).toLocaleString("de-DE", {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            </span>
          ) : null}
          {topAnlass ? (
            <span className="inline-flex items-center gap-1.5">
              Häufigster Anlass:&nbsp;
              <span className="max-w-[12rem] truncate font-medium text-foreground">
                {topAnlass.anlass}
              </span>
              <span className="tabular-nums text-muted-foreground/80">
                ({topAnlass.count}x)
              </span>
            </span>
          ) : null}
          {stornoCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              Stornos:&nbsp;
              <span className="font-medium text-foreground tabular-nums">
                {stornoCount}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <MiniBarChart monthly={monthly} />
    </div>
  );
}

function MiniBarChart({ monthly }: { monthly: MonthlyBucket[] }) {
  const max = Math.max(1, ...monthly.map((m) => m.sumCent));
  return (
    <div className="mt-4">
      <div className="flex items-end gap-1.5 sm:gap-2" aria-hidden>
        {monthly.map((m) => {
          const heightPct = (m.sumCent / max) * 100;
          const minVisible = m.sumCent > 0 ? Math.max(heightPct, 4) : 0;
          return (
            <div
              key={m.key}
              className="group/bar relative flex flex-1 flex-col items-stretch"
            >
              <div className="relative h-24 sm:h-28">
                <div className="absolute inset-x-0 bottom-0 top-0 rounded-md bg-muted/40" />
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 rounded-md transition-colors",
                    m.isCurrentMonth
                      ? "bg-primary/80 group-hover/bar:bg-primary"
                      : "bg-primary/30 group-hover/bar:bg-primary/55",
                  )}
                  style={{ height: `${minVisible}%` }}
                />
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover/bar:opacity-100"
                >
                  <span className="font-mono tabular-nums">
                    {formatCent(m.sumCent)}
                  </span>
                  <span className="ml-1.5 text-muted-foreground">
                    · {m.count}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  "mt-1.5 text-center text-[10px] uppercase tracking-wider",
                  m.isCurrentMonth
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground/80",
                )}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="sr-only">
        {monthly.map((m) => (
          <li key={m.key}>
            {m.longLabel}: {formatCent(m.sumCent)} ({m.count} Belege)
          </li>
        ))}
      </ul>
    </div>
  );
}
