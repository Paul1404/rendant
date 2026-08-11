import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import {
	Archive,
	Ban,
	ChevronLeft,
	ChevronRight,
	Download,
	Eye,
	FileArchive,
	Loader2,
	Pencil,
	Search,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateDe } from "@/lib/date";
import { DENOMINATIONS } from "@/lib/denominations";
import { formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpc, orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import {
	UMSATZBEREICHE,
	type Umsatzbereich,
	umsatzbereichLabel,
} from "@/lib/umsatzbereich";
import { cn } from "@/lib/utils";

const historicalTableFeatures = tableFeatures({});
const DIRECTORY_INPUT_ATTRIBUTES = {
	directory: "",
	webkitdirectory: "",
} as const;

type HistoricalPage = Awaited<
	ReturnType<typeof orpcClient.historicalRevenue.page>
>;
type HistoricalRow = HistoricalPage["items"][number];
type HistoricalDetail = Awaited<
	ReturnType<typeof orpcClient.historicalRevenue.get>
>;
type HistoricalSource = NonNullable<HistoricalDetail["source"]>;
type PageSize = 25 | 50 | 100;
type SortKey = "date" | "revenue" | "expenses" | "result" | "created_at";

export function HistoricalRevenueTable({
	years,
	canManage,
}: {
	years: number[];
	canManage: boolean;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<PageSize>(25);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query.trim());
	const [year, setYear] = useState("all");
	const [area, setArea] = useState<Umsatzbereich | "all">("all");
	const [includeCanceled, setIncludeCanceled] = useState(false);
	const [sort, setSort] = useState<SortKey>("date");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [archiving, setArchiving] = useState(false);

	const input = {
		page,
		page_size: pageSize,
		query: deferredQuery || undefined,
		year: year === "all" ? undefined : Number(year),
		umsatzbereich: area === "all" ? undefined : area,
		include_storniert: includeCanceled,
		sort,
		direction: "desc" as const,
	};
	const pageQuery = useQuery({
		...orpc.historicalRevenue.page.queryOptions({ input }),
		placeholderData: (previous) => previous,
	});
	const data = pageQuery.data;
	useEffect(() => {
		if (data && page > Math.max(data.pageCount, 1)) {
			setPage(Math.max(data.pageCount, 1));
		}
	}, [data, page]);

	function resetPage() {
		setPage(1);
	}

	async function refresh() {
		await queryClient.invalidateQueries();
		await router.invalidate();
	}

	async function archiveFolder(files: FileList | null) {
		if (!files || files.length === 0) return;
		setArchiving(true);
		try {
			const form = new FormData();
			for (const file of Array.from(files)) form.append("files", file);
			const response = await fetch("/api/import/historical-sources", {
				method: "POST",
				body: form,
			});
			const result = (await response.json()) as {
				error?: string;
				matched?: number;
				archived?: number;
				existing?: number;
				unmatched?: number;
			};
			if (!response.ok)
				throw new Error(result.error ?? "Archivierung fehlgeschlagen");
			toast.success(
				`${result.matched ?? 0} Quellen zugeordnet, ${result.archived ?? 0} neu archiviert`,
			);
			if ((result.unmatched ?? 0) > 0) {
				toast.info(
					`${result.unmatched} Dateien gehören nicht zu den importierten Daten`,
				);
			}
			await refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Archivierung fehlgeschlagen",
			);
		} finally {
			setArchiving(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	const columns = useMemo<
		ColumnDef<typeof historicalTableFeatures, HistoricalRow>[]
	>(
		() => [
			{
				accessorKey: "anlass_datum",
				header: "Datum",
				cell: ({ row }) => formatDateDe(row.original.anlass_datum),
			},
			{
				accessorKey: "anlass",
				header: "Veranstaltung",
				cell: ({ row }) => (
					<div className="max-w-[32rem] whitespace-normal">
						<p className="font-medium">{row.original.anlass}</p>
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{row.original.quelle_pfad ??
								row.original.quellreferenz ??
								"Manuell erfasst"}
						</p>
					</div>
				),
			},
			{
				accessorKey: "umsatzbereich",
				header: "Umsatzbereich",
				cell: ({ row }) =>
					row.original.umsatzbereich
						? umsatzbereichLabel(row.original.umsatzbereich as Umsatzbereich)
						: row.original.vergleichsgruppe,
			},
			{
				accessorKey: "umsatz_cent",
				header: "Umsatz",
				cell: ({ row }) => <Money cent={row.original.umsatz_cent} emphasis />,
			},
			{
				id: "result",
				header: "Ergebnis",
				cell: ({ row }) => (
					<Money cent={row.original.umsatz_cent - row.original.ausgaben_cent} />
				),
			},
			{
				id: "source",
				header: "Original",
				cell: ({ row }) =>
					row.original.source_archived ? (
						<Badge variant="secondary">Archiviert</Badge>
					) : row.original.quelle_sha256 ? (
						<Badge variant="outline">Fehlt</Badge>
					) : (
						<span className="text-xs text-muted-foreground">Keine Datei</span>
					),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge
						variant={row.original.storniert_am ? "destructive" : "secondary"}
					>
						{row.original.storniert_am ? "Storniert" : "Aktiv"}
					</Badge>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setSelectedId(row.original.id)}
					>
						<Eye className="mr-1 h-4 w-4" />
						Details
					</Button>
				),
			},
		],
		[],
	);
	const table = useTable({
		features: historicalTableFeatures,
		data: data?.items ?? [],
		columns,
		getRowId: (row) => row.id,
	});

	return (
		<section className="space-y-4" aria-labelledby="historical-list-heading">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id="historical-list-heading" className="text-lg font-semibold">
						Erfasste Altunterlagen
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Durchsuchbare Einzelwerte mit Originalquelle und Korrekturverlauf.
					</p>
				</div>
				{canManage ? (
					<>
						<input
							ref={inputRef}
							type="file"
							multiple
							accept=".ods,.xlsx"
							className="sr-only"
							{...DIRECTORY_INPUT_ATTRIBUTES}
							onChange={(event) => void archiveFolder(event.target.files)}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={archiving}
							onClick={() => inputRef.current?.click()}
						>
							{archiving ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<FileArchive className="mr-2 h-4 w-4" />
							)}
							Originaldateien zuordnen
						</Button>
					</>
				) : null}
			</div>

			<div className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_10rem_14rem_11rem_auto]">
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							resetPage();
						}}
						placeholder="Altunterlagen durchsuchen"
						className="pl-9"
					/>
				</div>
				<Select
					value={year}
					onValueChange={(value) => {
						setYear(value);
						resetPage();
					}}
				>
					<SelectTrigger aria-label="Kalenderjahr">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Alle Jahre</SelectItem>
						{years.map((value) => (
							<SelectItem key={value} value={String(value)}>
								{value}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={area}
					onValueChange={(value) => {
						setArea(value as Umsatzbereich | "all");
						resetPage();
					}}
				>
					<SelectTrigger aria-label="Umsatzbereich">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Alle Umsatzbereiche</SelectItem>
						{UMSATZBEREICHE.map((value) => (
							<SelectItem key={value.code} value={value.code}>
								{value.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={sort}
					onValueChange={(value) => {
						setSort(value as SortKey);
						resetPage();
					}}
				>
					<SelectTrigger aria-label="Sortierung">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="date">Neueste zuerst</SelectItem>
						<SelectItem value="revenue">Höchster Umsatz</SelectItem>
						<SelectItem value="expenses">Höchste Ausgaben</SelectItem>
						<SelectItem value="result">Höchstes Ergebnis</SelectItem>
						<SelectItem value="created_at">Zuletzt erfasst</SelectItem>
					</SelectContent>
				</Select>
				<label className="flex items-center gap-2 rounded-lg border px-3 text-xs">
					<input
						type="checkbox"
						checked={includeCanceled}
						onChange={(event) => {
							setIncludeCanceled(event.target.checked);
							resetPage();
						}}
						className="accent-primary"
					/>
					Stornierte
				</label>
			</div>

			<div className="overflow-hidden rounded-xl border bg-card shadow-sm">
				<Table>
					<TableHeader className="bg-muted/40">
						{table.getHeaderGroups().map((group) => (
							<TableRow key={group.id}>
								{group.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{pageQuery.isLoading ? (
							<TableRow>
								<TableCell
									colSpan={8}
									className="py-12 text-center text-muted-foreground"
								>
									<Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
									Altunterlagen werden geladen
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={8}
									className="py-12 text-center text-muted-foreground"
								>
									Keine passenden Altunterlagen gefunden.
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									className={cn(row.original.storniert_am && "opacity-65")}
								>
									{row.getAllCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
				<span>
					{data?.total ?? 0} Einträge · Seite {page} von{" "}
					{Math.max(data?.pageCount ?? 1, 1)}
				</span>
				<div className="flex items-center gap-2">
					<span>Einträge pro Seite</span>
					<Select
						value={String(pageSize)}
						onValueChange={(value) => {
							setPageSize(Number(value) as PageSize);
							resetPage();
						}}
					>
						<SelectTrigger size="sm" aria-label="Einträge pro Seite">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[25, 50, 100].map((value) => (
								<SelectItem key={value} value={String(value)}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="icon-sm"
						variant="outline"
						onClick={() => setPage((value) => Math.max(1, value - 1))}
						disabled={page <= 1}
					>
						<ChevronLeft />
						<span className="sr-only">Vorherige Seite</span>
					</Button>
					<Button
						type="button"
						size="icon-sm"
						variant="outline"
						onClick={() => setPage((value) => value + 1)}
						disabled={!data || page >= data.pageCount}
					>
						<ChevronRight />
						<span className="sr-only">Nächste Seite</span>
					</Button>
				</div>
			</div>

			<HistoricalRevenueDetailDialog
				id={selectedId}
				open={Boolean(selectedId)}
				onOpenChange={(open) => {
					if (!open) setSelectedId(null);
				}}
				canManage={canManage}
				onChanged={refresh}
			/>
		</section>
	);
}

function HistoricalRevenueDetailDialog({
	id,
	open,
	onOpenChange,
	canManage,
	onChanged,
}: {
	id: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	canManage: boolean;
	onChanged: () => Promise<void>;
}) {
	const [correcting, setCorrecting] = useState(false);
	const detailQuery = useQuery({
		...orpc.historicalRevenue.get.queryOptions({
			input: { id: id ?? "00000000-0000-4000-8000-000000000000" },
		}),
		enabled: Boolean(id && open),
	});
	const detail = detailQuery.data;
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				setCorrecting(false);
				onOpenChange(value);
			}}
		>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Altunterlage prüfen</DialogTitle>
					<DialogDescription>
						Originalwerte, Herkunft und Korrekturverlauf bleiben gemeinsam
						nachvollziehbar.
					</DialogDescription>
				</DialogHeader>
				{!detail ? (
					<div className="py-12 text-center text-muted-foreground">
						<Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
						Details werden geladen
					</div>
				) : correcting ? (
					<CorrectionForm
						detail={detail}
						onCancel={() => setCorrecting(false)}
						onDone={async () => {
							setCorrecting(false);
							await detailQuery.refetch();
							await onChanged();
						}}
					/>
				) : (
					<div className="space-y-5">
						<div className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-3">
							<DetailValue
								label="Datum"
								value={formatDateDe(detail.anlass_datum)}
							/>
							<DetailValue
								label="Umsatz"
								value={`${formatCentPlain(detail.umsatz_cent)} EUR`}
							/>
							<DetailValue
								label="Ergebnis"
								value={`${formatCentPlain(detail.umsatz_cent - detail.ausgaben_cent)} EUR`}
							/>
							<div className="sm:col-span-3">
								<DetailValue label="Veranstaltung" value={detail.anlass} />
							</div>
						</div>
						{detail.source ? (
							<div className="space-y-3 rounded-xl border p-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="font-medium">Originalquelle</p>
										<p className="text-xs text-muted-foreground">
											{detail.source.path ?? "Pfad nicht gespeichert"}
										</p>
									</div>
									{detail.source.archive ? (
										<Button asChild size="sm" variant="outline">
											<a href={`/api/historical-revenues/${detail.id}/source`}>
												<Download className="mr-2 h-4 w-4" />
												Original herunterladen
											</a>
										</Button>
									) : (
										<Badge variant="outline">
											Original noch nicht archiviert
										</Badge>
									)}
								</div>
								<p className="break-all font-mono text-[11px] text-muted-foreground">
									SHA256 {detail.source.sha256}
								</p>
								<SourceAccountingEvidence source={detail.source} />
								{detail.source.warnings?.length ? (
									<ul className="list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-200">
										{detail.source.warnings.map((warning) => (
											<li key={warning}>{warning}</li>
										))}
									</ul>
								) : null}
							</div>
						) : null}
						{detail.predecessor ? (
							<p className="rounded-lg bg-muted px-3 py-2 text-xs">
								Dieser Eintrag korrigiert „{detail.predecessor.anlass}“ vom{" "}
								{formatDateDe(detail.predecessor.anlass_datum)}.
							</p>
						) : null}
						{detail.successor ? (
							<p className="rounded-lg bg-muted px-3 py-2 text-xs">
								Dieser stornierte Eintrag wurde durch „{detail.successor.anlass}
								“ ersetzt.
							</p>
						) : null}
						<DialogFooter>
							{canManage && !detail.storniert_am && !detail.successor ? (
								<Button type="button" onClick={() => setCorrecting(true)}>
									<Pencil className="mr-2 h-4 w-4" />
									Korrektur anlegen
								</Button>
							) : null}
							{canManage && !detail.storniert_am && !detail.successor ? (
								<HistoricalCancelButton
									detail={detail}
									onDone={async () => {
										await detailQuery.refetch();
										await onChanged();
									}}
								/>
							) : null}
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function CorrectionForm({
	detail,
	onCancel,
	onDone,
}: {
	detail: NonNullable<HistoricalDetail>;
	onCancel: () => void;
	onDone: () => Promise<void>;
}) {
	const idempotencyKey = useRef(crypto.randomUUID());
	const prefix = detail.umsatzbereich
		? `${umsatzbereichLabel(detail.umsatzbereich as Umsatzbereich)} · `
		: "";
	const form = useForm({
		defaultValues: {
			date: detail.anlass_datum,
			area: (detail.umsatzbereich ?? "sonstiges") as Umsatzbereich,
			detail: detail.anlass.startsWith(prefix)
				? detail.anlass.slice(prefix.length)
				: detail.anlass,
			revenue: formatCentPlain(detail.umsatz_cent),
			expenses: formatCentPlain(detail.ausgaben_cent),
			note: detail.bemerkung ?? "",
			reason: "",
		},
		onSubmit: async ({ value }) => {
			const revenue = parseGermanAmount(value.revenue);
			const expenses = parseGermanAmount(value.expenses);
			if (
				revenue == null ||
				expenses == null ||
				value.reason.trim().length < 5
			) {
				toast.error("Bitte Beträge und Korrekturbegründung vollständig prüfen");
				return;
			}
			try {
				await orpcClient.historicalRevenue.correct({
					id: detail.id,
					idempotency_key: idempotencyKey.current,
					anlass_datum: value.date,
					anlass_katalog_id: null,
					umsatzbereich: value.area,
					veranstaltungsbezeichnung: value.detail.trim(),
					umsatz_cent: revenue,
					ausgaben_cent: expenses,
					bemerkung: value.note.trim() || null,
					korrektur_grund: value.reason.trim(),
				});
				toast.success("Korrektur revisionssicher angelegt");
				await onDone();
			} catch (error) {
				toast.error(orpcMessage(error, "Korrektur fehlgeschlagen"));
			}
		},
	});
	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
				<p className="font-medium">Vorher</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{detail.anlass} · {formatCentPlain(detail.umsatz_cent)} EUR Umsatz ·{" "}
					{formatCentPlain(detail.ausgaben_cent)} EUR Ausgaben
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<form.Field name="date">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="historical-correction-date">Datum</Label>
							<Input
								id="historical-correction-date"
								type="date"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
							/>
						</div>
					)}
				</form.Field>
				<form.Field name="area">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="historical-correction-area">Umsatzbereich</Label>
							<Select
								value={field.state.value}
								onValueChange={(value) =>
									field.handleChange(value as Umsatzbereich)
								}
							>
								<SelectTrigger id="historical-correction-area">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{UMSATZBEREICHE.map((value) => (
										<SelectItem key={value.code} value={value.code}>
											{value.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>
				<form.Field name="detail">
					{(field) => (
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="historical-correction-detail">Details</Label>
							<Input
								id="historical-correction-detail"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
								maxLength={120}
							/>
						</div>
					)}
				</form.Field>
				<form.Field name="revenue">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="historical-correction-revenue">Umsatz EUR</Label>
							<Input
								id="historical-correction-revenue"
								inputMode="decimal"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
							/>
						</div>
					)}
				</form.Field>
				<form.Field name="expenses">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="historical-correction-expenses">
								Ausgaben EUR
							</Label>
							<Input
								id="historical-correction-expenses"
								inputMode="decimal"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
							/>
						</div>
					)}
				</form.Field>
				<form.Field name="note">
					{(field) => (
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="historical-correction-note">Bemerkung</Label>
							<Textarea
								id="historical-correction-note"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
								maxLength={2000}
							/>
						</div>
					)}
				</form.Field>
				<form.Field name="reason">
					{(field) => (
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="historical-correction-reason">
								Korrekturbegründung
							</Label>
							<Textarea
								id="historical-correction-reason"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
								minLength={5}
								maxLength={500}
								required
							/>
						</div>
					)}
				</form.Field>
			</div>
			<p className="text-xs text-muted-foreground">
				Beim Speichern wird der bisherige Eintrag storniert und ein verknüpfter
				Nachfolger angelegt. Das Original bleibt unverändert erhalten.
			</p>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					Abbrechen
				</Button>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(pending) => (
						<Button type="submit" disabled={pending}>
							{pending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Archive className="mr-2 h-4 w-4" />
							)}
							Korrektur speichern
						</Button>
					)}
				</form.Subscribe>
			</div>
		</form>
	);
}

function HistoricalCancelButton({
	detail,
	onDone,
}: {
	detail: { id: string; anlass: string };
	onDone: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);
	async function cancel() {
		if (reason.trim().length < 5) return;
		setPending(true);
		try {
			await orpcClient.historicalRevenue.cancel({
				id: detail.id,
				storno_grund: reason.trim(),
			});
			toast.success("Historischer Umsatz storniert");
			setOpen(false);
			await onDone();
		} catch (error) {
			toast.error(orpcMessage(error, "Stornierung fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}
	return (
		<>
			<Button type="button" variant="outline" onClick={() => setOpen(true)}>
				<Ban className="mr-2 h-4 w-4" />
				Nur stornieren
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Historischen Umsatz stornieren</AlertDialogTitle>
						<AlertDialogDescription>
							Der Eintrag bleibt erhalten und wird nicht mehr ausgewertet.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Label htmlFor="historical-cancel-reason">Begründung</Label>
						<Textarea
							id="historical-cancel-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							minLength={5}
							maxLength={500}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
						<AlertDialogAction
							disabled={reason.trim().length < 5 || pending}
							onClick={(event) => {
								event.preventDefault();
								void cancel();
							}}
						>
							{pending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Stornieren
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function DetailValue({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="mt-0.5 font-medium">{value}</p>
		</div>
	);
}

function SourceAccountingEvidence({ source }: { source: HistoricalSource }) {
	const denominations = source.denominations
		? DENOMINATIONS.flatMap((denomination) => {
				const count = source.denominations?.[denomination.key] ?? 0;
				return count > 0 ? [{ ...denomination, count }] : [];
			})
		: [];
	return (
		<div className="space-y-3 text-xs">
			<div className="grid gap-2 sm:grid-cols-3">
				<DetailValue
					label="Kasse"
					value={
						source.cashRegisterLabel ??
						source.cashRegisterNumber ??
						"Nicht angegeben"
					}
				/>
				<DetailValue
					label="Gezählt von"
					value={source.countedBy ?? "Nicht angegeben"}
				/>
				<DetailValue
					label="Wechselgeld"
					value={moneyOrUnknown(source.openingCent)}
				/>
				<DetailValue
					label="Bargeldumsatz"
					value={moneyOrUnknown(source.cashRevenueCent)}
				/>
				<DetailValue
					label="Kartenzahlung"
					value={moneyOrUnknown(source.cardCent)}
				/>
				<DetailValue
					label="Gezählter Bestand"
					value={moneyOrUnknown(source.countedCent)}
				/>
			</div>
			{source.vat?.length ? (
				<div>
					<p className="font-medium">Umsatzsteuer-Aufteilung</p>
					<div className="mt-1 flex flex-wrap gap-1.5">
						{source.vat.map((row) => (
							<Badge key={row.ust_basis_punkte} variant="outline">
								{(row.ust_basis_punkte / 100).toLocaleString("de-DE")} %:{" "}
								{formatCentPlain(row.betrag_cent)} EUR
							</Badge>
						))}
					</div>
				</div>
			) : null}
			{denominations.length ? (
				<div>
					<p className="font-medium">Erkannte Stückelung</p>
					<div className="mt-1 flex flex-wrap gap-1.5">
						{denominations.map((row) => (
							<Badge key={row.key} variant="outline">
								{row.count} × {row.label}
							</Badge>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

function moneyOrUnknown(value: number | null | undefined): string {
	return value == null ? "Nicht bekannt" : `${formatCentPlain(value)} EUR`;
}
