import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	CalendarDays,
	ChevronDown,
	ChevronUp,
	History,
	Info,
	Loader2,
	Pencil,
	Plus,
	Save,
	TriangleAlert,
	X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HistoricalRevenueTable } from "@/components/historical-revenue-table";
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
import { Textarea } from "@/components/ui/textarea";
import type { AnlassKatalogEntry } from "@/lib/anlass";
import {
	buildComparisons,
	groupKeyFor,
	type OccasionComparison,
	type OccasionYear,
	toComparisonEntries,
} from "@/lib/anlass-comparison";
import { formatDateDe, todayIsoDate } from "@/lib/date";
import { formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import type { ProtokollRow } from "@/lib/protokoll-types";
import { UMSATZBEREICHE, type Umsatzbereich } from "@/lib/umsatzbereich";
import { cn } from "@/lib/utils";

export type HistoricalRevenue = {
	id: string;
	anlass_datum: string;
	anlass: string;
	anlass_katalog_id: string | null;
	umsatzbereich: string | null;
	umsatz_cent: number;
	ausgaben_cent: number;
	bemerkung: string | null;
	vergleichsgruppe: string;
	quellreferenz: string | null;
	storniert_am?: Date | null;
	storniert_von_user_id?: string | null;
	storniert_von_name?: string | null;
	storno_grund?: string | null;
};

type ComparisonDetailEntry = {
	id: string;
	source: "protocol" | "historical";
	date: string;
	label: string;
	reference: string;
	revenueCent: number;
};

const MONTHS = [
	"Januar",
	"Februar",
	"März",
	"April",
	"Mai",
	"Juni",
	"Juli",
	"August",
	"September",
	"Oktober",
	"November",
	"Dezember",
] as const;

export function HistoricalRevenueOverview({
	initialHistorical,
	protocols,
	anlassKatalog,
	canCreate,
}: {
	initialHistorical: HistoricalRevenue[];
	protocols: ProtokollRow[];
	anlassKatalog: AnlassKatalogEntry[];
	canCreate: boolean;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [historical, setHistorical] =
		useState<HistoricalRevenue[]>(initialHistorical);
	const [previousInitialHistorical, setPreviousInitialHistorical] =
		useState(initialHistorical);
	if (initialHistorical !== previousInitialHistorical) {
		setPreviousInitialHistorical(initialHistorical);
		setHistorical(initialHistorical);
	}
	const [showForm, setShowForm] = useState(initialHistorical.length === 0);
	const [occasionFilter, setOccasionFilter] = useState("all");
	const [monthFrom, setMonthFrom] = useState("1");
	const [monthTo, setMonthTo] = useState("12");
	const idempotencyKey = useRef<string | null>(null);

	const catalogById = useMemo(
		() => new Map(anlassKatalog.map((k) => [k.id, k])),
		[anlassKatalog],
	);
	const allComparisonEntries = useMemo(
		() => toComparisonEntries(historical, protocols),
		[historical, protocols],
	);
	const comparisonEntries = useMemo(
		() =>
			allComparisonEntries.filter((entry) => {
				const month = Number(entry.date.slice(5, 7));
				const from = Number(monthFrom);
				const to = Number(monthTo);
				return from <= to
					? month >= from && month <= to
					: month >= from || month <= to;
			}),
		[allComparisonEntries, monthFrom, monthTo],
	);
	const comparisons = useMemo(
		() => buildComparisons(comparisonEntries, catalogById),
		[comparisonEntries, catalogById],
	);
	const detailsByGroup = useMemo(() => {
		const groups = new Map<string, ComparisonDetailEntry[]>();
		const historicalById = new Map(
			historical.map((entry) => [entry.id, entry]),
		);
		const protocolsById = new Map(protocols.map((entry) => [entry.id, entry]));
		for (const entry of comparisonEntries) {
			const mappedId =
				entry.katalogId && catalogById.has(entry.katalogId)
					? entry.katalogId
					: null;
			const key = groupKeyFor(
				mappedId,
				entry.occasion,
				entry.umsatzbereich as Umsatzbereich | null,
			);
			const source =
				entry.source === "protocol"
					? protocolsById.get(entry.id)
					: historicalById.get(entry.id);
			if (!source) continue;
			const detail: ComparisonDetailEntry =
				entry.source === "protocol"
					? {
							id: entry.id,
							source: "protocol",
							date: entry.date,
							label: (source as ProtokollRow).anlass,
							reference: (source as ProtokollRow).belegnummer,
							revenueCent: entry.revenueCent,
						}
					: {
							id: entry.id,
							source: "historical",
							date: entry.date,
							label: (source as HistoricalRevenue).anlass,
							reference:
								(source as HistoricalRevenue).quellreferenz ?? "Altunterlage",
							revenueCent: entry.revenueCent,
						};
			groups.set(key, [...(groups.get(key) ?? []), detail]);
		}
		return groups;
	}, [comparisonEntries, historical, protocols, catalogById]);
	const visibleComparisons =
		occasionFilter === "all"
			? comparisons
			: comparisons.filter((group) => group.key === occasionFilter);
	function duplicateSources(date: string, area: Umsatzbereich): string[] {
		if (!date || !area) return [];
		const sources: string[] = [];
		if (
			historical.some(
				(entry) =>
					!entry.storniert_am &&
					entry.anlass_datum === date &&
					entry.umsatzbereich === area,
			)
		) {
			sources.push("historischer Eintrag");
		}
		if (
			protocols.some(
				(protocol) =>
					!protocol.storniert_am &&
					protocol.anlass_datum === date &&
					protocol.umsatzbereich === area,
			)
		) {
			sources.push("Kassenzählprotokoll");
		}
		return sources;
	}

	const form = useForm({
		defaultValues: {
			date: todayIsoDate(),
			revenueArea: "" as Umsatzbereich | "",
			eventLabel: "",
			revenue: "",
			expenses: "0,00",
			note: "",
			sourceReference: "",
		},
		onSubmit: async ({ value }) => {
			const revenueCent = parseGermanAmount(value.revenue);
			const expensesCent = parseGermanAmount(value.expenses);
			if (!value.date || !value.revenueArea || !value.eventLabel.trim()) {
				toast.error("Datum, Umsatzbereich und Details sind erforderlich");
				return;
			}
			if (revenueCent == null || revenueCent < 0) {
				toast.error("Umsatz ist ungültig");
				return;
			}
			if (expensesCent == null || expensesCent < 0) {
				toast.error("Ausgaben sind ungültig");
				return;
			}

			try {
				idempotencyKey.current ??= crypto.randomUUID();
				const created = await orpcClient.historicalRevenue.create({
					idempotency_key: idempotencyKey.current,
					anlass_datum: value.date,
					anlass_katalog_id: null,
					umsatzbereich: value.revenueArea,
					veranstaltungsbezeichnung: value.eventLabel.trim(),
					umsatz_cent: revenueCent,
					ausgaben_cent: expensesCent,
					bemerkung: value.note.trim() || null,
					quellreferenz: value.sourceReference.trim() || null,
				});
				setHistorical((entries) => [created, ...entries]);
				setOccasionFilter(
					groupKeyFor(
						created.anlass_katalog_id,
						created.vergleichsgruppe,
						created.umsatzbereich as Umsatzbereich | null,
					),
				);
				idempotencyKey.current = null;
				form.reset();
				setShowForm(false);
				toast.success("Historischer Umsatz gespeichert");
				await queryClient.invalidateQueries();
				await router.invalidate();
			} catch (error) {
				toast.error(orpcMessage(error, "Speichern fehlgeschlagen"));
			}
		},
	});

	return (
		<div className="space-y-6">
			<div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm text-muted-foreground">
				<div className="flex gap-3">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<p>
						Historische Werte stammen aus Altunterlagen. Sie ergänzen den
						Jahresvergleich, enthalten aber keine Aufteilung nach
						Umsatzsteuersatz.
					</p>
				</div>
			</div>

			{canCreate ? (
				<div className="flex justify-end">
					<Button
						type="button"
						variant={showForm ? "ghost" : "outline"}
						size="sm"
						onClick={() => setShowForm((value) => !value)}
					>
						{showForm ? (
							<ChevronUp className="mr-2 h-4 w-4" />
						) : (
							<Plus className="mr-2 h-4 w-4" />
						)}
						{showForm ? "Eingabe schließen" : "Historischen Umsatz erfassen"}
					</Button>
				</div>
			) : null}

			{showForm && canCreate ? (
				<Card variant="hero">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<History className="h-4 w-4 text-primary" />
							Vergangenen Umsatz ergänzen
						</CardTitle>
						<CardDescription>
							Erfasse ältere Veranstaltungen, für die kein Kassenzählprotokoll
							vorliegt.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
							onSubmit={(event) => {
								event.preventDefault();
								event.stopPropagation();
								void form.handleSubmit();
							}}
						>
							<form.Field name="date">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-1 lg:col-span-3">
										<Label htmlFor={field.name}>Datum</Label>
										<Input
											id={field.name}
											name={field.name}
											type="date"
											max={todayIsoDate()}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											required
										/>
									</div>
								)}
							</form.Field>

							<form.Field name="revenueArea">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-1 lg:col-span-4">
										<Label htmlFor={field.name}>Umsatzbereich</Label>
										<Select
											value={field.state.value}
											onValueChange={(value) =>
												field.handleChange(value as Umsatzbereich)
											}
										>
											<SelectTrigger id={field.name} className="w-full">
												<SelectValue placeholder="Umsatzbereich wählen" />
											</SelectTrigger>
											<SelectContent>
												{UMSATZBEREICHE.map((entry) => (
													<SelectItem key={entry.code} value={entry.code}>
														{entry.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>

							<form.Field name="eventLabel">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
										<Label htmlFor={field.name}>Details</Label>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="z. B. Sommerfest · Essenkasse"
											maxLength={120}
											required
										/>
									</div>
								)}
							</form.Field>

							<form.Field name="revenue">
								{(field) => (
									<AmountField
										id={field.name}
										label="Umsatz"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={field.handleChange}
										required
									/>
								)}
							</form.Field>

							<form.Field name="expenses">
								{(field) => (
									<AmountField
										id={field.name}
										label="Ausgaben"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={field.handleChange}
									/>
								)}
							</form.Field>

							<form.Field name="sourceReference">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-2 lg:col-span-6">
										<Label htmlFor={field.name}>Quellreferenz</Label>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Optional, zum Beispiel Excel 2024, Zeile 18"
											maxLength={500}
										/>
									</div>
								)}
							</form.Field>

							<form.Subscribe
								selector={(state) => [
									state.values.date,
									state.values.revenueArea,
								]}
							>
								{([date, revenueArea]) => {
									const duplicates = duplicateSources(
										date,
										revenueArea as Umsatzbereich,
									);
									return duplicates.length > 0 ? (
										<div
											className="flex gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning sm:col-span-2 lg:col-span-12"
											role="alert"
										>
											<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
											<p>
												Für dieses Datum und diesen Umsatzbereich gibt es
												möglicherweise bereits: {duplicates.join(" und ")}.
												Prüfe die Details und Beträge. Speichern bleibt möglich.
											</p>
										</div>
									) : null;
								}}
							</form.Subscribe>

							<form.Field name="note">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-2 lg:col-span-10">
										<Label htmlFor={field.name}>Bemerkung</Label>
										<Textarea
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Optional, zum Beispiel Quelle der Zahlen"
											maxLength={2000}
											className="min-h-20"
										/>
									</div>
								)}
							</form.Field>

							<div className="flex items-end sm:col-span-2 lg:col-span-2">
								<form.Subscribe selector={(state) => state.isSubmitting}>
									{(isSubmitting) => (
										<Button
											type="submit"
											disabled={isSubmitting}
											className="w-full"
										>
											{isSubmitting ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<Save className="mr-2 h-4 w-4" />
											)}
											Speichern
										</Button>
									)}
								</form.Subscribe>
							</div>
						</form>
					</CardContent>
				</Card>
			) : null}

			<section className="space-y-4" aria-labelledby="comparison-heading">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 id="comparison-heading" className="text-lg font-semibold">
							Vorjahresvergleich
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Historische Werte und aktive Kassenzählprotokolle im Vergleich.
						</p>
					</div>
					<div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[15rem_8rem_8rem]">
						<div className="space-y-1.5">
							<Label htmlFor="occasion-filter">Umsatzbereich</Label>
							<Select value={occasionFilter} onValueChange={setOccasionFilter}>
								<SelectTrigger id="occasion-filter" className="w-full">
									<SelectValue placeholder="Alle Umsatzbereiche" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Alle Umsatzbereiche</SelectItem>
									{comparisons.map((group) => (
										<SelectItem key={group.key} value={group.key}>
											{group.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<MonthSelect
							id="month-from"
							label="Von Monat"
							value={monthFrom}
							onChange={setMonthFrom}
						/>
						<MonthSelect
							id="month-to"
							label="Bis Monat"
							value={monthTo}
							onChange={setMonthTo}
						/>
					</div>
				</div>

				{visibleComparisons.length > 0 ? (
					<div className="grid gap-4 lg:grid-cols-2">
						{visibleComparisons.map((group) => (
							<ComparisonCard
								key={group.key}
								group={group}
								entries={detailsByGroup.get(group.key) ?? []}
								catalog={anlassKatalog}
								canManage={false}
								onSaved={async () => {
									await queryClient.invalidateQueries();
									await router.invalidate();
								}}
							/>
						))}
					</div>
				) : (
					<EmptyComparison onAdd={() => setShowForm(true)} />
				)}
			</section>

			<HistoricalRevenueTable
				years={Array.from(
					new Set(
						historical.map((entry) => Number(entry.anlass_datum.slice(0, 4))),
					),
				).sort((a, b) => b - a)}
				canManage={canCreate}
			/>
		</div>
	);
}

function AmountField({
	id,
	label,
	value,
	onBlur,
	onChange,
	required,
}: {
	id: string;
	label: string;
	value: string;
	onBlur: () => void;
	onChange: (value: string) => void;
	required?: boolean;
}) {
	return (
		<div className="space-y-1.5 sm:col-span-1 lg:col-span-3">
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input
					id={id}
					name={id}
					inputMode="decimal"
					value={value}
					onBlur={onBlur}
					onChange={(event) => onChange(event.target.value)}
					placeholder="0,00"
					className="pr-14 text-right tabular-nums sm:pr-14"
					required={required}
				/>
				<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
					EUR
				</span>
			</div>
		</div>
	);
}

function ComparisonCard({
	group,
	entries,
	catalog,
	canManage,
	onSaved,
}: {
	group: OccasionComparison;
	entries: ComparisonDetailEntry[];
	catalog: AnlassKatalogEntry[];
	canManage: boolean;
	onSaved: () => Promise<void>;
}) {
	const initialTarget = group.unmapped ? "" : group.key;
	const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [targetId, setTargetId] = useState(initialTarget);
	const [targetName, setTargetName] = useState(group.label);
	const [saving, setSaving] = useState(false);
	const [editingGroup, setEditingGroup] = useState(false);
	const catalogEntry = group.unmapped
		? null
		: (catalog.find((entry) => entry.id === group.key) ?? null);
	const [editName, setEditName] = useState(catalogEntry?.name ?? group.label);
	const [editType, setEditType] = useState(catalogEntry?.typ ?? group.typ);
	const [editActive, setEditActive] = useState(catalogEntry?.aktiv ?? true);
	const years = Array.from(group.years.values()).sort(
		(a, b) => b.year - a.year,
	);
	const newest = years[0];
	const previous = years[1];
	const delta = previous ? newest.revenueCent - previous.revenueCent : null;
	const deltaPercent =
		previous && previous.revenueCent !== 0
			? ((delta ?? 0) / previous.revenueCent) * 100
			: null;

	function selectTarget(id: string) {
		setTargetId(id);
		setTargetName(catalog.find((entry) => entry.id === id)?.name ?? "");
	}

	function toggleYear(year: number) {
		setExpandedYears((current) => {
			const next = new Set(current);
			if (next.has(year)) next.delete(year);
			else next.add(year);
			return next;
		});
	}

	function startGroupEdit() {
		if (!catalogEntry) return;
		setEditName(catalogEntry.name);
		setEditType(catalogEntry.typ);
		setEditActive(catalogEntry.aktiv);
		setEditingGroup(true);
	}

	async function saveGroup() {
		if (!catalogEntry || !editName.trim()) return;
		setSaving(true);
		try {
			await orpcClient.anlassKatalog.update({
				id: catalogEntry.id,
				expected_updated_at: catalogEntry.updatedAt,
				name: editName.trim(),
				typ: editType,
				aktiv: editActive,
			});
			setEditingGroup(false);
			toast.success("Umsatzgruppe aktualisiert");
			await onSaved();
		} catch (error) {
			toast.error(
				orpcMessage(error, "Umsatzgruppe konnte nicht gespeichert werden"),
			);
		} finally {
			setSaving(false);
		}
	}

	async function applyBulkEdit() {
		if (!targetId || selected.size === 0) return;
		const selectedEntries = entries.filter((entry) => selected.has(entry.id));
		setSaving(true);
		try {
			const result = await orpcClient.anlassKatalog.bulkAssign({
				target_id: targetId,
				source_id: group.unmapped ? null : group.key,
				target_name: targetName.trim() || undefined,
				protokoll_ids: selectedEntries
					.filter((entry) => entry.source === "protocol")
					.map((entry) => entry.id),
				historical_ids: selectedEntries
					.filter((entry) => entry.source === "historical")
					.map((entry) => entry.id),
			});
			setTargetName(result.entry.name);
			setSelected(new Set());
			const changed = result.protocols + result.historical;
			if (result.skipped > 0) {
				toast.warning(
					`${changed} Einträge zugeordnet. ${result.skipped} wurden zwischenzeitlich geändert.`,
				);
			} else {
				toast.success(`${changed} Einträge zugeordnet`);
			}
			await onSaved();
		} catch (error) {
			toast.error(orpcMessage(error, "Zuordnung fehlgeschlagen"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Card className="min-w-0">
			<CardHeader className="border-b border-border/60 pb-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="truncate">{group.label}</CardTitle>
						<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
							<CardDescription>
								{years.length} {years.length === 1 ? "Jahr" : "Jahre"} erfasst
							</CardDescription>
							<span
								className={cn(
									"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
									group.typ === "wiederkehrend"
										? "bg-primary/10 text-primary"
										: "bg-muted text-muted-foreground",
								)}
							>
								{group.typ === "wiederkehrend" ? "wiederkehrend" : "einmalig"}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-1">
						{canManage && catalogEntry ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Umsatzgruppe bearbeiten"
								onClick={startGroupEdit}
							>
								<Pencil className="h-4 w-4" />
							</Button>
						) : null}
					</div>
				</div>
				{delta != null ? (
					<div
						className={cn(
							"mt-3 rounded-lg px-3 py-2 text-xs",
							delta >= 0
								? "bg-success/10 text-success"
								: "bg-destructive/10 text-destructive",
						)}
					>
						<span className="font-medium tabular-nums">
							{delta >= 0 ? "+" : ""}
							{formatCentPlain(delta)} EUR
						</span>{" "}
						gegenüber {previous?.year}
						{deltaPercent != null
							? ` (${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %)`
							: ""}
					</div>
				) : null}
			</CardHeader>
			<CardContent className="space-y-2">
				{editingGroup && catalogEntry ? (
					<div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor={`group-name-${group.key}`}>Name</Label>
								<Input
									id={`group-name-${group.key}`}
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
									maxLength={120}
									autoFocus
								/>
							</div>
							<div className="space-y-1.5">
								<Label>Auswertung</Label>
								<div className="flex rounded-lg border border-input bg-background p-0.5">
									{(["wiederkehrend", "einmalig"] as const).map((type) => (
										<button
											key={type}
											type="button"
											aria-pressed={editType === type}
											onClick={() => setEditType(type)}
											className={cn(
												"flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium",
												editType === type
													? "bg-primary/10 text-primary"
													: "text-muted-foreground",
											)}
										>
											{type}
										</button>
									))}
								</div>
							</div>
						</div>
						<label className="flex items-center gap-2 text-xs text-foreground">
							<input
								type="checkbox"
								checked={editActive}
								onChange={(event) => setEditActive(event.target.checked)}
								className="h-4 w-4 accent-primary"
							/>
							Aktiv und bei neuen Erfassungen auswählbar
						</label>
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setEditingGroup(false)}
								disabled={saving}
							>
								<X className="mr-1 h-4 w-4" />
								Abbrechen
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => void saveGroup()}
								disabled={saving || !editName.trim()}
							>
								{saving ? (
									<Loader2 className="mr-1 h-4 w-4 animate-spin" />
								) : (
									<Save className="mr-1 h-4 w-4" />
								)}
								Speichern
							</Button>
						</div>
					</div>
				) : null}
				{years.map((year) => {
					const expanded = expandedYears.has(year.year);
					const yearEntries = entries.filter(
						(entry) => Number(entry.date.slice(0, 4)) === year.year,
					);
					return (
						<div
							key={year.year}
							className="overflow-hidden rounded-xl bg-muted/35"
						>
							<button
								type="button"
								aria-expanded={expanded}
								onClick={() => toggleYear(year.year)}
								className="grid w-full grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 px-3 py-3 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[4rem_1fr_1fr_auto] sm:items-center"
							>
								<div className="row-span-2 flex items-center gap-2 font-semibold tabular-nums sm:row-span-1">
									<CalendarDays className="h-3.5 w-3.5 text-primary" />
									{year.year}
								</div>
								<div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
									<span className="text-xs text-muted-foreground">Umsatz</span>
									<Money cent={year.revenueCent} emphasis />
								</div>
								<div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
									<span className="text-xs text-muted-foreground">
										Ergebnis
									</span>
									<Money
										cent={year.revenueCent - year.expensesCent}
										tone={
											year.revenueCent - year.expensesCent < 0
												? "negative"
												: "default"
										}
									/>
								</div>
								{expanded ? (
									<ChevronUp className="row-span-2 h-4 w-4 self-center sm:row-span-1" />
								) : (
									<ChevronDown className="row-span-2 h-4 w-4 self-center sm:row-span-1" />
								)}
								<div className="col-start-2 text-[11px] text-muted-foreground sm:col-span-2 sm:col-start-2">
									{group.typ === "wiederkehrend" ? (
										<span className="font-medium text-foreground/70">
											{year.dates.size}{" "}
											{year.dates.size === 1 ? "Termin" : "Termine"}
											{year.dates.size > 0
												? ` · Ø ${formatCentPlain(
														Math.round(year.revenueCent / year.dates.size),
													)} EUR/Termin`
												: ""}
											{" · "}
										</span>
									) : null}
									{sourceSummary(year)}, zuletzt am{" "}
									{formatDateDe(year.latestDate)}
								</div>
							</button>
							{expanded ? (
								<div className="space-y-3 border-border/60 border-t bg-background/55 p-3">
									<div className="flex items-center justify-between gap-2">
										<p className="text-xs font-semibold">
											Einträge {year.year}
										</p>
										{canManage ? (
											<button
												type="button"
												className="text-xs font-medium text-primary hover:underline"
												onClick={() =>
													setSelected(
														selected.size === yearEntries.length
															? new Set()
															: new Set(yearEntries.map((entry) => entry.id)),
													)
												}
											>
												{selected.size === yearEntries.length
													? "Auswahl aufheben"
													: "Alle auswählen"}
											</button>
										) : null}
									</div>
									<div className="max-h-64 space-y-1 overflow-y-auto">
										{[...yearEntries]
											.sort((a, b) => b.date.localeCompare(a.date))
											.map((entry) => (
												<div
													key={`${entry.source}-${entry.id}`}
													className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-2 text-xs"
												>
													{canManage ? (
														<input
															type="checkbox"
															aria-label={`${entry.label} auswählen`}
															checked={selected.has(entry.id)}
															onChange={(event) => {
																const next = new Set(selected);
																if (event.target.checked) next.add(entry.id);
																else next.delete(entry.id);
																setSelected(next);
															}}
															className="h-4 w-4 accent-primary"
														/>
													) : (
														<span className="h-1.5 w-1.5 rounded-full bg-primary" />
													)}
													<span className="min-w-0">
														<span className="block truncate font-medium">
															{entry.label}
														</span>
														<span className="text-muted-foreground">
															{formatDateDe(entry.date)} · {entry.reference}
														</span>
													</span>
													<Money cent={entry.revenueCent} />
												</div>
											))}
									</div>
									{canManage ? (
										<div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
											<p className="text-xs text-muted-foreground">
												Ausgewählte Einträge einer Umsatzgruppe zuordnen. Der
												ursprüngliche Belegtext bleibt aus Gründen der
												Nachvollziehbarkeit erhalten.
											</p>
											<div className="grid gap-2 sm:grid-cols-2">
												<div className="space-y-1.5">
													<Label>Ziel-Umsatzgruppe</Label>
													<Select value={targetId} onValueChange={selectTarget}>
														<SelectTrigger className="w-full">
															<SelectValue placeholder="Umsatzgruppe wählen" />
														</SelectTrigger>
														<SelectContent>
															{catalog.map((entry) => (
																<SelectItem key={entry.id} value={entry.id}>
																	{entry.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												<div className="space-y-1.5">
													<Label htmlFor={`bulk-name-${group.key}`}>
														Katalogname
													</Label>
													<Input
														id={`bulk-name-${group.key}`}
														value={targetName}
														onChange={(event) =>
															setTargetName(event.target.value)
														}
														maxLength={120}
														disabled={!targetId}
													/>
												</div>
											</div>
											<Button
												type="button"
												size="sm"
												className="w-full"
												disabled={!targetId || selected.size === 0 || saving}
												onClick={() => void applyBulkEdit()}
											>
												{saving ? (
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												) : null}
												{selected.size} ausgewählte übernehmen
											</Button>
										</div>
									) : null}
								</div>
							) : null}
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

function sourceSummary(year: OccasionYear): string {
	const parts: string[] = [];
	if (year.protocolCount > 0) {
		parts.push(
			`${year.protocolCount} ${year.protocolCount === 1 ? "Protokoll" : "Protokolle"}`,
		);
	}
	if (year.historicalCount > 0) {
		parts.push(
			`${year.historicalCount} ${year.historicalCount === 1 ? "Altunterlage" : "Altunterlagen"}`,
		);
	}
	return parts.join(", ");
}

function MonthSelect({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{MONTHS.map((month, index) => (
						<SelectItem key={month} value={String(index + 1)}>
							{month}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function EmptyComparison({ onAdd }: { onAdd: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
			<span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
				<History className="h-5 w-5" />
			</span>
			<h3 className="mt-3 text-sm font-semibold">Noch keine Umsätze</h3>
			<p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
				Erfasse einen historischen Umsatz oder lege ein Kassenzählprotokoll an.
			</p>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-4"
				onClick={onAdd}
			>
				<Plus className="mr-2 h-4 w-4" />
				Historischen Umsatz erfassen
			</Button>
		</div>
	);
}
