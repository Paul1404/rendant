import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { TimeRange } from "@/lib/dashboard-stats";
import { cn } from "@/lib/utils";

const RANGES: { value: TimeRange; label: string }[] = [
	{ value: "all", label: "Alle" },
	{ value: "year", label: "Dieses Jahr" },
	{ value: "30d", label: "30 Tage" },
	{ value: "month", label: "Dieser Monat" },
];

type Props = {
	initialQuery: string;
	initialRange: TimeRange;
	includeStorniert: boolean;
};

export function DashboardToolbar({
	initialQuery,
	initialRange,
	includeStorniert,
}: Props) {
	const navigate = useNavigate({ from: "/protokolle/" });
	const [query, setQuery] = useState(initialQuery);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Reset the local search text when the URL value changes (e.g. after a
	// reset). Adjust during render rather than in an effect.
	const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);
	if (initialQuery !== prevInitialQuery) {
		setPrevInitialQuery(initialQuery);
		setQuery(initialQuery);
	}

	function pushParams(next: {
		q?: string;
		range?: TimeRange;
		storno?: boolean;
	}) {
		navigate({
			replace: true,
			resetScroll: false,
			search: (prev) => {
				const updated = { ...prev } as {
					q?: string;
					range?: TimeRange;
					storno?: boolean;
				};
				if (next.q !== undefined) {
					updated.q = next.q.trim() ? next.q.trim() : undefined;
				}
				if (next.range !== undefined) {
					updated.range = next.range === "all" ? undefined : next.range;
				}
				if (next.storno !== undefined) {
					updated.storno = next.storno ? true : undefined;
				}
				return updated;
			},
		});
	}

	const onQueryChange = (value: string) => {
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => pushParams({ q: value }), 220);
	};

	const clearQuery = () => {
		setQuery("");
		if (debounceRef.current) clearTimeout(debounceRef.current);
		pushParams({ q: "" });
	};

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
			<div className="relative w-full sm:max-w-xs">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="Suchen: Belegnr., Anlass, Person..."
					className="h-9 pl-8 pr-8 text-sm"
					aria-label="Protokolle durchsuchen"
				/>
				{query ? (
					<button
						type="button"
						onClick={clearQuery}
						aria-label="Suche löschen"
						className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div
					// biome-ignore lint/a11y/useSemanticElements: segmented control pattern
					role="tablist"
					aria-label="Zeitraum"
					className="inline-flex items-center rounded-lg border border-border bg-background/60 p-0.5 shadow-sm"
				>
					{RANGES.map((r) => {
						const active = initialRange === r.value;
						return (
							<button
								key={r.value}
								type="button"
								role="tab"
								aria-selected={active}
								onClick={() => pushParams({ range: r.value })}
								className={cn(
									"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
									active
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{r.label}
							</button>
						);
					})}
				</div>

				<label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:text-foreground">
					<input
						type="checkbox"
						checked={includeStorniert}
						onChange={(e) => pushParams({ storno: e.target.checked })}
						className="h-3.5 w-3.5 cursor-pointer accent-primary"
					/>
					Stornierte anzeigen
				</label>
			</div>
		</div>
	);
}
