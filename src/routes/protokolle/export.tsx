import { createFileRoute } from "@tanstack/react-router";
import { ExportForm } from "@/components/export-form";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/protokolle/export")({
	component: ExportPage,
});

function ExportPage() {
	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Buchhaltung"
				title="CSV-Export"
				description="Export aller Protokolle eines Zeitraums für Steuerberater oder DATEV. Trenner ist Semikolon, Beträge mit Dezimalkomma."
			/>
			<div className="mx-auto max-w-2xl">
				<ExportForm />
			</div>
		</div>
	);
}
