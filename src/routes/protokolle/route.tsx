import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CommandPalette } from "@/components/command-palette";
import { Header } from "@/components/header";
import { MainWatermark } from "@/components/main-watermark";
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
			<CommandPalette />
			<Header />
			<main className="relative isolate mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
				<MainWatermark />
				<div className="relative z-10">
					<Outlet />
				</div>
			</main>
			<footer className="mt-auto border-t border-border/70 bg-background/60 backdrop-blur">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted-foreground sm:px-6">
					<span>
						<span className="font-medium text-foreground/70">SVUFO</span>
						<span className="mx-1.5 text-muted-foreground/40">·</span>
						läuft für {branding.vereinsname}
					</span>
					<VersionChip />
				</div>
			</footer>
		</>
	);
}
