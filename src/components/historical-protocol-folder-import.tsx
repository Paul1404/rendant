import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	AlertTriangle,
	Archive,
	CheckCircle2,
	Database,
	FileSearch,
	FolderOpen,
	Loader2,
	ShieldCheck,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	HistoricalProtocolClassificationOverrides,
	HistoricalProtocolImportStatus,
	HistoricalProtocolPreview,
} from "@/lib/historical-protocol-import";
import {
	UMSATZBEREICHE,
	type Umsatzbereich,
	umsatzbereichLabel,
} from "@/lib/umsatzbereich";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<HistoricalProtocolImportStatus, string> = {
	ready: "Bereit",
	review: "Prüffall",
	already_imported: "Bereits importiert",
	existing_protocol: "Rendant-Protokoll vorhanden",
	duplicate_file: "Doppelte Datei",
	skipped: "Nicht relevant",
	error: "Nicht lesbar",
};

const STATUS_STYLES: Record<HistoricalProtocolImportStatus, string> = {
	ready: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
	review: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
	already_imported: "bg-muted text-muted-foreground",
	existing_protocol: "bg-primary/10 text-primary",
	duplicate_file: "bg-muted text-muted-foreground",
	skipped: "bg-muted text-muted-foreground",
	error: "bg-destructive/10 text-destructive",
};

// Render these attributes with the input itself. Safari decides whether to
// open a directory chooser from the initial file-input configuration and can
// reject a directory when an extension-based `accept` filter is present.
const DIRECTORY_INPUT_ATTRIBUTES = {
	directory: "",
	webkitdirectory: "",
} as const;

async function responseError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error ?? "Ordnerimport fehlgeschlagen";
	} catch {
		return "Ordnerimport fehlgeschlagen";
	}
}

function filePath(file: File): string {
	return file.webkitRelativePath || file.name;
}

function folderFormData(files: File[], mode: "preview" | "apply") {
	const data = new FormData();
	data.set("mode", mode);
	data.set(
		"file_metadata",
		JSON.stringify(
			files.map((file) => ({
				path: filePath(file),
				modifiedAt: new Date(file.lastModified).toISOString().slice(0, 10),
			})),
		),
	);
	for (const file of files) data.append("files", file, file.name);
	return data;
}

export function HistoricalProtocolFolderImport() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [files, setFiles] = useState<File[]>([]);
	const [preview, setPreview] = useState<HistoricalProtocolPreview | null>(
		null,
	);
	const [overrides, setOverrides] =
		useState<HistoricalProtocolClassificationOverrides>({});
	const [includedReviewReasons, setIncludedReviewReasons] = useState<string[]>(
		[],
	);
	const [statusFilter, setStatusFilter] = useState<
		HistoricalProtocolImportStatus | "all"
	>("ready");
	const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
	const setDirectoryInputRef = useCallback((node: HTMLInputElement | null) => {
		inputRef.current = node;
		if (!node) return;
		const directoryInput = node as HTMLInputElement & {
			webkitdirectory: boolean;
		};
		directoryInput.webkitdirectory = true;
		node.setAttribute("webkitdirectory", "");
		node.setAttribute("directory", "");
	}, []);

	const includedReviewRows =
		preview?.rows.filter(
			(row) =>
				row.status === "review" &&
				includedReviewReasons.includes(row.statusReason),
		) ?? [];
	const selectedCount = preview
		? preview.statusCounts.ready + includedReviewRows.length
		: 0;
	const selectedTotals = useMemo(
		() =>
			(preview?.rows ?? [])
				.filter(
					(row) =>
						row.status === "ready" ||
						(row.status === "review" &&
							includedReviewReasons.includes(row.statusReason)),
				)
				.reduce(
					(sum, row) => ({
						revenueCent: sum.revenueCent + (row.revenueCent ?? 0),
						expensesCent: sum.expensesCent + (row.expensesCent ?? 0),
						cardCent: sum.cardCent + (row.source?.cardCent ?? 0),
					}),
					{ revenueCent: 0, expensesCent: 0, cardCent: 0 },
				),
		[preview, includedReviewReasons],
	);
	const reviewGroups = useMemo(() => {
		const groups = new Map<string, number>();
		for (const row of preview?.rows ?? []) {
			if (row.status !== "review") continue;
			groups.set(row.statusReason, (groups.get(row.statusReason) ?? 0) + 1);
		}
		return Array.from(groups, ([reason, count]) => ({ reason, count })).sort(
			(a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "de"),
		);
	}, [preview]);
	const visibleRows = useMemo(
		() =>
			preview?.rows.filter(
				(row) => statusFilter === "all" || row.status === statusFilter,
			) ?? [],
		[preview, statusFilter],
	);

	function chooseFolder(next: FileList | null) {
		setFiles(next ? Array.from(next) : []);
		setPreview(null);
		setOverrides({});
		setIncludedReviewReasons([]);
	}

	async function previewFolder() {
		if (files.length === 0) return;
		setLoading("preview");
		try {
			const response = await fetch("/api/import/historical-protocols", {
				method: "POST",
				body: folderFormData(files, "preview"),
			});
			if (!response.ok) throw new Error(await responseError(response));
			const result = (await response.json()) as HistoricalProtocolPreview;
			setPreview(result);
			setOverrides(
				Object.fromEntries(
					result.classifications.map((entry) => [
						entry.key,
						entry.suggestedArea,
					]),
				),
			);
			setStatusFilter(result.statusCounts.review > 0 ? "review" : "ready");
			toast.success(`${result.spreadsheetFiles} Zählprotokolle ausgewertet`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Ordnerimport fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	async function applyFolder() {
		if (!preview || selectedCount === 0) return;
		const reviewText =
			includedReviewRows.length > 0
				? ` Darin sind ${includedReviewRows.length} ausdrücklich bestätigte Prüffälle.`
				: "";
		if (
			!window.confirm(
				`${selectedCount} historische Umsätze verbindlich importieren?${reviewText} Die Quellen und Prüfhinweise werden dauerhaft gespeichert.`,
			)
		) {
			return;
		}
		setLoading("apply");
		try {
			const data = folderFormData(files, "apply");
			data.set("confirm_digest", preview.digest);
			data.set("classification_overrides", JSON.stringify(overrides));
			data.set(
				"included_review_indices",
				JSON.stringify(includedReviewRows.map((row) => row.fileIndex)),
			);
			const response = await fetch("/api/import/historical-protocols", {
				method: "POST",
				body: data,
			});
			if (!response.ok) throw new Error(await responseError(response));
			const result = (await response.json()) as {
				created: number;
				skipped: number;
			};
			toast.success(`${result.created} historische Umsätze importiert`);
			setFiles([]);
			setPreview(null);
			setOverrides({});
			if (inputRef.current) inputRef.current.value = "";
			await queryClient.invalidateQueries();
			await router.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Ordnerimport fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	return (
		<Card className="overflow-hidden border-primary/25">
			<CardHeader className="bg-primary/[0.025]">
				<CardTitle className="flex items-center gap-2.5">
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<FolderOpen className="h-[18px] w-[18px]" />
					</span>
					Zählprotokoll-Ordner übernehmen
				</CardTitle>
				<CardDescription>
					Rendant erkennt die Jahresordner, liest ODS und XLSX und zeigt vor dem
					Import, welche historischen Daten wirklich hinzukommen.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5 pt-6">
				<div className="grid gap-3 sm:grid-cols-3">
					<ImportPrinciple
						icon={FileSearch}
						title="Inhalt statt Dateiname"
						text="Datum, Umsatz, Ausgaben, Karte, USt und Stückelung werden aus dem Protokoll gelesen."
					/>
					<ImportPrinciple
						icon={ShieldCheck}
						title="Erst prüfen"
						text="Dubletten, Hauptkasse und unsichere Werte werden vor dem Schreiben getrennt."
					/>
					<ImportPrinciple
						icon={Database}
						title="Quelle bleibt nachvollziehbar"
						text="Pfad, SHA256 und erkannte Detaildaten werden dauerhaft mitgeführt."
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="historical-protocol-folder">
						Ordner Zählprotokolle
					</Label>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							{...DIRECTORY_INPUT_ATTRIBUTES}
							ref={setDirectoryInputRef}
							id="historical-protocol-folder"
							type="file"
							multiple
							className="hidden"
							onChange={(event) => chooseFolder(event.target.files)}
							disabled={loading != null}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={loading != null}
							className="justify-start sm:min-w-64"
						>
							<FolderOpen className="mr-2 h-4 w-4" />
							{files.length > 0
								? "Anderen Ordner auswählen"
								: "Ordner auswählen"}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => void previewFolder()}
							disabled={files.length === 0 || loading != null}
							className="shrink-0"
						>
							{loading === "preview" ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<FileSearch className="mr-2 h-4 w-4" />
							)}
							Ordner auswerten
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						{files.length > 0
							? `${files.length} Dateien ausgewählt, ${(files.reduce((sum, file) => sum + file.size, 0) / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`
							: "Bis 1.500 Dateien und insgesamt 40 MB. Die Originaldateien werden nicht verändert."}
					</p>
				</div>

				{preview ? (
					<div className="space-y-5 rounded-xl border border-border/70 bg-muted/10 p-4">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<PreviewMetric
								label="Sicher importierbar"
								value={preview.statusCounts.ready}
								tone="positive"
							/>
							<PreviewMetric
								label="Prüffälle"
								value={preview.statusCounts.review}
								tone="warning"
							/>
							<PreviewMetric
								label="Schon vorhanden"
								value={
									preview.statusCounts.already_imported +
									preview.statusCounts.existing_protocol +
									preview.statusCounts.duplicate_file
								}
							/>
							<PreviewMetric
								label="Bewusst ausgelassen"
								value={
									preview.statusCounts.skipped + preview.statusCounts.error
								}
							/>
						</div>

						<div className="grid gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 sm:grid-cols-3">
							<div>
								<p className="text-xs text-muted-foreground">
									Ausgewählter Umsatz
								</p>
								<Money cent={selectedTotals.revenueCent} emphasis />
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Davon Karte</p>
								<Money cent={selectedTotals.cardCent} />
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Ausgaben</p>
								<Money cent={selectedTotals.expensesCent} />
							</div>
						</div>

						<div className="flex flex-wrap gap-2 text-xs">
							<ValueBadge>
								Zeitraum {preview.coverage.years.at(0) ?? "?"} bis{" "}
								{preview.coverage.years.at(-1) ?? "?"}
							</ValueBadge>
							<ValueBadge>
								{preview.coverage.withDenominations} mit Stückelung
							</ValueBadge>
							<ValueBadge>
								{preview.coverage.withVat} mit USt-Aufteilung
							</ValueBadge>
							<ValueBadge>
								{preview.coverage.withCard} mit Kartenzahlung
							</ValueBadge>
							<ValueBadge>
								{preview.coverage.withCashRegister} mit Kassenangabe
							</ValueBadge>
						</div>

						{preview.classifications.length > 0 ? (
							<section
								className="space-y-2"
								aria-labelledby="folder-classification-heading"
							>
								<div>
									<h3
										id="folder-classification-heading"
										className="text-sm font-semibold"
									>
										Umsatzbereiche vor dem Import zuordnen
									</h3>
									<p className="text-xs text-muted-foreground">
										Eine Änderung gilt für alle Protokolle mit derselben
										erkannten Bezeichnung.
									</p>
								</div>
								<div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-2">
									{preview.classifications.map((entry) => (
										<div
											key={entry.key}
											className="grid gap-2 rounded-lg bg-background px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{entry.label}
												</p>
												<p className="text-[11px] text-muted-foreground">
													{entry.count} Protokolle · Vorschlag{" "}
													{entry.confidence === "high"
														? "sicher"
														: entry.confidence === "medium"
															? "plausibel"
															: "unsicher"}
												</p>
											</div>
											<Select
												value={overrides[entry.key] ?? entry.suggestedArea}
												onValueChange={(value) =>
													setOverrides((current) => ({
														...current,
														[entry.key]: value as Umsatzbereich,
													}))
												}
											>
												<SelectTrigger className="w-full sm:w-48">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{UMSATZBEREICHE.map((area) => (
														<SelectItem key={area.code} value={area.code}>
															{area.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									))}
								</div>
							</section>
						) : null}

						<section
							className="space-y-2"
							aria-labelledby="folder-files-heading"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h3 id="folder-files-heading" className="text-sm font-semibold">
									Was hinzugefügt oder ausgelassen wird
								</h3>
								<Select
									value={statusFilter}
									onValueChange={(value) =>
										setStatusFilter(
											value as HistoricalProtocolImportStatus | "all",
										)
									}
								>
									<SelectTrigger size="sm" className="w-52">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">
											Alle {preview.rows.length}
										</SelectItem>
										{Object.entries(STATUS_LABELS).map(([status, label]) => (
											<SelectItem key={status} value={status}>
												{label} (
												{
													preview.statusCounts[
														status as HistoricalProtocolImportStatus
													]
												}
												)
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="max-h-96 overflow-auto rounded-lg border border-border/60">
								<table className="w-full min-w-[820px] text-left text-xs">
									<thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
										<tr>
											<th className="px-3 py-2 font-medium">Status</th>
											<th className="px-3 py-2 font-medium">Quelle</th>
											<th className="px-3 py-2 font-medium">Datum</th>
											<th className="px-3 py-2 font-medium">Details</th>
											<th className="px-3 py-2 font-medium">Bereich</th>
											<th className="px-3 py-2 text-right font-medium">
												Umsatz
											</th>
										</tr>
									</thead>
									<tbody>
										{visibleRows.map((row) => (
											<tr
												key={row.fileIndex}
												className="border-border/50 border-t align-top"
											>
												<td className="px-3 py-2">
													<span
														className={cn(
															"inline-flex rounded-full px-2 py-0.5 font-medium",
															STATUS_STYLES[row.status],
														)}
													>
														{STATUS_LABELS[row.status]}
													</span>
													<p className="mt-1 max-w-56 text-[11px] text-muted-foreground">
														{row.statusReason}
													</p>
												</td>
												<td
													className="max-w-64 truncate px-3 py-2 font-mono text-[11px]"
													title={row.path}
												>
													{row.path}
												</td>
												<td className="px-3 py-2 tabular-nums">
													{row.date ?? ""}
												</td>
												<td className="max-w-52 truncate px-3 py-2">
													{row.detail}
												</td>
												<td className="px-3 py-2">
													{row.source
														? umsatzbereichLabel(
																overrides[row.classificationKey] ??
																	row.suggestedArea,
															)
														: ""}
												</td>
												<td className="px-3 py-2 text-right">
													{row.revenueCent != null ? (
														<Money cent={row.revenueCent} />
													) : null}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								{visibleRows.length === 0 ? (
									<p className="p-6 text-center text-sm text-muted-foreground">
										Keine Dateien in dieser Auswahl.
									</p>
								) : null}
							</div>
						</section>

						{reviewGroups.length > 0 ? (
							<div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
								<div>
									<strong>Prüffälle gezielt freigeben</strong>
									<p className="text-xs opacity-80">
										Originalwerte und Warnungen bleiben dauerhaft
										nachvollziehbar.
									</p>
								</div>
								{reviewGroups.map((group) => (
									<label
										key={group.reason}
										className="flex items-start gap-3 rounded-md bg-background/60 px-2.5 py-2"
									>
										<input
											type="checkbox"
											checked={includedReviewReasons.includes(group.reason)}
											onChange={(event) =>
												setIncludedReviewReasons((current) =>
													event.target.checked
														? [...current, group.reason]
														: current.filter(
																(reason) => reason !== group.reason,
															),
												)
											}
											className="mt-0.5 h-4 w-4 accent-primary"
										/>
										<span>
											<strong>{group.count}</strong>{" "}
											{group.reason.replace(/^Vor Import prüfen: /, "")}
										</span>
									</label>
								))}
							</div>
						) : null}

						<Button
							type="button"
							className="w-full"
							onClick={() => void applyFolder()}
							disabled={selectedCount === 0 || loading != null}
						>
							{loading === "apply" ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Archive className="mr-2 h-4 w-4" />
							)}
							{selectedCount > 0
								? `${selectedCount} geprüfte Altumsätze importieren`
								: "Keine neuen Umsätze"}
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function ImportPrinciple({
	icon: Icon,
	title,
	text,
}: {
	icon: typeof CheckCircle2;
	title: string;
	text: string;
}) {
	return (
		<div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
			<Icon className="mb-2 h-4 w-4 text-primary" />
			<p className="font-semibold">{title}</p>
			<p className="mt-1 text-xs text-muted-foreground">{text}</p>
		</div>
	);
}

function PreviewMetric({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: number;
	tone?: "neutral" | "positive" | "warning";
}) {
	const Icon =
		tone === "positive"
			? CheckCircle2
			: tone === "warning"
				? AlertTriangle
				: Database;
	return (
		<div className="rounded-xl border border-border/60 bg-background p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">{label}</p>
				<Icon
					className={cn(
						"h-4 w-4",
						tone === "positive"
							? "text-emerald-600"
							: tone === "warning"
								? "text-amber-600"
								: "text-muted-foreground",
					)}
				/>
			</div>
			<p className="mt-1 font-mono text-xl font-semibold tabular-nums">
				{value}
			</p>
		</div>
	);
}

function ValueBadge({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-muted-foreground">
			{children}
		</span>
	);
}
