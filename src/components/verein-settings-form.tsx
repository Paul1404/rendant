import { useRouter } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import type { VereinStammdaten } from "@/lib/verein";

const EMPTY: VereinStammdaten = {
	name: "",
	strasse: "",
	plz: "",
	ort: "",
	vorstand: "",
	registergericht: "",
	registernummer: "",
};

function normalize(v: VereinStammdaten): VereinStammdaten {
	return {
		name: v.name.trim(),
		strasse: v.strasse.trim(),
		plz: v.plz.trim(),
		ort: v.ort.trim(),
		vorstand: v.vorstand.trim(),
		registergericht: v.registergericht.trim(),
		registernummer: v.registernummer.trim(),
	};
}

function equal(a: VereinStammdaten, b: VereinStammdaten): boolean {
	const x = normalize(a);
	const y = normalize(b);
	return (
		x.name === y.name &&
		x.strasse === y.strasse &&
		x.plz === y.plz &&
		x.ort === y.ort &&
		x.vorstand === y.vorstand &&
		x.registergericht === y.registergericht &&
		x.registernummer === y.registernummer
	);
}

export function VereinSettingsForm({
	initial,
}: {
	initial: VereinStammdaten & { updated_at?: string };
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [updatedAt, setUpdatedAt] = useState(initial.updated_at);
	const [value, setValue] = useState<VereinStammdaten>({
		...EMPTY,
		...initial,
	});
	const [saved, setSaved] = useState<VereinStammdaten>({
		...EMPTY,
		...initial,
	});
	const dirty = !equal(value, saved);
	const nameOk = value.name.trim().length > 0;

	function set<K extends keyof VereinStammdaten>(
		key: K,
		next: VereinStammdaten[K],
	) {
		setValue((prev) => ({ ...prev, [key]: next }));
	}

	function save() {
		if (!nameOk) return;
		const payload = normalize(value);
		start(async () => {
			try {
				const data = await orpcClient.settings.updateVerein({
					vereinsname: payload.name,
					strasse: payload.strasse,
					plz: payload.plz,
					ort: payload.ort,
					vorstand: payload.vorstand,
					registergericht: payload.registergericht,
					registernummer: payload.registernummer,
					expected_updated_at: updatedAt,
				});
				setSaved(data);
				setValue(data);
				setUpdatedAt(data.updated_at);
				toast.success("Verein gespeichert");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Vereinsstammdaten</CardTitle>
				<CardDescription>
					Name, Anschrift, Vorstand und Registereintrag. Der Name erscheint
					dezent in der Fußzeile und auf der Anmeldeseite sowie im Kopf der
					PDF-Protokolle. Anschrift, Vorstand und Register stehen in der
					Fußzeile jedes PDF-Protokolls. Leere Felder werden im PDF ausgelassen.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-1.5">
					<Label htmlFor="vereinsname">Vereinsname</Label>
					<Input
						id="vereinsname"
						value={value.name}
						maxLength={120}
						placeholder="z. B. SV 1945 Untereuerheim e.V."
						onChange={(e) => set("name", e.target.value)}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
					<div className="space-y-1.5">
						<Label htmlFor="verein-strasse">Straße und Hausnummer</Label>
						<Input
							id="verein-strasse"
							value={value.strasse}
							maxLength={120}
							placeholder="z. B. Triebweg 9"
							onChange={(e) => set("strasse", e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-[6rem_1fr] gap-3 sm:grid-cols-[6rem_11rem] sm:items-end">
						<div className="space-y-1.5">
							<Label htmlFor="verein-plz">PLZ</Label>
							<Input
								id="verein-plz"
								value={value.plz}
								maxLength={10}
								placeholder="97508"
								onChange={(e) => set("plz", e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="verein-ort">Ort</Label>
							<Input
								id="verein-ort"
								value={value.ort}
								maxLength={120}
								placeholder="Untereuerheim"
								onChange={(e) => set("ort", e.target.value)}
							/>
						</div>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="verein-vorstand">Vorstand</Label>
					<Textarea
						id="verein-vorstand"
						value={value.vorstand}
						maxLength={400}
						rows={2}
						placeholder="Alexander Eckert (Vorstandsvorsitzender), Lorin Hümpfer (stv. Vorstandsvorsitzender)"
						onChange={(e) => set("vorstand", e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Frei formatierbar, z. B. Name und Rolle je Person, durch Komma
						getrennt.
					</p>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="verein-registergericht">Registergericht</Label>
						<Input
							id="verein-registergericht"
							value={value.registergericht}
							maxLength={120}
							placeholder="z. B. Amtsgericht Schweinfurt"
							onChange={(e) => set("registergericht", e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="verein-registernummer">Registernummer</Label>
						<Input
							id="verein-registernummer"
							value={value.registernummer}
							maxLength={40}
							placeholder="z. B. VR 31"
							onChange={(e) => set("registernummer", e.target.value)}
						/>
					</div>
				</div>

				<div className="flex items-center justify-end gap-2">
					{dirty ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setValue(saved)}
							disabled={pending}
						>
							Verwerfen
						</Button>
					) : null}
					<Button
						type="button"
						onClick={save}
						disabled={pending || !dirty || !nameOk}
					>
						{pending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						Speichern
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
