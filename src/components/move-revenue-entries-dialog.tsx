import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/ui/money";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateDe } from "@/lib/date";
import { formatCentPlain } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import {
	UMSATZBEREICHE,
	type Umsatzbereich,
	umsatzbereichLabel,
} from "@/lib/umsatzbereich";

export type MovableEntry = {
	id: string;
	source: "protocol" | "historical";
	label: string;
	date: string;
	revenueCent: number;
};

const REASON_MIN = 5;

/**
 * Moving entries between the comparison groups means one thing in the data: a
 * different Umsatzbereich. Both sources take the route their record type
 * allows. A protocol keeps its Beleg untouched and only changes its reporting
 * classification, a historical entry is corrected the way the ledger demands,
 * by cancelling the old row and writing a replacement.
 */
export function MoveRevenueEntriesDialog({
	open,
	onOpenChange,
	entries,
	currentArea,
	onMoved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entries: MovableEntry[];
	currentArea: Umsatzbereich | null;
	onMoved: () => Promise<void>;
}) {
	const [target, setTarget] = useState<Umsatzbereich | "">("");
	const [reason, setReason] = useState("");
	const [saving, setSaving] = useState(false);

	const protocols = entries.filter((entry) => entry.source === "protocol");
	const historical = entries.filter((entry) => entry.source === "historical");
	const totalCent = entries.reduce((sum, entry) => sum + entry.revenueCent, 0);
	const trimmedReason = reason.trim();
	const canSave =
		target !== "" &&
		target !== currentArea &&
		trimmedReason.length >= REASON_MIN &&
		entries.length > 0 &&
		!saving;

	function close(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setTarget("");
			setReason("");
		}
	}

	async function move() {
		if (target === "") return;
		setSaving(true);
		try {
			let moved = 0;
			let skipped = 0;
			if (protocols.length > 0) {
				const result = await orpcClient.protokolle.reclassify({
					ids: protocols.map((entry) => entry.id),
					umsatzbereich: target,
					grund: trimmedReason,
				});
				moved += result.moved;
				skipped += result.skipped;
			}
			// One correction per historical row: each one cancels its original and
			// writes a replacement, so they cannot be batched into one statement.
			for (const entry of historical) {
				const detail = await orpcClient.historicalRevenue.get({ id: entry.id });
				if (!detail || detail.storniert_am) {
					skipped += 1;
					continue;
				}
				const prefix = detail.umsatzbereich
					? `${umsatzbereichLabel(detail.umsatzbereich as Umsatzbereich)} · `
					: "";
				await orpcClient.historicalRevenue.correct({
					id: detail.id,
					idempotency_key: crypto.randomUUID(),
					anlass_datum: detail.anlass_datum,
					anlass_katalog_id: null,
					umsatzbereich: target,
					veranstaltungsbezeichnung: detail.anlass.startsWith(prefix)
						? detail.anlass.slice(prefix.length)
						: detail.anlass,
					umsatz_cent: detail.umsatz_cent,
					ausgaben_cent: detail.ausgaben_cent,
					bemerkung: detail.bemerkung ?? null,
					korrektur_grund: trimmedReason,
				});
				moved += 1;
			}
			if (moved === 0) {
				toast.warning(
					"Nichts verschoben. Die Einträge wurden zwischenzeitlich geändert.",
				);
			} else if (skipped > 0) {
				toast.warning(
					`${moved} verschoben, ${skipped} übersprungen (storniert oder bereits im Zielbereich).`,
				);
			} else {
				toast.success(
					moved === 1 ? "Eintrag verschoben" : `${moved} Einträge verschoben`,
				);
			}
			await onMoved();
			close(false);
		} catch (error) {
			toast.error(orpcMessage(error, "Verschieben fehlgeschlagen"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{entries.length === 1
							? "Eintrag verschieben"
							: `${entries.length} Einträge verschieben`}
					</DialogTitle>
					<DialogDescription>
						{currentArea
							? `Aus ${umsatzbereichLabel(currentArea)} in einen anderen Umsatzbereich.`
							: "In einen Umsatzbereich einsortieren."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-muted/40 p-3 text-xs">
						{entries.slice(0, 12).map((entry) => (
							<div
								key={`${entry.source}-${entry.id}`}
								className="flex items-baseline justify-between gap-3"
							>
								<span className="min-w-0 truncate">
									{formatDateDe(entry.date)} · {entry.label}
								</span>
								<Money cent={entry.revenueCent} className="text-xs" />
							</div>
						))}
						{entries.length > 12 ? (
							<p className="text-muted-foreground">
								und {entries.length - 12} weitere
							</p>
						) : null}
						<p className="border-border/60 border-t pt-1.5 font-medium">
							Summe {formatCentPlain(totalCent)} EUR
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="move-target">Ziel-Umsatzbereich</Label>
						<Select
							value={target}
							onValueChange={(value) => setTarget(value as Umsatzbereich)}
						>
							<SelectTrigger id="move-target" className="w-full">
								<SelectValue placeholder="Umsatzbereich wählen" />
							</SelectTrigger>
							<SelectContent>
								{UMSATZBEREICHE.map((area) => (
									<SelectItem
										key={area.code}
										value={area.code}
										disabled={area.code === currentArea}
									>
										{area.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="move-reason">Begründung</Label>
						<Textarea
							id="move-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							rows={3}
							maxLength={500}
							placeholder="Warum gehört der Umsatz woandershin?"
						/>
						<p className="text-xs text-muted-foreground">
							Mindestens {REASON_MIN} Zeichen. Die Begründung steht im
							Protokoll.
						</p>
					</div>

					<p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
						{protocols.length > 0
							? "Kassenzählprotokolle behalten Belegnummer, Betrag und Belegtext. Nur die Zuordnung zur Auswertung ändert sich."
							: null}
						{protocols.length > 0 && historical.length > 0 ? " " : null}
						{historical.length > 0
							? "Altunterlagen werden revisionssicher korrigiert: der alte Eintrag wird storniert und durch einen neuen ersetzt."
							: null}
					</p>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => close(false)}
						disabled={saving}
					>
						Abbrechen
					</Button>
					<Button type="button" onClick={() => void move()} disabled={!canSave}>
						{saving ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<ArrowRightLeft className="mr-2 h-4 w-4" />
						)}
						Verschieben
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
