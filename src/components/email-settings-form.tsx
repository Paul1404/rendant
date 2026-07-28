import { useRouter } from "@tanstack/react-router";
import { Loader2, Save, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import type { EmailSecurity } from "@/lib/schemas";

// Client-side view of the email settings (no password is ever sent to the
// browser; has_password only signals whether one is stored).
export type EmailSettingsView = {
	enabled: boolean;
	host: string;
	port: number;
	security: EmailSecurity;
	user: string;
	from: string;
	has_password: boolean;
	notify_new_protokoll: boolean;
	recipients: string;
};

type FormState = {
	enabled: boolean;
	host: string;
	port: number;
	security: EmailSecurity;
	user: string;
	from: string;
	notify_new_protokoll: boolean;
	recipients: string;
};

function toFormState(s: EmailSettingsView): FormState {
	return {
		enabled: s.enabled,
		host: s.host,
		port: s.port,
		security: s.security,
		user: s.user,
		from: s.from,
		notify_new_protokoll: s.notify_new_protokoll,
		recipients: s.recipients,
	};
}

function equal(a: FormState, b: FormState): boolean {
	return (
		a.enabled === b.enabled &&
		a.host === b.host &&
		a.port === b.port &&
		a.security === b.security &&
		a.user === b.user &&
		a.from === b.from &&
		a.notify_new_protokoll === b.notify_new_protokoll &&
		a.recipients === b.recipients
	);
}

const SECURITY_LABELS: Record<EmailSecurity, string> = {
	starttls: "STARTTLS (Port 587)",
	ssl: "SSL/TLS (Port 465)",
	none: "Keine (unverschlüsselt)",
};

export function EmailSettingsForm({ initial }: { initial: EmailSettingsView }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [testing, startTest] = useTransition();

	const [saved, setSaved] = useState<FormState>(toFormState(initial));
	const [value, setValue] = useState<FormState>(toFormState(initial));
	const [hasPassword, setHasPassword] = useState(initial.has_password);
	const [password, setPassword] = useState("");
	const [clearPassword, setClearPassword] = useState(false);
	const [testTo, setTestTo] = useState("");

	const passwordTouched = password.length > 0 || clearPassword;
	const dirty = !equal(value, saved) || passwordTouched;

	function set<K extends keyof FormState>(key: K, next: FormState[K]) {
		setValue((prev) => ({ ...prev, [key]: next }));
	}

	// Picking a security mode nudges the port to the conventional default when it
	// is still on the other mode's default, so the two stay in sync without
	// overriding a custom port.
	function setSecurity(next: EmailSecurity) {
		setValue((prev) => {
			let port = prev.port;
			if (next === "ssl" && prev.port === 587) port = 465;
			else if (next !== "ssl" && prev.port === 465) port = 587;
			return { ...prev, security: next, port };
		});
	}

	function discard() {
		setValue(saved);
		setPassword("");
		setClearPassword(false);
	}

	function save() {
		start(async () => {
			try {
				const data = await orpcClient.settings.updateEmail({
					enabled: value.enabled,
					host: value.host,
					port: value.port,
					security: value.security,
					user: value.user,
					password: clearPassword ? "" : password,
					clear_password: clearPassword,
					from: value.from,
					notify_new_protokoll: value.notify_new_protokoll,
					recipients: value.recipients,
				});
				const next = toFormState(data);
				setSaved(next);
				setValue(next);
				setHasPassword(data.has_password);
				setPassword("");
				setClearPassword(false);
				toast.success("Benachrichtigungen gespeichert");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	function sendTest() {
		const to = testTo.trim();
		if (!to) {
			toast.error("Bitte eine Empfängeradresse für den Test angeben");
			return;
		}
		startTest(async () => {
			try {
				await orpcClient.settings.testEmail({ to });
				toast.success(`Test-E-Mail an ${to} gesendet`);
			} catch (e) {
				toast.error(orpcMessage(e, "Test-E-Mail fehlgeschlagen"));
			}
		});
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">E-Mail-Benachrichtigungen</CardTitle>
				<CardDescription>
					Schickt eine kurze Info-E-Mail, sobald ein neues Kassenzählprotokoll
					erfasst wurde. Angemeldete Benutzer erhalten die Mail über ihre eigene
					Einstellung. Hier pflegst du den SMTP-Zugang und optional zusätzliche
					externe Empfänger. Das Passwort wird verschlüsselt gespeichert und nie
					wieder angezeigt.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background px-3">
					<input
						id="smtp-enabled"
						type="checkbox"
						checked={value.enabled}
						onChange={(e) => set("enabled", e.target.checked)}
						className="h-4 w-4 rounded border-input accent-primary"
					/>
					<Label
						htmlFor="smtp-enabled"
						className="cursor-pointer text-sm font-normal"
					>
						Benachrichtigungen aktiv
					</Label>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
					<div className="space-y-1.5">
						<Label htmlFor="smtp-host">SMTP-Server</Label>
						<Input
							id="smtp-host"
							value={value.host}
							maxLength={255}
							placeholder="z. B. smtp.example.de"
							onChange={(e) => set("host", e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="smtp-port">Port</Label>
						<Input
							id="smtp-port"
							type="number"
							min={1}
							max={65535}
							value={value.port}
							className="sm:w-28"
							onChange={(e) =>
								set("port", Number.parseInt(e.target.value, 10) || 0)
							}
						/>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="smtp-security">Verschlüsselung</Label>
					<Select
						value={value.security}
						onValueChange={(s) => setSecurity(s as EmailSecurity)}
					>
						<SelectTrigger id="smtp-security" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="starttls">
								{SECURITY_LABELS.starttls}
							</SelectItem>
							<SelectItem value="ssl">{SECURITY_LABELS.ssl}</SelectItem>
							<SelectItem value="none">{SECURITY_LABELS.none}</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-[11px] text-muted-foreground">
						STARTTLS nutzt üblicherweise Port 587, SSL/TLS Port 465.
					</p>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="smtp-user">Benutzername</Label>
						<Input
							id="smtp-user"
							value={value.user}
							maxLength={255}
							autoComplete="off"
							placeholder="z. B. noreply@example.de"
							onChange={(e) => set("user", e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="smtp-password">Passwort</Label>
						<Input
							id="smtp-password"
							type="password"
							value={password}
							maxLength={255}
							autoComplete="new-password"
							disabled={clearPassword}
							placeholder={
								hasPassword ? "gespeichert (leer lassen)" : "Passwort"
							}
							onChange={(e) => setPassword(e.target.value)}
						/>
						{hasPassword ? (
							<label className="flex items-center gap-2 text-[11px] text-muted-foreground">
								<input
									type="checkbox"
									checked={clearPassword}
									onChange={(e) => {
										setClearPassword(e.target.checked);
										if (e.target.checked) setPassword("");
									}}
									className="h-3.5 w-3.5 rounded border-input accent-primary"
								/>
								Gespeichertes Passwort entfernen
							</label>
						) : null}
					</div>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="smtp-from">Absender</Label>
					<Input
						id="smtp-from"
						value={value.from}
						maxLength={255}
						placeholder='z. B. "Rendant" <noreply@example.de>'
						onChange={(e) => set("from", e.target.value)}
					/>
					<p className="text-[11px] text-muted-foreground">
						Leer lassen, um den Benutzernamen als Absender zu verwenden.
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="smtp-recipients">Zusätzliche Empfänger</Label>
					<Textarea
						id="smtp-recipients"
						value={value.recipients}
						rows={2}
						placeholder="kassier@example.de, vorstand@example.de"
						onChange={(e) => set("recipients", e.target.value)}
					/>
					<p className="text-[11px] text-muted-foreground">
						Externe Adressen zusätzlich zu den angemeldeten Benutzern, getrennt
						durch Komma oder Zeilenumbruch. Leer lassen, wenn nur Benutzerkonten
						benachrichtigt werden sollen.
					</p>
				</div>

				<div className="flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background px-3">
					<input
						id="notify-new-protokoll"
						type="checkbox"
						checked={value.notify_new_protokoll}
						onChange={(e) => set("notify_new_protokoll", e.target.checked)}
						className="h-4 w-4 rounded border-input accent-primary"
					/>
					<Label
						htmlFor="notify-new-protokoll"
						className="cursor-pointer text-sm font-normal"
					>
						Bei neuem Protokoll benachrichtigen
					</Label>
				</div>

				<div className="flex items-center justify-end gap-2">
					{dirty ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={discard}
							disabled={pending}
						>
							Verwerfen
						</Button>
					) : null}
					<Button type="button" onClick={save} disabled={pending || !dirty}>
						{pending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						Speichern
					</Button>
				</div>

				<div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
					<Label htmlFor="smtp-test-to" className="text-sm">
						Test-E-Mail senden
					</Label>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							id="smtp-test-to"
							type="email"
							value={testTo}
							placeholder="adresse@example.de"
							onChange={(e) => setTestTo(e.target.value)}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={sendTest}
							disabled={testing || dirty}
						>
							{testing ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Send className="mr-2 h-4 w-4" />
							)}
							Test senden
						</Button>
					</div>
					<p className="text-[11px] text-muted-foreground">
						Verwendet die gespeicherten SMTP-Einstellungen. Vor dem Test bitte
						speichern.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
