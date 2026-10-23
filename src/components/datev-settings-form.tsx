import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

type Settings = Awaited<ReturnType<typeof orpcClient.settings.getDatev>>;

export function DatevSettingsForm({ initial }: { initial: Settings }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [saved, setSaved] = useState(initial);
	const [enabled, setEnabled] = useState(initial.enabled);
	const [recipient, setRecipient] = useState(initial.recipient);
	const [sender, setSender] = useState(initial.sender);
	const [pending, start] = useTransition();
	const dirty =
		enabled !== saved.enabled ||
		recipient !== saved.recipient ||
		sender !== saved.sender;

	return (
		<Card>
			<CardContent className="space-y-4 pt-6">
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						start(async () => {
							try {
								const next = await orpcClient.settings.updateDatev({
									enabled,
									recipient: recipient.trim(),
									sender: sender.trim(),
									expected_updated_at: saved.updated_at,
								});
								setSaved(next);
								setRecipient(next.recipient);
								setSender(next.sender);
								await queryClient.invalidateQueries();
								await router.invalidate();
								toast.success("DATEV-Einstellungen gespeichert");
							} catch (error) {
								toast.error(orpcMessage(error, "Speichern fehlgeschlagen"));
							}
						});
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="datev-recipient">DATEV-Zieladresse für Kasse</Label>
						<Input
							id="datev-recipient"
							type="email"
							value={recipient}
							onChange={(event) => setRecipient(event.target.value)}
							required={enabled}
							disabled={pending}
							placeholder="…@uploadmail.datev.de"
							aria-describedby="datev-recipient-help"
						/>
						<p
							id="datev-recipient-help"
							className="text-xs text-muted-foreground"
						>
							Aus DATEV Belege online: Upload Mail, Belegtyp „Kasse“. Die
							Zieladresse bestimmt den Belegtyp.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="datev-sender">
							In DATEV freigeschalteter Absender
						</Label>
						<Input
							id="datev-sender"
							type="email"
							value={sender}
							onChange={(event) => setSender(event.target.value)}
							required={enabled}
							disabled={pending}
							aria-describedby="datev-sender-help"
						/>
						<p id="datev-sender-help" className="text-xs text-muted-foreground">
							Diese Adresse muss in DATEV bestätigt sein und über den
							eingerichteten E-Mail-Zugang senden dürfen. Der Versand verwendet
							die vorhandenen SMTP-Einstellungen mit Verschlüsselung.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<input
							id="datev-enabled"
							type="checkbox"
							checked={enabled}
							onChange={(event) => setEnabled(event.target.checked)}
							disabled={pending}
							className="h-4 w-4 accent-primary"
						/>
						<Label htmlFor="datev-enabled">DATEV-Versand aktivieren</Label>
					</div>
					<p className="text-xs text-muted-foreground">
						Gespeichert wird nur die Verbindung. Ein Beleg wird erst nach deiner
						Bestätigung auf der Protokollseite gesendet.
					</p>
					<Button type="submit" disabled={pending || !dirty}>
						{pending ? "Speichern…" : "Speichern"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
