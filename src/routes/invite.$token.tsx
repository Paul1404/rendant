import { createFileRoute } from "@tanstack/react-router";
import { Loader2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { useBranding } from "@/routes/__root";

export const Route = createFileRoute("/invite/$token")({
	loader: ({ params }) =>
		orpcClient.invites.getByToken({ token: params.token }),
	head: () => ({ meta: [{ title: "Einladung · SVUFO" }] }),
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
			<Shell logoUrl={branding.logoUrl} vereinsname={branding.vereinsname}>
				<div className="rounded-2xl border border-destructive/30 bg-card/80 p-6 text-center">
					<p className="text-sm font-medium text-destructive">
						Diese Einladung ist ungültig oder abgelaufen.
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Bitte den Administrator um eine neue Einladung bitten.
					</p>
				</div>
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
				toast.success("Konto angelegt. Bitte anmelden.");
				window.location.assign("/login");
				return;
			}
			window.location.assign("/protokolle");
		});
	}

	return (
		<Shell logoUrl={branding.logoUrl} vereinsname={branding.vereinsname}>
			<div className="rounded-2xl border border-border/70 bg-card/80 p-6 shadow-xl shadow-foreground/5 backdrop-blur">
				<p className="mb-4 text-sm text-muted-foreground">
					Konto anlegen für{" "}
					<span className="font-medium text-foreground">{invite.email}</span>
				</p>
				<form className="space-y-4" onSubmit={submit}>
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
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
							className="h-10"
						/>
						<p className="text-[11px] text-muted-foreground">
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
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<UserPlus className="mr-2 h-4 w-4" />
						)}
						Konto anlegen
					</Button>
				</form>
			</div>
		</Shell>
	);
}

function Shell({
	children,
	logoUrl,
	vereinsname,
}: {
	children: React.ReactNode;
	logoUrl: string;
	vereinsname: string;
}) {
	return (
		<div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
			<div className="w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-primary/10 ring-1 ring-foreground/10">
						<img
							src={logoUrl}
							alt=""
							className="h-full w-auto object-contain"
						/>
					</div>
					<h1 className="text-xl font-semibold tracking-tight text-foreground">
						SVUFO
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">{vereinsname}</p>
				</div>
				{children}
			</div>
		</div>
	);
}
