import { createFileRoute, redirect } from "@tanstack/react-router";
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
					<div className="mb-6 inline-flex h-[84px] w-[84px] items-center justify-center rounded-[1.35rem] bg-white p-2.5 shadow-[0_10px_34px_-10px] shadow-primary/30 ring-1 ring-foreground/10">
						<img
							src={branding.logoUrl}
							alt=""
							width={64}
							height={64}
							className="h-full w-auto object-contain"
						/>
					</div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
						Kassenzählprotokoll
					</p>
					<h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">
						SVUFO
					</h1>
					<p className="mt-1.5 text-sm text-muted-foreground">
						{branding.vereinsname}
					</p>
				</div>

				<div className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-xl shadow-foreground/[0.06] backdrop-blur">
					<div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
					<div className="p-1">
						<LoginForm redirectTo={redirectTo} />
					</div>
				</div>

				<div className="mt-7 flex justify-center">
					<VersionChip />
				</div>
			</div>
		</div>
	);
}
