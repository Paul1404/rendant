import { useRouter } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCent, formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { cn } from "@/lib/utils";

export type CashRegister = {
	id: string;
	kassennummer: string;
	kassenbezeichnung: string;
	wechselgeld_cent: number;
	reihenfolge: number;
};

type Draft = {
	kassennummer: string;
	kassenbezeichnung: string;
	wechselgeld_input: string;
};

function emptyDraft(): Draft {
	return {
		kassennummer: "",
		kassenbezeichnung: "",
		wechselgeld_input: "160,00",
	};
}

function draftFromRegister(r: CashRegister): Draft {
	return {
		kassennummer: r.kassennummer,
		kassenbezeichnung: r.kassenbezeichnung,
		wechselgeld_input: formatCentPlain(r.wechselgeld_cent),
	};
}

const KASSENNUMMER_RE = /^[A-Za-z0-9._\-/]+$/;

function validateDraft(draft: Draft): string | null {
	const num = draft.kassennummer.trim();
	if (!num) return "Kassennummer fehlt";
	if (num.length > 50) return "Kassennummer zu lang";
	if (!KASSENNUMMER_RE.test(num)) {
		return "Kassennummer darf nur Buchstaben, Ziffern und . _ - / enthalten";
	}
	const bez = draft.kassenbezeichnung.trim();
	if (!bez) return "Kassenbezeichnung fehlt";
	if (bez.length > 120) return "Kassenbezeichnung zu lang";
	const cent = parseGermanAmount(draft.wechselgeld_input);
	if (cent == null || cent < 0) return "Wechselgeld ist ungültig";
	return null;
}

function draftToPayload(draft: Draft) {
	const cent = parseGermanAmount(draft.wechselgeld_input);
	return {
		kassennummer: draft.kassennummer.trim(),
		kassenbezeichnung: draft.kassenbezeichnung.trim(),
		wechselgeld_cent: cent ?? 0,
	};
}

export function CashRegistersForm({ initial }: { initial: CashRegister[] }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [registers, setRegisters] = useState<CashRegister[]>(initial);
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

	function cancelAdd() {
		setAddingDraft(null);
	}

	function startEdit(r: CashRegister) {
		setAddingDraft(null);
		setEditingId(r.id);
		setEditDraft(draftFromRegister(r));
	}

	function cancelEdit() {
		setEditingId(null);
		setEditDraft(null);
	}

	function saveNew() {
		if (!addingDraft) return;
		const err = validateDraft(addingDraft);
		if (err) {
			toast.error(err);
			return;
		}
		const payload = draftToPayload(addingDraft);
		start(async () => {
			try {
				const data = await orpcClient.registers.create(payload);
				setRegisters((list) => [...list, data.register]);
				setAddingDraft(null);
				toast.success("Kasse angelegt");
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
		const payload = draftToPayload(editDraft);
		const id = editingId;
		start(async () => {
			try {
				const data = await orpcClient.registers.update({ id, ...payload });
				setRegisters((list) =>
					list.map((r) => (r.id === id ? data.register : r)),
				);
				setEditingId(null);
				setEditDraft(null);
				toast.success("Kasse aktualisiert");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	function remove(r: CashRegister) {
		if (
			!window.confirm(
				`Kasse ${r.kassennummer} – ${r.kassenbezeichnung} wirklich löschen?\n\nBereits erstellte Protokolle bleiben unverändert.`,
			)
		) {
			return;
		}
		start(async () => {
			try {
				await orpcClient.registers.remove({ id: r.id });
				setRegisters((list) => list.filter((x) => x.id !== r.id));
				if (editingId === r.id) {
					setEditingId(null);
					setEditDraft(null);
				}
				toast.success("Kasse gelöscht");
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
					Kasse anlegen
				</Button>
			</CardHeader>
			<CardContent className="space-y-3">
				{registers.length === 0 && !addingDraft ? (
					<p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
						Noch keine Kasse angelegt.
					</p>
				) : null}

				<div className="space-y-2">
					{registers.map((r) => {
						const isEditing = editingId === r.id;
						if (isEditing && editDraft) {
							return (
								<RegisterEditRow
									key={r.id}
									draft={editDraft}
									setDraft={setEditDraft}
									inputRef={editInputRef}
									onCancel={cancelEdit}
									onSave={saveEdit}
									pending={pending}
								/>
							);
						}
						return (
							<div
								key={r.id}
								className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 p-3 sm:flex-row sm:items-center"
							>
								<div className="min-w-0 flex-1 space-y-0.5">
									<div className="flex flex-wrap items-baseline gap-x-2">
										<span className="font-mono text-sm font-semibold text-foreground">
											{r.kassennummer}
										</span>
										<span className="text-sm text-foreground/80">
											{r.kassenbezeichnung}
										</span>
									</div>
									<p className="text-[11px] text-muted-foreground">
										Wechselgeld {formatCent(r.wechselgeld_cent)}
									</p>
								</div>
								<div className="flex items-center justify-end gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Kasse bearbeiten"
										onClick={() => startEdit(r)}
										disabled={pending}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Kasse löschen"
										onClick={() => remove(r)}
										disabled={pending}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>
						);
					})}

					{addingDraft ? (
						<RegisterEditRow
							draft={addingDraft}
							setDraft={(d) => setAddingDraft(d)}
							inputRef={addInputRef}
							onCancel={cancelAdd}
							onSave={saveNew}
							pending={pending}
						/>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

function RegisterEditRow({
	draft,
	setDraft,
	inputRef,
	onCancel,
	onSave,
	pending,
}: {
	draft: Draft;
	setDraft: (d: Draft) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	onCancel: () => void;
	onSave: () => void;
	pending: boolean;
}) {
	const wechselgeldCent = parseGermanAmount(draft.wechselgeld_input);
	const wechselgeldInvalid =
		draft.wechselgeld_input.trim() !== "" &&
		(wechselgeldCent == null || wechselgeldCent < 0);

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
		<div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
				<div className="space-y-1 sm:col-span-4">
					<Label htmlFor="reg-num">Kassennummer</Label>
					<Input
						id="reg-num"
						ref={inputRef}
						value={draft.kassennummer}
						onChange={(e) =>
							setDraft({ ...draft, kassennummer: e.target.value })
						}
						onKeyDown={onKeyDown}
						maxLength={50}
						placeholder="K-01"
						className="font-mono"
					/>
				</div>
				<div className="space-y-1 sm:col-span-5">
					<Label htmlFor="reg-bez">Kassenbezeichnung</Label>
					<Input
						id="reg-bez"
						value={draft.kassenbezeichnung}
						onChange={(e) =>
							setDraft({ ...draft, kassenbezeichnung: e.target.value })
						}
						onKeyDown={onKeyDown}
						maxLength={120}
						placeholder="Sportheim Theke"
					/>
				</div>
				<div className="space-y-1 sm:col-span-3">
					<Label htmlFor="reg-wg">Wechselgeld</Label>
					<Input
						id="reg-wg"
						inputMode="decimal"
						value={draft.wechselgeld_input}
						onChange={(e) =>
							setDraft({ ...draft, wechselgeld_input: e.target.value })
						}
						onKeyDown={onKeyDown}
						onFocus={(e) => e.currentTarget.select()}
						aria-invalid={wechselgeldInvalid}
						className={cn("text-right tabular-nums")}
					/>
				</div>
			</div>
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
		</div>
	);
}
