import { createFileRoute } from "@tanstack/react-router";
import { ExportForm } from "@/components/export-form";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/protokolle/export")({
	head: () => ({ meta: [{ title: "Export & Auswertungen · SVUFO" }] }),
	component: ExportPage,
});

function ExportPage() {
	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Buchhaltung"
				title="Export & Auswertungen"
				description="Belege, USt-Auswertung und Backup eines Zeitraums herunterladen. Ein Zeitraum gilt für alle Exporte."
			/>
			<div className="mx-auto max-w-4xl">
				<ExportForm />
			</div>
		</div>
	);
}
