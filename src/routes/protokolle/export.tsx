import { createFileRoute } from "@tanstack/react-router";
import { ExportForm } from "@/components/export-form";
import { HistoricalRevenueImport } from "@/components/historical-revenue-import";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/protokolle/export")({
	head: () => ({ meta: [{ title: "Import & Export · Rendant" }] }),
	component: ExportPage,
});

function ExportPage() {
	const { user } = Route.useRouteContext();
	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Import & Export"
				description={
					user.role === "admin"
						? "Historische Umsätze aus Excel übernehmen sowie Belege, Auswertungen und Sicherungen herunterladen."
						: "Belege, Auswertungen und Sicherungen herunterladen."
				}
			/>
			<div className="mx-auto max-w-4xl space-y-8">
				{user.role === "admin" ? <HistoricalRevenueImport /> : null}
				<ExportForm isAdmin={user.role === "admin"} />
			</div>
		</div>
	);
}
