import { useRouter } from "@tanstack/react-router";
import {
	Check,
	Copy,
	Loader2,
	Mail,
	ShieldCheck,
	Trash2,
	UserPlus,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatDateDe } from "@/lib/date";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

type UserRow = {
	id: string;
	email: string;
	name: string;
	role: string | null;
	createdAt: Date;
};

type InviteRow = {
	id: string;
	email: string;
	role: string;
	accepted_at: Date | null;
	expires_at: Date;
	created_at: Date;
};

export function UserManagement({
	users,
	invites,
}: {
	users: UserRow[];
	invites: InviteRow[];
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"user" | "admin">("user");
	const [lastLink, setLastLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const pendingInvites = invites.filter((i) => !i.accepted_at);

	async function writeClipboard(text: string): Promise<boolean> {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch {
			// Clipboard blocked (insecure context, permissions). Fall through.
		}
		return false;
	}

	function createInvite(e: React.FormEvent) {
		e.preventDefault();
		if (!email.trim()) return;
		start(async () => {
			try {
				const invite = await orpcClient.invites.create({
					email: email.trim(),
					role,
				});
				const link = `${window.location.origin}/invite/${invite.token}`;
				setLastLink(link);
				setEmail("");
				const ok = await writeClipboard(link);
				setCopied(ok);
				toast.success(
					ok ? "Einladung erstellt, Link kopiert" : "Einladung erstellt",
				);
				await router.invalidate();
			} catch (err) {
				toast.error(orpcMessage(err, "Einladung fehlgeschlagen"));
			}
		});
	}

	function revoke(id: string) {
		start(async () => {
			try {
				await orpcClient.invites.revoke({ id });
				toast.success("Einladung zurückgezogen");
				await router.invalidate();
			} catch (err) {
				toast.error(orpcMessage(err, "Zurückziehen fehlgeschlagen"));
			}
		});
	}

	async function copyLink() {
		if (!lastLink) return;
		const ok = await writeClipboard(lastLink);
		if (ok) {
			setCopied(true);
			toast.success("Link kopiert");
		} else {
			toast.error("Kopieren nicht möglich, Link bitte manuell markieren");
		}
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<UserPlus className="h-4 w-4 text-primary" />
						Person einladen
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<form
						onSubmit={createInvite}
						className="grid grid-cols-1 gap-3 sm:grid-cols-12"
					>
						<div className="space-y-1.5 sm:col-span-6">
							<Label htmlFor="invite-email">E-Mail</Label>
							<Input
								id="invite-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="person@verein.de"
								required
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-3">
							<Label htmlFor="invite-role">Rolle</Label>
							<Select
								value={role}
								onValueChange={(v) => setRole(v as "user" | "admin")}
							>
								<SelectTrigger id="invite-role" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="user">Benutzer</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-end sm:col-span-3">
							<Button type="submit" disabled={pending} className="w-full">
								{pending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Mail className="mr-2 h-4 w-4" />
								)}
								Einladen
							</Button>
						</div>
					</form>

					{lastLink ? (
						<div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/[0.05] p-3 sm:flex-row sm:items-center">
							<code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-foreground">
								{lastLink}
							</code>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="w-full shrink-0 sm:w-auto"
								onClick={copyLink}
							>
								{copied ? (
									<Check className="mr-1 h-3.5 w-3.5" />
								) : (
									<Copy className="mr-1 h-3.5 w-3.5" />
								)}
								Kopieren
							</Button>
						</div>
					) : (
						<p className="text-[11px] text-muted-foreground">
							Die eingeladene Person erhält einen einmaligen Link, um ein Konto
							mit eigenem Passwort anzulegen. Der Link ist 7 Tage gültig.
						</p>
					)}
				</CardContent>
			</Card>

			{pendingInvites.length > 0 ? (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-base">Offene Einladungen</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{pendingInvites.map((i) => (
							<div
								key={i.id}
								className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
							>
								<div className="min-w-0">
									<p className="truncate text-sm font-medium text-foreground">
										{i.email}
									</p>
									<p className="text-[11px] text-muted-foreground">
										{i.role === "admin" ? "Admin" : "Benutzer"} · gültig bis{" "}
										{formatDateDe(i.expires_at)}
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Einladung zurückziehen"
									onClick={() => revoke(i.id)}
									disabled={pending}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Konten</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{users.map((u) => (
						<div
							key={u.id}
							className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium text-foreground">
									{u.name}
								</p>
								<p className="truncate text-[11px] text-muted-foreground">
									{u.email}
								</p>
							</div>
							{u.role === "admin" ? (
								<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
									<ShieldCheck className="h-3 w-3" />
									Admin
								</span>
							) : (
								<span className="text-[11px] text-muted-foreground">
									Benutzer
								</span>
							)}
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
