import type { JSX } from "react";
import { formatCent, formatCentCompact } from "@/lib/money";

type RevenuePoint = {
	label: string;
	longLabel: string;
	total: number;
	count: number;
	isCurrent: boolean;
};

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 100;
const GRID_LINES = 4;

export function RevenueAreaChart({
	points,
}: {
	points: RevenuePoint[];
}): JSX.Element {
	const max = Math.max(0, ...points.map((p) => p.total));
	const safeMax = max > 0 ? max : 1;

	// X position as a fraction (0..1) across the plot width.
	const xFrac = (index: number) => {
		if (points.length <= 1) {
			return 0.5;
		}
		return index / (points.length - 1);
	};
	// Y in unitless viewBox space (0 = top, VIEW_HEIGHT = baseline).
	const yFor = (value: number) => VIEW_HEIGHT - (VIEW_HEIGHT * value) / safeMax;

	const linePath = points
		.map(
			(p, i) =>
				`${i === 0 ? "M" : "L"} ${(xFrac(i) * VIEW_WIDTH).toFixed(2)} ${yFor(p.total).toFixed(2)}`,
		)
		.join(" ");

	const areaPath =
		points.length > 0
			? `${linePath} L ${(xFrac(points.length - 1) * VIEW_WIDTH).toFixed(2)} ${VIEW_HEIGHT} L ${(xFrac(0) * VIEW_WIDTH).toFixed(2)} ${VIEW_HEIGHT} Z`
			: "";

	// Tick values from top (safeMax) down to a value above the baseline.
	const ticks = Array.from({ length: GRID_LINES }, (_, i) => {
		const value = (safeMax * (GRID_LINES - i)) / GRID_LINES;
		return { value, frac: 1 - value / safeMax };
	});

	return (
		<div className="w-full">
			<div className="relative h-48 w-full pt-2 pb-7 pl-14 pr-2">
				{/* Plot area: paths stretch to fill; overlays positioned by %. */}
				<div className="relative h-full w-full">
					{/* Y-axis tick labels (HTML, crisp). */}
					{ticks.map((tick) => (
						<span
							key={`y-${tick.value}`}
							className="absolute right-full top-0 -translate-y-1/2 pr-2 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap"
							style={{ top: `${(tick.frac * 100).toFixed(3)}%` }}
						>
							{formatCentCompact(tick.value)}
						</span>
					))}

					{/* Gridlines + area + line (stretched SVG). */}
					<svg
						viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
						preserveAspectRatio="none"
						className="absolute inset-0 h-full w-full overflow-visible"
						aria-hidden="true"
					>
						<defs>
							<linearGradient
								id="revenue-area-fill"
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop
									offset="0%"
									stopColor="var(--primary)"
									stopOpacity="0.3"
								/>
								<stop
									offset="100%"
									stopColor="var(--primary)"
									stopOpacity="0"
								/>
							</linearGradient>
						</defs>

						{ticks.map((tick) => (
							<line
								key={`grid-${tick.value}`}
								x1={0}
								y1={tick.frac * VIEW_HEIGHT}
								x2={VIEW_WIDTH}
								y2={tick.frac * VIEW_HEIGHT}
								className="stroke-border"
								strokeWidth={1}
								strokeDasharray="3 4"
								vectorEffect="non-scaling-stroke"
							/>
						))}

						{areaPath && <path d={areaPath} fill="url(#revenue-area-fill)" />}
						{linePath && (
							<path
								d={linePath}
								fill="none"
								className="stroke-primary"
								strokeWidth={2}
								strokeLinejoin="round"
								strokeLinecap="round"
								vectorEffect="non-scaling-stroke"
							/>
						)}
					</svg>

					{/* Data points + hover tooltips (HTML, perfectly round). */}
					{points.map((p, i) => {
						const left = xFrac(i) * 100;
						const top = (yFor(p.total) / VIEW_HEIGHT) * 100;
						return (
							<div
								key={`pt-${p.label}`}
								className="group absolute top-0 bottom-0 -translate-x-1/2"
								style={{
									left: `${left.toFixed(3)}%`,
									width: `${(100 / Math.max(points.length, 1)).toFixed(3)}%`,
								}}
							>
								{/* Dot, centered on its column. */}
								<div
									className={
										p.isCurrent
											? "absolute left-1/2 size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
											: "absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary opacity-80"
									}
									style={{ top: `${top.toFixed(3)}%` }}
								/>
								{/* Tooltip. */}
								<div
									className="pointer-events-none absolute left-1/2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-center opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
									style={{
										top: `calc(${top.toFixed(3)}% - 10px)`,
									}}
								>
									<div className="text-[11px] font-medium text-foreground">
										{p.longLabel}
									</div>
									<div className="text-[11px] text-foreground">
										{formatCent(p.total)}
									</div>
									<div className="text-[10px] text-muted-foreground">
										{`${p.count} ${p.count === 1 ? "Beleg" : "Belege"}`}
									</div>
								</div>
							</div>
						);
					})}
				</div>

				{/* X-axis month labels (HTML, aligned to data points). */}
				<div className="absolute right-2 bottom-1 left-14 h-4">
					{points.map((p, i) => (
						<span
							key={`x-${p.label}`}
							className={
								p.isCurrent
									? "absolute -translate-x-1/2 text-[11px] font-semibold text-foreground whitespace-nowrap"
									: "absolute -translate-x-1/2 text-[11px] text-muted-foreground whitespace-nowrap"
							}
							style={{ left: `${(xFrac(i) * 100).toFixed(3)}%` }}
						>
							{p.label}
						</span>
					))}
				</div>
			</div>

			<ul className="sr-only">
				{points.map((p) => (
					<li key={`sr-${p.label}`}>
						{`${p.longLabel}: ${formatCent(p.total)} (${p.count} ${p.count === 1 ? "Beleg" : "Belege"})`}
					</li>
				))}
			</ul>
		</div>
	);
}
