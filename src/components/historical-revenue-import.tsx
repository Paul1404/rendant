import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	Download,
	FileCheck2,
	FileSpreadsheet,
	Loader2,
	Upload,
} from "lucide-react";
import { useRef, useState } from "react";
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
import { Money } from "@/components/ui/money";

type ImportPreview = {
	valid: boolean;
	digest: string;
	rows: number;
	alreadyImported: number;
	possibleDuplicates: number[];
	toImport: number;
	errors: Array<{ row: number; message: string }>;
	totals: { revenueCent: number; expensesCent: number };
	sample: Array<{
		row: number;
		date: string;
		group: string;
		event: string;
		revenueCent: number;
		expensesCent: number;
	}>;
};

async function responseError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error ?? "Import fehlgeschlagen";
	} catch {
		return "Import fehlgeschlagen";
	}
}

export function HistoricalRevenueImport() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<ImportPreview | null>(null);
	const [loading, setLoading] = useState<"preview" | "apply" | null>(null);

	function chooseFile(next: File | null) {
		setFile(next);
		setPreview(null);
	}

	async function send(mode: "preview" | "apply") {
		if (!file) return;
		setLoading(mode);
		try {
			const data = new FormData();
			data.set("file", file);
			data.set("mode", mode);
			if (mode === "apply" && preview) {
				data.set("confirm_digest", preview.digest);
			}
			const response = await fetch("/api/import/revenue", {
				method: "POST",
				body: data,
			});
			if (!response.ok) throw new Error(await responseError(response));
			if (mode === "preview") {
				const result = (await response.json()) as ImportPreview;
				setPreview(result);
				if (result.valid) toast.success("Datei erfolgreich geprüft");
				else toast.error("Die Datei enthält Fehler");
				return;
			}

			const result = (await response.json()) as {
				created: number;
				skipped: number;
			};
			toast.success(
				result.created > 0
					? `${result.created} historische Umsätze importiert`
					: "Alle Zeilen waren bereits importiert",
			);
			chooseFile(null);
			if (inputRef.current) inputRef.current.value = "";
			await queryClient.invalidateQueries();
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Import fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	function confirmImport() {
		if (!preview?.valid || preview.toImport <= 0) return;
		const duplicateWarning =
			preview.possibleDuplicates.length > 0
				? ` ${preview.possibleDuplicates.length} Zeilen ähneln bestehenden Einträgen.`
				: "";
		if (
			!window.confirm(
				`${preview.toImport} historische Umsätze verbindlich importieren?${duplicateWarning} Die Einträge können später nur storniert, nicht bearbeitet werden.`,
			)
		) {
			return;
		}
		void send("apply");
	}

	return (
		<Card className="overflow-hidden border-primary/20">
			<CardHeader>
				<CardTitle className="flex items-center gap-2.5">
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Upload className="h-[18px] w-[18px]" />
					</span>
					Historische Umsätze importieren
				</CardTitle>
				<CardDescription>
					Leere Vorlage herunterladen, in Excel ausfüllen und hier prüfen. Erst
					nach deiner Bestätigung werden alle Zeilen gemeinsam importiert.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-3 sm:grid-cols-3">
					<div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
						<p className="font-semibold">1. Vorlage laden</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Enthält die gültigen Umsatzgruppen als Auswahlliste.
						</p>
					</div>
					<div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
						<p className="font-semibold">2. In Excel ausfüllen</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Eine Veranstaltung pro Zeile. Überschriften nicht ändern.
						</p>
					</div>
					<div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
						<p className="font-semibold">3. Prüfen und importieren</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Fehler werden vor dem Speichern mit Zeilennummer angezeigt.
						</p>
					</div>
				</div>

				<Button variant="outline" className="w-full sm:w-auto" asChild>
					<a href="/api/import/revenue/template">
						<Download className="mr-2 h-4 w-4" />
						Leere Excel-Vorlage herunterladen
					</a>
				</Button>

				<div className="space-y-2">
					<Label htmlFor="historical-revenue-import">Ausgefüllte Vorlage</Label>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							ref={inputRef}
							id="historical-revenue-import"
							type="file"
							accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
							onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
							disabled={loading != null}
						/>
						<Button
							type="button"
							variant="secondary"
							onClick={() => void send("preview")}
							disabled={!file || loading != null}
							className="shrink-0"
						>
							{loading === "preview" ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<FileCheck2 className="mr-2 h-4 w-4" />
							)}
							Datei prüfen
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Nur XLSX-Dateien bis 5 MB, höchstens 500 Datenzeilen.
					</p>
				</div>

				{preview ? (
					<div className="space-y-4 rounded-xl border border-border/70 bg-muted/15 p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="flex items-center gap-2 font-semibold">
									<FileSpreadsheet className="h-4 w-4 text-primary" />
									{preview.valid
										? `${preview.rows} Zeilen geprüft`
										: `${preview.errors.length} Fehler gefunden`}
								</p>
								{preview.valid ? (
									<p className="mt-1 text-xs text-muted-foreground">
										Umsatz <Money cent={preview.totals.revenueCent} />, Ausgaben{" "}
										<Money cent={preview.totals.expensesCent} />
									</p>
								) : null}
							</div>
							{preview.alreadyImported > 0 ? (
								<span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
									{preview.alreadyImported} bereits importiert
								</span>
							) : null}
						</div>

						{preview.errors.length > 0 ? (
							<ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
								{preview.errors.map((error, index) => (
									<li key={`${error.row}-${index}`}>
										{error.row > 0 ? `Zeile ${error.row}: ` : ""}
										{error.message}
									</li>
								))}
							</ul>
						) : null}

						{preview.valid && preview.possibleDuplicates.length > 0 ? (
							<p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
								Mögliche Dubletten in den Excel-Zeilen{" "}
								{preview.possibleDuplicates.join(", ")}. Bitte vor dem Import
								prüfen.
							</p>
						) : null}

						{preview.valid && preview.sample.length > 0 ? (
							<div className="overflow-x-auto rounded-lg border border-border/60">
								<table className="w-full min-w-[680px] text-left text-xs">
									<thead className="bg-muted/70 text-muted-foreground">
										<tr>
											<th className="px-3 py-2 font-medium">Zeile</th>
											<th className="px-3 py-2 font-medium">Datum</th>
											<th className="px-3 py-2 font-medium">Umsatzgruppe</th>
											<th className="px-3 py-2 font-medium">Veranstaltung</th>
											<th className="px-3 py-2 text-right font-medium">
												Umsatz
											</th>
										</tr>
									</thead>
									<tbody>
										{preview.sample.map((row) => (
											<tr key={row.row} className="border-border/50 border-t">
												<td className="px-3 py-2 tabular-nums">{row.row}</td>
												<td className="px-3 py-2 tabular-nums">{row.date}</td>
												<td className="px-3 py-2">{row.group}</td>
												<td className="max-w-64 truncate px-3 py-2">
													{row.event}
												</td>
												<td className="px-3 py-2 text-right">
													<Money cent={row.revenueCent} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : null}

						{preview.valid ? (
							<Button
								type="button"
								className="w-full"
								onClick={confirmImport}
								disabled={preview.toImport <= 0 || loading != null}
							>
								{loading === "apply" ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Upload className="mr-2 h-4 w-4" />
								)}
								{preview.toImport > 0
									? `${preview.toImport} Umsätze importieren`
									: "Keine neuen Zeilen"}
							</Button>
						) : null}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
