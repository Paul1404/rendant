import { Check, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CatalogOption = { id: string; label: string; aktiv?: boolean };

function normalize(value: string) {
	return value.trim().toLocaleLowerCase("de-DE");
}

/**
 * Select an existing catalogue entry, or deliberately create one. Typing only
 * filters; it never becomes the stored value. That is the whole point: a name
 * or occasion enters the system once, as a decision, instead of being retyped
 * slightly differently every month.
 */
export function CatalogPicker({
	label,
	options,
	value,
	onChange,
	onCreate,
	placeholder = "Suchen oder neu anlegen",
	emptyHint = "Nichts gefunden",
	disabled = false,
	id,
}: {
	label: string;
	options: CatalogOption[];
	value: string | null;
	onChange: (id: string) => void;
	/** Omitted where creating from this screen is not allowed. */
	onCreate?: (label: string) => Promise<string | null>;
	placeholder?: string;
	emptyHint?: string;
	disabled?: boolean;
	id?: string;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const selected = options.find((option) => option.id === value) ?? null;
	const treffer = useMemo(() => {
		const q = normalize(query);
		const usable = options.filter((option) => option.aktiv !== false);
		if (!q) return usable.slice(0, 8);
		return usable
			.filter((option) => normalize(option.label).includes(q))
			.slice(0, 8);
	}, [options, query]);
	// Anlegen nur, wenn die Eingabe wirklich neu ist.
	const exact = options.some(
		(option) => normalize(option.label) === normalize(query),
	);
	const canCreate = Boolean(onCreate) && query.trim().length > 0 && !exact;

	async function create() {
		if (!onCreate) return;
		setCreating(true);
		try {
			const id = await onCreate(query.trim());
			if (id) {
				onChange(id);
				setQuery("");
			}
		} finally {
			setCreating(false);
		}
	}

	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			{selected ? (
				<div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
					<span className="flex items-center gap-2 font-medium">
						<Check className="h-4 w-4 text-success" />
						{selected.label}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={disabled}
						onClick={() => onChange("")}
					>
						Ändern
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{/* SearchInput besitzt seine Lupe und die noetige Polsterung selbst.
					    Eine handgebaute Lupe mit pl-8 laeuft ab 640px unter den Text,
					    weil sm:px-2.5 die Kaskade gewinnt. */}
					<SearchInput
						id={id}
						value={query}
						disabled={disabled}
						placeholder={placeholder}
						onFocus={() => setOpen(true)}
						onChange={(event) => setQuery(event.target.value)}
					/>
					{/* Anlegen steht als letzte Zeile in der Liste, nicht als Knopf
					    darunter: so ist am selben Ort sichtbar, dass das Feld sowohl
					    auswaehlt als auch anlegt. Zwei dauerhaft offene Listen im
					    Formular waeren dagegen eine Wand, deshalb erst bei Fokus. */}
					<div
						className="max-h-52 overflow-y-auto rounded-lg border"
						hidden={!open && query.trim().length === 0}
					>
						{treffer.map((option) => (
							<button
								key={option.id}
								type="button"
								disabled={disabled}
								className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
								onClick={() => {
									onChange(option.id);
									setQuery("");
									setOpen(false);
								}}
							>
								{option.label}
							</button>
						))}
						{canCreate ? (
							<button
								type="button"
								disabled={disabled || creating}
								className="flex w-full items-center gap-2 border-t bg-muted/30 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted/60 disabled:opacity-60"
								onClick={() => void create()}
							>
								{creating ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Plus className="h-3.5 w-3.5" />
								)}
								<span className="min-w-0 truncate">
									„{query.trim()}“ neu anlegen
								</span>
							</button>
						) : null}
						{treffer.length === 0 && !canCreate ? (
							<p className="p-3 text-center text-xs text-muted-foreground">
								{emptyHint}
							</p>
						) : null}
					</div>
				</div>
			)}
		</div>
	);
}
