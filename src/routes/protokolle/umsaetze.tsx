import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HistoricalRevenueOverview } from "@/components/historical-revenue-overview";
import { PageHeader } from "@/components/page-header";
import { orpc } from "@/lib/orpc";

const historicalQueryOptions = orpc.historicalRevenue.list.queryOptions({
	refetchInterval: 15_000,
	refetchIntervalInBackground: false,
	refetchOnWindowFocus: "always",
});

const protocolsQueryOptions = orpc.protokolle.list.queryOptions({
	input: { includeStorniert: true },
	refetchInterval: 15_000,
	refetchIntervalInBackground: false,
	refetchOnWindowFocus: "always",
});

const anlassKatalogQueryOptions = orpc.anlassKatalog.list.queryOptions({
	refetchOnWindowFocus: "always",
});

export const Route = createFileRoute("/protokolle/umsaetze")({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(historicalQueryOptions),
			context.queryClient.ensureQueryData(protocolsQueryOptions),
			context.queryClient.ensureQueryData(anlassKatalogQueryOptions),
		]);
	},
	head: () => ({ meta: [{ title: "Umsätze im Vergleich · Rendant" }] }),
	component: RevenueComparisonPage,
});

function RevenueComparisonPage() {
	const { data: historical } = useSuspenseQuery(historicalQueryOptions);
	const { data: protocols } = useSuspenseQuery(protocolsQueryOptions);
	const { data: anlassKatalog } = useSuspenseQuery(anlassKatalogQueryOptions);
	const { user } = Route.useRouteContext();
	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Auswertung"
				title="Umsätze im Vergleich"
				description="Vergleiche Veranstaltungen über mehrere Jahre und ergänze Umsätze aus der Zeit vor Rendant."
			/>
			<HistoricalRevenueOverview
				initialHistorical={historical}
				protocols={protocols}
				anlassKatalog={anlassKatalog}
				canCreate={user.role === "admin"}
			/>
		</div>
	);
}
