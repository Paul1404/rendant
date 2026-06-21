import { cn } from "@/lib/utils";

// A label/value row for key/value lists and running summaries. Label is quiet,
// value leads. `emphasis` promotes a total; `divider` adds a hairline above.
export function DataRow({
	label,
	children,
	emphasis,
	divider,
	className,
}: {
	label: React.ReactNode;
	children: React.ReactNode;
	emphasis?: boolean;
	divider?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-4 py-1.5",
				divider && "mt-1.5 border-border/60 border-t pt-3",
				className,
			)}
		>
			<span
				className={cn(
					"text-sm",
					emphasis ? "font-medium text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"text-right text-sm text-foreground",
					emphasis && "font-semibold",
				)}
			>
				{children}
			</span>
		</div>
	);
}

// A stacked label-over-value cell for read-only detail grids (Kopfdaten).
export function DataField({
	label,
	value,
	mono,
	className,
}: {
	label: string;
	value: React.ReactNode;
	mono?: boolean;
	className?: string;
}) {
	return (
		<div className={className}>
			<p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
				{label}
			</p>
			<p
				className={cn(
					"mt-1 whitespace-pre-wrap text-sm text-foreground",
					mono && "font-mono",
				)}
			>
				{value}
			</p>
		</div>
	);
}
