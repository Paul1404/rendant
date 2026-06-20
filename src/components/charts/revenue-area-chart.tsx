import type { JSX } from "react";
import { formatCent, formatCentCompact } from "@/lib/money";

type RevenuePoint = {
	label: string;
	longLabel: string;
	total: number;
	count: number;
	isCurrent: boolean;
};

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 240;
const PADDING_LEFT = 56;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 32;
const PLOT_WIDTH = VIEW_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const GRID_LINES = 4;

export function RevenueAreaChart({
	points,
}: {
	points: RevenuePoint[];
}): JSX.Element {
	const max = Math.max(0, ...points.map((p) => p.total));
	const safeMax = max > 0 ? max : 1;

	const xFor = (index: number) => {
		if (points.length <= 1) {
			return PADDING_LEFT + PLOT_WIDTH / 2;
		}
		return PADDING_LEFT + (PLOT_WIDTH * index) / (points.length - 1);
	};
	const yFor = (value: number) =>
		PADDING_TOP + PLOT_HEIGHT - (PLOT_HEIGHT * value) / safeMax;

	const linePath = points
		.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.total)}`)
		.join(" ");

	const baseline = PADDING_TOP + PLOT_HEIGHT;
	const areaPath =
		points.length > 0
			? `${linePath} L ${xFor(points.length - 1)} ${baseline} L ${xFor(0)} ${baseline} Z`
			: "";

	const ticks = Array.from({ length: GRID_LINES }, (_, i) => {
		const value = (safeMax * (GRID_LINES - i)) / GRID_LINES;
		return { value, y: yFor(value) };
	});

	return (
		<div className="w-full">
			<div className="relative h-48 w-full">
				<svg
					viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
					preserveAspectRatio="xMidYMid meet"
					className="h-full w-full"
					role="img"
					aria-label="Umsatzverlauf"
				>
					<title>Umsatzverlauf</title>
					<defs>
						<linearGradient id="revenue-area-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
							<stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
						</linearGradient>
					</defs>

					{ticks.map((tick) => (
						<g key={tick.value}>
							<line
								x1={PADDING_LEFT}
								y1={tick.y}
								x2={VIEW_WIDTH - PADDING_RIGHT}
								y2={tick.y}
								className="stroke-border"
								strokeWidth={1}
								strokeDasharray="3 4"
								vectorEffect="non-scaling-stroke"
							/>
							<text
								x={PADDING_LEFT - 8}
								y={tick.y + 4}
								textAnchor="end"
								className="fill-muted-foreground text-[11px]"
							>
								{formatCentCompact(tick.value)}
							</text>
						</g>
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

					{points.map((p, i) => {
						const cx = xFor(i);
						const cy = yFor(p.total);
						return (
							<g key={p.label} className="group">
								<rect
									x={cx - PLOT_WIDTH / Math.max(points.length, 1) / 2}
									y={PADDING_TOP}
									width={PLOT_WIDTH / Math.max(points.length, 1)}
									height={PLOT_HEIGHT}
									fill="transparent"
								/>
								<circle
									cx={cx}
									cy={cy}
									r={p.isCurrent ? 5 : 3}
									className={
										p.isCurrent
											? "fill-primary stroke-background"
											: "fill-primary stroke-background opacity-80"
									}
									strokeWidth={2}
								/>
								<g
									className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100"
									transform={`translate(${Math.min(Math.max(cx, PADDING_LEFT + 70), VIEW_WIDTH - PADDING_RIGHT - 70)}, ${Math.max(cy - 16, PADDING_TOP + 40)})`}
								>
									<rect
										x={-70}
										y={-44}
										width={140}
										height={42}
										rx={6}
										className="fill-popover stroke-border"
										strokeWidth={1}
										vectorEffect="non-scaling-stroke"
									/>
									<text
										x={0}
										y={-29}
										textAnchor="middle"
										className="fill-foreground text-[11px] font-medium"
									>
										{p.longLabel}
									</text>
									<text
										x={0}
										y={-16}
										textAnchor="middle"
										className="fill-foreground text-[11px]"
									>
										{formatCent(p.total)}
									</text>
									<text
										x={0}
										y={-5}
										textAnchor="middle"
										className="fill-muted-foreground text-[10px]"
									>
										{`${p.count} ${p.count === 1 ? "Beleg" : "Belege"}`}
									</text>
								</g>
							</g>
						);
					})}

					{points.map((p, i) => (
						<text
							key={p.label}
							x={xFor(i)}
							y={VIEW_HEIGHT - 10}
							textAnchor="middle"
							className={
								p.isCurrent
									? "fill-foreground text-[11px] font-semibold"
									: "fill-muted-foreground text-[11px]"
							}
						>
							{p.label}
						</text>
					))}
				</svg>
			</div>

			<ul className="sr-only">
				{points.map((p) => (
					<li key={p.label}>
						{`${p.longLabel}: ${formatCent(p.total)} (${p.count} ${p.count === 1 ? "Beleg" : "Belege"})`}
					</li>
				))}
			</ul>
		</div>
	);
}
