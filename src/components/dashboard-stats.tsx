import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowDownRight,
	ArrowUpRight,
	CalendarDays,
	CreditCard,
	History,
	ListChecks,
	Minus,
	Percent,
	ReceiptText,
	TrendingUp,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { SplitBar } from "@/components/charts/split-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { FieldLabel } from "@/components/ui/section";
import { type DateWindow, filterByDateWindow } from "@/lib/dashboard-stats";
import { formatDateDe } from "@/lib/date";
import {
	computeSeries,
	type FinanceContext,
	GRANULARITY_LABELS,
	type Granularity,
	type HistoricalRevenueLike,
	type PeriodStats,
	revenueOf,
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
	historicalItems: HistoricalRevenueLike[];
	seriesNow: Date;
	initialGranularity: Granularity;
	selectedDrilldown?: DateWindow;
	onChartChange: (
		granularity: Granularity,
		window: DateWindow | undefined,
	) => void;
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
	historicalItems,
	seriesNow,
	initialGranularity,
	selectedDrilldown,
	onChartChange,
}: Props) {
	const [granularity, setGranularity] =
		useState<Granularity>(initialGranularity);
	const series = useMemo(
		() => computeSeries(items, granularity, seriesNow, historicalItems),
		[items, historicalItems, granularity, seriesNow],
	);
	const hasTrend = series.some((p) => p.total > 0);
	const drilldownProtocols = useMemo(
		() => filterByDateWindow(items, selectedDrilldown),
		[items, selectedDrilldown],
	);
	const drilldownHistorical = useMemo(
		() => filterByDateWindow(historicalItems, selectedDrilldown),
		[historicalItems, selectedDrilldown],
	);
	const selectedPoint = selectedDrilldown
		? series.find(
				(point) =>
					point.from === selectedDrilldown.von &&
					point.to === selectedDrilldown.bis,
			)
		: undefined;

	return (
		<div className="space-y-8">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<KpiCard
					icon={TrendingUp}
					variant="hero"
					label={`Umsatz · ${rangeLabel}`}
					cent={period.revenueTotal}
					hint={
						rangeLabel === "Dieser Monat" ? (
							<MomDelta
								pct={context.momPct}
								thisMonth={context.thisMonthTotal}
								lastMonth={context.lastMonthTotal}
							/>
						) : (
							`${period.count} ${period.count === 1 ? "Eintrag" : "Einträge"}`
						)
					}
				/>
				<KpiCard
					icon={ReceiptText}
					label="Ausgaben"
					cent={period.expenses}
					hint={`${period.count} ${period.count === 1 ? "Eintrag" : "Einträge"}`}
				/>
				<KpiCard
					icon={CreditCard}
					label="Kartenzahlungen"
					cent={period.revenueCard}
					hint={
						period.cardSharePct === null
							? "Keine Zahlungsart erfasst"
							: `${period.cardSharePct.toLocaleString("de-DE", { maximumFractionDigits: 1 })} % des Umsatzes mit bekannter Zahlungsart`
					}
				/>
				<KpiCard
					icon={ListChecks}
					label="Einträge"
					value={period.count.toLocaleString("de-DE")}
					hint={recencyHint(context.lastEntryDays)}
				/>
			</div>

			{hasTrend ? (
				<Card>
					<CardHeader className="pb-2">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="space-y-1">
								<FieldLabel>{TREND_TITLE[granularity]}</FieldLabel>
								<p className="text-sm text-muted-foreground">
									{TREND_SUBTITLE[granularity]}
								</p>
							</div>
							<fieldset className="inline-flex items-center rounded-lg border border-border/60 bg-background/60 p-0.5 shadow-sm">
								<legend className="sr-only">Zeitliche Auflösung</legend>
								{GRANULARITIES.map((g) => {
									const active = granularity === g;
									return (
										<button
											key={g}
											type="button"
											aria-pressed={active}
											onClick={() => {
												setGranularity(g);
												onChartChange(g, undefined);
											}}
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
						<RevenueAreaChart
							points={series}
							selected={selectedDrilldown}
							onSelect={(window) => onChartChange(granularity, window)}
						/>
						{selectedDrilldown ? (
							<RevenueDrilldown
								label={
									selectedPoint?.longLabel ??
									formatDateWindow(selectedDrilldown)
								}
								protocols={drilldownProtocols}
								historical={drilldownHistorical}
								onClear={() => onChartChange(granularity, undefined)}
							/>
						) : null}
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
						<div className="space-y-2">
							<FieldLabel>Bar gegen Karte</FieldLabel>
							<SplitBar
								segments={[
									{
										label: "Bar",
										value: period.revenueCashNet,
										tone: "primary",
									},
									{ label: "Karte", value: period.revenueCard, tone: "card" },
									{
										label: "Historisch, Zahlungsart unbekannt",
										value: period.revenueHistorical,
										tone: "muted",
									},
								]}
							/>
						</div>
						<div className="space-y-2">
							<FieldLabel>Top Veranstaltungen</FieldLabel>
							<BarList
								items={period.topAnlass.map((a) => ({
									label: a.anlass,
									value: a.sum,
									sub: `${a.count} ${a.count === 1 ? "Beleg" : "Belege"}`,
								}))}
							/>
						</div>
						<div className="border-border/60 border-t pt-3">
							<SummaryRow
								label="Umsatz abzüglich erfasster Ausgaben"
								value={period.net}
								bold
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function formatDateWindow(window: DateWindow): string {
	if (window.von === window.bis) return formatDateDe(window.von);
	return `${formatDateDe(window.von)} bis ${formatDateDe(window.bis)}`;
}

function RevenueDrilldown({
	label,
	protocols,
	historical,
	onClear,
}: {
	label: string;
	protocols: ProtokollRow[];
	historical: HistoricalRevenueLike[];
	onClear: () => void;
}) {
	const rows = [
		...protocols.map((item) => ({
			key: `protocol-${item.id}`,
			source: "protocol" as const,
			id: item.id,
			date: item.anlass_datum,
			label: item.anlass,
			reference: item.belegnummer,
			revenue: revenueOf(item),
		})),
		...historical.map((item, index) => ({
			key: `historical-${item.id ?? `${item.anlass_datum}-${index}`}`,
			source: "historical" as const,
			id: undefined,
			date: item.anlass_datum,
			label: item.anlass,
			reference: item.quellreferenz?.trim() || "Altunterlage",
			revenue: item.umsatz_cent,
		})),
	].sort(
		(a, b) =>
			b.date.localeCompare(a.date) ||
			b.revenue - a.revenue ||
			a.label.localeCompare(b.label, "de"),
	);
	const total = rows.reduce((sum, row) => sum + row.revenue, 0);

	return (
		<section
			aria-labelledby="revenue-drilldown-heading"
			className="mt-4 border-border/60 border-t pt-4"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<CalendarDays className="h-4 w-4 text-primary" />
						<h3 id="revenue-drilldown-heading" className="font-medium">
							Auswahl: {label}
						</h3>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}
						<span className="mx-1.5 text-muted-foreground/40">·</span>
						<Money cent={total} className="text-xs text-foreground" />
					</p>
				</div>
				<Button type="button" variant="ghost" size="sm" onClick={onClear}>
					<X className="mr-1 h-3.5 w-3.5" />
					Auswahl aufheben
				</Button>
			</div>

			{rows.length > 0 ? (
				<ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
					{rows.map((row) => (
						<li
							key={row.key}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5"
						>
							<div className="min-w-0">
								<div className="flex min-w-0 items-center gap-2">
									{row.source === "historical" ? (
										<History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									) : (
										<ReceiptText className="h-3.5 w-3.5 shrink-0 text-primary" />
									)}
									<span className="truncate font-medium">{row.label}</span>
								</div>
								<p className="mt-0.5 truncate pl-5.5 text-xs text-muted-foreground">
									{formatDateDe(row.date)} · {row.reference}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Money cent={row.revenue} emphasis />
								{row.source === "protocol" && row.id ? (
									<Button asChild variant="ghost" size="sm">
										<Link to="/protokolle/$id" params={{ id: row.id }}>
											Anzeigen
										</Link>
									</Button>
								) : null}
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
					Keine Einträge in diesem Zeitraum.
				</p>
			)}
		</section>
	);
}

function VatCard({ vatRange }: { vatRange: { von: string; bis: string } }) {
	const vat = useQuery(
		orpc.reports.vat.queryOptions({
			input: vatRange,
			refetchInterval: 15_000,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: "always",
		}),
	);

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
				<p className="text-xs text-muted-foreground">
					Nur Kassenzählprotokolle mit USt.-Aufteilung
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{vat.isPending ? (
					<div className="space-y-2" aria-hidden>
						<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
						<div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
						<div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
					</div>
				) : vat.isError ? (
					<div className="space-y-2 py-3 text-center" role="alert">
						<p className="text-sm font-medium text-destructive">
							Umsatzsteuerdaten konnten nicht geladen werden.
						</p>
						<Button variant="outline" size="sm" onClick={() => vat.refetch()}>
							Erneut versuchen
						</Button>
					</div>
				) : hasData ? (
					<>
						{revenue.length > 0 ? (
							<div className="space-y-2">
								<FieldLabel>USt. auf Umsatz</FieldLabel>
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
			<Money cent={value} emphasis={bold} />
		</div>
	);
}

function KpiCard({
	icon: Icon,
	label,
	cent,
	value,
	hint,
	tone = "default",
	variant = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	cent?: number;
	value?: React.ReactNode;
	hint?: React.ReactNode;
	tone?: "default" | "negative";
	variant?: "default" | "hero";
}) {
	const hero = variant === "hero";
	const valueTone =
		tone === "negative" ? "negative" : hero ? "primary" : "default";
	return (
		<Card variant={hero ? "hero" : "default"} className="lift gap-0 py-4">
			<CardContent>
				<div className="flex items-center justify-between gap-2">
					<FieldLabel className={cn("truncate", hero && "text-primary/80")}>
						{label}
					</FieldLabel>
					<span
						className={cn(
							"inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
							hero
								? "bg-primary/15 text-primary"
								: "bg-primary/8 text-primary/80",
						)}
					>
						<Icon className="h-3.5 w-3.5" />
					</span>
				</div>
				{value !== undefined ? (
					<span
						className={cn(
							"mt-2 block font-mono font-semibold tracking-tight tabular-nums",
							hero ? "text-primary" : "text-foreground",
							hero
								? "text-[clamp(0.9rem,4.2vw,1.7rem)] sm:text-[1.7rem]"
								: "text-[clamp(0.85rem,3.6vw,1.35rem)] sm:text-[1.35rem]",
						)}
					>
						{value}
					</span>
				) : (
					<Money
						cent={cent ?? 0}
						tone={valueTone}
						emphasis
						className={cn(
							"mt-2 block tracking-tight",
							// On narrow mobile the card is half the viewport and clips the
							// no-wrap figure. Scale the value down with the card width and
							// pin it to the original fixed size from the sm breakpoint up.
							hero
								? "text-[clamp(0.9rem,4.2vw,1.7rem)] sm:text-[1.7rem]"
								: "text-[clamp(0.85rem,3.6vw,1.35rem)] sm:text-[1.35rem]",
						)}
					/>
				)}
				{hint ? (
					<div className="mt-1 text-xs text-muted-foreground">{hint}</div>
				) : null}
			</CardContent>
		</Card>
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
