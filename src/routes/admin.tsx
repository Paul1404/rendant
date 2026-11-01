import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { OperatorConsole, OperatorDenied } from "@/components/operator-console";
import { fetchOperatorSession } from "@/lib/server-fns";

export const Route = createFileRoute("/admin")({
	validateSearch: (search: Record<string, unknown>): { tenant?: string } => ({
		tenant:
			typeof search.tenant === "string" &&
			/^[0-9a-f-]{36}$/i.test(search.tenant)
				? search.tenant
				: undefined,
	}),
	beforeLoad: async () => {
		const entry = await fetchOperatorSession();
		if (!entry.operatorHost) throw notFound();
		if (!entry.user && !entry.forbidden)
			throw redirect({ to: "/login", search: { from: "/admin" } });
		return { operator: entry.user, forbidden: entry.forbidden };
	},
	head: () => ({ meta: [{ title: "Vereinsverwaltung · Rendant" }] }),
	component: AdminPage,
});

function AdminPage() {
	const { operator, forbidden } = Route.useRouteContext();
	const { tenant } = Route.useSearch();
	const navigate = Route.useNavigate();
	if (forbidden || !operator) return <OperatorDenied />;
	return (
		<OperatorConsole
			user={operator}
			selectedTenantId={tenant}
			onSelect={(id) => void navigate({ search: { tenant: id } })}
		/>
	);
}
