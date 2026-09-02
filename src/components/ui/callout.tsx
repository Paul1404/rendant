import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

// One callout for every "read this before you continue" box. The tone picks the
// semantic token, so a warning looks the same wherever it appears and stays
// legible in both themes. Anything that needs a coloured box should come
// through here rather than reaching for a raw palette colour.
const tones = {
	warning: {
		icon: TriangleAlert,
		box: "border-warning/35 bg-warning/10",
		mark: "text-warning",
		title: "text-warning",
		body: "text-foreground/80",
	},
	danger: {
		icon: TriangleAlert,
		box: "border-destructive/40 bg-destructive/5",
		mark: "text-destructive",
		title: "text-destructive",
		body: "text-destructive/90",
	},
	success: {
		icon: CircleCheck,
		box: "border-success/35 bg-success/10",
		mark: "text-success",
		title: "text-success",
		body: "text-foreground/80",
	},
	info: {
		icon: Info,
		box: "border-border bg-muted/50",
		mark: "text-muted-foreground",
		title: "text-foreground",
		body: "text-muted-foreground",
	},
} as const;

export type CalloutTone = keyof typeof tones;

export function Callout({
	tone = "info",
	title,
	icon: iconOverride,
	children,
	className,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	tone?: CalloutTone;
	title?: React.ReactNode;
	icon?: React.ComponentType<{ className?: string }>;
}) {
	const spec = tones[tone];
	const Icon = iconOverride ?? spec.icon;

	return (
		<div
			data-slot="callout"
			data-tone={tone}
			className={cn(
				"flex gap-3 rounded-xl border p-4 text-sm",
				spec.box,
				className,
			)}
			{...props}
		>
			<Icon className={cn("mt-0.5 h-4 w-4 shrink-0", spec.mark)} />
			<div className="min-w-0 space-y-1">
				{title ? (
					<p className={cn("font-medium", spec.title)}>{title}</p>
				) : null}
				{children ? <div className={spec.body}>{children}</div> : null}
			</div>
		</div>
	);
}

// The bullet list used inside a warning callout, so the marker colour tracks
// the tone instead of being hand-set at each call site.
export function CalloutList({
	items,
	className,
}: {
	items: { id: string; message: string }[];
	className?: string;
}) {
	return (
		<ul className={cn("space-y-1", className)}>
			{items.map((item) => (
				<li key={item.id} className="flex gap-2">
					<span
						aria-hidden
						className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-current opacity-60"
					/>
					<span>{item.message}</span>
				</li>
			))}
		</ul>
	);
}
