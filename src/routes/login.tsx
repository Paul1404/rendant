import { createFileRoute, redirect } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand-lockup";
import { LoginForm } from "@/components/login-form";
import { VersionChip } from "@/components/version-chip";
import { sanitizeAuthRedirect } from "@/lib/redirect";
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
	head: () => ({ meta: [{ title: "Anmelden · Rendant" }] }),
	component: LoginPage,
});

function LoginPage() {
	const { from } = Route.useSearch();
	const branding = useBranding();
	const redirectTo = sanitizeAuthRedirect(from);

	return (
		<div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
			<div className="w-full max-w-sm">
				<div className="flex flex-col items-center text-center">
					<BrandLockup variant="hero" className="mb-6" />
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
						Finanzverwaltung für Vereine
					</p>
					<h1 className="wordmark mt-1.5 text-3xl text-foreground">Rendant</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						läuft für {branding.vereinsname}
					</p>
				</div>

				<div className="mt-8 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
					<LoginForm redirectTo={redirectTo} />
				</div>

				<div className="mt-7 flex justify-center">
					<VersionChip />
				</div>
			</div>
		</div>
	);
}
