import { useRouter } from "@tanstack/react-router";
import { CreditCard, Loader2, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCent } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

// Client-side view of the SumUp settings. The API key never reaches the
// browser; has_api_key only says whether one is stored.
export type SumupSettingsView = {
	enabled: boolean;
	has_api_key: boolean;
	merchant_code: string;
	merchant_name: string;
	updated_at: string | undefined;
};

export function SumupSettingsForm({ initial }: { initial: SumupSettingsView }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [testing, startTest] = useTransition();

	const [saved, setSaved] = useState<SumupSettingsView>(initial);
	const [enabled, setEnabled] = useState(initial.enabled);
	const [apiKey, setApiKey] = useState("");
	const [clearKey, setClearKey] = useState(false);

	const keyTouched = apiKey.trim().length > 0 || clearKey;
	const dirty = enabled !== saved.enabled || keyTouched;
	const canEnable = saved.has_api_key || apiKey.trim().length > 0;

	function discard() {
		setEnabled(saved.enabled);
		setApiKey("");
		setClearKey(false);
	}

	function save() {
		start(async () => {
			try {
				const data = await orpcClient.settings.updateSumup({
					enabled: clearKey ? false : enabled,
					api_key: clearKey ? "" : apiKey.trim(),
					clear_api_key: clearKey,
					expected_updated_at: saved.updated_at,
				});
				setSaved(data);
				setEnabled(data.enabled);
				setApiKey("");
				setClearKey(false);
				toast.success(
					data.has_api_key
						? `SumUp verbunden mit ${data.merchant_name || data.merchant_code}`
						: "SumUp-Anbindung entfernt",
				);
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	function test() {
		startTest(async () => {
			try {
				const res = await orpcClient.settings.testSumup();
				toast.success(
					`Verbindung steht. Heute ${res.anzahl} Kartenzahlungen, ${formatCent(res.kartenzahlung_cent)}.`,
				);
			} catch (e) {
				toast.error(orpcMessage(e, "Verbindungstest fehlgeschlagen"));
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle className="flex items-center gap-2">
							<CreditCard className="h-4 w-4 text-primary" />
							SumUp
						</CardTitle>
						<CardDescription className="mt-1">
							Kartenumsätze eines Veranstaltungstags direkt aus SumUp in das
							Feld Kartenzahlung übernehmen. Rendant liest nur die
							Transaktionshistorie und schreibt nichts nach SumUp.
						</CardDescription>
					</div>
					<Badge
						variant={saved.enabled && saved.has_api_key ? "default" : "outline"}
					>
						{saved.enabled && saved.has_api_key ? "Aktiv" : "Nicht aktiv"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				{saved.has_api_key ? (
					<dl className="grid gap-4 sm:grid-cols-2">
						<div>
							<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Händlerkonto
							</dt>
							<dd className="mt-1 text-sm text-foreground">
								{saved.merchant_name || "Ohne Namen"}
							</dd>
						</div>
						<div>
							<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Händlercode
							</dt>
							<dd className="mt-1 font-mono text-sm text-foreground">
								{saved.merchant_code}
							</dd>
						</div>
					</dl>
				) : (
					<Callout tone="info" title="API-Key aus dem SumUp-Dashboard">
						Unter me.sumup.com im Profil Einstellungen öffnen, dann "Für
						Entwickler", "API-Keys" und einen neuen Key erzeugen. Der Key wird
						beim Speichern gegen SumUp geprüft und verschlüsselt abgelegt.
					</Callout>
				)}

				<div className="space-y-2">
					<Label htmlFor="sumup-api-key">
						{saved.has_api_key ? "Neuer API-Key (optional)" : "API-Key"}
					</Label>
					<Input
						id="sumup-api-key"
						type="password"
						autoComplete="off"
						placeholder={
							saved.has_api_key
								? "Leer lassen, um den gespeicherten Key zu behalten"
								: "sup_sk_..."
						}
						value={apiKey}
						disabled={clearKey}
						onChange={(e) => setApiKey(e.target.value)}
						className="font-mono"
					/>
					{saved.has_api_key ? (
						<label className="flex items-center gap-2 text-xs text-muted-foreground">
							<input
								type="checkbox"
								checked={clearKey}
								onChange={(e) => setClearKey(e.target.checked)}
								className="h-3.5 w-3.5 accent-primary"
							/>
							Gespeicherten Key entfernen und Anbindung deaktivieren
						</label>
					) : null}
				</div>

				<label className="flex items-start gap-3 text-sm">
					<input
						type="checkbox"
						checked={enabled && !clearKey}
						disabled={clearKey || !canEnable}
						onChange={(e) => setEnabled(e.target.checked)}
						className="mt-0.5 h-4 w-4 accent-primary"
					/>
					<span>
						<span className="font-medium text-foreground">
							Abruf im Protokollformular anbieten
						</span>
						<span className="block text-xs text-muted-foreground">
							Zeigt im Feld Kartenzahlung den Knopf "Aus SumUp übernehmen". Der
							Wert bleibt ein Vorschlag und kann vor dem Speichern geändert
							werden.
						</span>
					</span>
				</label>

				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={save} disabled={!dirty || pending}>
						{pending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : clearKey ? (
							<Trash2 className="mr-2 h-4 w-4" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						{clearKey ? "Anbindung entfernen" : "Speichern"}
					</Button>
					{dirty ? (
						<Button variant="ghost" onClick={discard} disabled={pending}>
							Verwerfen
						</Button>
					) : null}
					{saved.has_api_key && !dirty ? (
						<Button variant="outline" onClick={test} disabled={testing}>
							{testing ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<CreditCard className="mr-2 h-4 w-4" />
							)}
							Verbindung testen
						</Button>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
