import { createFileRoute } from "@tanstack/react-router";
import { Loader2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand-lockup";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { selectTenant } from "@/lib/server-fns";
import { useBranding } from "@/routes/__root";

export const Route = createFileRoute("/invite/$token")({
	loader: ({ params }) =>
		orpcClient.invites.getByToken({ token: params.token }),
	head: () => ({ meta: [{ title: "Einladung · Rendant" }] }),
	component: InvitePage,
});

function InvitePage() {
	const { token } = Route.useParams();
	const invite = Route.useLoaderData();
	const branding = useBranding();
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [pending, start] = useTransition();
	const { data: session, isPending: sessionPending } = authClient.useSession();

	if (!invite.valid) {
		return (
			<Shell vereinsname={branding.vereinsname}>
				<Card className="border-destructive/30">
					<CardContent className="space-y-1 py-2 text-center">
						<h2 className="text-sm font-medium text-destructive">
							Diese Einladung ist ungültig oder abgelaufen.
						</h2>
						<p className="text-sm text-muted-foreground">
							Bitte den Administrator um eine neue Einladung bitten.
						</p>
					</CardContent>
				</Card>
			</Shell>
		);
	}

	const inviteEmail = invite.email;
	const existingAccount = invite.existingAccount;
	const matchingSession =
		session?.user.email.toLowerCase() === inviteEmail.toLowerCase();
	const wrongSession = Boolean(session && !matchingSession);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (wrongSession) return;
		if (!existingAccount && (!name.trim() || password.length < 8)) return;
		if (existingAccount && !matchingSession && !password) return;
		start(async () => {
			try {
				if (existingAccount && !matchingSession) {
					const { error } = await authClient.signIn.email({
						email: inviteEmail,
						password,
					});
					if (error)
						throw new Error(orpcMessage(error, "Anmeldung fehlgeschlagen"));
				}
				const accepted = await orpcClient.invites.accept({
					token,
					...(existingAccount ? {} : { name: name.trim(), password }),
				});
				if (!existingAccount) {
					const { error } = await authClient.signIn.email({
						email: inviteEmail,
						password,
					});
					if (error) {
						toast.info(
							orpcMessage(error, "Konto angelegt. Bitte melde dich an."),
						);
						window.location.assign("/login");
						return;
					}
				}
				await selectTenant(accepted.tenantId);
				window.location.assign("/protokolle");
			} catch (err) {
				toast.error(
					orpcMessage(err, "Einladung konnte nicht angenommen werden"),
				);
			}
		});
	}

	return (
		<Shell vereinsname={invite.tenantName}>
			<Card>
				<CardContent className="space-y-4">
					<h2 className="text-lg font-semibold text-foreground">
						{existingAccount ? "Einladung annehmen" : "Konto anlegen"}
					</h2>
					<p className="text-sm text-muted-foreground">
						Einladung für{" "}
						<span className="font-medium text-foreground">{invite.email}</span>
					</p>
					{wrongSession ? (
						<div className="space-y-3">
							<p className="text-sm">
								Du bist mit einem anderen Konto angemeldet. Melde dich mit{" "}
								{invite.email} an.
							</p>
							<Button
								onClick={async () => {
									await authClient.signOut();
									window.location.reload();
								}}
							>
								Konto wechseln
							</Button>
						</div>
					) : (
						<form className="space-y-4" onSubmit={submit}>
							{!existingAccount && (
								<div className="space-y-2">
									<Label htmlFor="name">Name</Label>
									<Input
										id="name"
										autoComplete="name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										required
										className="h-10"
									/>
								</div>
							)}
							{!matchingSession && (
								<div className="space-y-2">
									<Label htmlFor="password">
										{existingAccount ? "Dein bisheriges Passwort" : "Passwort"}
									</Label>
									<Input
										id="password"
										type="password"
										autoComplete={
											existingAccount ? "current-password" : "new-password"
										}
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										required
										minLength={existingAccount ? undefined : 8}
										aria-describedby="password-help"
										className="h-10"
									/>
									<p
										id="password-help"
										className="text-[11px] text-muted-foreground"
									>
										{existingAccount
											? "Dein bestehendes Konto erhält Zugang zu diesem Verein."
											: "Mindestens 8 Zeichen."}
									</p>
								</div>
							)}
							<Button
								type="submit"
								size="lg"
								className="h-10 w-full"
								disabled={
									pending ||
									sessionPending ||
									(existingAccount
										? !matchingSession && !password
										: !name.trim() || password.length < 8)
								}
							>
								{pending ? (
									<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<UserPlus aria-hidden className="mr-2 h-4 w-4" />
								)}
								{pending
									? "Wird übernommen…"
									: existingAccount
										? "Einladung annehmen"
										: "Konto anlegen"}
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</Shell>
	);
}

function Shell({
	children,
	vereinsname,
}: {
	children: React.ReactNode;
	vereinsname: string;
}) {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="relative flex flex-1 items-center justify-center px-4 py-12 outline-none sm:py-16"
		>
			<div className="w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<BrandLockup variant="hero" className="mb-4" />
					<h1 className="wordmark text-xl text-foreground">Rendant</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						läuft für {vereinsname}
					</p>
				</div>
				{children}
			</div>
		</main>
	);
}
