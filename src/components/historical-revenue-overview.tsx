import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	Ban,
	CalendarDays,
	ChevronUp,
	History,
	Info,
	Loader2,
	Plus,
	Save,
	TrendingUp,
	TriangleAlert,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
	occasionKey,
	toComparisonEntries,
} from "@/lib/anlass-comparison";
import { formatDateDe, todayIsoDate } from "@/lib/date";
import { formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import type { ProtokollRow } from "@/lib/protokoll-types";
import { cn } from "@/lib/utils";

export type HistoricalRevenue = {
	id: string;
	anlass_datum: string;
	anlass: string;
	anlass_katalog_id: string | null;
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
	const idempotencyKey = useRef<string | null>(null);

	const catalogById = useMemo(
		() => new Map(anlassKatalog.map((k) => [k.id, k])),
		[anlassKatalog],
	);
	const comparisons = useMemo(
		() =>
			buildComparisons(toComparisonEntries(historical, protocols), catalogById),
		[historical, protocols, catalogById],
	);
	const visibleComparisons =
		occasionFilter === "all"
			? comparisons
			: comparisons.filter((group) => group.key === occasionFilter);
	function duplicateSources(date: string, comparisonGroup: string): string[] {
		const key = occasionKey(comparisonGroup);
		if (!date || !key) return [];
		const sources: string[] = [];
		if (
			historical.some(
				(entry) =>
					!entry.storniert_am &&
					entry.anlass_datum === date &&
					occasionKey(entry.vergleichsgruppe) === key,
			)
		) {
			sources.push("historischer Eintrag");
		}
		if (
			protocols.some(
				(protocol) =>
					!protocol.storniert_am &&
					protocol.anlass_datum === date &&
					occasionKey(protocol.anlass) === key,
			)
		) {
			sources.push("Kassenzählprotokoll");
		}
		return sources;
	}

	const form = useForm({
		defaultValues: {
			date: todayIsoDate(),
			occasion: "",
			comparisonGroup: "",
			revenue: "",
			expenses: "0,00",
			note: "",
			sourceReference: "",
		},
		onSubmit: async ({ value }) => {
			const revenueCent = parseGermanAmount(value.revenue);
			const expensesCent = parseGermanAmount(value.expenses);
			if (
				!value.date ||
				!value.occasion.trim() ||
				!value.comparisonGroup.trim()
			) {
				toast.error("Datum, Anlass und Vergleichsgruppe sind erforderlich");
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
					anlass: value.occasion.trim(),
					vergleichsgruppe: value.comparisonGroup.trim(),
					umsatz_cent: revenueCent,
					ausgaben_cent: expensesCent,
					bemerkung: value.note.trim() || null,
					quellreferenz: value.sourceReference.trim() || null,
				});
				setHistorical((entries) => [created, ...entries]);
				setOccasionFilter(
					groupKeyFor(created.anlass_katalog_id, created.vergleichsgruppe),
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

							<form.Field name="occasion">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-1 lg:col-span-5">
										<Label htmlFor={field.name}>Anlass</Label>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Zum Beispiel Biergarteneröffnung"
											maxLength={200}
											required
										/>
									</div>
								)}
							</form.Field>

							<form.Field name="comparisonGroup">
								{(field) => (
									<div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
										<Label htmlFor={field.name}>Vergleichsgruppe</Label>
										<Input
											id={field.name}
											name={field.name}
											list="historical-comparison-groups"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Zum Beispiel Biergarteneröffnung"
											maxLength={200}
											required
										/>
										<datalist id="historical-comparison-groups">
											{comparisons.map((group) => (
												<option key={group.key} value={group.label} />
											))}
										</datalist>
										<p className="text-xs text-muted-foreground">
											Gleiche Gruppe für denselben Anlass in jedem Jahr
											verwenden.
										</p>
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
									state.values.comparisonGroup,
								]}
							>
								{([date, comparisonGroup]) => {
									const duplicates = duplicateSources(date, comparisonGroup);
									return duplicates.length > 0 ? (
										<div
											className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 sm:col-span-2 lg:col-span-12 dark:text-amber-200"
											role="alert"
										>
											<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
											<p>
												Für dieses Datum und diese Vergleichsgruppe gibt es
												bereits: {duplicates.join(" und ")}. Prüfe die Zahlen,
												damit der Umsatz nicht doppelt gezählt wird.
												Absichtliches Speichern bleibt möglich.
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
					{comparisons.length > 0 ? (
						<div className="w-full space-y-1.5 sm:w-64">
							<Label htmlFor="occasion-filter">Anlass filtern</Label>
							<Select value={occasionFilter} onValueChange={setOccasionFilter}>
								<SelectTrigger id="occasion-filter" className="w-full">
									<SelectValue placeholder="Alle Anlässe" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Alle Anlässe</SelectItem>
									{comparisons.map((group) => (
										<SelectItem key={group.key} value={group.key}>
											{group.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</div>

				{visibleComparisons.length > 0 ? (
					<div className="grid gap-4 lg:grid-cols-2">
						{visibleComparisons.map((group) => (
							<ComparisonCard key={group.key} group={group} />
						))}
					</div>
				) : (
					<EmptyComparison onAdd={() => setShowForm(true)} />
				)}
			</section>

			{historical.length > 0 ? (
				<HistoricalEntries
					entries={historical}
					canCancel={canCreate}
					onCanceled={(id, reason) =>
						setHistorical((entries) =>
							entries.map((entry) =>
								entry.id === id
									? {
											...entry,
											storniert_am: new Date(),
											storno_grund: reason,
										}
									: entry,
							),
						)
					}
				/>
			) : null}
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
					className="pr-12 text-right tabular-nums"
					required={required}
				/>
				<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
					EUR
				</span>
			</div>
		</div>
	);
}

function ComparisonCard({ group }: { group: OccasionComparison }) {
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
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<TrendingUp className="h-4 w-4" />
					</span>
				</div>
				{delta != null ? (
					<div
						className={cn(
							"mt-3 rounded-lg px-3 py-2 text-xs",
							delta >= 0
								? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
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
				{years.map((year) => (
					<div
						key={year.year}
						className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-muted/35 px-3 py-3 sm:grid-cols-[4rem_1fr_1fr] sm:items-center"
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
							<span className="text-xs text-muted-foreground">Ergebnis</span>
							<Money
								cent={year.revenueCent - year.expensesCent}
								tone={
									year.revenueCent - year.expensesCent < 0
										? "negative"
										: "default"
								}
							/>
						</div>
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
							{sourceSummary(year)}, zuletzt am {formatDateDe(year.latestDate)}
						</div>
					</div>
				))}
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

function HistoricalEntries({
	entries,
	canCancel,
	onCanceled,
}: {
	entries: HistoricalRevenue[];
	canCancel: boolean;
	onCanceled: (id: string, reason: string) => void;
}) {
	const sorted = [...entries].sort((a, b) =>
		b.anlass_datum.localeCompare(a.anlass_datum),
	);
	return (
		<section className="space-y-4" aria-labelledby="historical-list-heading">
			<div>
				<h2 id="historical-list-heading" className="text-lg font-semibold">
					Erfasste Altunterlagen
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Nachvollziehbare Einzelwerte hinter dem Vergleich.
				</p>
			</div>
			<Card className="gap-0 py-0">
				{sorted.map((entry, index) => (
					<div
						key={entry.id}
						className={cn(
							"grid gap-3 px-4 py-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center",
							index > 0 && "border-border/60 border-t",
						)}
					>
						<div className="text-xs tabular-nums text-muted-foreground">
							{formatDateDe(entry.anlass_datum)}
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<p className="truncate font-medium">{entry.anlass}</p>
								<Badge variant="outline">Altunterlage</Badge>
								<Badge
									variant={entry.storniert_am ? "destructive" : "secondary"}
								>
									{entry.storniert_am ? "Storniert" : "Aktiv"}
								</Badge>
							</div>
							<p className="mt-1 text-xs text-muted-foreground">
								Vergleichsgruppe: {entry.vergleichsgruppe}
								{entry.quellreferenz ? ` · Quelle: ${entry.quellreferenz}` : ""}
							</p>
							{entry.storniert_am ? (
								<p className="mt-1 text-xs text-destructive">
									Storniert
									{entry.storniert_von_name
										? ` von ${entry.storniert_von_name}`
										: ""}
									{entry.storno_grund ? `: ${entry.storno_grund}` : ""}
								</p>
							) : null}
						</div>
						<div className="flex items-center justify-between gap-3 sm:justify-end">
							<div className="text-left sm:text-right">
								<Money cent={entry.umsatz_cent} emphasis />
								<p className="mt-1 text-xs text-muted-foreground">
									Ergebnis{" "}
									<Money
										cent={entry.umsatz_cent - entry.ausgaben_cent}
										className="text-xs"
									/>
								</p>
							</div>
							{canCancel && !entry.storniert_am ? (
								<HistoricalCancelDialog entry={entry} onCanceled={onCanceled} />
							) : null}
						</div>
					</div>
				))}
			</Card>
		</section>
	);
}

function HistoricalCancelDialog({
	entry,
	onCanceled,
}: {
	entry: HistoricalRevenue;
	onCanceled: (id: string, reason: string) => void;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);
	const trimmed = reason.trim();

	async function cancel() {
		if (trimmed.length < 5) {
			toast.error("Bitte mindestens 5 Zeichen Begründung angeben");
			return;
		}
		setPending(true);
		try {
			await orpcClient.historicalRevenue.cancel({
				id: entry.id,
				storno_grund: trimmed,
			});
			onCanceled(entry.id, trimmed);
			setOpen(false);
			setReason("");
			toast.success("Historischer Umsatz storniert");
			await queryClient.invalidateQueries();
			await router.invalidate();
		} catch (error) {
			toast.error(orpcMessage(error, "Stornierung fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`${entry.anlass} stornieren`}
					className="shrink-0 text-muted-foreground hover:text-destructive"
				>
					<Ban className="h-4 w-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Historischen Umsatz stornieren</AlertDialogTitle>
					<AlertDialogDescription>
						Der Eintrag bleibt erhalten und wird aus dem Vergleich entfernt.
						Eine Stornierung kann nicht rückgängig gemacht werden.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-2">
					<Label htmlFor={`historical-cancel-${entry.id}`}>Begründung</Label>
					<Textarea
						id={`historical-cancel-${entry.id}`}
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						minLength={5}
						maxLength={500}
						placeholder="Grund für die Stornierung"
					/>
					<p className="text-xs text-muted-foreground">
						Mindestens 5 Zeichen, maximal 500.
					</p>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
					<AlertDialogAction
						disabled={trimmed.length < 5 || pending}
						onClick={(event) => {
							event.preventDefault();
							void cancel();
						}}
					>
						{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						Stornieren
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
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
