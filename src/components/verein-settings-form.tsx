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
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

export function VereinSettingsForm({ initial }: { initial: string }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [value, setValue] = useState(initial);
	const [saved, setSaved] = useState(initial);
	const trimmed = value.trim();
	const dirty = trimmed !== saved.trim();

	function save() {
		if (!trimmed) return;
		start(async () => {
			try {
				const data = await orpcClient.settings.updateVerein({
					vereinsname: trimmed,
				});
				setSaved(data.vereinsname);
				setValue(data.vereinsname);
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
				<CardTitle className="text-base">Verein</CardTitle>
				<CardDescription>
					Name des Vereins, für den diese Instanz läuft. Erscheint dezent in der
					Fußzeile und auf der Anmeldeseite sowie im Kopf der PDF-Protokolle.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-1.5">
					<Label htmlFor="vereinsname">Vereinsname</Label>
					<Input
						id="vereinsname"
						value={value}
						maxLength={120}
						placeholder="z. B. SV 1945 Untereuerheim e.V."
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && dirty) save();
						}}
					/>
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
						disabled={pending || !dirty || !trimmed}
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
