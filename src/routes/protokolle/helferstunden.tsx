import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HelperHoursPage } from "@/components/helper-hours-page";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/protokolle/helferstunden")({
	validateSearch: (
		search: Record<string, unknown>,
	): { jahr?: number | "alle" } => {
		if (search.jahr === "alle") return { jahr: "alle" };
		const year =
			typeof search.jahr === "string" && /^\d{4}$/.test(search.jahr)
				? Number(search.jahr)
				: search.jahr;
		return {
			jahr:
				typeof year === "number" &&
				Number.isInteger(year) &&
				year >= 2000 &&
				year <= 2100
					? year
					: undefined,
		};
	},
	head: () => ({ meta: [{ title: "Helferstunden · Rendant" }] }),
	component: Page,
});
function Page() {
	const { user } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/protokolle/helferstunden" });
	const selectedYear =
		search.jahr === "alle"
			? undefined
			: (search.jahr ?? new Date().getFullYear());
	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Vereinsarbeit"
				title="Helferstunden"
				description="Helfereinsätze schnell erfassen, nachvollziehen und aus der bisherigen Excel-Liste übernehmen."
			/>
			<HelperHoursPage
				isAdmin={user.role === "admin"}
				year={selectedYear}
				onYearChange={(year) =>
					void navigate({ search: { jahr: year ?? "alle" } })
				}
			/>
		</div>
	);
}
