import { Link } from "@tanstack/react-router";
import { CreditCard, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
	addIsoCalendarDays,
	formatDateDe,
	formatWeekdayDe,
	isIsoCalendarDate,
	isoCalendarDayDifference,
	todayIsoDate,
} from "@/lib/date";
import { formatCent } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { SUMUP_MAX_RANGE_DAYS } from "@/lib/schemas";

type SumupDaysResult = Awaited<
	ReturnType<typeof orpcClient.protokolle.sumupDays>
>;

// Welche SumUp-Tage mit Kartenumsatz noch in keinem Protokoll stecken. Wird
// auf Knopfdruck geladen, weil jeder Aufruf SumUp befragt und die Seite
// sonst bei jedem Öffnen eine Fremd-API bemühen würde.
export function SumupOpenDays() {
	const heute = todayIsoDate();
	const [von, setVon] = useState(addIsoCalendarDays(heute, -30));
	const [bis, setBis] = useState(heute);
	const [result, setResult] = useState<SumupDaysResult | null>(null);
	const [loading, start] = useTransition();

	const rangeError = (() => {
		if (!isIsoCalendarDate(von) || !isIsoCalendarDate(bis)) {
			return "Bitte gültige Daten angeben.";
		}
		if (von > bis) return "Das Startdatum muss vor dem Enddatum liegen.";
		if (bis > heute) return "Das Enddatum darf nicht in der Zukunft liegen.";
		if (isoCalendarDayDifference(bis, von) >= SUMUP_MAX_RANGE_DAYS) {
			return `Höchstens ${SUMUP_MAX_RANGE_DAYS} Tage auf einmal.`;
		}
		return null;
	})();

	function load() {
		if (rangeError) return;
		start(async () => {
			try {
				setResult(await orpcClient.protokolle.sumupDays({ von, bis }));
			} catch (e) {
				toast.error(orpcMessage(e, "Abruf aus SumUp fehlgeschlagen"));
			}
		});
	}

	const offen = result?.tage.filter((d) => d.anzahl > 0 && !d.protokoll) ?? [];
	const zugeordnet =
		result?.tage.filter((d) => d.anzahl > 0 && d.protokoll) ?? [];
	const offenCent = offen.reduce((s, d) => s + d.kartenzahlung_cent, 0);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<CreditCard className="h-4 w-4 text-primary" />
					Kartenumsätze aus SumUp
				</CardTitle>
				<CardDescription>
					Zeigt, welche Tage mit Kartenzahlungen noch in keinem Protokoll
					übernommen wurden. So fällt ein vergessener Tag auf, bevor der Monat
					abgeschlossen wird.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
					<div className="space-y-1.5">
						<Label htmlFor="sumup-offen-von">Von</Label>
						<Input
							id="sumup-offen-von"
							type="date"
							value={von}
							max={heute}
							onChange={(e) => setVon(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="sumup-offen-bis">Bis</Label>
						<Input
							id="sumup-offen-bis"
							type="date"
							value={bis}
							max={heute}
							onChange={(e) => setBis(e.target.value)}
						/>
					</div>
					<Button
						type="button"
						onClick={load}
						disabled={loading || Boolean(rangeError)}
					>
						{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						Prüfen
					</Button>
				</div>
				{rangeError ? (
					<p className="text-xs text-destructive">{rangeError}</p>
				) : null}

				{result ? (
					offen.length === 0 ? (
						<Callout tone="success" title="Alle Tage sind zugeordnet">
							{zugeordnet.length > 0
								? `${zugeordnet.length} ${zugeordnet.length === 1 ? "Tag" : "Tage"} mit Kartenzahlung, alle in einem Protokoll.`
								: "Im gewählten Zeitraum gab es keine Kartenzahlung."}
						</Callout>
					) : (
						<div className="space-y-2">
							<Callout
								tone="warning"
								title={`${offen.length} ${offen.length === 1 ? "Tag" : "Tage"} ohne Protokoll, zusammen ${formatCent(offenCent)}`}
							>
								Beim Erfassen des Protokolls "Aus SumUp übernehmen" wählen und
								den Tag anhaken. Ein Tag, der zu einem bereits erfassten
								Protokoll gehört, lässt sich nur über Storno und Neuerfassung
								nachtragen.
							</Callout>
							<ul className="divide-y divide-border/60 rounded-lg border border-border/70">
								{offen.map((d) => (
									<li
										key={d.datum}
										className="flex items-center gap-3 px-3 py-2 text-sm tabular-nums"
									>
										<span className="font-medium">
											{formatWeekdayDe(d.datum)} {formatDateDe(d.datum)}
										</span>
										<span className="text-xs text-muted-foreground">
											{d.anzahl} {d.anzahl === 1 ? "Zahlung" : "Zahlungen"}
										</span>
										<span className="ml-auto">
											{formatCent(d.kartenzahlung_cent)}
										</span>
									</li>
								))}
							</ul>
							<div className="flex justify-end">
								<Button asChild variant="outline" size="sm">
									<Link to="/protokolle/neu">Neues Protokoll erfassen</Link>
								</Button>
							</div>
						</div>
					)
				) : null}
			</CardContent>
		</Card>
	);
}
