import { useRouter } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Repeat, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnlassKatalogEntry, AnlassTyp } from "@/lib/anlass";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { cn } from "@/lib/utils";

type Draft = { name: string; typ: AnlassTyp; aktiv: boolean };

function emptyDraft(): Draft {
	return { name: "", typ: "wiederkehrend", aktiv: true };
}

function draftFromEntry(e: AnlassKatalogEntry): Draft {
	return { name: e.name, typ: e.typ, aktiv: e.aktiv };
}

function validateDraft(draft: Draft): string | null {
	const name = draft.name.trim();
	if (!name) return "Name fehlt";
	if (name.length > 120) return "Name zu lang";
	return null;
}

export function AnlassCatalogForm({
	initial,
}: {
	initial: AnlassKatalogEntry[];
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [entries, setEntries] = useState<AnlassKatalogEntry[]>(initial);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [addingDraft, setAddingDraft] = useState<Draft | null>(null);
	const [editDraft, setEditDraft] = useState<Draft | null>(null);
	const addInputRef = useRef<HTMLInputElement | null>(null);
	const editInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (addingDraft && addInputRef.current) addInputRef.current.focus();
	}, [addingDraft]);
	useEffect(() => {
		if (editingId && editInputRef.current) editInputRef.current.focus();
	}, [editingId]);

	function startAdd() {
		setEditingId(null);
		setEditDraft(null);
		setAddingDraft(emptyDraft());
	}

	function startEdit(entry: AnlassKatalogEntry) {
		setAddingDraft(null);
		setEditingId(entry.id);
		setEditDraft(draftFromEntry(entry));
	}

	function saveNew() {
		if (!addingDraft) return;
		const err = validateDraft(addingDraft);
		if (err) {
			toast.error(err);
			return;
		}
		start(async () => {
			try {
				const data = await orpcClient.anlassKatalog.create({
					name: addingDraft.name.trim(),
					typ: addingDraft.typ,
					aktiv: addingDraft.aktiv,
				});
				setEntries((list) => [...list, data.entry]);
				setAddingDraft(null);
				toast.success("Anlass angelegt");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	function saveEdit() {
		if (!editingId || !editDraft) return;
		const err = validateDraft(editDraft);
		if (err) {
			toast.error(err);
			return;
		}
		const id = editingId;
		start(async () => {
			try {
				const data = await orpcClient.anlassKatalog.update({
					id,
					name: editDraft.name.trim(),
					typ: editDraft.typ,
					aktiv: editDraft.aktiv,
				});
				setEntries((list) => list.map((e) => (e.id === id ? data.entry : e)));
				setEditingId(null);
				setEditDraft(null);
				toast.success("Anlass aktualisiert");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	function remove(entry: AnlassKatalogEntry) {
		if (
			!window.confirm(
				`Anlass "${entry.name}" wirklich löschen?\n\nGeht nur, wenn ihm keine Belege zugeordnet sind. Sonst besser deaktivieren.`,
			)
		) {
			return;
		}
		start(async () => {
			try {
				await orpcClient.anlassKatalog.remove({ id: entry.id });
				setEntries((list) => list.filter((e) => e.id !== entry.id));
				if (editingId === entry.id) {
					setEditingId(null);
					setEditDraft(null);
				}
				toast.success("Anlass gelöscht");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Löschen fehlgeschlagen"));
			}
		});
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-end gap-2 pb-3">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={startAdd}
					disabled={addingDraft != null || pending}
				>
					<Plus className="mr-2 h-4 w-4" />
					Anlass anlegen
				</Button>
			</CardHeader>
			<CardContent className="space-y-3">
				{entries.length === 0 && !addingDraft ? (
					<p className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
						Noch kein Anlass angelegt.
					</p>
				) : null}

				<div className="space-y-2">
					{entries.map((entry) => {
						if (editingId === entry.id && editDraft) {
							return (
								<AnlassEditRow
									key={entry.id}
									idPrefix={`edit-${entry.id}`}
									draft={editDraft}
									setDraft={setEditDraft}
									inputRef={editInputRef}
									onCancel={() => {
										setEditingId(null);
										setEditDraft(null);
									}}
									onSave={saveEdit}
									pending={pending}
								/>
							);
						}
						return (
							<div
								key={entry.id}
								className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="truncate text-sm font-semibold text-foreground">
											{entry.name}
										</span>
										{entry.typ === "wiederkehrend" ? (
											<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
												<Repeat className="h-3 w-3" />
												wiederkehrend
											</span>
										) : (
											<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
												einmalig
											</span>
										)}
										{!entry.aktiv ? (
											<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
												inaktiv
											</span>
										) : null}
									</div>
								</div>
								<div className="flex items-center justify-end gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Anlass bearbeiten"
										onClick={() => startEdit(entry)}
										disabled={pending}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Anlass löschen"
										onClick={() => remove(entry)}
										disabled={pending}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>
						);
					})}

					{addingDraft ? (
						<AnlassEditRow
							idPrefix="add"
							draft={addingDraft}
							setDraft={(d) => setAddingDraft(d)}
							inputRef={addInputRef}
							onCancel={() => setAddingDraft(null)}
							onSave={saveNew}
							pending={pending}
						/>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

function AnlassEditRow({
	idPrefix,
	draft,
	setDraft,
	inputRef,
	onCancel,
	onSave,
	pending,
}: {
	idPrefix: string;
	draft: Draft;
	setDraft: (d: Draft) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	onCancel: () => void;
	onSave: () => void;
	pending: boolean;
}) {
	const nameId = `${idPrefix}-anlass-name`;

	function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			onSave();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	}

	return (
		<Card variant="quiet" size="sm" className="ring-1 ring-primary/20">
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
					<div className="space-y-1.5 sm:col-span-6">
						<Label htmlFor={nameId}>Name</Label>
						<Input
							id={nameId}
							ref={inputRef}
							value={draft.name}
							onChange={(e) => setDraft({ ...draft, name: e.target.value })}
							onKeyDown={onKeyDown}
							maxLength={120}
							placeholder="z. B. Biergarten"
						/>
					</div>
					<div className="space-y-1.5 sm:col-span-6">
						<Label>Typ</Label>
						<fieldset className="inline-flex w-full rounded-lg border border-border/60 bg-background/60 p-0.5">
							{(["wiederkehrend", "einmalig"] as const).map((t) => {
								const active = draft.typ === t;
								return (
									<button
										key={t}
										type="button"
										aria-pressed={active}
										onClick={() => setDraft({ ...draft, typ: t })}
										className={cn(
											"flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
											active
												? "bg-primary/10 text-primary"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										{t === "wiederkehrend" ? "wiederkehrend" : "einmalig"}
									</button>
								);
							})}
						</fieldset>
					</div>
				</div>
				<label className="flex min-h-9 items-center gap-2 py-1.5 text-sm text-foreground">
					<input
						type="checkbox"
						checked={draft.aktiv}
						onChange={(e) => setDraft({ ...draft, aktiv: e.target.checked })}
						className="h-4 w-4 rounded border-border accent-primary"
					/>
					Aktiv (zur Auswahl beim Erfassen)
				</label>
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onCancel}
						disabled={pending}
					>
						<X className="mr-1 h-4 w-4" />
						Abbrechen
					</Button>
					<Button type="button" size="sm" onClick={onSave} disabled={pending}>
						{pending ? (
							<Loader2 className="mr-1 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-1 h-4 w-4" />
						)}
						Speichern
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
