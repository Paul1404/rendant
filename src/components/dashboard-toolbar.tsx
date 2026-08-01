import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
	selectedYear?: number;
	availableYears: number[];
	includeStorniert: boolean;
};

export function DashboardToolbar({
	initialQuery,
	initialRange,
	selectedYear,
	availableYears,
	includeStorniert,
}: Props) {
	const navigate = useNavigate({ from: "/protokolle/" });
	const [query, setQuery] = useState(initialQuery);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear any pending debounced navigation when the toolbar unmounts.
	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

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
		jahr?: number | null;
		storno?: boolean;
	}) {
		navigate({
			replace: true,
			resetScroll: false,
			search: (prev) => {
				const updated = { ...prev } as {
					q?: string;
					range?: TimeRange;
					jahr?: number;
					storno?: boolean;
					von?: string;
					bis?: string;
					chart?: "day" | "week" | "month";
				};
				delete updated.von;
				delete updated.bis;
				delete updated.chart;
				if (next.q !== undefined) {
					updated.q = next.q.trim() ? next.q.trim() : undefined;
				}
				if (next.range !== undefined) {
					updated.range = next.range === "all" ? undefined : next.range;
				}
				if ("jahr" in next) {
					updated.jahr = next.jahr ?? undefined;
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
				<Input
					type="search"
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="Suchen: Belegnr., Veranstaltung, Person..."
					className="h-9 pr-8 text-sm"
					aria-label="Protokolle durchsuchen"
				/>
				{query ? (
					<button
						type="button"
						onClick={clearQuery}
						aria-label="Suche löschen"
						className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<fieldset className="inline-flex items-center rounded-lg border border-border/60 bg-background/60 p-0.5 shadow-sm">
					<legend className="sr-only">Zeitraum</legend>
					{RANGES.map((r) => {
						const active = initialRange === r.value;
						return (
							<button
								key={r.value}
								type="button"
								aria-pressed={active}
								onClick={() => pushParams({ range: r.value, jahr: null })}
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
				</fieldset>

				{availableYears.length > 0 ? (
					<select
						value={selectedYear ?? ""}
						onChange={(event) => {
							const value = event.target.value;
							pushParams({
								range: "all",
								jahr: value ? Number(value) : null,
							});
						}}
						aria-label="Kalenderjahr für die JHV-Auswertung"
						className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<option value="">JHV: alle Jahre</option>
						{availableYears.map((year) => (
							<option key={year} value={year}>
								JHV {year}
							</option>
						))}
					</select>
				) : null}

				<label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:text-foreground">
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
