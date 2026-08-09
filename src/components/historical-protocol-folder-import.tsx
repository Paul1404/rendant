import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	type ColumnDef,
	createPaginatedRowModel,
	flexRender,
	rowPaginationFeature,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import {
	Archive,
	Check,
	ChevronLeft,
	ChevronRight,
	FileSearch,
	FolderOpen,
	Loader2,
	Pencil,
	RotateCcw,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
	HistoricalProtocolDraftDecision,
	HistoricalProtocolDraftDetail,
	HistoricalProtocolDraftItem,
	HistoricalProtocolDraftSummary,
	HistoricalProtocolReviewPhaseKind,
	HistoricalProtocolReviewPhaseSummary,
} from "@/lib/historical-protocol-import";
import { orpcClient } from "@/lib/orpc";
import {
	UMSATZBEREICHE,
	type Umsatzbereich,
	umsatzbereichLabel,
} from "@/lib/umsatzbereich";
import { cn } from "@/lib/utils";

const DIRECTORY_INPUT_ATTRIBUTES = {
	directory: "",
	webkitdirectory: "",
} as const;

const protocolTableFeatures = tableFeatures({
	rowPaginationFeature,
	paginatedRowModel: createPaginatedRowModel(),
});

const DECISIONS: Record<
	HistoricalProtocolDraftDecision,
	{ label: string; className: string }
> = {
	include: {
		label: "Übernehmen",
		className: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
	},
	review: {
		label: "Prüfen",
		className: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
	},
	exclude: { label: "Auslassen", className: "bg-muted text-muted-foreground" },
};

const STANDARD_REVIEW_PHASES: Array<{
	name: string;
	kind: HistoricalProtocolReviewPhaseKind;
}> = [
	{ name: "Quellen und Erkennung", kind: "source" },
	{ name: "Datum und Zeitraum", kind: "date" },
	{ name: "Umsatz, Ausgaben und Karte", kind: "amount" },
	{ name: "Umsatzbereiche und Details", kind: "assignment" },
	{ name: "Abschlusskontrolle", kind: "final" },
];

type Validation = Awaited<
	ReturnType<typeof orpcClient.historicalProtocolImport.validate>
>;

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

function folderFormData(files: File[]) {
	const data = new FormData();
	data.set("mode", "preview");
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

function centInput(cent: number | null): string {
	return cent == null ? "" : (cent / 100).toFixed(2).replace(".", ",");
}

function parseCent(value: string): number | null {
	const normalized = value.trim().replaceAll(".", "").replace(",", ".");
	if (!normalized) return null;
	const amount = Number(normalized);
	return Number.isFinite(amount) && amount >= 0
		? Math.round(amount * 100)
		: null;
}

export function HistoricalProtocolFolderImport() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [files, setFiles] = useState<File[]>([]);
	const [drafts, setDrafts] = useState<HistoricalProtocolDraftSummary[]>([]);
	const [draft, setDraft] = useState<HistoricalProtocolDraftDetail | null>(
		null,
	);
	const [validation, setValidation] = useState<Validation | null>(null);
	const [reviewPhases, setReviewPhases] = useState<
		HistoricalProtocolReviewPhaseSummary[]
	>([]);
	const [decisionFilter, setDecisionFilter] = useState<
		HistoricalProtocolDraftDecision | "all"
	>("review");
	const [query, setQuery] = useState("");
	const [editing, setEditing] = useState<HistoricalProtocolDraftItem | null>(
		null,
	);
	const [loading, setLoading] = useState<string | null>(null);

	const setDirectoryInputRef = useCallback((node: HTMLInputElement | null) => {
		inputRef.current = node;
		if (!node) return;
		const input = node as HTMLInputElement & { webkitdirectory: boolean };
		input.webkitdirectory = true;
		node.setAttribute("webkitdirectory", "");
		node.setAttribute("directory", "");
	}, []);

	const refreshDrafts = useCallback(async () => {
		try {
			setDrafts(await orpcClient.historicalProtocolImport.list());
		} catch {
			// The main page remains usable if the resume list cannot be loaded.
		}
	}, []);

	useEffect(() => {
		void refreshDrafts();
	}, [refreshDrafts]);

	const refreshReviewPhases = useCallback(async (draftId: string) => {
		try {
			setReviewPhases(
				await orpcClient.historicalProtocolImport.listReviewPhases({
					draft_id: draftId,
				}),
			);
		} catch {
			setReviewPhases([]);
		}
	}, []);

	useEffect(() => {
		if (draft) void refreshReviewPhases(draft.id);
		else setReviewPhases([]);
	}, [draft, refreshReviewPhases]);

	async function analyzeFolder() {
		if (files.length === 0) return;
		setLoading("analyze");
		try {
			const response = await fetch("/api/import/historical-protocols", {
				method: "POST",
				body: folderFormData(files),
			});
			if (!response.ok) throw new Error(await responseError(response));
			const result = (await response.json()) as HistoricalProtocolDraftDetail;
			setDraft(result);
			setReviewPhases([]);
			setValidation(null);
			setDecisionFilter(result.counts.review > 0 ? "review" : "include");
			await refreshDrafts();
			toast.success(`${result.spreadsheetFiles} Zählprotokolle strukturiert`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Ordnerimport fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	async function openDraft(id: string) {
		setLoading("open");
		try {
			const result = await orpcClient.historicalProtocolImport.get({ id });
			setDraft(result);
			await refreshReviewPhases(result.id);
			setValidation(null);
			setDecisionFilter(result.counts.review > 0 ? "review" : "include");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Entwurf konnte nicht geladen werden",
			);
		} finally {
			setLoading(null);
		}
	}

	async function changeDecision(
		item: HistoricalProtocolDraftItem,
		decision: HistoricalProtocolDraftDecision,
	) {
		if (draft?.status !== "editing" || item.decision === decision) return;
		if (decision === "include" && item.parserStatus !== "ready") {
			setEditing(item);
			return;
		}
		setLoading(item.id);
		try {
			const next = await orpcClient.historicalProtocolImport.updateItem({
				draft_id: draft.id,
				item_id: item.id,
				expected_revision: draft.revision,
				decision,
			});
			setDraft(next);
			await refreshReviewPhases(next.id);
			setValidation(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Änderung fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	async function createStandardReviewPhases() {
		if (draft?.status !== "editing") return;
		setLoading("review-phases");
		try {
			let currentRevision = draft.revision;
			const existingNames = new Set(reviewPhases.map((phase) => phase.name));
			let created = 0;
			for (const definition of STANDARD_REVIEW_PHASES) {
				if (existingNames.has(definition.name)) continue;
				const input = {
					draft_id: draft.id,
					name: definition.name,
					kind: definition.kind,
					year_from: 2022,
					year_to: 2026,
					decisions: [
						"include",
						"review",
						"exclude",
					] as HistoricalProtocolDraftDecision[],
				};
				const plan =
					await orpcClient.historicalProtocolImport.planReviewPhase(input);
				const result =
					await orpcClient.historicalProtocolImport.createReviewPhase({
						...input,
						expected_revision: currentRevision,
						selection_hash: plan.selectionHash,
					});
				currentRevision = result.draft.revision;
				created += 1;
			}
			const next = await orpcClient.historicalProtocolImport.get({
				id: draft.id,
			});
			setDraft(next);
			await refreshReviewPhases(draft.id);
			toast.success(
				created > 0
					? `${created} Prüfphasen angelegt`
					: "Die Prüfphasen sind bereits angelegt",
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Prüfphasen konnten nicht angelegt werden",
			);
			await refreshReviewPhases(draft.id);
		} finally {
			setLoading(null);
		}
	}

	async function transitionReviewPhase(
		phase: HistoricalProtocolReviewPhaseSummary,
		action: "complete" | "reopen",
	) {
		if (!draft) return;
		setLoading(`phase-${phase.id}`);
		try {
			const input = {
				phase_id: phase.id,
				expected_phase_revision: phase.revision,
				expected_draft_revision: draft.revision,
			};
			if (action === "complete") {
				await orpcClient.historicalProtocolImport.completeReviewPhase(input);
			} else {
				await orpcClient.historicalProtocolImport.reopenReviewPhase(input);
			}
			const next = await orpcClient.historicalProtocolImport.get({
				id: draft.id,
			});
			setDraft(next);
			await refreshReviewPhases(draft.id);
			setValidation(null);
			toast.success(
				action === "complete"
					? "Prüfphase abgeschlossen"
					: "Prüfphase wieder geöffnet",
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Prüfphase konnte nicht geändert werden",
			);
		} finally {
			setLoading(null);
		}
	}

	async function validateAndReady() {
		if (!draft) return;
		setLoading("validate");
		try {
			const result = await orpcClient.historicalProtocolImport.validate({
				id: draft.id,
			});
			setValidation(result);
			if (!result.valid) {
				toast.error(
					"Der Entwurf enthält noch offene oder unvollständige Zeilen",
				);
				return;
			}
			setDraft(
				await orpcClient.historicalProtocolImport.markReady({
					id: draft.id,
					expected_revision: draft.revision,
				}),
			);
			toast.success("Entwurf geprüft und für den Import gesperrt");
			await refreshDrafts();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Prüfung fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	async function reopen() {
		if (!draft) return;
		setLoading("reopen");
		try {
			setDraft(
				await orpcClient.historicalProtocolImport.reopen({
					id: draft.id,
					expected_revision: draft.revision,
				}),
			);
			setValidation(null);
			toast.success("Entwurf wieder zur Bearbeitung geöffnet");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Öffnen fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	async function applyDraft() {
		if (draft?.status !== "ready") return;
		if (
			!window.confirm(
				`${draft.counts.include} geprüfte Altumsätze verbindlich importieren? Die Arbeitswerte werden danach unveränderlich übernommen.`,
			)
		)
			return;
		setLoading("apply");
		try {
			const result = await orpcClient.historicalProtocolImport.apply({
				id: draft.id,
				expected_revision: draft.revision,
			});
			const current = await orpcClient.historicalProtocolImport.get({
				id: draft.id,
			});
			setDraft(current);
			toast.success(`${result.created} historische Umsätze importiert`);
			await refreshDrafts();
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

	const visibleItems = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase("de");
		return (draft?.items ?? []).filter((item) => {
			if (decisionFilter !== "all" && item.decision !== decisionFilter)
				return false;
			if (!needle) return true;
			return [item.path, item.detail, item.parserReason, item.area]
				.filter(Boolean)
				.join(" ")
				.toLocaleLowerCase("de")
				.includes(needle);
		});
	}, [decisionFilter, draft, query]);

	const columns = useMemo<
		ColumnDef<typeof protocolTableFeatures, HistoricalProtocolDraftItem>[]
	>(
		() => [
			{
				header: "Entscheidung",
				cell: ({ row }) => {
					const item = row.original;
					return (
						<Select
							value={item.decision}
							onValueChange={(value) =>
								void changeDecision(
									item,
									value as HistoricalProtocolDraftDecision,
								)
							}
							disabled={draft?.status !== "editing" || loading === item.id}
						>
							<SelectTrigger size="sm" className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(DECISIONS).map(([value, entry]) => (
									<SelectItem key={value} value={value}>
										{entry.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					);
				},
			},
			{
				header: "Quelle und Erkennung",
				cell: ({ row }) => (
					<div className="max-w-72">
						<p
							className="truncate font-mono text-[11px]"
							title={row.original.path}
						>
							{row.original.path}
						</p>
						<p className="mt-1 text-[11px] text-muted-foreground">
							{row.original.parserReason}
						</p>
					</div>
				),
			},
			{
				accessorKey: "date",
				header: "Datum",
				cell: ({ row }) => row.original.date ?? "",
			},
			{
				header: "Arbeitswerte",
				cell: ({ row }) => (
					<div className="max-w-56">
						<p className="truncate font-medium" title={row.original.detail}>
							{row.original.detail}
						</p>
						<p className="text-[11px] text-muted-foreground">
							{row.original.area
								? umsatzbereichLabel(row.original.area)
								: "Bereich fehlt"}
						</p>
					</div>
				),
			},
			{
				header: "Umsatz",
				cell: ({ row }) =>
					row.original.revenueCent == null ? (
						""
					) : (
						<Money cent={row.original.revenueCent} />
					),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setEditing(row.original)}
						disabled={draft?.status !== "editing"}
					>
						<Pencil className="h-4 w-4" /> Bearbeiten
					</Button>
				),
			},
		],
		[draft?.status, loading],
	);

	const table = useTable({
		features: protocolTableFeatures,
		data: visibleItems,
		columns,
		initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
	});

	return (
		<Card className="overflow-hidden border-primary/25">
			<CardHeader className="bg-primary/[0.025]">
				<CardTitle className="flex items-center gap-2.5">
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<FolderOpen className="h-[18px] w-[18px]" />
					</span>
					Zählprotokoll-Ordner übernehmen
				</CardTitle>
				<CardDescription>
					Ein gespeicherter Arbeitsstand verbindet Ordneranalyse, manuelle
					Prüfung und MCP-Korrekturen vor dem verbindlichen Import.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6 pt-6">
				<Steps status={draft?.status} hasDraft={Boolean(draft)} />

				{drafts.some(
					(item) => item.status !== "imported" && item.id !== draft?.id,
				) ? (
					<div className="rounded-xl border border-border/60 bg-muted/15 p-3">
						<p className="mb-2 text-sm font-semibold">
							Gespeicherten Arbeitsstand fortsetzen
						</p>
						<div className="flex flex-wrap gap-2">
							{drafts
								.filter(
									(item) => item.status !== "imported" && item.id !== draft?.id,
								)
								.slice(0, 5)
								.map((item) => (
									<Button
										key={item.id}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => void openDraft(item.id)}
										disabled={loading != null}
									>
										{item.folderName} · {item.counts.review} offen
									</Button>
								))}
						</div>
					</div>
				) : null}

				<div className="space-y-2">
					<Label htmlFor="historical-protocol-folder">
						1. Ordner analysieren
					</Label>
					<Input
						{...DIRECTORY_INPUT_ATTRIBUTES}
						ref={setDirectoryInputRef}
						id="historical-protocol-folder"
						type="file"
						multiple
						className="hidden"
						onChange={(event) => {
							setFiles(
								event.target.files ? Array.from(event.target.files) : [],
							);
						}}
						disabled={loading != null}
					/>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={loading != null}
							className="justify-start sm:min-w-64"
						>
							<FolderOpen className="mr-2 h-4 w-4" />
							{files.length ? "Anderen Ordner auswählen" : "Ordner auswählen"}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => void analyzeFolder()}
							disabled={!files.length || loading != null}
						>
							{loading === "analyze" ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<FileSearch className="mr-2 h-4 w-4" />
							)}
							Strukturierten Entwurf anlegen
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						{files.length
							? `${files.length} Dateien ausgewählt`
							: "Bis 1.500 Dateien und 40 MB. Originaldateien werden nicht verändert und nicht dauerhaft gespeichert."}
					</p>
				</div>

				{draft ? (
					<div className="space-y-5 rounded-xl border border-border/70 bg-muted/10 p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 className="font-semibold">{draft.folderName}</h3>
								<p className="text-xs text-muted-foreground">
									Revision {draft.revision} · {draft.spreadsheetFiles} erkannte
									Tabellen · Bearbeitbar in Rendant und per MCP
								</p>
							</div>
							<Badge variant="outline">
								{draft.status === "editing"
									? "In Bearbeitung"
									: draft.status === "ready"
										? "Geprüft und gesperrt"
										: "Importiert"}
							</Badge>
						</div>
						<div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
							<Metric
								label="Übernehmen"
								value={draft.counts.include}
								tone="positive"
							/>
							<Metric
								label="Offen"
								value={draft.counts.review}
								tone="warning"
							/>
							<Metric label="Auslassen" value={draft.counts.exclude} />
							<div className="rounded-lg border bg-background p-3 sm:col-span-3">
								<p className="text-xs text-muted-foreground">
									Ausgewählter Umsatz · Ausgaben · Karte
								</p>
								<div className="mt-1 flex flex-wrap gap-4">
									<Money cent={draft.totals.revenueCent} emphasis />
									<Money cent={draft.totals.expensesCent} />
									<Money cent={draft.totals.cardCent} tone="muted" />
								</div>
							</div>
						</div>

						<div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.025] p-3">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="text-sm font-semibold">
										Prüfplan 2022 bis 2026
									</p>
									<p className="text-xs text-muted-foreground">
										Gespeicherter Fortschritt für Rendant und MCP. Noch keine
										Prüfphase erzeugt Altumsätze.
									</p>
								</div>
								{draft.status === "editing" ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => void createStandardReviewPhases()}
										disabled={loading != null}
									>
										{loading === "review-phases" ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<ShieldCheck className="mr-2 h-4 w-4" />
										)}
										{reviewPhases.length === 0
											? "Prüfplan anlegen"
											: "Prüfplan vervollständigen"}
									</Button>
								) : null}
							</div>
							{reviewPhases.length > 0 ? (
								<div className="grid gap-2 lg:grid-cols-2">
									{reviewPhases.map((phase) => (
										<div
											key={phase.id}
											className="rounded-lg border bg-background p-3"
										>
											<div className="flex items-start justify-between gap-2">
												<div>
													<p className="text-sm font-medium">{phase.name}</p>
													<p className="text-[11px] text-muted-foreground">
														{phase.counts.completed} von {phase.counts.total}{" "}
														geprüft
														{phase.counts.issue > 0
															? ` · ${phase.counts.issue} beanstandet`
															: ""}
													</p>
												</div>
												<Badge
													variant={
														phase.status === "completed" ? "default" : "outline"
													}
												>
													{phase.status === "completed"
														? "Abgeschlossen"
														: "Aktiv"}
												</Badge>
											</div>
											<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-primary transition-[width]"
													style={{ width: `${phase.progressPercent}%` }}
												/>
											</div>
											<div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
												<span>{phase.progressPercent} Prozent</span>
												{draft.status === "editing" &&
												(phase.status === "completed" ||
													(phase.counts.pending === 0 &&
														phase.counts.issue === 0)) ? (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														onClick={() =>
															void transitionReviewPhase(
																phase,
																phase.status === "completed"
																	? "reopen"
																	: "complete",
															)
														}
														disabled={loading != null}
													>
														{phase.status === "completed"
															? "Öffnen"
															: "Abschließen"}
													</Button>
												) : null}
											</div>
										</div>
									))}
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									Noch kein Prüfplan. Der bisherige Zeilenworkflow bleibt
									verfügbar.
								</p>
							)}
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Pfad, Details oder Prüfhinweis suchen"
								className="min-w-56 flex-1"
							/>
							<Select
								value={decisionFilter}
								onValueChange={(value) =>
									setDecisionFilter(
										value as HistoricalProtocolDraftDecision | "all",
									)
								}
							>
								<SelectTrigger className="w-40">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Alle Zeilen</SelectItem>
									{Object.entries(DECISIONS).map(([value, entry]) => (
										<SelectItem key={value} value={value}>
											{entry.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="overflow-auto rounded-lg border border-border/60">
							<table className="w-full min-w-[980px] text-left text-xs">
								<thead className="bg-muted text-muted-foreground">
									{table.getHeaderGroups().map((group) => (
										<tr key={group.id}>
											{group.headers.map((header) => (
												<th key={header.id} className="px-3 py-2 font-medium">
													{header.isPlaceholder
														? null
														: flexRender(
																header.column.columnDef.header,
																header.getContext(),
															)}
												</th>
											))}
										</tr>
									))}
								</thead>
								<tbody>
									{table.getRowModel().rows.map((row) => (
										<tr
											key={row.id}
											className="border-border/50 border-t align-top"
										>
											{row.getAllCells().map((cell) => (
												<td key={cell.id} className="px-3 py-2">
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
							{table.getRowModel().rows.length === 0 ? (
								<p className="p-6 text-center text-sm text-muted-foreground">
									Keine Zeilen in dieser Auswahl.
								</p>
							) : null}
						</div>
						<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
							<span>
								{visibleItems.length} Zeilen · Seite{" "}
								{table.state.pagination.pageIndex + 1} von{" "}
								{Math.max(1, table.getPageCount())}
							</span>
							<div className="flex gap-1">
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									<ChevronLeft />
									<span className="sr-only">Vorherige Seite</span>
								</Button>
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									onClick={() => table.nextPage()}
									disabled={!table.getCanNextPage()}
								>
									<ChevronRight />
									<span className="sr-only">Nächste Seite</span>
								</Button>
							</div>
						</div>

						{validation && !validation.valid ? (
							<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
								<strong>Noch nicht importierbar:</strong> {validation.review}{" "}
								offene Prüffälle, {validation.invalidIncluded.length}{" "}
								unvollständige Übernahmen, {validation.reviewPhases.active}{" "}
								aktive Prüfphasen, {validation.reviewPhases.uncoveredIncluded}{" "}
								Übernahmen ohne Abschlusskontrolle.
							</div>
						) : null}
						{draft.status === "editing" ? (
							<Button
								type="button"
								className="w-full"
								onClick={() => void validateAndReady()}
								disabled={loading != null}
							>
								{loading === "validate" ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<ShieldCheck className="mr-2 h-4 w-4" />
								)}
								Entwurf prüfen und für Import sperren
							</Button>
						) : null}
						{draft.status === "ready" ? (
							<div className="flex flex-col gap-2 sm:flex-row">
								<Button
									type="button"
									variant="outline"
									onClick={() => void reopen()}
									disabled={loading != null}
								>
									<RotateCcw className="mr-2 h-4 w-4" />
									Weiter bearbeiten
								</Button>
								<Button
									type="button"
									className="flex-1"
									onClick={() => void applyDraft()}
									disabled={loading != null}
								>
									{loading === "apply" ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<Archive className="mr-2 h-4 w-4" />
									)}
									{draft.counts.include} Altumsätze verbindlich importieren
								</Button>
							</div>
						) : null}
						{draft.status === "imported" ? (
							<div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
								<Check className="mr-2 inline h-4 w-4" />
								Import abgeschlossen: {draft.resultCreated ?? 0} angelegt,{" "}
								{draft.resultSkipped ?? 0} bereits vorhanden.
							</div>
						) : null}
					</div>
				) : null}
			</CardContent>

			<EditItemDialog
				item={editing}
				draft={draft}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={(next) => {
					setDraft(next);
					setEditing(null);
					setValidation(null);
					void refreshReviewPhases(next.id);
				}}
			/>
		</Card>
	);
}

function EditItemDialog({
	item,
	draft,
	onOpenChange,
	onSaved,
}: {
	item: HistoricalProtocolDraftItem | null;
	draft: HistoricalProtocolDraftDetail | null;
	onOpenChange: (open: boolean) => void;
	onSaved: (draft: HistoricalProtocolDraftDetail) => void;
}) {
	const [date, setDate] = useState("");
	const [decision, setDecision] =
		useState<HistoricalProtocolDraftDecision>("review");
	const [detail, setDetail] = useState("");
	const [area, setArea] = useState<Umsatzbereich | "">("");
	const [revenue, setRevenue] = useState("");
	const [expenses, setExpenses] = useState("");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!item) return;
		setDate(item.date ?? "");
		setDecision(item.decision);
		setDetail(item.detail);
		setArea(item.area ?? "");
		setRevenue(centInput(item.revenueCent));
		setExpenses(centInput(item.expensesCent));
		setNote(item.correctionNote ?? "");
	}, [item]);

	async function save() {
		if (!item || !draft) return;
		if (note.trim().length < 3) {
			toast.error("Bitte einen kurzen Korrekturhinweis angeben");
			return;
		}
		setSaving(true);
		try {
			onSaved(
				await orpcClient.historicalProtocolImport.updateItem({
					draft_id: draft.id,
					item_id: item.id,
					expected_revision: draft.revision,
					decision,
					date: date || null,
					detail,
					umsatzbereich: area || null,
					umsatz_cent: parseCent(revenue),
					ausgaben_cent: parseCent(expenses),
					korrekturhinweis: note,
				}),
			);
			toast.success("Arbeitswerte gespeichert");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Arbeitswerte korrigieren</DialogTitle>
					<DialogDescription>
						Die erkannte Quelle bleibt unverändert. Abweichende Arbeitswerte und
						der Korrekturhinweis werden revisionssicher protokolliert.
					</DialogDescription>
				</DialogHeader>
				{item ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3 text-xs">
							<p className="font-mono">{item.path}</p>
							<p className="mt-1 text-muted-foreground">
								Erkannt: {item.detected.date ?? "kein Datum"} ·{" "}
								{item.detected.detail || "keine Details"} ·{" "}
								{item.detected.revenueCent == null
									? "kein Umsatz"
									: `${centInput(item.detected.revenueCent)} €`}
							</p>
						</div>
						<Field label="Entscheidung">
							<Select
								value={decision}
								onValueChange={(value) =>
									setDecision(value as HistoricalProtocolDraftDecision)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(DECISIONS).map(([value, entry]) => (
										<SelectItem key={value} value={value}>
											{entry.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field label="Datum">
							<Input
								type="date"
								value={date}
								onChange={(event) => setDate(event.target.value)}
							/>
						</Field>
						<Field label="Umsatzbereich">
							<Select
								value={area}
								onValueChange={(value) => setArea(value as Umsatzbereich)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Bereich wählen" />
								</SelectTrigger>
								<SelectContent>
									{UMSATZBEREICHE.map((entry) => (
										<SelectItem key={entry.code} value={entry.code}>
											{entry.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<div className="sm:col-span-2">
							<Field label="Details">
								<Input
									value={detail}
									onChange={(event) => setDetail(event.target.value)}
									maxLength={120}
								/>
							</Field>
						</div>
						<Field label="Umsatz in Euro">
							<Input
								inputMode="decimal"
								value={revenue}
								onChange={(event) => setRevenue(event.target.value)}
							/>
						</Field>
						<Field label="Ausgaben in Euro">
							<Input
								inputMode="decimal"
								value={expenses}
								onChange={(event) => setExpenses(event.target.value)}
							/>
						</Field>
						<div className="sm:col-span-2">
							<Field label="Korrekturhinweis">
								<Textarea
									value={note}
									onChange={(event) => setNote(event.target.value)}
									placeholder="Warum weicht der Arbeitswert von der Erkennung ab?"
									maxLength={1000}
								/>
							</Field>
						</div>
					</div>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Abbrechen
					</Button>
					<Button
						type="button"
						onClick={() => void save()}
						disabled={saving || !detail.trim()}
					>
						{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						Korrektur speichern
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label>{label}</Label>
			{children}
		</div>
	);
}

function Steps({
	status,
	hasDraft,
}: {
	status?: HistoricalProtocolDraftDetail["status"];
	hasDraft: boolean;
}) {
	const active = !hasDraft
		? 1
		: status === "editing"
			? 2
			: status === "ready"
				? 3
				: 4;
	return (
		<ol className="grid gap-2 sm:grid-cols-4">
			{[
				"Ordner analysieren",
				"Daten bearbeiten",
				"Prüfen und sperren",
				"Verbindlich importieren",
			].map((label, index) => {
				const step = index + 1;
				return (
					<li
						key={label}
						className={cn(
							"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
							step === active
								? "border-primary bg-primary/5 font-semibold text-foreground"
								: step < active
									? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
									: "text-muted-foreground",
						)}
					>
						<span className="flex h-5 w-5 items-center justify-center rounded-full border font-mono">
							{step < active ? <Check className="h-3 w-3" /> : step}
						</span>
						{label}
					</li>
				);
			})}
		</ol>
	);
}

function Metric({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone?: "positive" | "warning";
}) {
	return (
		<div className="rounded-lg border bg-background p-3">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p
				className={cn(
					"mt-1 font-mono text-xl font-semibold",
					tone === "positive" && "text-emerald-700 dark:text-emerald-300",
					tone === "warning" && "text-amber-700 dark:text-amber-300",
				)}
			>
				{value}
			</p>
		</div>
	);
}
