import { createFileRoute, redirect } from "@tanstack/react-router";
import { ExportForm } from "@/components/export-form";
import { HistoricalRevenueImport } from "@/components/historical-revenue-import";
import { PageHeader } from "@/components/page-header";
import { canOpenExportPage } from "@/lib/navigation";
import {
	firstClubPath,
	hasEveryPermission,
	hasPermission,
} from "@/lib/permissions";

export const Route = createFileRoute("/protokolle/export")({
	beforeLoad: ({ context }) => {
		if (!canOpenExportPage(context.user))
			throw redirect({ to: firstClubPath(context.user) });
	},
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
					hasPermission(user, "imports.manage")
						? "Historische Zählprotokolle oder einzelne Altumsätze prüfen und übernehmen sowie Belege, Auswertungen und Sicherungen herunterladen."
						: "Belege, Auswertungen und Sicherungen herunterladen."
				}
			/>
			<div className="mx-auto max-w-4xl space-y-8">
				{hasPermission(user, "imports.manage") ? (
					<HistoricalRevenueImport />
				) : null}
				<ExportForm
					canDownload={hasEveryPermission(
						user,
						"exports.download",
						"finance.read",
					)}
					isAdmin={hasPermission(user, "exports.archive")}
				/>
			</div>
		</div>
	);
}
