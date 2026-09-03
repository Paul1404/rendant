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

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || password.length < 8) return;
		start(async () => {
			try {
				await orpcClient.invites.accept({ token, name: name.trim(), password });
			} catch (err) {
				toast.error(orpcMessage(err, "Konto konnte nicht angelegt werden"));
				return;
			}
			const { error } = await authClient.signIn.email({
				email: invite.valid ? invite.email : "",
				password,
			});
			if (error) {
				// The account exists, so this is not a failure - but it is not the
				// success the user asked for either, and dropping them on a login form
				// with a success toast leaves them guessing why.
				toast.info(
					orpcMessage(
						error,
						"Konto angelegt. Die automatische Anmeldung hat nicht geklappt, bitte melde dich an.",
					),
				);
				window.location.assign("/login");
				return;
			}
			window.location.assign("/protokolle");
		});
	}

	return (
		<Shell vereinsname={branding.vereinsname}>
			<Card>
				<CardContent className="space-y-4">
					<h2 className="text-lg font-semibold text-foreground">
						Konto anlegen
					</h2>
					<p className="text-sm text-muted-foreground">
						Konto anlegen für{" "}
						<span className="font-medium text-foreground">{invite.email}</span>
					</p>
					<form className="space-y-4" onSubmit={submit}>
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
						<div className="space-y-2">
							<Label htmlFor="password">Passwort</Label>
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
								aria-describedby="password-help"
								className="h-10"
							/>
							<p
								id="password-help"
								className="text-[11px] text-muted-foreground"
							>
								Mindestens 8 Zeichen.
							</p>
						</div>
						<Button
							type="submit"
							size="lg"
							className="h-10 w-full"
							disabled={pending || !name.trim() || password.length < 8}
						>
							{pending ? (
								<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<UserPlus aria-hidden className="mr-2 h-4 w-4" />
							)}
							{pending ? "Konto wird angelegt…" : "Konto anlegen"}
						</Button>
					</form>
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
