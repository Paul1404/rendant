import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A section header inside a page (between the PageHeader and the cards).
// Quiet by default; an optional icon ties it to its content, actions sit at the
// trailing edge.
export function SectionHeading({
	icon: Icon,
	title,
	description,
	actions,
	className,
}: {
	icon?: LucideIcon;
	title: string;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-end justify-between gap-4", className)}>
			<div>
				{/* 18px/600 is the scale every other route already uses for a
				    section heading; the page title above stays 28px/400. */}
				<h2 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight text-foreground">
					{Icon ? <Icon className="h-4.5 w-4.5 text-primary" /> : null}
					{title}
				</h2>
				{description ? (
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}

// Small uppercase label that introduces a group inside a card.
export function FieldLabel({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
				className,
			)}
		>
			{children}
		</p>
	);
}
