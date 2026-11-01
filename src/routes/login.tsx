import { createFileRoute, redirect } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand-lockup";
import { ClubAccessDenied } from "@/components/club-access-denied";
import { ResetPasswordForm } from "@/components/invite-password-recovery";
import { LoginForm } from "@/components/login-form";
import { VersionChip } from "@/components/version-chip";
import { firstClubPath } from "@/lib/permissions";
import { sanitizeAuthRedirect } from "@/lib/redirect";
import { fetchClubEntry, fetchOperatorSession } from "@/lib/server-fns";
import { useBranding } from "@/routes/__root";

export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): { from?: string; resetToken?: string } => ({
		from: typeof search.from === "string" ? search.from : undefined,
		resetToken:
			typeof search.resetToken === "string" && search.resetToken.length <= 512
				? search.resetToken
				: undefined,
	}),
	beforeLoad: async ({ search }) => {
		const operatorEntry = await fetchOperatorSession();
		if (operatorEntry.operatorHost) {
			if (operatorEntry.user || operatorEntry.forbidden)
				throw redirect({ to: "/admin" });
			return { operatorEntry, clubForbidden: false };
		}
		// A reset link remains usable even while another account is signed in.
		if (search?.resetToken) return { operatorEntry, clubForbidden: false };
		const entry = await fetchClubEntry();
		if (entry.user) throw redirect({ to: firstClubPath(entry.user) });
		return { operatorEntry, clubForbidden: entry.forbidden };
	},
	head: () => ({ meta: [{ title: "Anmelden · Rendant" }] }),
	component: LoginPage,
});

function LoginPage() {
	const { from, resetToken } = Route.useSearch();
	const { operatorEntry, clubForbidden } = Route.useRouteContext();
	const branding = useBranding();
	const redirectTo = operatorEntry.operatorHost
		? "/admin"
		: sanitizeAuthRedirect(from);

	if (clubForbidden)
		return <ClubAccessDenied vereinsname={branding.vereinsname} />;

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="relative flex flex-1 items-center justify-center px-4 py-12 outline-none sm:py-16"
		>
			<div className="w-full max-w-sm">
				<div className="flex flex-col items-center text-center">
					<BrandLockup variant="hero" className="mb-6" />
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
						{operatorEntry.operatorHost
							? "Vereinsverwaltung"
							: "Finanzverwaltung für Vereine"}
					</p>
					<h1 className="wordmark mt-1.5 text-3xl text-foreground">Rendant</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{operatorEntry.operatorHost
							? "Anmeldung für Betreiber"
							: `läuft für ${branding.vereinsname}`}
					</p>
				</div>

				<div className="mt-8 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
					{resetToken && !operatorEntry.operatorHost ? (
						<div className="p-6">
							<ResetPasswordForm
								key={resetToken}
								resetToken={resetToken}
								recovery={
									<a className="text-sm underline" href="/login">
										Neuen Link anfordern
									</a>
								}
							/>
						</div>
					) : (
						<LoginForm
							redirectTo={redirectTo}
							allowRecovery={!operatorEntry.operatorHost}
						/>
					)}
				</div>

				<div className="mt-7 flex justify-center">
					<VersionChip />
				</div>
			</div>
		</main>
	);
}
