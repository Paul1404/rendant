import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	CheckCircle2,
	Download,
	FileCheck2,
	Loader2,
	Pencil,
	Plus,
	ReceiptText,
	RotateCcw,
	Settings2,
	Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateDe, todayIsoDate } from "@/lib/date";
import {
	formatMinutes,
	HELPER_HOUR_CATEGORIES,
	type HelperHourBudgetCategory,
	type HelperHourCategory,
	helperHourCategoryLabel,
} from "@/lib/helper-hours";
import { formatCent, formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpc, orpcClient } from "@/lib/orpc";

type Preview = {
	valid: boolean;
	digest: string;
	rows: number;
	toImport: number;
	alreadyImported: number;
	hours: number;
	warnings: number;
	errors: Array<{ sheet: string; row: number; message: string }>;
	warningSample: Array<{ sheet: string; row: number; warnings: string[] }>;
	reviewRows: HelperHoursReviewRow[];
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

type HelperHoursImportIssue =
	| "missing_name"
	| "derived_total"
	| "unassigned"
	| "total_mismatch";
type HelperHoursAllocations = Record<`${HelperHourCategory}_minuten`, number>;
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

function parseHours(value: string): number | null {
	const hours = Number(value.trim().replace(",", "."));
	if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
	const minutes = Math.round(hours * 60);
	return minutes % 15 === 0 ? minutes : null;
}

export function HelperHoursPage({ isAdmin }: { isAdmin: boolean }) {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(orpc.helperHours.list.queryOptions());
	const [selectedDepartment, setSelectedDepartment] =
		useState<HelperHourBudgetCategory>("fussball");
	const [saving, setSaving] = useState(false);
	const key = useRef<string | null>(null);
	const [form, setForm] = useState({
		datum: todayIsoDate(),
		veranstaltung: "",
		vorname: "",
		nachname: "",
		stunden: "",
		kategorie: "gesamtverein" as HelperHourCategory,
		bemerkung: "",
	});
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
				kategorie: form.kategorie,
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
			await queryClient.invalidateQueries({
				queryKey: orpc.helperHours.list.queryKey(),
			});
			toast.success("Helferstunde gespeichert");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<div className="space-y-6">
			<div className="grid gap-3 sm:grid-cols-3">
				{[
					["Stunden", formatMinutes(data?.summary.minutes ?? 0)],
					["Helfer", String(data?.summary.helpers ?? 0)],
					["Einträge", String(data?.summary.entries ?? 0)],
				].map(([label, value]) => (
					<Card key={label} size="sm" variant="quiet">
						<CardContent>
							<p className="text-xs text-muted-foreground">{label}</p>
							<p className="mt-1 font-heading text-2xl tabular-nums">
								{isLoading ? "…" : value}
							</p>
						</CardContent>
					</Card>
				))}
			</div>
			<HelperHoursBudgets
				budgets={data?.budgets ?? []}
				contribution={
					data?.contribution ?? {
						code: "gesamtverein",
						label: "Vereinsbeitrag",
						minutes: 0,
						earnedCent: 0,
					}
				}
				expenses={data?.expenses ?? []}
				valueCent={data?.valueCent ?? 600}
				selected={selectedDepartment}
				onSelected={setSelectedDepartment}
				isAdmin={isAdmin}
				onChanged={() =>
					queryClient.invalidateQueries({
						queryKey: orpc.helperHours.list.queryKey(),
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
								value={form.kategorie}
								onValueChange={(value) =>
									setForm({ ...form, kategorie: value as HelperHourCategory })
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{HELPER_HOUR_CATEGORIES.map((c) => (
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
			{isAdmin ? (
				<HelperHoursImport
					onImported={() =>
						queryClient.invalidateQueries({
							queryKey: orpc.helperHours.list.queryKey(),
						})
					}
				/>
			) : null}
			<Card>
				<CardHeader>
					<CardTitle>Letzte Einträge</CardTitle>
					<CardDescription>
						Die neuesten Helferstunden aus Erfassung und Import.
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full min-w-[680px] text-sm">
						<thead>
							<tr className="border-b text-left text-xs text-muted-foreground">
								<th className="py-2 pr-3">Datum</th>
								<th className="px-3 py-2">Helfer</th>
								<th className="px-3 py-2">Veranstaltung</th>
								<th className="px-3 py-2">Quelle</th>
								<th className="py-2 pl-3 text-right">Stunden</th>
							</tr>
						</thead>
						<tbody>
							{data?.items.map((item) => (
								<tr
									key={item.id}
									className="border-b border-border/50 last:border-0"
								>
									<td className="py-2.5 pr-3 tabular-nums">
										{formatDateDe(item.datum)}
									</td>
									<td className="px-3 py-2.5 font-medium">
										{`${item.vorname} ${item.nachname}`.trim() || "Ohne Namen"}
									</td>
									<td className="px-3 py-2.5">{item.veranstaltung}</td>
									<td className="px-3 py-2.5 text-xs text-muted-foreground">
										{item.quelle === "excel" ? item.quelle_blatt : "Manuell"}
									</td>
									<td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
										{formatMinutes(item.gemeldete_summe_minuten)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!isLoading && !data?.items.length ? (
						<p className="py-8 text-center text-muted-foreground">
							Noch keine Helferstunden erfasst.
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

type Budget = {
	code: HelperHourBudgetCategory;
	label: string;
	minutes: number;
	earnedCent: number;
	spentCent: number;
	balanceCent: number;
};

type ClubContribution = {
	code: "gesamtverein";
	label: string;
	minutes: number;
	earnedCent: number;
};

type DepartmentExpense = {
	id: string;
	abteilung: string;
	datum: string;
	bezeichnung: string;
	betrag_cent: number;
	bemerkung: string;
	storniert_am: Date | string | null;
	storno_grund: string | null;
};

function HelperHoursBudgets({
	budgets,
	contribution,
	expenses,
	valueCent,
	selected,
	onSelected,
	isAdmin,
	onChanged,
}: {
	budgets: Budget[];
	contribution: ClubContribution;
	expenses: DepartmentExpense[];
	valueCent: number;
	selected: HelperHourBudgetCategory;
	onSelected: (value: HelperHourBudgetCategory) => void;
	isAdmin: boolean;
	onChanged: () => Promise<unknown>;
}) {
	const budget = budgets.find((entry) => entry.code === selected);
	const visibleExpenses = expenses.filter(
		(entry) => entry.abteilung === selected,
	);
	const [expenseForm, setExpenseForm] = useState({
		datum: todayIsoDate(),
		bezeichnung: "",
		betrag: "",
		bemerkung: "",
	});
	const [rateInput, setRateInput] = useState(formatCentPlain(valueCent));
	const [saving, setSaving] = useState<"expense" | "rate" | "cancel" | null>(
		null,
	);
	const expenseKey = useRef<string | null>(null);
	useEffect(() => setRateInput(formatCentPlain(valueCent)), [valueCent]);

	async function saveExpense(event: React.FormEvent) {
		event.preventDefault();
		const amount = parseGermanAmount(expenseForm.betrag);
		if (!amount || amount <= 0) {
			toast.error("Bitte einen positiven Betrag angeben");
			return;
		}
		setSaving("expense");
		try {
			expenseKey.current ??= crypto.randomUUID();
			await orpcClient.helperHours.createExpense({
				idempotency_key: expenseKey.current,
				abteilung: selected,
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
			toast.success("Ausgabe vom Abteilungsbudget abgezogen");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(null);
		}
	}

	async function saveRate() {
		const amount = parseGermanAmount(rateInput);
		if (!amount || amount <= 0) {
			toast.error("Bitte einen positiven Stundenwert angeben");
			return;
		}
		setSaving("rate");
		try {
			await orpcClient.settings.updateHelperHourValue({ wert_cent: amount });
			await onChanged();
			toast.success("Stundenwert gespeichert");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(null);
		}
	}

	async function cancelExpense(id: string) {
		const reason = window.prompt("Warum wird diese Ausgabe storniert?");
		if (!reason) return;
		if (reason.trim().length < 5) {
			toast.error("Bitte einen kurzen Stornogrund angeben");
			return;
		}
		setSaving("cancel");
		try {
			await orpcClient.helperHours.cancelExpense({ id, grund: reason });
			await onChanged();
			toast.success("Ausgabe storniert");
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
					Vereinsbeitrag und Abteilungsbudgets
				</CardTitle>
				<CardDescription>
					Helferstunden werden mit {formatCent(valueCent)} bewertet. Käufe
					mindern nur das verfügbare Budget der gewählten Abteilung.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p className="font-medium">Interner Vereinsbeitrag</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Dem Gesamtverein zugeordnete Stunden gelten als Beitrag an den
								Verein und stehen nicht für Abteilungskäufe zur Verfügung.
							</p>
						</div>
						<div className="sm:text-right">
							<p className="font-heading text-xl tabular-nums">
								{formatCent(contribution.earnedCent)}
							</p>
							<p className="text-xs text-muted-foreground">
								{formatMinutes(contribution.minutes)} h
							</p>
						</div>
					</div>
				</div>
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
									entry.balanceCent < 0 ? "text-destructive" : ""
								}`}
							>
								{formatCent(entry.balanceCent)}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{formatMinutes(entry.minutes)} h · {formatCent(entry.spentCent)}{" "}
								ausgegeben
							</p>
						</button>
					))}
				</div>
				<div className="grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-3">
					<BudgetNumber label="Erarbeitet" value={budget?.earnedCent ?? 0} />
					<BudgetNumber label="Ausgegeben" value={budget?.spentCent ?? 0} />
					<BudgetNumber
						label="Verfügbar"
						value={budget?.balanceCent ?? 0}
						emphasized
					/>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="font-medium">{helperHourCategoryLabel(selected)}</p>
						<p className="text-xs text-muted-foreground">
							Export mit Übersicht, Helferstunden und Ausgaben.
						</p>
					</div>
					<Button asChild variant="outline">
						<a
							href={`/api/export/helper-hours/xlsx?abteilung=${selected}`}
							download
						>
							<Download className="mr-1 h-4 w-4" />
							Excel-Übersicht
						</a>
					</Button>
				</div>
				{isAdmin ? (
					<div className="grid gap-4 border-t pt-5 lg:grid-cols-[1fr_2fr]">
						<div className="space-y-3">
							<div className="flex items-center gap-2 font-medium">
								<Settings2 className="h-4 w-4 text-primary" />
								Stundenwert
							</div>
							<p className="text-xs text-muted-foreground">
								Der Wert gilt für alle vorhandenen und neuen Helferstunden.
							</p>
							<div className="flex gap-2">
								<Input
									aria-label="Wert einer Helferstunde"
									inputMode="decimal"
									value={rateInput}
									onChange={(event) => setRateInput(event.target.value)}
								/>
								<Button
									type="button"
									variant="secondary"
									disabled={saving !== null}
									onClick={() => void saveRate()}
								>
									Speichern
								</Button>
							</div>
						</div>
						<form className="grid gap-3 sm:grid-cols-2" onSubmit={saveExpense}>
							<div className="sm:col-span-2">
								<p className="font-medium">Ausgabe für {budget?.label}</p>
								<p className="text-xs text-muted-foreground">
									Der Betrag wird direkt vom Abteilungsbudget abgezogen.
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
								<Label htmlFor="hh-expense-amount">Betrag</Label>
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
									required
								/>
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
								Ausgabe abziehen
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
									<th className="px-3 py-2">Ausgabe</th>
									<th className="px-3 py-2">Status</th>
									<th className="px-3 py-2 text-right">Betrag</th>
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
											{formatCent(entry.betrag_cent)}
										</td>
										{isAdmin ? (
											<td className="py-2.5 pl-3 text-right">
												{!entry.storniert_am ? (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={saving !== null}
														onClick={() => void cancelExpense(entry.id)}
													>
														<RotateCcw className="mr-1 h-3.5 w-3.5" />
														Stornieren
													</Button>
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
				{formatCent(value)}
			</p>
		</div>
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
	function confirmImport() {
		if (!preview?.valid || preview.toImport <= 0 || openIssues > 0) return;
		const hint =
			preview.warnings > 0
				? ` ${preview.warnings} Hinweise bleiben zur Herkunft gespeichert.`
				: "";
		if (
			window.confirm(
				`${preview.toImport} Helferstunden verbindlich importieren?${hint}`,
			)
		)
			void send("apply");
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Upload className="h-4 w-4 text-primary" />
					Excel-Datei importieren
				</CardTitle>
				<CardDescription>
					Rendant erkennt die Monatsblätter der bisherigen SVU-Liste, zeigt
					Unstimmigkeiten an und importiert erst nach deiner Bestätigung.
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
							{preview.toImport} neu, {preview.alreadyImported} bereits
							importiert, {preview.warnings} Hinweise
						</p>
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
							<div className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-50">
											<AlertTriangle className="h-4 w-4" />
											{resolvedIssues} von {totalIssues} Hinweisen geklärt
										</p>
										<p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-100/80">
											Originalwerte bleiben erhalten. Öffne eine Zeile zum
											Korrigieren.
										</p>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-amber-950/10 sm:w-40">
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
													<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
												) : (
													<Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
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
					</div>
				) : null}
			</CardContent>
			<HelperHoursCorrectionDialog
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
	if (issue === "unassigned")
		return (
			correction.allocations.gesamtverein_minuten !==
			correction.gemeldete_summe_minuten
		);
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
	const [working, setWorking] = useState<HelperHoursCorrection | null>(null);
	useEffect(() => {
		if (row && value)
			setWorking({
				...value,
				allocations: { ...value.allocations },
				acceptedIssues: [...value.acceptedIssues],
			});
	}, [row, value]);
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
	function assignTotal(category: HelperHourCategory) {
		setWorking((current) => {
			if (!current) return current;
			return {
				...current,
				acceptedIssues: current.acceptedIssues.filter(
					(issue) => issue !== "unassigned" && issue !== "total_mismatch",
				),
				allocations: Object.fromEntries(
					HELPER_HOUR_CATEGORIES.map((entry) => [
						`${entry.code}_minuten`,
						entry.code === category ? current.gemeldete_summe_minuten : 0,
					]),
				) as HelperHoursAllocations,
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
					{row.issues.some((issue) => issue !== "missing_name") ? (
						<CorrectionSection
							title="Stunden und Zuordnung prüfen"
							resolved={row.issues
								.filter((issue) => issue !== "missing_name")
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
									<div className="flex flex-col gap-2 sm:flex-row">
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
										<Select
											onValueChange={(value) =>
												assignTotal(value as HelperHourCategory)
											}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Abteilung wählen" />
											</SelectTrigger>
											<SelectContent>
												{HELPER_HOUR_CATEGORIES.map((entry) => (
													<SelectItem key={entry.code} value={entry.code}>
														{entry.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							) : null}
							{row.issues.includes("unassigned") ? (
								<div className="space-y-1.5">
									<Label>Gemeldete Summe zuordnen</Label>
									<Select
										onValueChange={(value) =>
											assignTotal(value as HelperHourCategory)
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Abteilung wählen" />
										</SelectTrigger>
										<SelectContent>
											{HELPER_HOUR_CATEGORIES.map((entry) => (
												<SelectItem key={entry.code} value={entry.code}>
													{entry.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Button
										type="button"
										variant={
											working.acceptedIssues.includes("unassigned")
												? "default"
												: "outline"
										}
										onClick={() => toggleAccepted("unassigned")}
									>
										Als Vereinsbeitrag übernehmen
									</Button>
								</div>
							) : null}
							{row.issues.includes("derived_total") ? (
								<Button
									type="button"
									variant={
										working.acceptedIssues.includes("derived_total")
											? "default"
											: "outline"
									}
									onClick={() => toggleAccepted("derived_total")}
								>
									Berechnete Summe übernehmen
								</Button>
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
					<span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
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
