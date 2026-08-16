import { createFileRoute } from "@tanstack/react-router";
import { HelperHoursPage } from "@/components/helper-hours-page";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/protokolle/helferstunden")({
	head: () => ({ meta: [{ title: "Helferstunden · Rendant" }] }),
	component: Page,
});
function Page() {
	const { user } = Route.useRouteContext();
	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Vereinsarbeit"
				title="Helferstunden"
				description="Helfereinsätze schnell erfassen, nachvollziehen und aus der bisherigen Excel-Liste übernehmen."
			/>
			<HelperHoursPage isAdmin={user.role === "admin"} />
		</div>
	);
}
