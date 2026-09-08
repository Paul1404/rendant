import {
	ArrowDownRight,
	ArrowUpRight,
	CalendarDays,
	Minus,
	Sigma,
	Trophy,
} from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { FieldLabel } from "@/components/ui/section";
import { toComparisonEntries } from "@/lib/anlass-comparison";
import { formatDateDe, todayIsoDate } from "@/lib/date";
import { formatCent, formatCentCompact } from "@/lib/money";
import type { ProtokollRow } from "@/lib/protokoll-types";
import {
	buildRevenueHighlights,
	type RevenueHighlights as RevenueHighlightsData,
} from "@/lib/revenue-highlights";
import { cn } from "@/lib/utils";

type HistoricalLike = Parameters<typeof toComparisonEntries>[0][number];

/**
 * The all-time figure the club asks for first, plus the records that make the
 * number readable: which year, which day, how much a normal event brings in,
 * and where the running year stands against the same point last year.
 */
export function RevenueHighlights({
	historical,
	protocols,
}: {
	historical: HistoricalLike[];
	protocols: ProtokollRow[];
}) {
	const highlights = useMemo(
		() =>
			buildRevenueHighlights(
				toComparisonEntries(historical, protocols),
				todayIsoDate(),
			),
		[historical, protocols],
	);

	if (highlights.entryCount === 0) return null;

	const firstYear = highlights.firstDate?.slice(0, 4);
	const lastYear = highlights.lastDate?.slice(0, 4);
	const span =
		firstYear && lastYear && firstYear !== lastYear
			? `${firstYear} bis ${lastYear}`
			: (firstYear ?? "");

	return (
		<section className="space-y-3" aria-labelledby="revenue-highlights-heading">
			<h2 id="revenue-highlights-heading" className="sr-only">
				Gesamtbild
			</h2>
			<Card variant="hero" className="gap-0 py-5">
				<CardContent className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-end">
					<div>
						<FieldLabel className="text-primary/80">
							Gesamtumsatz {span}
						</FieldLabel>
						<Money
							cent={highlights.totalCent}
							tone="primary"
							emphasis
							className="mt-2 block text-[clamp(1.6rem,7vw,2.6rem)] leading-none tracking-tight"
						/>
						<p className="mt-3 text-sm text-muted-foreground">
							{highlights.dateCount}{" "}
							{highlights.dateCount === 1 ? "Termin" : "Termine"} aus{" "}
							{highlights.years.filter((year) => year.revenueCent > 0).length}{" "}
							Jahren, {highlights.entryCount}{" "}
							{highlights.entryCount === 1 ? "Eintrag" : "Einträge"} insgesamt.
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Davon {formatCent(highlights.protocolCent)} aus
							Kassenzählprotokollen und {formatCent(highlights.historicalCent)}{" "}
							aus Altunterlagen.
						</p>
					</div>
					<YearStrip highlights={highlights} />
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<HighlightTile
					icon={Trophy}
					label="Bestes Jahr"
					value={
						highlights.bestYear ? (
							<Money cent={highlights.bestYear.revenueCent} emphasis />
						) : (
							"Noch keine Daten"
						)
					}
					hint={
						highlights.bestYear
							? `${highlights.bestYear.year} mit ${highlights.bestYear.dateCount} ${
									highlights.bestYear.dateCount === 1 ? "Termin" : "Terminen"
								}`
							: undefined
					}
				/>
				<HighlightTile
					icon={CalendarDays}
					label="Stärkster Termin"
					value={
						highlights.bestDay ? (
							<Money cent={highlights.bestDay.revenueCent} emphasis />
						) : (
							"Noch keine Daten"
						)
					}
					hint={
						highlights.bestDay
							? `${formatDateDe(highlights.bestDay.date)}${
									highlights.bestDay.label
										? `, ${highlights.bestDay.label}`
										: ""
								}`
							: undefined
					}
				/>
				<HighlightTile
					icon={Sigma}
					label="Schnitt je Termin"
					value={<Money cent={highlights.averagePerDateCent} emphasis />}
					hint={`Über alle ${highlights.dateCount} Termine gerechnet`}
				/>
				{highlights.yearToDate ? (
					<HighlightTile
						icon={CalendarDays}
						label={`${highlights.yearToDate.year} bis heute`}
						value={<Money cent={highlights.yearToDate.revenueCent} emphasis />}
						hint={<YearToDateHint yearToDate={highlights.yearToDate} />}
					/>
				) : null}
			</div>
		</section>
	);
}

/**
 * Every year between the first and the last entry gets its own column, gap
 * years included: a year without turnover is part of the story, and dropping it
 * would put two distant years side by side as if nothing lay between them.
 */
function YearStrip({ highlights }: { highlights: RevenueHighlightsData }) {
	const max = Math.max(1, ...highlights.years.map((year) => year.revenueCent));
	// Past a handful of columns the figures above the bars collide, so from
	// there on only the record year keeps its label and the rest answer on hover.
	const dense = highlights.years.length > 8;
	return (
		<div>
			<FieldLabel className="text-primary/80">Umsatz je Jahr</FieldLabel>
			<div className="mt-3 overflow-x-auto">
				<ul className="flex min-w-full items-end gap-1.5" aria-hidden>
					{highlights.years.map((year) => {
						const best = highlights.bestYear?.year === year.year;
						const height = (year.revenueCent / max) * 100;
						return (
							<li
								key={year.year}
								className="flex min-w-[1.6rem] flex-1 flex-col items-center gap-1.5"
								title={`${year.year}: ${formatCent(year.revenueCent)}`}
							>
								<span
									className={cn(
										"text-[10px] tabular-nums",
										best
											? "font-semibold text-primary"
											: "text-muted-foreground",
									)}
								>
									{year.revenueCent > 0 && (best || !dense)
										? formatCentCompact(year.revenueCent)
										: ""}
								</span>
								<span className="flex h-20 w-full items-end">
									<span
										className={cn(
											"w-full rounded-t-sm",
											best ? "bg-primary" : "bg-primary/30",
										)}
										style={{
											height: `${Math.max(year.revenueCent > 0 ? 4 : 1.5, height)}%`,
										}}
									/>
								</span>
								<span
									className={cn(
										"text-[11px] tabular-nums",
										best
											? "font-semibold text-primary"
											: "text-muted-foreground",
									)}
								>
									{String(year.year).slice(2)}
								</span>
							</li>
						);
					})}
				</ul>
			</div>
			<ul className="sr-only">
				{highlights.years.map((year) => (
					<li key={year.year}>
						{year.year}: {formatCent(year.revenueCent)}
					</li>
				))}
			</ul>
		</div>
	);
}

function YearToDateHint({
	yearToDate,
}: {
	yearToDate: NonNullable<RevenueHighlightsData["yearToDate"]>;
}) {
	if (yearToDate.deltaPct === null) {
		return <>Kein Vergleichswert aus {yearToDate.previousYear}</>;
	}
	const up = yearToDate.deltaPct > 0.5;
	const down = yearToDate.deltaPct < -0.5;
	const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1",
				up && "text-success",
				down && "text-destructive",
			)}
		>
			<Icon className="h-3.5 w-3.5" />
			{yearToDate.deltaPct.toLocaleString("de-DE", {
				maximumFractionDigits: 1,
				signDisplay: "exceptZero",
			})}{" "}
			% gegen {yearToDate.previousYear} zum selben Stichtag
		</span>
	);
}

function HighlightTile({
	icon: Icon,
	label,
	value,
	hint,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: React.ReactNode;
	hint?: React.ReactNode;
}) {
	return (
		<Card className="lift gap-0 py-4">
			<CardContent>
				<div className="flex items-center justify-between gap-2">
					<FieldLabel className="leading-snug">{label}</FieldLabel>
					<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary/80">
						<Icon className="h-3.5 w-3.5" />
					</span>
				</div>
				<span className="mt-2 block text-[clamp(0.95rem,3.6vw,1.35rem)] tracking-tight sm:text-[1.35rem]">
					{value}
				</span>
				{hint ? (
					<p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
				) : null}
			</CardContent>
		</Card>
	);
}
