import type { JSX } from "react";
import { formatCent } from "@/lib/money";

type BarListItem = {
	label: string;
	value: number;
	sub?: string;
};

export function BarList({
	items,
	formatValue,
}: {
	items: BarListItem[];
	formatValue?: (n: number) => string;
}): JSX.Element {
	if (items.length === 0) {
		return <p className="text-sm text-muted-foreground">Keine Daten</p>;
	}

	const format = formatValue ?? formatCent;
	const max = Math.max(1, ...items.map((item) => Math.max(0, item.value)));

	return (
		<ul className="space-y-3">
			{items.map((item) => {
				const width = (Math.max(0, item.value) / max) * 100;
				return (
					<li key={item.label} className="flex flex-col gap-1">
						<div className="flex items-baseline justify-between gap-3 text-sm">
							<span className="truncate text-foreground">{item.label}</span>
							<span className="shrink-0 text-foreground tabular-nums">
								{format(item.value)}
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${width}%` }}
							/>
						</div>
						{item.sub ? (
							<span className="text-xs text-muted-foreground">{item.sub}</span>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
