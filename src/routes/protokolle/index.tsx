import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Receipt, SearchX } from "lucide-react";
import { FinanceOverview } from "@/components/dashboard-stats";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { PageHeader } from "@/components/page-header";
import { ProtokollList } from "@/components/protokoll-list";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import {
	availableYears,
	filterByRange,
	filterBySearch,
	filterByYear,
	parseDateWindow,
	parseTimeRange,
	type TimeRange,
} from "@/lib/dashboard-stats";
import {
	computeContext,
	computePeriod,
	type Granularity,
	RANGE_LABELS,
	rangeToDates,
	revenueOf,
} from "@/lib/finance";
import { orpc } from "@/lib/orpc";

type ProtokolleSearch = {
	q?: string;
	range?: TimeRange;
	storno?: boolean;
	jahr?: number;
	von?: string;
	bis?: string;
	chart?: Granularity;
};

const listQueryOptions = orpc.protokolle.list.queryOptions({
	input: { includeStorniert: true },
	refetchInterval: 15_000,
	refetchIntervalInBackground: false,
	refetchOnWindowFocus: "always",
});

const historicalRevenueQueryOptions = orpc.historicalRevenue.list.queryOptions({
	refetchInterval: 15_000,
	refetchIntervalInBackground: false,
	refetchOnWindowFocus: "always",
});

export const Route = createFileRoute("/protokolle/")({
	validateSearch: (search: Record<string, unknown>): ProtokolleSearch => {
		const drilldown = parseDateWindow(search.von, search.bis);
		const range =
			typeof search.range === "string"
				? parseTimeRange(search.range)
				: undefined;
		return {
			q: typeof search.q === "string" && search.q ? search.q : undefined,
			range,
			storno:
				search.storno === true || search.storno === "true" ? true : undefined,
			jahr:
				typeof search.jahr === "string" && /^\d{4}$/.test(search.jahr)
					? Number(search.jahr)
					: typeof search.jahr === "number" && Number.isInteger(search.jahr)
						? search.jahr
						: undefined,
			von: drilldown?.von,
			bis: drilldown?.bis,
			chart:
				search.chart === "day" ||
				search.chart === "week" ||
				search.chart === "month"
					? search.chart
					: undefined,
		};
	},
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(listQueryOptions),
			context.queryClient.ensureQueryData(historicalRevenueQueryOptions),
		]),
	component: ProtokolleListPage,
});

function ProtokolleListPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/protokolle/" });
	const { data: all } = useSuspenseQuery(listQueryOptions);
	const { data: historical } = useSuspenseQuery(historicalRevenueQueryOptions);

	const includeStorniert = search.storno === true;
	const timeRange: TimeRange = search.range ?? "year";
	const selectedYear = search.jahr;
	const query = (search.q ?? "").trim();
	const selectedDrilldown = parseDateWindow(search.von, search.bis);

	const allActive = all.filter((p) => !p.storniert_am);
	const historicalActive = historical.filter((item) => !item.storniert_am);
	const periodActive = filterByYear(
		filterByRange(allActive, timeRange),
		selectedYear,
	);
	const periodHistorical = filterByYear(
		filterByRange(historicalActive, timeRange),
		selectedYear,
	);
	const period = computePeriod(periodActive, periodHistorical);
	const context = computeContext(allActive, new Date(), historicalActive);
	const vatRange = selectedYear
		? { von: `${selectedYear}-01-01`, bis: `${selectedYear}-12-31` }
		: rangeToDates(timeRange);
	const years = availableYears([...allActive, ...historicalActive]);

	const visibleScope = includeStorniert
		? all
		: all.filter((p) => !p.storniert_am);
	const ranged = filterByYear(
		filterByRange(visibleScope, timeRange),
		selectedYear,
	);
	const items = filterBySearch(ranged, query);

	const hasAnyData = all.length > 0 || historical.length > 0;
	const hasFilters =
		!!query || timeRange !== "year" || includeStorniert || !!selectedYear;
	const visibleSumCent = items
		.filter((p) => !p.storniert_am)
		.reduce((s, p) => s + revenueOf(p), 0);

	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Kassenzählprotokolle"
				description="Übersicht der erfassten Belege. Neue Protokolle anlegen und Auswertungen exportieren."
				actions={
					<Button asChild size="sm">
						<Link to="/protokolle/neu">
							<Plus className="mr-2 h-4 w-4" />
							Neues Protokoll
						</Link>
					</Button>
				}
			/>

			{hasAnyData ? (
				<FinanceOverview
					key={`${selectedYear ?? timeRange}-${search.chart ?? "default"}`}
					period={period}
					context={context}
					rangeLabel={
						selectedYear ? `Jahr ${selectedYear}` : RANGE_LABELS[timeRange]
					}
					vatRange={vatRange}
					items={periodActive}
					historicalItems={periodHistorical}
					seriesNow={
						selectedYear ? new Date(selectedYear, 11, 31, 12) : new Date()
					}
					initialGranularity={
						search.chart ??
						(selectedYear || timeRange === "year" ? "month" : "day")
					}
					selectedDrilldown={selectedDrilldown}
					onChartChange={(granularity, window) => {
						navigate({
							replace: true,
							resetScroll: false,
							search: (previous) => ({
								...previous,
								chart: granularity,
								von: window?.von,
								bis: window?.bis,
							}),
						});
					}}
				/>
			) : null}

			{hasAnyData ? (
				<div className="space-y-4">
					<DashboardToolbar
						initialQuery={query}
						initialRange={timeRange}
						selectedYear={selectedYear}
						availableYears={years}
						includeStorniert={includeStorniert}
					/>

					<div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
						<span>
							{items.length === 0
								? "Keine Treffer"
								: `${items.length} ${items.length === 1 ? "Eintrag" : "Einträge"}`}
							{items.length > 0 ? (
								<>
									<span className="mx-1.5 text-muted-foreground/40">·</span>
									<span className="tabular-nums">
										Summe aktiv:{" "}
										<Money cent={visibleSumCent} className="text-xs" />
									</span>
								</>
							) : null}
						</span>
						{hasFilters ? (
							<Link
								to="/protokolle"
								className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-background px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
							>
								Filter zurücksetzen
							</Link>
						) : null}
					</div>

					{items.length === 0 ? (
						<NoResults hasFilters={hasFilters} />
					) : (
						<ProtokollList items={items} />
					)}
				</div>
			) : (
				<EmptyState />
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<Receipt className="h-6 w-6" />
			</div>
			<h2 className="text-base font-semibold text-foreground">
				Noch keine Protokolle
			</h2>
			<p className="max-w-sm text-sm text-muted-foreground">
				Lege das erste Kassenzählprotokoll an, um Kassenbestand und
				Tageseinnahmen zu erfassen.
			</p>
			<Button asChild size="sm" className="mt-2">
				<Link to="/protokolle/neu">
					<Plus className="mr-2 h-4 w-4" />
					Neues Protokoll
				</Link>
			</Button>
		</div>
	);
}

function NoResults({ hasFilters }: { hasFilters: boolean }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
			<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<SearchX className="h-5 w-5" />
			</div>
			<h3 className="text-sm font-semibold text-foreground">
				Keine Kassenzählprotokolle
			</h3>
			<p className="max-w-sm text-xs text-muted-foreground">
				{hasFilters
					? "Mit den aktuellen Filtern wurden keine Kassenzählprotokolle gefunden."
					: "Hier stehen nur Kassenzählprotokolle. Die Kennzahlen oben enthalten zusätzlich erfasste Altunterlagen."}
			</p>
			{hasFilters ? (
				<Button asChild variant="outline" size="sm" className="mt-1">
					<Link to="/protokolle">Filter zurücksetzen</Link>
				</Button>
			) : null}
		</div>
	);
}
