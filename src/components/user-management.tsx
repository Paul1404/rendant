import { useRouter } from "@tanstack/react-router";
import {
	Check,
	Copy,
	Loader2,
	Lock,
	LockOpen,
	Mail,
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
	banned: boolean | null;
	createdAt: Date;
	notifyProtokoll: boolean;
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
	currentUserId,
}: {
	users: UserRow[];
	invites: InviteRow[];
	currentUserId: string;
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
				if (invite.email_status === "sent") {
					toast.success(
						ok
							? "Einladung per E-Mail gesendet, Link kopiert"
							: "Einladung per E-Mail gesendet",
					);
				} else if (invite.email_status === "failed") {
					toast.error(
						ok
							? "Einladung erstellt, E-Mail fehlgeschlagen, Link kopiert"
							: "Einladung erstellt, E-Mail fehlgeschlagen",
					);
				} else {
					toast.success(
						ok ? "Einladung erstellt, Link kopiert" : "Einladung erstellt",
					);
				}
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

	function setNotify(id: string, notify: boolean) {
		start(async () => {
			try {
				await orpcClient.users.setNotify({ id, notify });
				toast.success(
					notify
						? "Benachrichtigung aktiviert"
						: "Benachrichtigung deaktiviert",
				);
				await router.invalidate();
			} catch (err) {
				toast.error(orpcMessage(err, "Speichern fehlgeschlagen"));
			}
		});
	}

	function changeRole(user: UserRow, nextRole: "user" | "admin") {
		if (
			user.role === "admin" &&
			nextRole === "user" &&
			!window.confirm(
				`Admin-Rolle von ${user.name} wirklich entfernen? Die Person wird sofort abgemeldet.`,
			)
		) {
			return;
		}
		start(async () => {
			try {
				await orpcClient.users.setRole({ id: user.id, role: nextRole });
				toast.success(
					nextRole === "admin"
						? "Admin-Rolle vergeben"
						: "Admin-Rolle entfernt",
				);
				await router.invalidate();
			} catch (err) {
				toast.error(orpcMessage(err, "Rolle konnte nicht geändert werden"));
			}
		});
	}

	function changeBlocked(user: UserRow) {
		const nextBlocked = !user.banned;
		if (
			nextBlocked &&
			!window.confirm(
				`${user.name} wirklich sperren? Die Person wird sofort abgemeldet und kann sich nicht mehr anmelden.`,
			)
		) {
			return;
		}
		start(async () => {
			try {
				await orpcClient.users.setBanned({ id: user.id, banned: nextBlocked });
				toast.success(nextBlocked ? "Konto gesperrt" : "Konto entsperrt");
				await router.invalidate();
			} catch (err) {
				toast.error(
					orpcMessage(
						err,
						nextBlocked
							? "Konto konnte nicht gesperrt werden"
							: "Konto konnte nicht entsperrt werden",
					),
				);
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
					{users.map((u) => {
						const isSelf = u.id === currentUserId;
						return (
							<div
								key={u.id}
								className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 lg:flex-row lg:items-center lg:justify-between"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<p className="truncate text-sm font-medium text-foreground">
											{u.name}
										</p>
										{isSelf ? (
											<span className="text-[11px] text-muted-foreground">
												Du
											</span>
										) : null}
										{u.banned ? (
											<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
												Gesperrt
											</span>
										) : null}
									</div>
									<p className="truncate text-[11px] text-muted-foreground">
										{u.email}
									</p>
								</div>
								<div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
									<label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
										<input
											type="checkbox"
											checked={u.notifyProtokoll}
											disabled={pending || Boolean(u.banned)}
											onChange={(e) => setNotify(u.id, e.target.checked)}
											className="h-3.5 w-3.5 rounded border-input accent-primary"
										/>
										E-Mail bei neuem Protokoll
									</label>
									<Select
										value={u.role === "admin" ? "admin" : "user"}
										onValueChange={(value) =>
											changeRole(u, value as "user" | "admin")
										}
										disabled={pending || isSelf || Boolean(u.banned)}
									>
										<SelectTrigger
											className="h-8 w-28 text-xs"
											aria-label={`Rolle von ${u.name}`}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="user">Benutzer</SelectItem>
											<SelectItem value="admin">Admin</SelectItem>
										</SelectContent>
									</Select>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={pending || isSelf}
										onClick={() => changeBlocked(u)}
										aria-label={`${u.name} ${u.banned ? "entsperren" : "sperren"}`}
									>
										{u.banned ? (
											<LockOpen className="mr-1.5 h-3.5 w-3.5" />
										) : (
											<Lock className="mr-1.5 h-3.5 w-3.5" />
										)}
										{u.banned ? "Entsperren" : "Sperren"}
									</Button>
								</div>
							</div>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}
