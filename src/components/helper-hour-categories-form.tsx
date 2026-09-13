import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	formatMinutes,
	HELPER_HOUR_CATEGORY_ARTEN,
	type HelperHourCategoryArt,
} from "@/lib/helper-hours";
import { formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpc, orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

type Category = {
	id: string;
	code: string;
	label: string;
	art: HelperHourCategoryArt;
	sortierung: number;
	aktiv: boolean;
	system: boolean;
	entries: number;
	minutes: number;
	expenses: number;
};

/**
 * Two spellings of one person split their hours across two helpers. Merging is
 * never automatic: the same similarity finds real siblings too, so each pair is
 * confirmed here and then remembered for every future import.
 */
/**
 * Clean-up for what the old free-text data left behind: catalogue entries that
 * look like the same person. Merging moves the hours and remembers the losing
 * spelling, so a future import resolves to the survivor.
 */
export function HelperHourNameVariantsForm() {
	const queryClient = useQueryClient();
	const { data: variants, refetch } = useQuery(
		orpc.helperHours.nameVariants.queryOptions({}),
	);
	const [pending, setPending] = useState<string | null>(null);

	async function refresh() {
		await Promise.all([
			refetch(),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.catalog.key({ type: "query" }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.list.key({ type: "query" }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.entries.key({ type: "query" }),
			}),
		]);
	}

	async function merge(vonId: string, nachId: string, label: string) {
		setPending(vonId);
		try {
			const saved = await orpcClient.helperHours.mergePersons({
				von_id: vonId,
				nach_id: nachId,
			});
			await refresh();
			toast.success(`${saved.moved} Einträge auf „${label}“ vereinheitlicht`);
		} catch (error) {
			toast.error(orpcMessage(error, "Zusammenführen fehlgeschlagen"));
		} finally {
			setPending(null);
		}
	}

	const offen = (variants ?? []) as Array<{
		left: string;
		right: string;
		leftId: string | null;
		rightId: string | null;
		leftEntries: number;
		rightEntries: number;
		leftMinutes: number;
		rightMinutes: number;
	}>;

	return (
		<Card>
			<CardHeader>
				<p className="font-medium">Doppelte Helfer zusammenführen</p>
				<p className="text-xs text-muted-foreground">
					Katalogeinträge, die dieselbe Person sein könnten. Beim Zusammenführen
					wandern die Stunden mit, und die aufgegebene Schreibweise wird
					gemerkt, damit ein künftiger Import sie richtig zuordnet. Zwei
					ähnliche Namen können auch zwei echte Personen sein, deshalb passiert
					nichts von selbst.
				</p>
			</CardHeader>
			<CardContent className="space-y-2">
				{offen.length === 0 ? (
					<p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
						Keine doppelten Helfer gefunden.
					</p>
				) : null}
				{offen.map((variant) => {
					const linksGewinnt = variant.leftEntries >= variant.rightEntries;
					const ziel = linksGewinnt ? variant.left : variant.right;
					const zielId = linksGewinnt ? variant.leftId : variant.rightId;
					const quelle = linksGewinnt ? variant.right : variant.left;
					const quelleId = linksGewinnt ? variant.rightId : variant.leftId;
					if (!zielId || !quelleId) return null;
					return (
						<div
							key={`${variant.left}|${variant.right}`}
							className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
						>
							<p className="min-w-0 text-sm">
								<span className="font-medium">{quelle}</span> (
								{formatMinutes(
									linksGewinnt ? variant.rightMinutes : variant.leftMinutes,
								)}{" "}
								h) zu <span className="font-medium">{ziel}</span> (
								{formatMinutes(
									linksGewinnt ? variant.leftMinutes : variant.rightMinutes,
								)}{" "}
								h)
							</p>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									disabled={pending !== null}
									onClick={() => void merge(quelleId, zielId, ziel)}
								>
									Zusammenführen
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={pending !== null}
									onClick={() => void merge(zielId, quelleId, quelle)}
								>
									Umgekehrt
								</Button>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

type NoteRule = {
	id: string;
	vermerk: string;
	kategorie_code: string;
	kategorie_label: string;
};

/**
 * Sub-groups the spreadsheet only names in its "Sonstiges" column. A rule turns
 * such a note into a real booking without touching the monthly sheets.
 */
export function HelperHourNoteRulesForm() {
	const queryClient = useQueryClient();
	const { data: rules, refetch } = useQuery(
		orpc.helperHours.noteRules.queryOptions({}),
	);
	const { data: categoryData } = useQuery(
		orpc.helperHours.categories.queryOptions({}),
	);
	const categories = ((categoryData ?? []) as Category[]).filter(
		(c) => c.aktiv,
	);
	const [vermerk, setVermerk] = useState("");
	const [kategorie, setKategorie] = useState("");
	const [pending, setPending] = useState(false);

	async function refresh() {
		await Promise.all([
			refetch(),
			// Eine Regel bucht Stunden um, also stimmen auch die Zahlen der Punkte
			// und der Auswertung nicht mehr.
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.categories.key({ type: "query" }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.list.key({ type: "query" }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.entries.key({ type: "query" }),
			}),
		]);
	}

	async function create(event: React.FormEvent) {
		event.preventDefault();
		if (!vermerk.trim() || !kategorie) {
			toast.error("Bitte Vermerk und Punkt angeben");
			return;
		}
		setPending(true);
		try {
			const saved = await orpcClient.helperHours.createNoteRule({
				vermerk,
				kategorie,
				bemerkung: "",
			});
			setVermerk("");
			await refresh();
			toast.success(`${saved.updated} Einträge umgebucht`);
		} catch (error) {
			toast.error(orpcMessage(error, "Anlegen fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}

	async function remove(id: string) {
		setPending(true);
		try {
			await orpcClient.helperHours.deleteNoteRule({ id });
			await refresh();
			toast.success("Regel entfernt");
		} catch (error) {
			toast.error(orpcMessage(error, "Entfernen fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<p className="font-medium">Vermerke als Punkt buchen</p>
				<p className="text-xs text-muted-foreground">
					Steht in der Spalte "Sonstiges" eine Untergruppe wie Kinderturnen,
					zählen deren Stunden bisher für die angekreuzte Abteilung. Eine Regel
					bucht sie stattdessen auf einen eigenen Punkt, bei jedem Import und
					ohne neue Spalte in der Liste. Vorhandene Stunden werden sofort
					umgebucht.
				</p>
			</CardHeader>
			<CardContent className="space-y-2">
				{((rules ?? []) as NoteRule[]).map((rule) => (
					<div
						key={rule.id}
						className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
					>
						<span>
							Zeilen mit <span className="font-medium">„{rule.vermerk}“</span>{" "}
							in der Spalte Sonstiges buchen auf den Punkt{" "}
							<span className="font-medium">{rule.kategorie_label}</span>
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={pending}
							onClick={() => void remove(rule.id)}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</div>
				))}
				<form
					className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-[2fr_2fr_auto]"
					onSubmit={create}
				>
					<div className="space-y-1.5">
						<Label htmlFor="hhn-vermerk">Vermerk in "Sonstiges"</Label>
						<Input
							id="hhn-vermerk"
							placeholder="z. B. Kinderturnen"
							value={vermerk}
							maxLength={40}
							onChange={(event) => setVermerk(event.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Bucht auf Punkt</Label>
						<Select value={kategorie} onValueChange={setKategorie}>
							<SelectTrigger>
								<SelectValue placeholder="Punkt wählen" />
							</SelectTrigger>
							<SelectContent>
								{categories.map((entry) => (
									<SelectItem key={entry.code} value={entry.code}>
										{entry.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-end">
						<Button disabled={pending}>
							{pending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Plus className="mr-2 h-4 w-4" />
							)}
							Anlegen
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

export function HelperHourCategoriesForm({
	valueCent,
	valueUpdatedAt,
}: {
	valueCent: number;
	valueUpdatedAt?: string;
}) {
	const queryClient = useQueryClient();
	const { data, refetch } = useQuery(
		orpc.helperHours.categories.queryOptions({}),
	);
	const categories = (data ?? []) as Category[];
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState({
		label: "",
		art: "abteilung" as HelperHourCategoryArt,
		aktiv: true,
	});
	const [newLabel, setNewLabel] = useState("");
	const [newArt, setNewArt] = useState<HelperHourCategoryArt>("abteilung");
	const [pending, setPending] = useState(false);

	const [rateInput, setRateInput] = useState(formatCentPlain(valueCent));
	// The rate revalues every deduction retroactively, so a save that would
	// silently overwrite another admin's change is rejected.
	const [rateUpdatedAt, setRateUpdatedAt] = useState(valueUpdatedAt);
	const [rateSaving, setRateSaving] = useState(false);
	useEffect(() => setRateInput(formatCentPlain(valueCent)), [valueCent]);
	const createKey = useRef<string | null>(null);

	async function refresh() {
		await Promise.all([
			refetch(),
			queryClient.invalidateQueries({
				queryKey: orpc.helperHours.list.key({ type: "query" }),
			}),
		]);
	}

	async function saveRate() {
		const amount = parseGermanAmount(rateInput);
		if (!amount || amount <= 0) {
			toast.error("Bitte einen positiven Stundenwert angeben");
			return;
		}
		setRateSaving(true);
		try {
			const saved = await orpcClient.settings.updateHelperHourValue({
				wert_cent: amount,
				expected_updated_at: rateUpdatedAt,
			});
			setRateUpdatedAt(saved.updated_at);
			await refresh();
			toast.success("Stundenwert gespeichert");
		} catch (error) {
			toast.error(orpcMessage(error, "Speichern fehlgeschlagen"));
		} finally {
			setRateSaving(false);
		}
	}

	async function create(event: React.FormEvent) {
		event.preventDefault();
		if (!newLabel.trim()) {
			toast.error("Bitte einen Namen angeben");
			return;
		}
		setPending(true);
		try {
			createKey.current ??= crypto.randomUUID();
			await orpcClient.helperHours.createCategory({
				label: newLabel,
				art: newArt,
			});
			createKey.current = null;
			setNewLabel("");
			await refresh();
			toast.success("Punkt angelegt");
		} catch (error) {
			toast.error(orpcMessage(error, "Anlegen fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}

	async function save(category: Category) {
		setPending(true);
		try {
			await orpcClient.helperHours.updateCategory({
				id: category.id,
				label: draft.label,
				art: draft.art,
				aktiv: draft.aktiv,
				sortierung: category.sortierung,
			});
			setEditingId(null);
			await refresh();
			toast.success("Punkt gespeichert");
		} catch (error) {
			toast.error(orpcMessage(error, "Speichern fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}

	async function remove(category: Category) {
		setPending(true);
		try {
			await orpcClient.helperHours.deleteCategory({ id: category.id });
			await refresh();
			toast.success("Punkt gelöscht");
		} catch (error) {
			toast.error(orpcMessage(error, "Löschen fehlgeschlagen"));
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<p className="font-medium">Stundenwert</p>
					<p className="text-xs text-muted-foreground">
						Rechnet Käufe einer Abteilung in abgezogene Stunden um. In der
						Helferstunden-Ansicht selbst erscheinen nur Stunden. Der Wert gilt
						rückwirkend für alle Abzüge.
					</p>
				</CardHeader>
				<CardContent>
					<div className="flex max-w-sm gap-2">
						<Input
							aria-label="Wert einer Helferstunde in Euro"
							inputMode="decimal"
							value={rateInput}
							onChange={(event) => setRateInput(event.target.value)}
						/>
						<Button
							type="button"
							variant="secondary"
							disabled={rateSaving}
							onClick={() => void saveRate()}
						>
							{rateSaving ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Save className="mr-2 h-4 w-4" />
							)}
							Speichern
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<p className="font-medium">Punkte</p>
					<p className="text-xs text-muted-foreground">
						Abteilungen und Vereinsbeiträge, denen Helferstunden zugeordnet
						werden. Ein neuer Punkt erscheint sofort im Erfassungsformular und
						wird beim Import über eine gleichnamige Spalte erkannt.
					</p>
				</CardHeader>
				<CardContent className="space-y-2">
					{categories.map((category) =>
						editingId === category.id ? (
							<div
								key={category.id}
								className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_auto]"
							>
								<div className="space-y-1.5">
									<Label htmlFor={`hhc-label-${category.id}`}>Name</Label>
									<Input
										id={`hhc-label-${category.id}`}
										value={draft.label}
										maxLength={60}
										onChange={(event) =>
											setDraft({ ...draft, label: event.target.value })
										}
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Art</Label>
									<Select
										value={draft.art}
										onValueChange={(value) =>
											setDraft({
												...draft,
												art: value as HelperHourCategoryArt,
											})
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{HELPER_HOUR_CATEGORY_ARTEN.map((entry) => (
												<SelectItem key={entry.value} value={entry.value}>
													{entry.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="flex flex-wrap items-end gap-2">
									<Button
										type="button"
										variant={draft.aktiv ? "outline" : "secondary"}
										onClick={() => setDraft({ ...draft, aktiv: !draft.aktiv })}
									>
										{draft.aktiv ? "Aktiv" : "Deaktiviert"}
									</Button>
									<Button
										type="button"
										disabled={pending}
										onClick={() => void save(category)}
									>
										<Save className="mr-1 h-4 w-4" />
										Speichern
									</Button>
									<Button
										type="button"
										variant="ghost"
										onClick={() => setEditingId(null)}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							</div>
						) : (
							<div
								key={category.id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
							>
								<div className="min-w-0">
									<p className="font-medium">
										{category.label}
										{category.aktiv ? null : (
											<span className="ml-2 text-xs text-muted-foreground">
												deaktiviert
											</span>
										)}
									</p>
									<p className="text-xs text-muted-foreground">
										{HELPER_HOUR_CATEGORY_ARTEN.find(
											(entry) => entry.value === category.art,
										)?.label ?? category.art}
										{" · "}
										{category.entries} Einträge ·{" "}
										{formatMinutes(category.minutes)} h
										{category.expenses > 0
											? ` · ${category.expenses} Abzüge`
											: ""}
									</p>
								</div>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											setEditingId(category.id);
											setDraft({
												label: category.label,
												art: category.art,
												aktiv: category.aktiv,
											});
										}}
									>
										<Pencil className="mr-1 h-3.5 w-3.5" />
										Bearbeiten
									</Button>
									{!category.system &&
									category.entries === 0 &&
									category.expenses === 0 ? (
										<ConfirmDialog
											title="Punkt löschen"
											description={`„${category.label}“ wird entfernt. Das ist nur möglich, solange keine Stunden und keine Abzüge darauf gebucht sind.`}
											confirmLabel="Löschen"
											onConfirm={() => remove(category)}
											trigger={
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													aria-label="Punkt löschen"
													disabled={pending}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											}
										/>
									) : null}
								</div>
							</div>
						),
					)}

					<form
						className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-[2fr_1fr_auto]"
						onSubmit={create}
					>
						<div className="space-y-1.5">
							<Label htmlFor="hhc-new-label">Neuer Punkt</Label>
							<Input
								id="hhc-new-label"
								placeholder="z. B. Schützen"
								value={newLabel}
								maxLength={60}
								onChange={(event) => setNewLabel(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Art</Label>
							<Select
								value={newArt}
								onValueChange={(value) =>
									setNewArt(value as HelperHourCategoryArt)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{HELPER_HOUR_CATEGORY_ARTEN.map((entry) => (
										<SelectItem key={entry.value} value={entry.value}>
											{entry.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-end">
							<Button disabled={pending}>
								{pending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Plus className="mr-2 h-4 w-4" />
								)}
								Anlegen
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
