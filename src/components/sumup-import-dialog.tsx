import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, CreditCard, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/ui/money";
import {
	addIsoCalendarDays,
	formatDateDe,
	formatTimeDe,
	formatWeekdayDe,
	isIsoCalendarDate,
	isoCalendarDayDifference,
	todayIsoDate,
} from "@/lib/date";
import { formatCent } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { SUMUP_MAX_RANGE_DAYS } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type SumupDaysResult = Awaited<
	ReturnType<typeof orpcClient.protokolle.sumupDays>
>;
type SumupDay = SumupDaysResult["tage"][number];

export type SumupSelection = {
	tage: string[];
	anzahl: number;
	brutto_cent: number;
	erstattet_cent: number;
	kartenzahlung_cent: number;
};

// Wählt die SumUp-Tage aus, deren Kartenumsatz in das Protokoll wandert. Der
// Zeitraum ist mit dem Veranstaltungsdatum vorbelegt, lässt sich aber frei
// ziehen, weil selten am Tag der Veranstaltung gezählt wird und ein Fest über
// mehrere Tage gehen kann. Tage, die schon in einem Protokoll stecken, sind
// gesperrt und nennen den Beleg.
export function SumupImportDialog({
	open,
	onOpenChange,
	datum,
	onApply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	datum: string;
	onApply: (selection: SumupSelection) => void;
}) {
	const heute = todayIsoDate();
	const start = isIsoCalendarDate(datum) && datum <= heute ? datum : heute;
	const [von, setVon] = useState(start);
	const [bis, setBis] = useState(start);
	const [result, setResult] = useState<SumupDaysResult | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [expanded, setExpanded] = useState<string | null>(null);
	const [loading, startLoad] = useTransition();

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
		startLoad(async () => {
			try {
				const res = await orpcClient.protokolle.sumupDays({ von, bis });
				setResult(res);
				setExpanded(null);
				// Vorauswahl: alle freien Tage mit Umsatz. Bei einem einzelnen Tag
				// ist das genau der Tag, bei einem Fest das ganze Wochenende.
				setSelected(
					new Set(
						res.tage
							.filter((d) => d.anzahl > 0 && !d.protokoll)
							.map((d) => d.datum),
					),
				);
			} catch (e) {
				toast.error(orpcMessage(e, "Abruf aus SumUp fehlgeschlagen"));
			}
		});
	}

	function toggle(day: SumupDay) {
		if (day.protokoll) return;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(day.datum)) next.delete(day.datum);
			else next.add(day.datum);
			return next;
		});
	}

	function shift(days: number) {
		if (!isIsoCalendarDate(von) || !isIsoCalendarDate(bis)) return;
		const span = isoCalendarDayDifference(bis, von);
		const nextVon = addIsoCalendarDays(von, days);
		const nextBis = addIsoCalendarDays(nextVon, span);
		if (nextBis > heute) return;
		setVon(nextVon);
		setBis(nextBis);
	}

	const chosen = (result?.tage ?? []).filter((d) => selected.has(d.datum));
	const summary: SumupSelection = {
		tage: chosen.map((d) => d.datum),
		anzahl: chosen.reduce((s, d) => s + d.anzahl, 0),
		brutto_cent: chosen.reduce((s, d) => s + d.brutto_cent, 0),
		erstattet_cent: chosen.reduce((s, d) => s + d.erstattet_cent, 0),
		kartenzahlung_cent: chosen.reduce((s, d) => s + d.kartenzahlung_cent, 0),
	};
	const tageMitUmsatz = result?.tage.filter((d) => d.anzahl > 0) ?? [];

	function apply() {
		onApply(summary);
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CreditCard className="h-4 w-4 text-primary" />
						Kartenzahlung aus SumUp übernehmen
					</DialogTitle>
					<DialogDescription>
						Zeitraum wählen und laden. Die Tage, die zu diesem Protokoll
						gehören, anhaken. Die Summe der gewählten Tage wird als
						Kartenzahlung eingetragen.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
					<div className="space-y-1.5">
						<Label htmlFor="sumup-von">Von</Label>
						<Input
							id="sumup-von"
							type="date"
							value={von}
							max={heute}
							onChange={(e) => setVon(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="sumup-bis">Bis</Label>
						<Input
							id="sumup-bis"
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
						{result ? "Neu laden" : "Laden"}
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{rangeError ? (
						<span className="text-destructive">{rangeError}</span>
					) : (
						<span>
							{formatDateDe(von)}
							{von !== bis ? ` bis ${formatDateDe(bis)}` : ""}
						</span>
					)}
					<span className="ml-auto inline-flex gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => shift(-7)}
						>
							Woche zurück
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => shift(7)}
							disabled={
								!isIsoCalendarDate(bis) || addIsoCalendarDays(bis, 7) > heute
							}
						>
							Woche vor
						</Button>
					</span>
				</div>

				{result ? (
					tageMitUmsatz.length === 0 ? (
						<Callout
							tone="info"
							title="Keine Kartenzahlungen in diesem Zeitraum"
						>
							SumUp kennt für {formatDateDe(result.von)}
							{result.von !== result.bis
								? ` bis ${formatDateDe(result.bis)}`
								: ""}{" "}
							keine erfolgreiche Kartenzahlung. Zeitraum anpassen oder die
							Kartenzahlung von Hand eintragen.
						</Callout>
					) : (
						<div className="max-h-[50dvh] overflow-y-auto rounded-lg border border-border/70">
							<ul className="divide-y divide-border/60">
								{tageMitUmsatz.map((day) => {
									const taken = Boolean(day.protokoll);
									const checked = selected.has(day.datum);
									const isOpen = expanded === day.datum;
									return (
										<li key={day.datum}>
											<div
												className={cn(
													"flex items-center gap-3 px-3 py-2",
													taken && "opacity-70",
												)}
											>
												<input
													type="checkbox"
													aria-label={`${formatDateDe(day.datum)} übernehmen`}
													checked={checked}
													disabled={taken}
													onChange={() => toggle(day)}
													className="h-4 w-4 shrink-0 accent-primary"
												/>
												<button
													type="button"
													className="flex min-w-0 flex-1 items-center gap-2 text-left"
													onClick={() => setExpanded(isOpen ? null : day.datum)}
													aria-expanded={isOpen}
												>
													{isOpen ? (
														<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
													) : (
														<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
													)}
													<span className="min-w-0">
														<span className="block text-sm font-medium tabular-nums">
															{formatWeekdayDe(day.datum)}{" "}
															{formatDateDe(day.datum)}
														</span>
														<span className="block text-xs text-muted-foreground">
															{day.anzahl}{" "}
															{day.anzahl === 1 ? "Zahlung" : "Zahlungen"}
															{day.erstattet_cent > 0
																? `, ${formatCent(day.erstattet_cent)} erstattet`
																: ""}
														</span>
													</span>
												</button>
												{day.protokoll ? (
													<Badge variant="outline" className="shrink-0">
														<Link
															to="/protokolle/$id"
															params={{ id: day.protokoll.id }}
															target="_blank"
															rel="noreferrer"
															className="font-mono"
														>
															{day.protokoll.belegnummer}
														</Link>
													</Badge>
												) : null}
												<Money
													cent={day.kartenzahlung_cent}
													className="shrink-0 text-sm"
												/>
											</div>
											{isOpen ? (
												<ul className="border-t border-border/50 bg-muted/30 px-3 py-2 text-xs">
													{day.transaktionen.map((t) => (
														<li
															key={t.id}
															className="flex items-center gap-3 py-0.5 tabular-nums"
														>
															<span className="w-12 text-muted-foreground">
																{formatTimeDe(t.timestamp)}
															</span>
															<span className="flex-1 truncate text-muted-foreground">
																{t.card_type || "Karte"}
																{t.transaction_code
																	? ` · ${t.transaction_code}`
																	: ""}
															</span>
															{t.refunded_cent > 0 ? (
																<span className="text-muted-foreground">
																	-{formatCent(t.refunded_cent)}
																</span>
															) : null}
															<span>{formatCent(t.amount_cent)}</span>
														</li>
													))}
												</ul>
											) : null}
										</li>
									);
								})}
							</ul>
						</div>
					)
				) : (
					<p className="text-xs text-muted-foreground">
						Noch nichts geladen. Rendant liest nur die Transaktionshistorie und
						zieht erstattete Beträge ab. Barzahlungen aus der SumUp-App zählen
						nicht mit.
					</p>
				)}

				<DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="text-sm">
						{chosen.length > 0 ? (
							<>
								<span className="text-muted-foreground">
									{chosen.length} {chosen.length === 1 ? "Tag" : "Tage"},{" "}
									{summary.anzahl}{" "}
									{summary.anzahl === 1 ? "Zahlung" : "Zahlungen"}:
								</span>{" "}
								<span className="font-medium tabular-nums">
									{formatCent(summary.kartenzahlung_cent)}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">
								Kein Tag ausgewählt.
							</span>
						)}
					</div>
					<div className="flex gap-2 sm:justify-end">
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							Abbrechen
						</Button>
						<Button
							type="button"
							onClick={apply}
							disabled={chosen.length === 0}
						>
							Übernehmen
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
