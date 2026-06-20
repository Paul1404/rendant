import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Receipt, SearchX } from "lucide-react";
import { FinanceOverview } from "@/components/dashboard-stats";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { PageHeader } from "@/components/page-header";
import { ProtokollList } from "@/components/protokoll-list";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import {
	filterByRange,
	filterBySearch,
	parseTimeRange,
	type TimeRange,
} from "@/lib/dashboard-stats";
import {
	computeContext,
	computePeriod,
	RANGE_LABELS,
	rangeToDates,
} from "@/lib/finance";
import { orpc } from "@/lib/orpc";

type ProtokolleSearch = {
	q?: string;
	range?: TimeRange;
	storno?: boolean;
};

const listQueryOptions = orpc.protokolle.list.queryOptions({
	input: { includeStorniert: true },
});

export const Route = createFileRoute("/protokolle/")({
	validateSearch: (search: Record<string, unknown>): ProtokolleSearch => {
		const range = parseTimeRange(
			typeof search.range === "string" ? search.range : undefined,
		);
		return {
			q: typeof search.q === "string" && search.q ? search.q : undefined,
			range: range === "all" ? undefined : range,
			storno:
				search.storno === true || search.storno === "true" ? true : undefined,
		};
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(listQueryOptions),
	component: ProtokolleListPage,
});

function ProtokolleListPage() {
	const search = Route.useSearch();
	const { data: all } = useSuspenseQuery(listQueryOptions);

	const includeStorniert = search.storno === true;
	const timeRange: TimeRange = search.range ?? "all";
	const query = (search.q ?? "").trim();

	const allActive = all.filter((p) => !p.storniert_am);
	const periodActive = filterByRange(allActive, timeRange);
	const period = computePeriod(periodActive);
	const context = computeContext(allActive);
	const vatRange = rangeToDates(timeRange);

	const visibleScope = includeStorniert
		? all
		: all.filter((p) => !p.storniert_am);
	const ranged = filterByRange(visibleScope, timeRange);
	const items = filterBySearch(ranged, query);

	const hasAnyData = all.length > 0;
	const hasFilters = !!query || timeRange !== "all" || includeStorniert;
	const visibleSumCent = items
		.filter((p) => !p.storniert_am)
		.reduce((s, p) => s + p.tageseinnahmen_cent, 0);

	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Kassenzählprotokolle"
				description="Übersicht der erfassten Belege. Neue Protokolle anlegen und Auswertungen exportieren."
				actions={
					<Link to="/protokolle/neu">
						<Button size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Neues Protokoll
						</Button>
					</Link>
				}
			/>

			{hasAnyData ? (
				<FinanceOverview
					period={period}
					context={context}
					rangeLabel={RANGE_LABELS[timeRange]}
					vatRange={vatRange}
					items={allActive}
				/>
			) : null}

			{hasAnyData ? (
				<div className="space-y-4">
					<DashboardToolbar
						initialQuery={query}
						initialRange={timeRange}
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
								className="text-muted-foreground transition-colors hover:text-foreground"
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
		<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
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
			<Link to="/protokolle/neu" className="mt-2">
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" />
					Neues Protokoll
				</Button>
			</Link>
		</div>
	);
}

function NoResults({ hasFilters }: { hasFilters: boolean }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
			<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<SearchX className="h-5 w-5" />
			</div>
			<h3 className="text-sm font-semibold text-foreground">Keine Treffer</h3>
			<p className="max-w-sm text-xs text-muted-foreground">
				{hasFilters
					? "Mit den aktuellen Filtern wurden keine Belege gefunden."
					: "Es sind keine Belege vorhanden."}
			</p>
			{hasFilters ? (
				<Link to="/protokolle" className="mt-1">
					<Button variant="outline" size="sm">
						Filter zurücksetzen
					</Button>
				</Link>
			) : null}
		</div>
	);
}
