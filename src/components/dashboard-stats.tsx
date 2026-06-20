import { useQuery } from "@tanstack/react-query";
import {
	ArrowDownRight,
	ArrowUpRight,
	CreditCard,
	Minus,
	Percent,
	ReceiptText,
	Scale,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { SplitBar } from "@/components/charts/split-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	computeSeries,
	type FinanceContext,
	GRANULARITY_LABELS,
	type Granularity,
	type PeriodStats,
} from "@/lib/finance";
import { formatCent } from "@/lib/money";
import { orpc } from "@/lib/orpc";
import type { ProtokollRow } from "@/lib/protokoll-types";
import { formatUstSatz } from "@/lib/ust";
import { cn } from "@/lib/utils";

type Props = {
	period: PeriodStats;
	context: FinanceContext;
	rangeLabel: string;
	vatRange: { von: string; bis: string };
	items: ProtokollRow[];
};

const GRANULARITIES: Granularity[] = ["day", "week", "month"];
const TREND_TITLE: Record<Granularity, string> = {
	day: "Umsatzverlauf · letzte 30 Tage",
	week: "Umsatzverlauf · letzte 12 Wochen",
	month: "Umsatzverlauf · letzte 12 Monate",
};
const TREND_SUBTITLE: Record<Granularity, string> = {
	day: "Tageseinnahmen inkl. Kartenzahlung je Tag",
	week: "Tageseinnahmen inkl. Kartenzahlung je Woche",
	month: "Tageseinnahmen inkl. Kartenzahlung je Monat",
};

export function FinanceOverview({
	period,
	context,
	rangeLabel,
	vatRange,
	items,
}: Props) {
	const [granularity, setGranularity] = useState<Granularity>("day");
	const series = useMemo(
		() => computeSeries(items, granularity),
		[items, granularity],
	);
	const hasTrend = series.some((p) => p.total > 0);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<KpiCard
					icon={TrendingUp}
					label={`Umsatz · ${rangeLabel}`}
					value={formatCent(period.revenueTotal)}
					hint={
						rangeLabel === "Dieser Monat" ? (
							<MomDelta
								pct={context.momPct}
								thisMonth={context.thisMonthTotal}
								lastMonth={context.lastMonthTotal}
							/>
						) : (
							`${period.count} ${period.count === 1 ? "Beleg" : "Belege"}`
						)
					}
				/>
				<KpiCard
					icon={ReceiptText}
					label="Ausgaben"
					value={formatCent(period.expenses)}
					hint={`${period.count} ${period.count === 1 ? "Beleg" : "Belege"}`}
				/>
				<KpiCard
					icon={Scale}
					label="Netto-Ergebnis"
					value={formatCent(period.net)}
					tone={period.net < 0 ? "negative" : "default"}
					hint="Umsatz abzüglich Ausgaben"
				/>
				<KpiCard
					icon={Sparkles}
					label="Ø je Beleg"
					value={
						period.avgPerProtokoll > 0
							? formatCent(period.avgPerProtokoll)
							: formatCent(0)
					}
					hint={recencyHint(context.lastEntryDays)}
				/>
			</div>

			{hasTrend ? (
				<Card>
					<CardHeader className="pb-2">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
									{TREND_TITLE[granularity]}
								</CardTitle>
								<p className="mt-0.5 text-sm text-muted-foreground">
									{TREND_SUBTITLE[granularity]}
								</p>
							</div>
							<fieldset className="inline-flex items-center rounded-lg border border-border bg-background/60 p-0.5 shadow-sm">
								<legend className="sr-only">Zeitliche Auflösung</legend>
								{GRANULARITIES.map((g) => {
									const active = granularity === g;
									return (
										<button
											key={g}
											type="button"
											aria-pressed={active}
											onClick={() => setGranularity(g)}
											className={cn(
												"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
												active
													? "bg-primary/10 text-primary"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{GRANULARITY_LABELS[g]}
										</button>
									);
								})}
							</fieldset>
						</div>
					</CardHeader>
					<CardContent>
						<RevenueAreaChart points={series} />
					</CardContent>
				</Card>
			) : null}

			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<VatCard vatRange={vatRange} />
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-sm">
							<CreditCard className="h-4 w-4 text-primary" />
							Zahlungsart &amp; Anlässe
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-5">
						<div>
							<p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
								Bar gegen Karte
							</p>
							<SplitBar
								segments={[
									{
										label: "Bar",
										value: period.revenueCashNet,
										tone: "primary",
									},
									{ label: "Karte", value: period.revenueCard, tone: "card" },
								]}
							/>
						</div>
						<div>
							<p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
								Top Anlässe
							</p>
							<BarList
								items={period.topAnlass.map((a) => ({
									label: a.anlass,
									value: a.sum,
									sub: `${a.count} ${a.count === 1 ? "Beleg" : "Belege"}`,
								}))}
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function VatCard({ vatRange }: { vatRange: { von: string; bis: string } }) {
	const vat = useQuery(orpc.reports.vat.queryOptions({ input: vatRange }));

	const revenue = vat.data?.revenue ?? [];
	const expenses = vat.data?.expenses ?? [];
	const ustTotal = revenue.reduce((s, g) => s + g.ust_cent, 0);
	const vorsteuerTotal = expenses.reduce((s, g) => s + g.ust_cent, 0);
	const zahllast = ustTotal - vorsteuerTotal;
	const hasData = revenue.length > 0 || expenses.length > 0;

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Percent className="h-4 w-4 text-primary" />
					Umsatzsteuer
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{vat.isPending ? (
					<div className="space-y-2" aria-hidden>
						<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
						<div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
						<div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
					</div>
				) : hasData ? (
					<>
						{revenue.length > 0 ? (
							<div>
								<p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
									USt. auf Umsatz
								</p>
								<BarList
									items={revenue.map((g) => ({
										label: formatUstSatz(g.bp),
										value: g.ust_cent,
										sub: `Netto ${formatCent(g.netto_cent)} · Brutto ${formatCent(g.brutto_cent)}`,
									}))}
								/>
							</div>
						) : null}
						<div className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-sm">
							<SummaryRow label="Umsatzsteuer" value={ustTotal} />
							<SummaryRow label="Vorsteuer (Ausgaben)" value={vorsteuerTotal} />
							<div className="border-border/60 border-t pt-1.5">
								<SummaryRow label="Zahllast" value={zahllast} bold />
							</div>
						</div>
					</>
				) : (
					<p className="py-4 text-center text-sm text-muted-foreground">
						Keine USt.-Angaben in diesem Zeitraum.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

function SummaryRow({
	label,
	value,
	bold,
}: {
	label: string;
	value: number;
	bold?: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className={cn(bold ? "font-medium" : "text-muted-foreground")}>
				{label}
			</span>
			<span
				className={cn(
					"font-mono tabular-nums",
					bold ? "font-semibold text-foreground" : "text-foreground",
				)}
			>
				{formatCent(value)}
			</span>
		</div>
	);
}

function KpiCard({
	icon: Icon,
	label,
	value,
	hint,
	tone = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	hint?: React.ReactNode;
	tone?: "default" | "negative";
}) {
	return (
		<div className="lift group relative overflow-hidden rounded-2xl border border-border bg-card/70 p-4 shadow-sm ring-1 ring-foreground/5 hover:border-border/100 hover:bg-card hover:shadow-md">
			<div className="flex items-center justify-between gap-2">
				<p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
					{label}
				</p>
				<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary/80">
					<Icon className="h-3.5 w-3.5" />
				</span>
			</div>
			<p
				className={cn(
					"mt-2 font-mono text-lg font-semibold tabular-nums tracking-tight sm:text-[1.35rem]",
					tone === "negative" ? "text-destructive" : "text-foreground",
				)}
			>
				{renderKpiValue(value)}
			</p>
			{hint ? (
				<div className="mt-1 text-xs text-muted-foreground">{hint}</div>
			) : null}
		</div>
	);
}

// Keep the numeric amount on one line so it never breaks mid-number on narrow
// cards; only the trailing currency suffix may wrap to a second line.
function renderKpiValue(value: string): React.ReactNode {
	const match = value.match(/^(.*?)(\s+EUR)$/);
	if (!match) return value;
	return (
		<>
			<span className="whitespace-nowrap">{match[1]}</span>
			<span className="whitespace-nowrap"> EUR</span>
		</>
	);
}

function MomDelta({
	pct,
	thisMonth,
	lastMonth,
}: {
	pct: number | null;
	thisMonth: number;
	lastMonth: number;
}) {
	if (pct === null) {
		if (lastMonth === 0 && thisMonth === 0) return <span>kein Vormonat</span>;
		return <span>Vormonat ohne Umsatz</span>;
	}
	if (pct === 0) {
		return (
			<span className="inline-flex items-center gap-1">
				<Minus className="h-3 w-3" />
				unverändert ggü. Vormonat
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
			{pct.toLocaleString("de-DE", { maximumFractionDigits: 1 })} % ggü.
			Vormonat
		</span>
	);
}

function recencyHint(days: number | null): string {
	if (days === null) return "Noch kein Eintrag";
	if (days === 0) return "Letzter Eintrag heute";
	if (days === 1) return "Letzter Eintrag gestern";
	return `Letzter Eintrag vor ${days} Tagen`;
}
