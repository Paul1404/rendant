import { type JSX, useLayoutEffect, useRef, useState } from "react";
import type { DateWindow } from "@/lib/dashboard-stats";
import { formatCent, formatCentCompact } from "@/lib/money";

type RevenuePoint = {
	key: string;
	label: string;
	longLabel: string;
	from: string;
	to: string;
	total: number;
	count: number;
	isCurrent: boolean;
};

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 100;
const GRID_LINES = 4;
// Minimum gap between two neighbouring axis labels, in pixels.
const LABEL_GAP_PX = 3;

type MeasuredLabel = { index: number; x: number; width: number };

// Labels that have to be hidden because they would touch their neighbour.
// Each label is centred on its bucket. Walking from the last bucket backwards
// keeps the current period labelled and drops only what actually collides.
export function hiddenAxisLabels(
	labels: MeasuredLabel[],
	gap = LABEL_GAP_PX,
): Set<number> {
	const hidden = new Set<number>();
	let previousLeft: number | null = null;
	for (let i = labels.length - 1; i >= 0; i--) {
		const label = labels[i];
		if (
			previousLeft !== null &&
			label.x + label.width / 2 + gap > previousLeft
		) {
			hidden.add(label.index);
			continue;
		}
		previousLeft = label.x - label.width / 2;
	}
	return hidden;
}

type Pt = { x: number; y: number };

// Fritsch–Carlson monotone cubic spline -> SVG cubic-bezier path. Produces a
// smooth, rounded line instead of spiky segments, while never overshooting the
// data, so the curve cannot dip below the baseline between a zero-revenue day
// and a peak.
function smoothLinePath(pts: Pt[]): string {
	const n = pts.length;
	if (n === 0) return "";
	const f = (v: number) => v.toFixed(2);
	if (n === 1) return `M ${f(pts[0].x)} ${f(pts[0].y)}`;

	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx[i] = pts[i + 1].x - pts[i].x;
		slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
	}

	const t: number[] = new Array(n);
	t[0] = slope[0];
	t[n - 1] = slope[n - 2];
	for (let i = 1; i < n - 1; i++) {
		if (slope[i - 1] * slope[i] <= 0) {
			t[i] = 0;
		} else {
			const w1 = 2 * dx[i] + dx[i - 1];
			const w2 = dx[i] + 2 * dx[i - 1];
			t[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
		}
	}

	let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
	for (let i = 0; i < n - 1; i++) {
		const c1x = pts[i].x + dx[i] / 3;
		const c1y = pts[i].y + (t[i] * dx[i]) / 3;
		const c2x = pts[i + 1].x - dx[i] / 3;
		const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
		d += ` C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(pts[i + 1].x)} ${f(pts[i + 1].y)}`;
	}
	return d;
}

export function RevenueAreaChart({
	points,
	selected,
	onSelect,
}: {
	points: RevenuePoint[];
	selected?: DateWindow;
	onSelect?: (window: DateWindow | undefined) => void;
}): JSX.Element {
	const max = Math.max(0, ...points.map((p) => p.total));
	const safeMax = max > 0 ? max : 1;
	// With many buckets (daily view) only mark days that actually have revenue,
	// plus the current day, to keep the line readable.
	const dense = points.length > 16;

	// X position as a fraction (0..1) across the plot width.
	const xFrac = (index: number) => {
		if (points.length <= 1) {
			return 0.5;
		}
		return index / (points.length - 1);
	};

	// Axis labels are measured after layout and the colliding ones are hidden,
	// so a narrow phone shows fewer of them instead of printing them on top of
	// each other. Before the first measurement every label is rendered, which
	// keeps the server-rendered markup complete.
	const axisRef = useRef<HTMLDivElement>(null);
	const labelRefs = useRef(new Map<number, HTMLSpanElement>());
	const [hiddenLabels, setHiddenLabels] = useState<Set<number>>(
		() => new Set(),
	);
	useLayoutEffect(() => {
		const axis = axisRef.current;
		if (!axis) return;
		const measure = () => {
			const width = axis.clientWidth;
			if (width <= 0) return;
			const measured = [...labelRefs.current.entries()]
				.sort(([a], [b]) => a - b)
				.map(([index, element]) => ({
					index,
					x: xFrac(index) * width,
					width: element.offsetWidth,
				}));
			const next = hiddenAxisLabels(measured);
			setHiddenLabels((current) =>
				current.size === next.size && [...next].every((i) => current.has(i))
					? current
					: next,
			);
		};
		measure();
		// Web fonts land after the first paint and change the label widths.
		document.fonts?.ready.then(measure).catch(() => {});
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(axis);
		return () => observer.disconnect();
	}, [points]);
	// Y in unitless viewBox space (0 = top, VIEW_HEIGHT = baseline).
	const yFor = (value: number) => VIEW_HEIGHT - (VIEW_HEIGHT * value) / safeMax;

	const coords: Pt[] = points.map((p, i) => ({
		x: xFrac(i) * VIEW_WIDTH,
		y: yFor(p.total),
	}));
	const linePath = smoothLinePath(coords);
	const areaPath =
		coords.length > 0
			? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${VIEW_HEIGHT} L ${coords[0].x.toFixed(2)} ${VIEW_HEIGHT} Z`
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
						const showDot = !dense || p.isCurrent || p.total > 0;
						const isSelected =
							selected?.von === p.from && selected.bis === p.to;
						// Anchor the tooltip to the nearest edge for points close to the
						// plot border so it can't clip against the card's overflow.
						const tipPos =
							left > 80
								? "right-0 translate-x-0"
								: left < 20
									? "left-0 translate-x-0"
									: "left-1/2 -translate-x-1/2";
						return (
							<button
								type="button"
								key={`pt-${p.key}`}
								disabled={!onSelect || p.count === 0}
								aria-label={`${p.longLabel}: ${formatCent(p.total)}, ${p.count} ${p.count === 1 ? "Eintrag" : "Einträge"}`}
								aria-pressed={isSelected}
								onClick={() =>
									onSelect?.(
										isSelected ? undefined : { von: p.from, bis: p.to },
									)
								}
								className={`group absolute top-0 bottom-0 -translate-x-1/2 rounded-sm outline-none transition-colors enabled:cursor-pointer enabled:hover:bg-primary/[0.04] focus-visible:ring-2 focus-visible:ring-primary/60 ${isSelected ? "bg-primary/[0.08]" : ""}`}
								style={{
									left: `${left.toFixed(3)}%`,
									width: `${(100 / Math.max(points.length, 1)).toFixed(3)}%`,
								}}
							>
								{/* Dot, centered on its column. */}
								{showDot ? (
									<span
										className={
											p.isCurrent
												? "absolute left-1/2 size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
												: "absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary opacity-80"
										}
										style={{ top: `${top.toFixed(3)}%` }}
									/>
								) : null}
								{/* Tooltip. */}
								<span
									className={`pointer-events-none absolute z-10 w-max ${tipPos} -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-center opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`}
									style={{
										top: `calc(${top.toFixed(3)}% - 10px)`,
									}}
								>
									<span className="block text-[11px] font-medium text-foreground">
										{p.longLabel}
									</span>
									<span className="block text-[11px] text-foreground">
										{formatCent(p.total)}
									</span>
									<span className="block text-[10px] text-muted-foreground">
										{`${p.count} ${p.count === 1 ? "Eintrag" : "Einträge"}`}
									</span>
								</span>
							</button>
						);
					})}
				</div>

				{/* X-axis labels (HTML, aligned to data points). */}
				<div ref={axisRef} className="absolute right-2 bottom-1 left-14 h-4">
					{points.map((p, i) => {
						if (!p.label) return null;
						// Hidden labels stay in the DOM so their width can be measured
						// again when the card is resized.
						return (
							<span
								key={`x-${p.key}`}
								ref={(element) => {
									if (element) labelRefs.current.set(i, element);
									else labelRefs.current.delete(i);
								}}
								aria-hidden={hiddenLabels.has(i) || undefined}
								className={`absolute -translate-x-1/2 text-[11px] whitespace-nowrap ${
									hiddenLabels.has(i) ? "invisible " : ""
								}${
									p.isCurrent
										? "font-semibold text-foreground"
										: "text-muted-foreground"
								}`}
								style={{ left: `${(xFrac(i) * 100).toFixed(3)}%` }}
							>
								{p.label}
							</span>
						);
					})}
				</div>
			</div>

			<ul className="sr-only">
				{points.map((p) => (
					<li key={`sr-${p.key}`}>
						{`${p.longLabel}: ${formatCent(p.total)} (${p.count} ${p.count === 1 ? "Eintrag" : "Einträge"})`}
					</li>
				))}
			</ul>
		</div>
	);
}
