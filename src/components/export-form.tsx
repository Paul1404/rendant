import {
	Braces,
	ChartNoAxesColumnIncreasing,
	Download,
	FileSpreadsheet,
	FileText,
	Percent,
} from "lucide-react";
import { useState } from "react";
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
import { FieldLabel } from "@/components/ui/section";
import { todayIsoDate } from "@/lib/date";
import { cn } from "@/lib/utils";

const TODAY = todayIsoDate();

function isoFromParts(year: number, monthIndex: number, day: number) {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

const NOW = new Date(`${TODAY}T00:00:00`);
const CURRENT_YEAR = NOW.getFullYear();

const PRESETS: ReadonlyArray<{
	label: string;
	range: () => { von: string; bis: string };
}> = [
	{
		label: "Aktuelles Jahr",
		range: () => ({ von: isoFromParts(CURRENT_YEAR, 0, 1), bis: TODAY }),
	},
	{
		label: "Letztes Jahr",
		range: () => ({
			von: isoFromParts(CURRENT_YEAR - 1, 0, 1),
			bis: isoFromParts(CURRENT_YEAR - 1, 11, 31),
		}),
	},
	{
		label: "Aktueller Monat",
		range: () => ({
			von: isoFromParts(CURRENT_YEAR, NOW.getMonth(), 1),
			bis: TODAY,
		}),
	},
	{
		label: "Letzte 30 Tage",
		range: () => {
			const start = new Date(NOW);
			start.setDate(start.getDate() - 29);
			return {
				von: isoFromParts(
					start.getFullYear(),
					start.getMonth(),
					start.getDate(),
				),
				bis: TODAY,
			};
		},
	},
];

const EXPORTS: ReadonlyArray<{
	id: string;
	title: string;
	description: string;
	path: string;
	icon: typeof FileText;
	button: string;
}> = [
	{
		id: "revenue-xlsx",
		title: "Umsätze (Excel)",
		description:
			"Echte Excel-Arbeitsmappe mit Filtern, formatierten Beträgen und Kassenzählprotokollen plus historischen Werten.",
		path: "/api/export/revenue/xlsx",
		icon: FileSpreadsheet,
		button: "Excel herunterladen",
	},
	{
		id: "revenue",
		title: "Umsätze (CSV)",
		description:
			"Kassenzählprotokolle und historische Werte in einer gemeinsamen Umsatzliste mit Herkunft und Status.",
		path: "/api/export/revenue",
		icon: ChartNoAxesColumnIncreasing,
		button: "Herunterladen",
	},
	{
		id: "csv",
		title: "Protokolle (CSV)",
		description:
			"Alle Belege des Zeitraums als CSV mit Semikolon und Dezimalkomma. Passend für Steuerberater und DATEV.",
		path: "/api/export",
		icon: FileText,
		button: "Herunterladen",
	},
	{
		id: "ust",
		title: "USt-Auswertung (CSV)",
		description:
			"Umsatzsteuer und Vorsteuer nach Satz aufgeschlüsselt, inklusive Zahllast.",
		path: "/api/export/ust",
		icon: Percent,
		button: "Herunterladen",
	},
	{
		id: "json",
		title: "Backup (JSON)",
		description:
			"Vollständige Sicherung aller Protokolle inklusive Ausgaben und USt-Aufteilung.",
		path: "/api/export/json",
		icon: Braces,
		button: "Herunterladen",
	},
];

export function ExportForm() {
	const [von, setVon] = useState(isoFromParts(CURRENT_YEAR, 0, 1));
	const [bis, setBis] = useState(TODAY);

	const invalidRange = !von || !bis || von > bis;

	const activePreset = PRESETS.findIndex((p) => {
		const r = p.range();
		return r.von === von && r.bis === bis;
	});

	function applyPreset(idx: number) {
		const r = PRESETS[idx].range();
		setVon(r.von);
		setBis(r.bis);
	}

	function download(path: string) {
		if (invalidRange) return;
		const url = `${path}?von=${encodeURIComponent(von)}&bis=${encodeURIComponent(bis)}`;
		window.location.href = url;
	}

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">Export</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Der gewählte Zeitraum gilt für alle Downloads.
				</p>
			</div>
			<Card variant="quiet">
				<CardContent className="space-y-5 py-1">
					<div className="space-y-2">
						<FieldLabel>Schnellauswahl</FieldLabel>
						<div className="flex flex-wrap gap-2">
							{PRESETS.map((p, i) => {
								const active = activePreset === i;
								return (
									<Button
										key={p.label}
										type="button"
										variant={active ? "default" : "outline"}
										size="sm"
										aria-pressed={active}
										onClick={() => applyPreset(i)}
									>
										{p.label}
									</Button>
								);
							})}
						</div>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="von">Von</Label>
							<Input
								id="von"
								type="date"
								value={von}
								max={bis || undefined}
								onChange={(e) => setVon(e.target.value)}
								aria-invalid={invalidRange}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="bis">Bis</Label>
							<Input
								id="bis"
								type="date"
								value={bis}
								min={von || undefined}
								max={TODAY}
								onChange={(e) => setBis(e.target.value)}
								aria-invalid={invalidRange}
								required
							/>
						</div>
					</div>
					<p
						className={cn(
							"text-xs",
							invalidRange ? "text-destructive" : "text-muted-foreground",
						)}
					>
						{invalidRange
							? "Bis muss am oder nach Von liegen."
							: "Zeitraum auswählen oder eine Schnellauswahl verwenden."}
					</p>
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{EXPORTS.map((ex) => {
					const Icon = ex.icon;
					return (
						<Card key={ex.id} className="flex flex-col">
							<CardHeader>
								<CardTitle className="flex items-center gap-2.5">
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
										<Icon className="h-[18px] w-[18px]" />
									</span>
									{ex.title}
								</CardTitle>
								<CardDescription>{ex.description}</CardDescription>
							</CardHeader>
							<CardContent className="mt-auto pt-2">
								<Button
									type="button"
									className="w-full"
									disabled={invalidRange}
									onClick={() => download(ex.path)}
								>
									<Download className="mr-2 h-4 w-4" />
									{ex.button}
								</Button>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
