import { createFileRoute, redirect } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand-lockup";
import { LoginForm } from "@/components/login-form";
import { VersionChip } from "@/components/version-chip";
import { fetchSession } from "@/lib/server-fns";
import { useBranding } from "@/routes/__root";

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): { from?: string } => ({
		from: typeof search.from === "string" ? search.from : undefined,
	}),
	beforeLoad: async () => {
		const user = await fetchSession();
		if (user) throw redirect({ to: "/protokolle" });
	},
	head: () => ({ meta: [{ title: "Anmelden · SVUFO" }] }),
	component: LoginPage,
});

function LoginPage() {
	const { from } = Route.useSearch();
	const branding = useBranding();
	const redirectTo = from?.startsWith("/") ? from : "/protokolle";

	return (
		<div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
			<div
				aria-hidden
				className="bg-grid-faint pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_55%_45%_at_50%_35%,black,transparent_75%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute left-1/2 top-[28%] -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]"
			/>

			<div className="w-full max-w-sm">
				<div className="flex flex-col items-center text-center">
					<BrandLockup variant="hero" className="mb-6" />
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
						Kassenzählprotokoll
					</p>
					<h1 className="wordmark mt-1.5 text-3xl text-foreground">SVUFO</h1>
					<p className="mt-1.5 text-sm text-muted-foreground">
						läuft für {branding.vereinsname}
					</p>
				</div>

				<div className="mt-8 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm backdrop-blur">
					<div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
					<LoginForm redirectTo={redirectTo} />
				</div>

				<div className="mt-7 flex justify-center">
					<VersionChip />
				</div>
			</div>
		</div>
	);
}
