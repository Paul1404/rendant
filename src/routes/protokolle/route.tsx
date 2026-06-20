import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { VersionChip } from "@/components/version-chip";
import { fetchSession } from "@/lib/server-fns";
import { useBranding } from "@/routes/__root";

export const Route = createFileRoute("/protokolle")({
	beforeLoad: async ({ location }) => {
		const user = await fetchSession();
		if (!user) {
			throw redirect({ to: "/login", search: { from: location.href } });
		}
		return { user };
	},
	component: ProtokolleLayout,
});

function ProtokolleLayout() {
	const branding = useBranding();
	return (
		<>
			<Header vereinsname={branding.vereinsname} logoUrl={branding.logoUrl} />
			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
				<Outlet />
			</main>
			<footer className="mt-auto border-t border-border/70 bg-background/60 backdrop-blur">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted-foreground sm:px-6">
					<span>
						&copy; {new Date().getFullYear()} {branding.vereinsname}
					</span>
					<VersionChip />
				</div>
			</footer>
		</>
	);
}
