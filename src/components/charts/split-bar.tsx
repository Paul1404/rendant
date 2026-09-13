import type { JSX } from "react";
import { formatCent, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

type SplitSegment = {
	label: string;
	value: number;
	tone: "primary" | "card" | "muted";
};

// Each segment needs its own colour from the chart palette. `bg-muted` used to
// be both a segment and the empty track, so that share was invisible.
const toneBar: Record<SplitSegment["tone"], string> = {
	primary: "bg-primary",
	card: "bg-chart-3",
	muted: "bg-chart-4",
};

export function SplitBar({
	segments,
}: {
	segments: SplitSegment[];
}): JSX.Element {
	const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

	return (
		<div className="w-full">
			<div className="flex h-3 w-full overflow-hidden rounded-full bg-border">
				{total > 0
					? segments.map((segment) => {
							const width = (Math.max(0, segment.value) / total) * 100;
							if (width <= 0) return null;
							return (
								<div
									key={segment.label}
									className={cn("h-full", toneBar[segment.tone])}
									style={{ width: `${width}%` }}
								/>
							);
						})
					: null}
			</div>

			{total > 0 ? (
				<ul className="mt-4 space-y-2">
					{segments.map((segment) => {
						const pct = (Math.max(0, segment.value) / total) * 100;
						return (
							<li
								key={segment.label}
								className="flex items-center gap-3 text-sm"
							>
								<span
									className={cn(
										"size-3 shrink-0 rounded-sm",
										toneBar[segment.tone],
									)}
									aria-hidden="true"
								/>
								<span className="flex-1 truncate text-foreground">
									{segment.label}
								</span>
								<span className="text-foreground tabular-nums">
									{formatCent(segment.value)}
								</span>
								<span className="w-14 text-right text-muted-foreground tabular-nums">
									{formatPercent(pct)}
								</span>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="mt-4 text-sm text-muted-foreground">Keine Daten</p>
			)}
		</div>
	);
}
