import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ColumnDef,
	columnFilteringFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_includesString,
	globalFilteringFeature,
	type PaginationState,
	rowPaginationFeature,
	rowSortingFeature,
	type SortingState,
	sortFn_text,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import {
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	CalendarRange,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Download,
	FileCheck2,
	Loader2,
	Pencil,
	Plus,
	ReceiptText,
	RotateCcw,
	Upload,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CancelReasonDialog } from "@/components/ui/cancel-reason-dialog";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input, SearchInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
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
import { formatDateDe, todayIsoDate } from "@/lib/date";
import {
	formatMinutes,
	type HelperHourCategory,
	minutesFromCent,
} from "@/lib/helper-hours";
import { parseGermanAmount } from "@/lib/money";
import { orpc, orpcClient } from "@/lib/orpc";

type ImportCategory = {
	code: string;
	label: string;
	art: "verein" | "abteilung";
	aktiv: boolean;
};

type Preview = {
	valid: boolean;
	digest: string;
	rows: number;
	toImport: number;
	replaces: number;
	sheets: string[];
	unknownColumns: string[];
	similarNames: Array<{
		left: string;
		right: string;
		leftEntries: number;
		rightEntries: number;
		leftMinutes: number;
		rightMinutes: number;
	}>;
	repairs: number;
	repairSample: Array<{
		sheet: string;
		row: number;
		before: string;
		after: string;
		beforeDate: string;
		afterDate: string;
		repairs: string[];
	}>;
	hours: number;
	warnings: number;
	errors: Array<{ sheet: string; row: number; message: string }>;
	warningSample: Array<{ sheet: string; row: number; warnings: string[] }>;
	reviewRows: HelperHoursReviewRow[];
	categories: ImportCategory[];
	sample: Array<{
		sheet: string;
		row: number;
		date: string;
		event: string;
		name: string;
		minutes: number;
		warnings: string[];
	}>;
};

type ExpensePreview = {
	valid: boolean;
	digest: string;
	rows: number;
	toImport: number;
	alreadyImported: number;
	missing: number;
	minutes: number;
	cent: number;
	errors: Array<{ sheet: string; row: number; message: string }>;
	sample: Array<{
		sheet: string;
		row: number;
		date: string;
		category: string;
		description: string;
		minutes: number;
	}>;
};

type HelperHoursImportIssue =
	| "missing_name"
	| "total_mismatch"
	| "unknown_date";
/** Minutes per category code; categories without minutes are absent. */
type HelperHoursAllocations = Record<string, number>;
type HelperHoursReviewRow = {
	sheet: string;
	rowNumber: number;
	date: string;
	event: string;
	vorname: string;
	nachname: string;
	allocations: HelperHoursAllocations;
	gemeldete_summe_minuten: number;
	issues: HelperHoursImportIssue[];
	warnings: string[];
};
type HelperHoursCorrection = Pick<
	HelperHoursReviewRow,
	| "sheet"
	| "rowNumber"
	| "vorname"
	| "nachname"
	| "allocations"
	| "gemeldete_summe_minuten"
> & { acceptedIssues: HelperHoursImportIssue[] };

type CategoryOption = HelperHourCategory & {
	entries: number;
	minutes: number;
	expenses: number;
};

function useHelperHourCategories() {
	const { data } = useQuery(orpc.helperHours.categories.queryOptions({}));
	return (data ?? []) as CategoryOption[];
}

/** Active categories, plus any inactive one that still holds hours. */
function selectableCategories(categories: CategoryOption[]) {
	return categories.filter((entry) => entry.aktiv);
}

function categoryLabel(
	categories: Array<{ code: string; label: string }>,
	code: string,
) {
	return categories.find((entry) => entry.code === code)?.label ?? code;
}

function parseHours(value: string): number | null {
	const hours = Number(value.trim().replace(",", "."));
	if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
	const minutes = Math.round(hours * 60);
	return minutes % 15 === 0 ? minutes : null;
}

export function HelperHoursPage({
	isAdmin,
	year,
	onYearChange,
}: {
	isAdmin: boolean;
	year?: number;
	onYearChange: (year?: number) => void;
}) {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, refetch } = useQuery(
		orpc.helperHours.list.queryOptions({ input: { jahr: year } }),
	);
	const [selectedDepartment, setSelectedDepartment] = useState<string | null>(
		null,
	);
	const [saving, setSaving] = useState(false);
	const key = useRef<string | null>(null);
	const [form, setForm] = useState({
		datum: todayIsoDate(),
		veranstaltung: "",
		vorname: "",
		nachname: "",
		stunden: "",
		kategorie: "gesamtverein",
		bemerkung: "",
	});
	const categories = useHelperHourCategories();
	const options = selectableCategories(categories);
	// The list is configurable, so the form falls back to whatever exists rather
	// than to a hard-coded department.
	const selectedCategory = options.some(
		(entry) => entry.code === form.kategorie,
	)
		? form.kategorie
		: (options.find((entry) => entry.art === "verein")?.code ??
			options[0]?.code ??
			"");
	const departments = data?.budgets ?? [];
	const activeDepartment =
		departments.find((entry) => entry.code === selectedDepartment)?.code ??
		departments[0]?.code ??
		null;
	async function refreshHours() {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.list.key({ type: "query" }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.entries.key({ type: "query" }),
			}),
		]);
	}
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const minuten = parseHours(form.stunden);
		if (!minuten) {
			toast.error("Bitte Stunden in Viertelstunden angeben, zum Beispiel 2,5");
			return;
		}
		setSaving(true);
		try {
			key.current ??= crypto.randomUUID();
			await orpcClient.helperHours.create({
				idempotency_key: key.current,
				datum: form.datum,
				veranstaltung: form.veranstaltung,
				nachname: form.nachname,
				vorname: form.vorname,
				kategorie: selectedCategory,
				minuten,
				bemerkung: form.bemerkung,
			});
			key.current = null;
			setForm({
				...form,
				vorname: "",
				nachname: "",
				stunden: "",
				bemerkung: "",
			});
			await refreshHours();
			toast.success("Helferstunde gespeichert");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(false);
		}
	}
	// Without this the zeros below would be indistinguishable from a year that
	// genuinely has no recorded hours.
	if (isError) {
		return (
			<QueryError
				title="Helferstunden konnten nicht geladen werden."
				description="Die angezeigten Zahlen wären unvollständig. Die erfassten Stunden sind unverändert gespeichert."
				onRetry={() => void refetch()}
			/>
		);
	}

	return (
		<div className="space-y-6">
			<HelperHoursPeriodOverview
				year={year}
				years={data?.years ?? []}
				summary={data?.summary ?? { entries: 0, helpers: 0, minutes: 0 }}
				distribution={data?.distribution ?? []}
				isLoading={isLoading}
				onYearChange={onYearChange}
			/>
			<HelperOverview
				year={year}
				helpers={data?.helpers ?? []}
				totalMinutes={data?.summary.minutes ?? 0}
				isLoading={isLoading}
			/>
			<HelperHoursBudgets
				budgets={data?.budgets ?? []}
				contributions={data?.contributions ?? []}
				expenses={data?.expenses ?? []}
				valueCent={data?.valueCent ?? 600}
				selected={activeDepartment}
				onSelected={setSelectedDepartment}
				isAdmin={isAdmin}
				onChanged={() =>
					queryClient.invalidateQueries({
						queryKey: orpc.helperHours.list.key({ type: "query" }),
					})
				}
			/>
			<Card variant="hero">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Plus className="h-4 w-4 text-primary" />
						Helferstunde erfassen
					</CardTitle>
					<CardDescription>
						Person, Anlass und Stunden. Die Zuordnung ist mit einem Klick
						erledigt.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
						onSubmit={submit}
					>
						<div className="space-y-1.5 lg:col-span-3">
							<Label htmlFor="hh-date">Datum</Label>
							<Input
								id="hh-date"
								type="date"
								value={form.datum}
								onChange={(e) => setForm({ ...form, datum: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
							<Label htmlFor="hh-event">Veranstaltung</Label>
							<Input
								id="hh-event"
								value={form.veranstaltung}
								onChange={(e) =>
									setForm({ ...form, veranstaltung: e.target.value })
								}
								placeholder="z. B. Sommerfest"
								maxLength={160}
								required
							/>
						</div>
						<div className="space-y-1.5 lg:col-span-2">
							<Label htmlFor="hh-first">Vorname</Label>
							<Input
								id="hh-first"
								value={form.vorname}
								onChange={(e) => setForm({ ...form, vorname: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1.5 lg:col-span-2">
							<Label htmlFor="hh-last">Nachname</Label>
							<Input
								id="hh-last"
								value={form.nachname}
								onChange={(e) => setForm({ ...form, nachname: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1.5 lg:col-span-3">
							<Label htmlFor="hh-hours">Stunden</Label>
							<Input
								id="hh-hours"
								inputMode="decimal"
								value={form.stunden}
								onChange={(e) => setForm({ ...form, stunden: e.target.value })}
								placeholder="2,5"
								required
							/>
							<div className="flex gap-1">
								{[1, 2, 3, 4, 5].map((h) => (
									<Button
										key={h}
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setForm({ ...form, stunden: String(h) })}
									>
										{h} h
									</Button>
								))}
							</div>
						</div>
						<div className="space-y-1.5 lg:col-span-4">
							<Label>Zuordnung</Label>
							<Select
								value={selectedCategory}
								onValueChange={(value) =>
									setForm({ ...form, kategorie: value })
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{options.map((c) => (
										<SelectItem key={c.code} value={c.code}>
											{c.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
							<Label htmlFor="hh-note">Bemerkung</Label>
							<Textarea
								id="hh-note"
								value={form.bemerkung}
								onChange={(e) =>
									setForm({ ...form, bemerkung: e.target.value })
								}
								placeholder="Optional"
								rows={2}
							/>
						</div>
						<div className="flex items-end sm:col-span-2 lg:col-span-12">
							<Button className="w-full sm:w-auto" disabled={saving}>
								{saving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Plus className="mr-2 h-4 w-4" />
								)}
								Speichern
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
			{isAdmin ? <HelperHoursImport onImported={refreshHours} /> : null}
			{isAdmin ? (
				<HelperHourExpenseImport
					onImported={() =>
						queryClient.invalidateQueries({
							queryKey: orpc.helperHours.list.key({ type: "query" }),
						})
					}
				/>
			) : null}
			<HelperHoursEntries year={year} />
		</div>
	);
}

type HelperHourEntriesPage = Awaited<
	ReturnType<typeof orpcClient.helperHours.entries>
>;
type HelperHourEntry = HelperHourEntriesPage["items"][number];
type HelperHourEntrySort = "date" | "helper" | "event" | "source" | "hours";
type HelperHourEntrySource = "alle" | "manuell" | "excel";
type HelperHourEntryCategory = "alle" | (string & {});

const helperHourEntryTableFeatures = tableFeatures({
	rowSortingFeature,
	rowPaginationFeature,
});
const EMPTY_HELPER_HOUR_ENTRIES: HelperHourEntry[] = [];

function entryAllocations(entry: HelperHourEntry): string {
	return (
		entry.allocations
			.map(
				(allocation) =>
					`${allocation.label}: ${formatMinutes(allocation.minuten)} h`,
			)
			.join(" · ") || "Ohne Zuordnung"
	);
}

function HelperHoursEntries({ year }: { year?: number }) {
	// Retired categories stay filterable as long as hours are booked on them.
	const entryCategories = useHelperHourCategories().filter(
		(entry) => entry.aktiv || entry.entries > 0,
	);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query.trim());
	const [source, setSource] = useState<HelperHourEntrySource>("alle");
	const [category, setCategory] = useState<HelperHourEntryCategory>("alle");
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "date", desc: true },
	]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 25,
	});
	const sort = (sorting[0]?.id ?? "date") as HelperHourEntrySort;
	const entriesQuery = useQuery({
		...orpc.helperHours.entries.queryOptions({
			input: {
				jahr: year,
				page: pagination.pageIndex + 1,
				page_size: pagination.pageSize,
				query: deferredQuery || undefined,
				quelle: source === "alle" ? undefined : source,
				kategorie: category === "alle" ? undefined : category,
				sort,
				direction: sorting[0]?.desc === false ? "asc" : "desc",
			},
		}),
		placeholderData: (previous) => previous,
	});
	const data = entriesQuery.data;
	useEffect(() => {
		setPagination((current) => ({ ...current, pageIndex: 0 }));
	}, [year]);
	useEffect(() => {
		if (
			data &&
			!entriesQuery.isPlaceholderData &&
			data.page - 1 !== pagination.pageIndex
		) {
			setPagination((current) => ({
				...current,
				pageIndex: data.page - 1,
			}));
		}
	}, [data, entriesQuery.isPlaceholderData, pagination.pageIndex]);
	function firstPage() {
		setPagination((current) => ({ ...current, pageIndex: 0 }));
	}
	const columns = useMemo<
		ColumnDef<typeof helperHourEntryTableFeatures, HelperHourEntry>[]
	>(
		() => [
			{
				id: "date",
				accessorKey: "datum",
				header: "Datum",
				cell: ({ row }) => (
					<span className="tabular-nums">
						{formatDateDe(row.original.datum)}
					</span>
				),
			},
			{
				id: "helper",
				accessorFn: (entry) => `${entry.vorname} ${entry.nachname}`,
				header: "Helfer",
				cell: ({ row }) => (
					<span className="font-medium">
						{`${row.original.vorname} ${row.original.nachname}`.trim() ||
							"Ohne Namen"}
					</span>
				),
			},
			{
				id: "event",
				accessorKey: "veranstaltung",
				header: "Veranstaltung",
			},
			{
				id: "allocations",
				header: "Zuordnung",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground">
						{entryAllocations(row.original)}
					</span>
				),
			},
			{
				id: "source",
				accessorKey: "quelle",
				header: "Quelle",
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground">
						{row.original.quelle === "excel"
							? (row.original.quelle_blatt ?? "Excel")
							: "Manuell"}
					</span>
				),
			},
			{
				id: "hours",
				accessorKey: "gemeldete_summe_minuten",
				header: "Stunden",
				cell: ({ row }) => (
					<span className="font-semibold tabular-nums">
						{formatMinutes(row.original.gemeldete_summe_minuten)} h
					</span>
				),
			},
		],
		[],
	);
	const table = useTable({
		features: helperHourEntryTableFeatures,
		data: data?.items ?? EMPTY_HELPER_HOUR_ENTRIES,
		columns,
		getRowId: (entry) => entry.id,
		rowCount: data?.total,
		manualSorting: true,
		manualPagination: true,
		enableMultiSort: false,
		enableSortingRemoval: false,
		state: { sorting, pagination },
		onSortingChange: (updater) => {
			setSorting(updater);
			firstPage();
		},
		onPaginationChange: setPagination,
	});
	const rows = table.getRowModel().rows;
	const total = data?.total ?? 0;
	const start =
		total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
	const end = Math.min((pagination.pageIndex + 1) * pagination.pageSize, total);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Alle Einträge</CardTitle>
				<CardDescription>
					Vollständige Helferstundenliste{" "}
					{year ? `aus ${year}` : "aus allen Jahren"}.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_13rem_13rem]">
					<SearchInput
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							firstPage();
						}}
						placeholder="Helfer oder Veranstaltung suchen"
						aria-label="Helferstunden durchsuchen"
					/>
					<Select
						value={source}
						onValueChange={(value) => {
							setSource(value as HelperHourEntrySource);
							firstPage();
						}}
					>
						<SelectTrigger aria-label="Quelle filtern">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="alle">Alle Quellen</SelectItem>
							<SelectItem value="manuell">Manuell</SelectItem>
							<SelectItem value="excel">Excel-Import</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={category}
						onValueChange={(value) => {
							setCategory(value as HelperHourEntryCategory);
							firstPage();
						}}
					>
						<SelectTrigger aria-label="Zuordnung filtern">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="alle">Alle Zuordnungen</SelectItem>
							{entryCategories.map((entry) => (
								<SelectItem key={entry.code} value={entry.code}>
									{entry.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="overflow-x-auto rounded-xl border">
					<Table className="min-w-[900px]">
						<TableHeader className="bg-muted/35">
							{table.getHeaderGroups().map((group) => (
								<TableRow key={group.id} className="hover:bg-transparent">
									{group.headers.map((header) => {
										const sorted = header.column.getIsSorted();
										const right = header.column.id === "hours";
										return (
											<TableHead
												key={header.id}
												className={right ? "text-right" : undefined}
											>
												{header.column.getCanSort() ? (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className={right ? "ml-auto -mr-2" : "-ml-2"}
														onClick={() => header.column.toggleSorting()}
													>
														<table.FlexRender header={header} />
														{sorted === "asc" ? (
															<ArrowUp className="h-3.5 w-3.5" />
														) : sorted === "desc" ? (
															<ArrowDown className="h-3.5 w-3.5" />
														) : (
															<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
														)}
													</Button>
												) : header.isPlaceholder ? null : (
													<table.FlexRender header={header} />
												)}
											</TableHead>
										);
									})}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{entriesQuery.isLoading ? (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="py-10 text-center text-muted-foreground"
									>
										Helferstunden werden geladen
									</TableCell>
								</TableRow>
							) : entriesQuery.isError ? (
								<TableRow>
									<TableCell colSpan={columns.length} className="py-6">
										<QueryError
											title="Helferstunden konnten nicht geladen werden."
											onRetry={() => void entriesQuery.refetch()}
										/>
									</TableCell>
								</TableRow>
							) : rows.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="py-10 text-center text-muted-foreground"
									>
										Keine passenden Helferstunden gefunden.
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<TableRow key={row.id}>
										{row.getAllCells().map((cell) => (
											<TableCell
												key={cell.id}
												className={
													cell.column.id === "hours" ? "text-right" : undefined
												}
											>
												<table.FlexRender cell={cell} />
											</TableCell>
										))}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
				<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted-foreground">
						{start} bis {end} von {total} Einträgen
						{entriesQuery.isFetching ? " · Wird aktualisiert" : ""}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={String(pagination.pageSize)}
							onValueChange={(value) =>
								setPagination({ pageIndex: 0, pageSize: Number(value) })
							}
						>
							<SelectTrigger size="sm" aria-label="Einträge pro Seite">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{[10, 25, 50, 100].map((size) => (
									<SelectItem key={size} value={String(size)}>
										{size} pro Seite
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
						<span className="min-w-24 text-center text-xs text-muted-foreground">
							Seite {pagination.pageIndex + 1} von{" "}
							{Math.max(table.getPageCount(), 1)}
						</span>
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
			</CardContent>
		</Card>
	);
}

type PeriodSummary = {
	entries: number;
	helpers: number;
	minutes: number;
};

type DistributionEntry = {
	code: string;
	label: string;
	minutes: number;
};

type HelperSummary = {
	vorname: string;
	nachname: string;
	entries: number;
	events: number;
	minutes: number;
	lastDate: string;
	allocations: Record<string, number>;
};

const helperTableFeatures = tableFeatures({
	columnFilteringFeature,
	globalFilteringFeature,
	filteredRowModel: createFilteredRowModel(),
	filterFns: { includesString: filterFn_includesString },
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: { text: sortFn_text },
	rowPaginationFeature,
	paginatedRowModel: createPaginatedRowModel(),
});

function HelperHoursPeriodOverview({
	year,
	years,
	summary,
	distribution,
	isLoading,
	onYearChange,
}: {
	year?: number;
	years: number[];
	summary: PeriodSummary;
	distribution: DistributionEntry[];
	isLoading: boolean;
	onYearChange: (year?: number) => void;
}) {
	const averageMinutes = summary.helpers
		? Math.round(summary.minutes / summary.helpers)
		: 0;
	const optionYears = Array.from(new Set(year ? [year, ...years] : years)).sort(
		(left, right) => right - left,
	);
	const distributedMinutes = distribution.reduce(
		(sum, entry) => sum + entry.minutes,
		0,
	);
	return (
		<Card>
			<CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<CardTitle className="flex items-center gap-2">
						<CalendarRange className="h-4 w-4 text-primary" />
						Jahresübersicht
					</CardTitle>
					<CardDescription>
						Kennzahlen und Zuordnungen für {year ?? "alle Jahre"}.
					</CardDescription>
				</div>
				<Select
					value={year ? String(year) : "alle"}
					onValueChange={(value) =>
						onYearChange(value === "alle" ? undefined : Number(value))
					}
				>
					<SelectTrigger
						className="w-full sm:w-44"
						aria-label="Auswertungsjahr"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{optionYears.map((entry) => (
							<SelectItem key={entry} value={String(entry)}>
								{entry}
							</SelectItem>
						))}
						<SelectItem value="alle">Alle Jahre</SelectItem>
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{[
						["Stunden", formatMinutes(summary.minutes)],
						["Helfer", String(summary.helpers)],
						["Einsätze", String(summary.entries)],
						["Ø je Helfer", `${formatMinutes(averageMinutes)} h`],
					].map(([label, value]) => (
						<div key={label} className="rounded-xl bg-muted/35 p-4">
							<p className="text-xs text-muted-foreground">{label}</p>
							<p className="mt-1 font-heading text-2xl tabular-nums">
								{isLoading ? "…" : value}
							</p>
						</div>
					))}
				</div>
				<div>
					<p className="mb-2 text-xs font-medium text-muted-foreground">
						Stunden nach Zuordnung
					</p>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
						{distribution.map((entry) => {
							const share = distributedMinutes
								? Math.round((entry.minutes / distributedMinutes) * 100)
								: 0;
							return (
								<div key={entry.code} className="rounded-lg border p-3">
									<div className="flex items-center justify-between gap-3 text-sm">
										<span>{entry.label}</span>
										<span className="font-medium tabular-nums">
											{formatMinutes(entry.minutes)} h
										</span>
									</div>
									<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-primary"
											style={{ width: `${Math.max(share, 1)}%` }}
										/>
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										{share} % der Stunden
									</p>
								</div>
							);
						})}
					</div>
					{!isLoading && distribution.length === 0 ? (
						<p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
							Für diesen Zeitraum sind noch keine Stunden vorhanden.
						</p>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

function helperFocus(
	allocations: Record<string, number>,
	categories: Array<{ code: string; label: string }>,
): string {
	const top = Object.entries(allocations)
		.filter(([, minutes]) => minutes > 0)
		.sort(([, left], [, right]) => right - left)
		.slice(0, 2)
		.map(([code]) => categoryLabel(categories, code));
	return top.join(" · ") || "Ohne Zuordnung";
}

function HelperOverview({
	year,
	helpers,
	totalMinutes,
	isLoading,
}: {
	year?: number;
	helpers: HelperSummary[];
	totalMinutes: number;
	isLoading: boolean;
}) {
	const helperCategories = useHelperHourCategories();
	const rankByHelper = useMemo(
		() =>
			new Map(
				helpers.map((helper, index) => [
					`${helper.vorname}:${helper.nachname}`.toLocaleLowerCase("de-DE"),
					index + 1,
				]),
			),
		[helpers],
	);
	const columns = useMemo<
		ColumnDef<typeof helperTableFeatures, HelperSummary>[]
	>(
		() => [
			{
				id: "rank",
				header: "Rang",
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) =>
					rankByHelper.get(
						`${row.original.vorname}:${row.original.nachname}`.toLocaleLowerCase(
							"de-DE",
						),
					) ?? "",
			},
			{
				id: "helper",
				accessorFn: (helper) => `${helper.vorname} ${helper.nachname}`,
				header: "Helfer",
				sortFn: "text",
				cell: ({ row }) => (
					<span className="font-medium">
						{row.original.vorname} {row.original.nachname}
					</span>
				),
			},
			{
				accessorKey: "entries",
				header: "Einsätze",
				sortDescFirst: true,
				cell: ({ row }) => (
					<span className="tabular-nums">{row.original.entries}</span>
				),
			},
			{
				accessorKey: "events",
				header: "Veranstaltungen",
				sortDescFirst: true,
				cell: ({ row }) => (
					<span className="tabular-nums">{row.original.events}</span>
				),
			},
			{
				id: "focus",
				header: "Schwerpunkt",
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground">
						{helperFocus(row.original.allocations, helperCategories)}
					</span>
				),
			},
			{
				accessorKey: "lastDate",
				header: "Letzter Einsatz",
				sortDescFirst: true,
				sortFn: "text",
				cell: ({ row }) => (
					<span className="tabular-nums">
						{formatDateDe(row.original.lastDate)}
					</span>
				),
			},
			{
				accessorKey: "minutes",
				header: "Stunden",
				sortDescFirst: true,
				cell: ({ row }) => {
					const share = totalMinutes
						? Math.round((row.original.minutes / totalMinutes) * 100)
						: 0;
					return (
						<div>
							<p className="font-semibold tabular-nums">
								{formatMinutes(row.original.minutes)} h
							</p>
							<p className="text-xs text-muted-foreground">{share} %</p>
						</div>
					);
				},
			},
		],
		[rankByHelper, totalMinutes, helperCategories],
	);
	const table = useTable({
		features: helperTableFeatures,
		data: helpers,
		columns,
		getRowId: (helper) =>
			`${helper.vorname}:${helper.nachname}`.toLocaleLowerCase("de-DE"),
		getColumnCanGlobalFilter: (column) => column.id === "helper",
		globalFilterFn: "includesString",
		enableMultiSort: false,
		enableSortingRemoval: false,
		initialState: {
			globalFilter: "",
			sorting: [{ id: "minutes", desc: true }],
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});
	const query = String(table.state.globalFilter ?? "");
	const rows = table.getRowModel().rows;
	const filteredCount = table.getPrePaginatedRowModel().rows.length;
	const pageIndex = table.state.pagination.pageIndex;
	const pageSize = table.state.pagination.pageSize;
	const pageStart = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
	const pageEnd = Math.min((pageIndex + 1) * pageSize, filteredCount);
	return (
		<Card>
			<CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<CardTitle>Übersicht pro Helfer</CardTitle>
					<CardDescription>
						Rangfolge nach Stunden{" "}
						{year ? `im Jahr ${year}` : "über alle Jahre"}.
					</CardDescription>
				</div>
				<SearchInput
					wrapperClassName="w-full sm:max-w-xs"
					value={query}
					onChange={(event) => {
						table.setGlobalFilter(event.target.value);
						table.firstPage();
					}}
					placeholder="Helfer suchen"
					aria-label="Helfer suchen"
				/>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="overflow-hidden rounded-xl border">
					<Table className="min-w-[760px]">
						<TableHeader className="bg-muted/35">
							{table.getHeaderGroups().map((group) => (
								<TableRow key={group.id} className="hover:bg-transparent">
									{group.headers.map((header) => {
										const sorted = header.column.getIsSorted();
										const numeric = ["entries", "events", "minutes"].includes(
											header.column.id,
										);
										return (
											<TableHead
												key={header.id}
												className={numeric ? "text-right" : undefined}
											>
												{header.column.getCanSort() ? (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className={numeric ? "ml-auto -mr-2" : "-ml-2"}
														onClick={() => header.column.toggleSorting()}
														aria-label={`${String(header.column.columnDef.header)} sortieren`}
													>
														<table.FlexRender header={header} />
														{sorted === "asc" ? (
															<ArrowUp className="h-3.5 w-3.5" />
														) : sorted === "desc" ? (
															<ArrowDown className="h-3.5 w-3.5" />
														) : (
															<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
														)}
													</Button>
												) : header.isPlaceholder ? null : (
													<table.FlexRender header={header} />
												)}
											</TableHead>
										);
									})}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="py-10 text-center text-muted-foreground"
									>
										Helferstunden werden geladen
									</TableCell>
								</TableRow>
							) : rows.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="py-10 text-center text-muted-foreground"
									>
										Keine passenden Helfer gefunden.
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<TableRow key={row.id}>
										{row.getAllCells().map((cell) => (
											<TableCell
												key={cell.id}
												className={
													["entries", "events", "minutes"].includes(
														cell.column.id,
													)
														? "text-right"
														: cell.column.id === "rank"
															? "text-muted-foreground"
															: undefined
												}
											>
												<table.FlexRender cell={cell} />
											</TableCell>
										))}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
				{filteredCount > 0 ? (
					<div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-xs text-muted-foreground">
							{pageStart} bis {pageEnd} von {filteredCount} Helfern
						</p>
						{table.getPageCount() > 1 ? (
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									<ChevronLeft className="h-4 w-4" />
									Zurück
								</Button>
								<span className="min-w-20 text-center text-xs text-muted-foreground">
									Seite {pageIndex + 1} von {table.getPageCount()}
								</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => table.nextPage()}
									disabled={!table.getCanNextPage()}
								>
									Weiter
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						) : null}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

type Budget = {
	code: string;
	label: string;
	minutes: number;
	earnedMinutes: number;
	spentMinutes: number;
	balanceMinutes: number;
};

type ClubContribution = {
	code: string;
	label: string;
	minutes: number;
};

type DepartmentExpense = {
	id: string;
	kategorie_code: string;
	datum: string;
	bezeichnung: string;
	betrag_cent: number;
	minuten: number;
	bemerkung: string;
	storniert_am: Date | string | null;
	storno_grund: string | null;
};

function HelperHoursBudgets({
	budgets,
	contributions,
	expenses,
	valueCent,
	selected,
	onSelected,
	isAdmin,
	onChanged,
}: {
	budgets: Budget[];
	contributions: ClubContribution[];
	expenses: DepartmentExpense[];
	valueCent: number;
	selected: string | null;
	onSelected: (value: string) => void;
	isAdmin: boolean;
	onChanged: () => Promise<unknown>;
}) {
	const budget = budgets.find((entry) => entry.code === selected);
	const visibleExpenses = expenses.filter(
		(entry) => entry.kategorie_code === selected,
	);
	const [expenseForm, setExpenseForm] = useState({
		datum: todayIsoDate(),
		bezeichnung: "",
		betrag: "",
		bemerkung: "",
	});
	const [saving, setSaving] = useState<"expense" | "cancel" | null>(null);
	const expenseKey = useRef<string | null>(null);
	// The purchase is booked in euro and immediately shown as the hours it
	// costs the department, so the amount is the only currency on this page.
	const previewMinutes = (() => {
		const amount = parseGermanAmount(expenseForm.betrag);
		return amount && amount > 0 ? minutesFromCent(amount, valueCent) : 0;
	})();

	async function saveExpense(event: React.FormEvent) {
		event.preventDefault();
		const amount = parseGermanAmount(expenseForm.betrag);
		if (!amount || amount <= 0) {
			toast.error("Bitte einen positiven Kaufbetrag angeben");
			return;
		}
		setSaving("expense");
		try {
			expenseKey.current ??= crypto.randomUUID();
			await orpcClient.helperHours.createExpense({
				idempotency_key: expenseKey.current,
				abteilung: selected ?? "",
				datum: expenseForm.datum,
				bezeichnung: expenseForm.bezeichnung,
				betrag_cent: amount,
				bemerkung: expenseForm.bemerkung,
			});
			expenseKey.current = null;
			setExpenseForm({
				...expenseForm,
				bezeichnung: "",
				betrag: "",
				bemerkung: "",
			});
			await onChanged();
			toast.success("Stundenabzug gebucht");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(null);
		}
	}

	// The reason arrives already trimmed and length-checked from the dialog, and
	// is stored exactly as validated.
	async function cancelExpense(id: string, reason: string) {
		setSaving("cancel");
		try {
			await orpcClient.helperHours.cancelExpense({ id, grund: reason });
			await onChanged();
			toast.success("Stundenabzug storniert");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Stornierung fehlgeschlagen",
			);
		} finally {
			setSaving(null);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ReceiptText className="h-4 w-4 text-primary" />
					Vereinsbeitrag und Abteilungsguthaben
				</CardTitle>
				<CardDescription>
					Kumuliert über alle Jahre. Ein Kauf der Abteilung wird in Stunden
					umgerechnet und nur vom Guthaben dieser Abteilung abgezogen.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{contributions.map((entry) => (
					<div
						key={entry.code}
						className="rounded-xl border border-primary/20 bg-primary/5 p-4"
					>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<p className="font-medium">{entry.label}</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Diese Stunden gelten als Beitrag an den Verein und stehen
									nicht für Abteilungskäufe zur Verfügung.
								</p>
							</div>
							<div className="sm:text-right">
								<p className="font-heading text-xl tabular-nums">
									{formatMinutes(entry.minutes)} h
								</p>
								<p className="text-xs text-muted-foreground">geleistet</p>
							</div>
						</div>
					</div>
				))}
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{budgets.map((entry) => (
						<button
							key={entry.code}
							type="button"
							onClick={() => onSelected(entry.code)}
							className={`rounded-xl border p-3 text-left transition-colors ${
								selected === entry.code
									? "border-primary bg-primary/5"
									: "border-border/60 hover:bg-muted/50"
							}`}
						>
							<p className="text-xs text-muted-foreground">{entry.label}</p>
							<p
								className={`mt-1 font-heading text-lg tabular-nums ${
									entry.balanceMinutes < 0 ? "text-destructive" : ""
								}`}
							>
								{formatMinutes(entry.balanceMinutes)} h
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{formatMinutes(entry.earnedMinutes)} h erarbeitet ·{" "}
								{formatMinutes(entry.spentMinutes)} h abgezogen
							</p>
						</button>
					))}
				</div>
				<div className="grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-3">
					<BudgetNumber
						label="Erarbeitete Stunden"
						value={budget?.earnedMinutes ?? 0}
					/>
					<BudgetNumber
						label="Abgezogene Stunden"
						value={budget?.spentMinutes ?? 0}
					/>
					<BudgetNumber
						label="Verfügbare Stunden"
						value={budget?.balanceMinutes ?? 0}
						emphasized
					/>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="font-medium">{budget?.label ?? "Abteilung"}</p>
						<p className="text-xs text-muted-foreground">
							Export mit Übersicht, Helferstunden und Abzügen.
						</p>
					</div>
					<Button asChild variant="outline">
						<a
							href={`/api/export/helper-hours/xlsx?abteilung=${selected ?? ""}`}
							download
						>
							<Download className="mr-1 h-4 w-4" />
							Excel-Übersicht
						</a>
					</Button>
				</div>
				{isAdmin ? (
					<div className="border-t pt-5">
						<form className="grid gap-3 sm:grid-cols-2" onSubmit={saveExpense}>
							<div className="sm:col-span-2">
								<p className="font-medium">Stundenabzug für {budget?.label}</p>
								<p className="text-xs text-muted-foreground">
									Der Kaufbetrag wird mit dem in den Einstellungen hinterlegten
									Stundenwert in Stunden umgerechnet und abgezogen.
								</p>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="hh-expense-date">Datum</Label>
								<Input
									id="hh-expense-date"
									type="date"
									value={expenseForm.datum}
									onChange={(event) =>
										setExpenseForm({
											...expenseForm,
											datum: event.target.value,
										})
									}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="hh-expense-amount">Kaufbetrag in Euro</Label>
								<Input
									id="hh-expense-amount"
									inputMode="decimal"
									placeholder="49,90"
									value={expenseForm.betrag}
									onChange={(event) =>
										setExpenseForm({
											...expenseForm,
											betrag: event.target.value,
										})
									}
									aria-describedby="hh-expense-amount-hint"
									required
								/>
								<p
									id="hh-expense-amount-hint"
									className="text-xs text-muted-foreground"
								>
									{previewMinutes > 0
										? `Entspricht ${formatMinutes(previewMinutes)} h Abzug`
										: "Wird in Stunden umgerechnet"}
								</p>
							</div>
							<div className="space-y-1.5 sm:col-span-2">
								<Label htmlFor="hh-expense-description">Gekauft</Label>
								<Input
									id="hh-expense-description"
									placeholder="z. B. neue Trainingsbälle"
									value={expenseForm.bezeichnung}
									onChange={(event) =>
										setExpenseForm({
											...expenseForm,
											bezeichnung: event.target.value,
										})
									}
									maxLength={200}
									required
								/>
							</div>
							<div className="space-y-1.5 sm:col-span-2">
								<Label htmlFor="hh-expense-note">Bemerkung</Label>
								<Input
									id="hh-expense-note"
									placeholder="Optional, z. B. Belegnummer"
									value={expenseForm.bemerkung}
									onChange={(event) =>
										setExpenseForm({
											...expenseForm,
											bemerkung: event.target.value,
										})
									}
								/>
							</div>
							<Button disabled={saving !== null} className="sm:col-span-2">
								{saving === "expense" ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Plus className="mr-2 h-4 w-4" />
								)}
								Stunden abziehen
							</Button>
						</form>
					</div>
				) : null}
				{visibleExpenses.length ? (
					<div className="overflow-x-auto border-t pt-4">
						<table className="w-full min-w-[620px] text-sm">
							<thead>
								<tr className="border-b text-left text-xs text-muted-foreground">
									<th className="py-2 pr-3">Datum</th>
									<th className="px-3 py-2">Kauf</th>
									<th className="px-3 py-2">Status</th>
									<th className="px-3 py-2 text-right">Abzug</th>
									{isAdmin ? <th className="py-2 pl-3" /> : null}
								</tr>
							</thead>
							<tbody>
								{visibleExpenses.map((entry) => (
									<tr
										key={entry.id}
										className="border-b border-border/50 last:border-0"
									>
										<td className="py-2.5 pr-3">{formatDateDe(entry.datum)}</td>
										<td className="px-3 py-2.5">
											<p
												className={
													entry.storniert_am ? "line-through" : "font-medium"
												}
											>
												{entry.bezeichnung}
											</p>
											{entry.bemerkung ? (
												<p className="text-xs text-muted-foreground">
													{entry.bemerkung}
												</p>
											) : null}
											{entry.storno_grund ? (
												<p className="text-xs text-destructive">
													Storno: {entry.storno_grund}
												</p>
											) : null}
										</td>
										<td className="px-3 py-2.5 text-xs text-muted-foreground">
											{entry.storniert_am ? "Storniert" : "Aktiv"}
										</td>
										<td className="px-3 py-2.5 text-right font-semibold tabular-nums">
											{formatMinutes(entry.minuten)} h
										</td>
										{isAdmin ? (
											<td className="py-2.5 pl-3 text-right">
												{!entry.storniert_am ? (
													<CancelReasonDialog
														title="Stundenabzug stornieren"
														description="Die Buchung bleibt zur Nachvollziehbarkeit erhalten und wird als storniert gekennzeichnet. Die Stunden stehen der Abteilung wieder zur Verfügung."
														confirmLabel="Stornieren"
														pending={saving === "cancel"}
														onConfirm={(reason) =>
															cancelExpense(entry.id, reason)
														}
														trigger={
															<Button
																type="button"
																variant="ghost"
																size="sm"
																disabled={saving !== null}
															>
																<RotateCcw className="mr-1 h-3.5 w-3.5" />
																Stornieren
															</Button>
														}
													/>
												) : null}
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function BudgetNumber({
	label,
	value,
	emphasized = false,
}: {
	label: string;
	value: number;
	emphasized?: boolean;
}) {
	return (
		<div>
			<p className="text-xs text-muted-foreground">{label}</p>
			<p
				className={`mt-1 font-heading text-xl tabular-nums ${
					emphasized && value < 0 ? "text-destructive" : ""
				}`}
			>
				{formatMinutes(value)} h
			</p>
		</div>
	);
}

function HelperHourExpenseImport({
	onImported,
}: {
	onImported: () => Promise<unknown>;
}) {
	const input = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<ExpensePreview | null>(null);
	const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);

	async function send(mode: "preview" | "apply") {
		if (!file) return;
		setLoading(mode);
		try {
			const body = new FormData();
			body.set("file", file);
			body.set("mode", mode);
			if (mode === "apply" && preview)
				body.set("confirm_digest", preview.digest);
			const response = await fetch("/api/import/helper-hour-expenses", {
				method: "POST",
				body,
			});
			const result = (await response.json()) as ExpensePreview & {
				error?: string;
				created?: number;
			};
			if (!response.ok)
				throw new Error(result.error ?? "Import fehlgeschlagen");
			if (mode === "preview") {
				setPreview(result);
				toast[result.valid ? "success" : "error"](
					result.valid
						? "Datei erfolgreich geprüft"
						: "Die Datei enthält Fehler",
				);
			} else {
				toast.success(`${result.created ?? 0} Stundenabzüge importiert`);
				setFile(null);
				setPreview(null);
				if (input.current) input.current.value = "";
				await onImported();
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Import fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Upload className="h-4 w-4 text-primary" />
					Verrechnungsliste importieren
				</CardTitle>
				<CardDescription>
					Übernimmt die Liste "Verrechnung Stunden Abteilungen" als
					Stundenabzüge. Ein Kaufbetrag wird mit dem hinterlegten Stundenwert in
					Stunden umgerechnet. Bereits gebuchte Abzüge bleiben unverändert.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						ref={input}
						type="file"
						accept=".xlsx"
						onChange={(event) => {
							setFile(event.target.files?.[0] ?? null);
							setPreview(null);
						}}
					/>
					<Button
						type="button"
						variant="secondary"
						disabled={!file || loading !== null}
						onClick={() => void send("preview")}
					>
						{loading === "preview" ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<FileCheck2 className="mr-2 h-4 w-4" />
						)}
						Datei prüfen
					</Button>
				</div>
				{preview ? (
					<div className="rounded-xl border bg-muted/20 p-4">
						<p className="font-semibold">
							{preview.rows} Käufe, {formatMinutes(preview.minutes)} Stunden
							Abzug
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{preview.toImport} neu, {preview.alreadyImported} bereits gebucht
						</p>
						{preview.missing > 0 ? (
							<p className="mt-2 text-sm text-warning">
								{preview.missing} in Rendant gebuchte Abzüge stehen nicht mehr
								in der Liste. Gebuchte Abzüge werden nie gelöscht. Storniere sie
								bei Bedarf einzeln mit Begründung.
							</p>
						) : null}
						{preview.errors.length ? (
							<ul className="mt-3 text-sm text-destructive">
								{preview.errors.slice(0, 8).map((entry, index) => (
									<li key={`${entry.sheet}-${entry.row}-${index}`}>
										{entry.sheet} Zeile {entry.row}: {entry.message}
									</li>
								))}
							</ul>
						) : null}
						{preview.sample.length ? (
							<ul className="mt-3 space-y-1 text-xs text-muted-foreground">
								{preview.sample.map((entry) => (
									<li key={`${entry.sheet}-${entry.row}`}>
										{formatDateDe(entry.date)} · {entry.category} ·{" "}
										{entry.description} · {formatMinutes(entry.minutes)} h
									</li>
								))}
							</ul>
						) : null}
						{preview.valid && preview.toImport > 0 ? (
							<Button
								className="mt-4 w-full"
								disabled={loading !== null}
								onClick={() => setConfirmOpen(true)}
							>
								{loading === "apply" ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Upload className="mr-2 h-4 w-4" />
								)}
								{preview.toImport} Stundenabzüge importieren
							</Button>
						) : null}
						<ConfirmDialog
							open={confirmOpen}
							onOpenChange={setConfirmOpen}
							title="Stundenabzüge verbindlich importieren"
							description={`${preview.toImport} Käufe als Stundenabzüge buchen? Ein Abzug kann danach nur noch mit Begründung storniert werden.`}
							confirmLabel="Importieren"
							pending={loading === "apply"}
							onConfirm={() => send("apply")}
						/>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function HelperHoursImport({
	onImported,
}: {
	onImported: () => Promise<unknown>;
}) {
	const input = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<Preview | null>(null);
	const [corrections, setCorrections] = useState<
		Record<string, HelperHoursCorrection>
	>({});
	const [editing, setEditing] = useState<HelperHoursReviewRow | null>(null);
	const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
	const reviewKey = (row: Pick<HelperHoursReviewRow, "sheet" | "rowNumber">) =>
		`${row.sheet}:${row.rowNumber}`;
	const resolvedIssues = preview
		? preview.reviewRows.reduce((sum, row) => {
				const correction = corrections[reviewKey(row)];
				return (
					sum +
					row.issues.filter((issue) =>
						isHelperHoursIssueResolved(issue, correction),
					).length
				);
			}, 0)
		: 0;
	const totalIssues =
		preview?.reviewRows.reduce((sum, row) => sum + row.issues.length, 0) ?? 0;
	const openIssues = totalIssues - resolvedIssues;
	async function send(mode: "preview" | "apply") {
		if (!file) return;
		setLoading(mode);
		try {
			const body = new FormData();
			body.set("file", file);
			body.set("mode", mode);
			if (mode === "apply" && preview)
				body.set("confirm_digest", preview.digest);
			if (mode === "apply")
				body.set("corrections", JSON.stringify(Object.values(corrections)));
			const response = await fetch("/api/import/helper-hours", {
				method: "POST",
				body,
			});
			const result = (await response.json()) as Preview & {
				error?: string;
				created?: number;
			};
			if (!response.ok)
				throw new Error(result.error ?? "Import fehlgeschlagen");
			if (mode === "preview") {
				setPreview(result);
				setCorrections(
					Object.fromEntries(
						result.reviewRows.map((row) => [
							reviewKey(row),
							{
								sheet: row.sheet,
								rowNumber: row.rowNumber,
								vorname: row.vorname,
								nachname: row.nachname,
								allocations: { ...row.allocations },
								gemeldete_summe_minuten: row.gemeldete_summe_minuten,
								acceptedIssues: [],
							},
						]),
					),
				);
				toast[result.valid ? "success" : "error"](
					result.valid
						? "Datei erfolgreich geprüft"
						: "Die Datei enthält Fehler",
				);
			} else {
				toast.success(`${result.created ?? 0} Helferstunden importiert`);
				setFile(null);
				setPreview(null);
				setCorrections({});
				if (input.current) input.current.value = "";
				await onImported();
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Import fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}
	// Controlled rather than trigger-based: the button either jumps to the next
	// open issue or starts the import, and only the second case is confirmed.
	const [importOpen, setImportOpen] = useState(false);
	const importHint =
		preview && preview.warnings > 0
			? ` ${preview.warnings} Hinweise bleiben zur Herkunft gespeichert.`
			: "";
	function confirmImport() {
		if (!preview?.valid || preview.toImport <= 0 || openIssues > 0) return;
		setImportOpen(true);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Upload className="h-4 w-4 text-primary" />
					Excel-Datei importieren
				</CardTitle>
				<CardDescription>
					Rendant erkennt die Monatsblätter der bisherigen SVU-Liste, korrigiert
					eindeutige Fehler selbst, zeigt den Rest an und importiert erst nach
					deiner Bestätigung. Bereits importierte Zeilen der enthaltenen
					Monatsblätter werden dabei durch den aktuellen Stand ersetzt.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						ref={input}
						type="file"
						accept=".xlsx"
						onChange={(e) => {
							setFile(e.target.files?.[0] ?? null);
							setPreview(null);
							setCorrections({});
						}}
					/>
					<Button
						type="button"
						variant="secondary"
						disabled={!file || loading !== null}
						onClick={() => void send("preview")}
					>
						{loading === "preview" ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<FileCheck2 className="mr-2 h-4 w-4" />
						)}
						Datei prüfen
					</Button>
				</div>
				{preview ? (
					<div className="rounded-xl border bg-muted/20 p-4">
						<p className="font-semibold">
							{preview.rows} Einträge, {formatMinutes(preview.hours)} Stunden
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{preview.replaces > 0
								? `${preview.replaces} bereits importierte Zeilen dieser Monatsblätter werden ersetzt`
								: "Noch nichts aus diesen Monatsblättern importiert"}
						</p>
						{preview.repairs > 0 ? (
							<details className="mt-3 rounded-lg border bg-background/60 p-3">
								<summary className="cursor-pointer text-sm font-medium">
									{preview.repairs} Angaben automatisch korrigiert
								</summary>
								<p className="mt-2 text-xs text-muted-foreground">
									Eindeutige Fälle wie vertauschte Namen, eine falsche
									Jahreszahl im Monatsblatt oder eine fehlende Summe. Die
									Originalwerte aus der Datei bleiben gespeichert.
								</p>
								<ul className="mt-2 space-y-1 text-xs">
									{preview.repairSample.map((entry) => (
										<li key={`${entry.sheet}-${entry.row}`}>
											{entry.sheet} Zeile {entry.row}:{" "}
											{entry.beforeDate !== entry.afterDate
												? `${formatDateDe(entry.beforeDate)} zu ${formatDateDe(entry.afterDate)}`
												: null}
											{entry.beforeDate !== entry.afterDate &&
											entry.before !== entry.after
												? ", "
												: null}
											{entry.before !== entry.after
												? `${entry.before} zu ${entry.after}`
												: null}
											{entry.beforeDate === entry.afterDate &&
											entry.before === entry.after
												? entry.repairs.join(", ")
												: null}
										</li>
									))}
								</ul>
							</details>
						) : null}
						{preview.similarNames.length ? (
							<details className="mt-3 rounded-lg border border-warning/35 bg-warning/10 p-3">
								<summary className="cursor-pointer text-sm font-medium">
									{preview.similarNames.length} mögliche Doppelschreibungen von
									Namen
								</summary>
								<p className="mt-2 text-xs text-foreground/80">
									Diese Schreibweisen könnten dieselbe Person sein und teilen
									deren Stunden sonst auf zwei Helfer auf. Rendant führt nichts
									automatisch zusammen. Korrigiere die Schreibweise in der Liste
									und importiere erneut, oder lass es so, wenn es wirklich zwei
									Personen sind.
								</p>
								<ul className="mt-2 space-y-1 text-xs">
									{preview.similarNames.map((entry) => (
										<li key={`${entry.left}-${entry.right}`}>
											{entry.left} ({entry.leftEntries}x,{" "}
											{formatMinutes(entry.leftMinutes)} h) und {entry.right} (
											{entry.rightEntries}x, {formatMinutes(entry.rightMinutes)}{" "}
											h)
										</li>
									))}
								</ul>
							</details>
						) : null}
						{preview.unknownColumns.length ? (
							<p className="mt-3 text-sm text-warning">
								Diese Spalten enthalten Stunden, passen aber zu keinem Punkt:{" "}
								{preview.unknownColumns.join(", ")}. Lege sie in den
								Einstellungen an, sonst gehen diese Stunden verloren.
							</p>
						) : null}
						{preview.errors.length ? (
							<ul className="mt-3 text-sm text-destructive">
								{preview.errors.slice(0, 8).map((e, i) => (
									<li key={`${e.sheet}-${e.row}-${i}`}>
										{e.sheet} Zeile {e.row}: {e.message}
									</li>
								))}
							</ul>
						) : null}
						{preview.reviewRows.length ? (
							<div className="mt-4 space-y-3 rounded-xl border border-warning/35 bg-warning/10 p-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="flex items-center gap-2 text-sm font-semibold text-warning">
											<AlertTriangle className="h-4 w-4" />
											{resolvedIssues} von {totalIssues} Hinweisen geklärt
										</p>
										<p className="mt-0.5 text-xs text-foreground/80">
											Originalwerte bleiben erhalten. Öffne eine Zeile zum
											Korrigieren.
										</p>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10 sm:w-40">
										<div
											className="h-full rounded-full bg-primary transition-all"
											style={{
												width: `${totalIssues ? (resolvedIssues / totalIssues) * 100 : 100}%`,
											}}
										/>
									</div>
								</div>
								<div className="grid gap-2 lg:grid-cols-2">
									{preview.reviewRows.map((row) => {
										const correction = corrections[reviewKey(row)];
										const resolved = row.issues.every((issue) =>
											isHelperHoursIssueResolved(issue, correction),
										);
										return (
											<button
												type="button"
												key={reviewKey(row)}
												className="flex items-start gap-3 rounded-lg border bg-background/80 p-3 text-left transition-colors hover:bg-background"
												onClick={() => setEditing(row)}
											>
												{resolved ? (
													<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
												) : (
													<Pencil className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
												)}
												<span className="min-w-0 flex-1">
													<span className="block text-xs font-semibold">
														{row.sheet} · Zeile {row.rowNumber} · {row.event}
													</span>
													<span className="mt-1 block text-xs text-muted-foreground">
														{resolved ? "Geprüft" : row.warnings.join(" ")}
													</span>
												</span>
											</button>
										);
									})}
								</div>
							</div>
						) : null}
						{preview.valid && preview.toImport > 0 ? (
							<Button
								className="mt-4 w-full"
								onClick={() => {
									if (openIssues > 0) {
										const next = preview.reviewRows.find((row) =>
											row.issues.some(
												(issue) =>
													!isHelperHoursIssueResolved(
														issue,
														corrections[reviewKey(row)],
													),
											),
										);
										setEditing(next ?? null);
										return;
									}
									confirmImport();
								}}
								disabled={loading !== null}
							>
								{loading === "apply" ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Upload className="mr-2 h-4 w-4" />
								)}
								{openIssues > 0
									? `${openIssues} Hinweise prüfen`
									: `${preview.toImport} geprüfte Einträge importieren`}
							</Button>
						) : null}
						<ConfirmDialog
							open={importOpen}
							onOpenChange={setImportOpen}
							title="Helferstunden verbindlich importieren"
							description={`${preview?.toImport ?? 0} Helferstunden verbindlich importieren?${
								preview?.replaces
									? ` ${preview.replaces} zuvor importierte Zeilen dieser Monatsblätter werden ersetzt.`
									: ""
							}${importHint}`}
							confirmLabel="Importieren"
							pending={loading === "apply"}
							onConfirm={() => send("apply")}
						/>
					</div>
				) : null}
			</CardContent>
			<HelperHoursCorrectionDialog
				// Keyed per row: without a remount the dialog rendered the previous
				// helper's name and allocations until the sync effect committed, a
				// visible flash of the wrong person's data in an audited correction.
				key={editing ? reviewKey(editing) : "none"}
				row={editing}
				value={editing ? corrections[reviewKey(editing)] : undefined}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSave={(value) => {
					setCorrections((current) => ({
						...current,
						[reviewKey(value)]: value,
					}));
					setEditing(null);
				}}
			/>
		</Card>
	);
}

function isHelperHoursIssueResolved(
	issue: HelperHoursImportIssue,
	correction: HelperHoursCorrection | undefined,
) {
	if (!correction) return false;
	if (correction.acceptedIssues.includes(issue)) return true;
	if (issue === "missing_name")
		return Boolean(correction.vorname.trim() && correction.nachname.trim());
	const allocated = Object.values(correction.allocations).reduce(
		(sum, value) => sum + value,
		0,
	);
	if (issue === "total_mismatch")
		return correction.gemeldete_summe_minuten === allocated;
	// The date cannot be edited here, so it is only ever resolved by accepting
	// it knowingly, which the check above already covers.
	return false;
}

function HelperHoursCorrectionDialog({
	row,
	value,
	onOpenChange,
	onSave,
}: {
	row: HelperHoursReviewRow | null;
	value: HelperHoursCorrection | undefined;
	onOpenChange: (open: boolean) => void;
	onSave: (value: HelperHoursCorrection) => void;
}) {
	// Initialised from props rather than synced by an effect, so the first paint
	// already shows this row's values.
	const dialogCategories = selectableCategories(useHelperHourCategories());
	const [working, setWorking] = useState<HelperHoursCorrection | null>(() =>
		row && value
			? {
					...value,
					allocations: { ...value.allocations },
					acceptedIssues: [...value.acceptedIssues],
				}
			: null,
	);
	if (!row || !working) return null;
	const allocated = Object.values(working.allocations).reduce(
		(sum, minutes) => sum + minutes,
		0,
	);
	function toggleAccepted(issue: HelperHoursImportIssue) {
		setWorking((current) =>
			current
				? {
						...current,
						acceptedIssues: current.acceptedIssues.includes(issue)
							? current.acceptedIssues.filter((entry) => entry !== issue)
							: [...current.acceptedIssues, issue],
					}
				: current,
		);
	}
	const contributionCode =
		dialogCategories.find((entry) => entry.art === "verein")?.code ?? null;
	function assignRemainder() {
		setWorking((current) => {
			if (!current || !contributionCode) return current;
			const assigned = Object.values(current.allocations).reduce(
				(sum, minutes) => sum + minutes,
				0,
			);
			const remainder = current.gemeldete_summe_minuten - assigned;
			if (remainder <= 0) return current;
			return {
				...current,
				acceptedIssues: current.acceptedIssues.filter(
					(issue) => issue !== "total_mismatch",
				),
				allocations: {
					...current.allocations,
					[contributionCode]:
						(current.allocations[contributionCode] ?? 0) + remainder,
				},
			};
		});
	}
	function assignTotal(code: string) {
		setWorking((current) => {
			if (!current) return current;
			return {
				...current,
				acceptedIssues: current.acceptedIssues.filter(
					(issue) => issue !== "total_mismatch",
				),
				allocations: { [code]: current.gemeldete_summe_minuten },
			};
		});
	}
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Importhinweise prüfen</DialogTitle>
					<DialogDescription>
						{row.sheet}, Zeile {row.rowNumber}: {row.event}. Korrekturen ändern
						die Excel-Datei nicht.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-5">
					{row.issues.includes("missing_name") ? (
						<CorrectionSection
							title="Name vervollständigen"
							resolved={isHelperHoursIssueResolved("missing_name", working)}
							onAccept={() => toggleAccepted("missing_name")}
							accepted={working.acceptedIssues.includes("missing_name")}
						>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label>Vorname</Label>
									<Input
										value={working.vorname}
										onChange={(event) =>
											setWorking({
												...working,
												vorname: event.target.value,
												acceptedIssues: working.acceptedIssues.filter(
													(issue) => issue !== "missing_name",
												),
											})
										}
										maxLength={120}
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Nachname</Label>
									<Input
										value={working.nachname}
										onChange={(event) =>
											setWorking({
												...working,
												nachname: event.target.value,
												acceptedIssues: working.acceptedIssues.filter(
													(issue) => issue !== "missing_name",
												),
											})
										}
										maxLength={120}
									/>
								</div>
							</div>
						</CorrectionSection>
					) : null}
					{row.issues.includes("unknown_date") ? (
						<CorrectionSection
							title="Datum prüfen"
							resolved={isHelperHoursIssueResolved("unknown_date", working)}
							onAccept={() => toggleAccepted("unknown_date")}
							accepted={working.acceptedIssues.includes("unknown_date")}
						>
							<p className="text-sm text-muted-foreground">
								Der {formatDateDe(row.date)} liegt nicht im Monat des Blatts{" "}
								{row.sheet}. Bitte in der Liste korrigieren oder das Datum
								bewusst übernehmen.
							</p>
						</CorrectionSection>
					) : null}
					{row.issues.some(
						(issue) => issue !== "missing_name" && issue !== "unknown_date",
					) ? (
						<CorrectionSection
							title="Stunden und Zuordnung prüfen"
							resolved={row.issues
								.filter(
									(issue) =>
										issue !== "missing_name" && issue !== "unknown_date",
								)
								.every((issue) => isHelperHoursIssueResolved(issue, working))}
						>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-lg border bg-muted/20 p-3">
									<p className="text-xs text-muted-foreground">
										Gemeldete Summe
									</p>
									<p className="mt-1 text-lg font-semibold tabular-nums">
										{formatMinutes(working.gemeldete_summe_minuten)} h
									</p>
								</div>
								<div className="rounded-lg border bg-muted/20 p-3">
									<p className="text-xs text-muted-foreground">Zuordnung</p>
									<p className="mt-1 text-lg font-semibold tabular-nums">
										{formatMinutes(allocated)} h
									</p>
								</div>
							</div>
							{row.issues.includes("total_mismatch") ? (
								<div className="space-y-2">
									<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
										{contributionCode &&
										working.gemeldete_summe_minuten > allocated ? (
											<Button type="button" onClick={assignRemainder}>
												Rest von{" "}
												{formatMinutes(
													working.gemeldete_summe_minuten - allocated,
												)}{" "}
												h dem Vereinsbeitrag zuordnen
											</Button>
										) : null}
										<Button
											type="button"
											variant="secondary"
											onClick={() =>
												setWorking({
													...working,
													gemeldete_summe_minuten: allocated,
													acceptedIssues: working.acceptedIssues.filter(
														(issue) => issue !== "total_mismatch",
													),
												})
											}
										>
											Zuordnung als Summe verwenden
										</Button>
										<Button
											type="button"
											variant={
												working.acceptedIssues.includes("total_mismatch")
													? "default"
													: "outline"
											}
											onClick={() => toggleAccepted("total_mismatch")}
										>
											Abweichung bewusst übernehmen
										</Button>
									</div>
									<div className="space-y-1.5">
										<Label>Oder gemeldete Summe vollständig zuordnen</Label>
										<Select onValueChange={assignTotal}>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Punkt wählen" />
											</SelectTrigger>
											<SelectContent>
												{dialogCategories.map((entry) => (
													<SelectItem key={entry.code} value={entry.code}>
														{entry.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							) : null}
						</CorrectionSection>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Abbrechen
					</Button>
					<Button type="button" onClick={() => onSave(working)}>
						Prüfung speichern
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CorrectionSection({
	title,
	resolved,
	children,
	onAccept,
	accepted,
}: {
	title: string;
	resolved: boolean;
	children: React.ReactNode;
	onAccept?: () => void;
	accepted?: boolean;
}) {
	return (
		<section className="space-y-3 rounded-xl border p-4">
			<div className="flex items-center justify-between gap-3">
				<p className="font-semibold">{title}</p>
				{resolved ? (
					<span className="flex items-center gap-1 text-xs font-medium text-success">
						<CheckCircle2 className="h-4 w-4" /> Geklärt
					</span>
				) : null}
			</div>
			{children}
			{onAccept ? (
				<Button
					type="button"
					variant={accepted ? "default" : "outline"}
					onClick={onAccept}
				>
					{accepted ? "Bewusst übernommen" : "Unvollständig übernehmen"}
				</Button>
			) : null}
		</section>
	);
}
