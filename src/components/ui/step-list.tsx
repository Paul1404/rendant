import { Check } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export type Step = {
	label: string;
	description?: string;
};

// One step language for the whole app. Pass `active` for a live stepper that
// tracks progress; leave it out for a static "how this works" list. Both render
// the same numbered boxes, so two imports on one page no longer look like two
// different products.
export function StepList({
	steps,
	active,
	className,
}: {
	steps: readonly Step[];
	active?: number;
	className?: string;
}) {
	return (
		<ol
			className={cn(
				"grid gap-2 sm:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]",
				className,
			)}
			style={{ "--step-count": steps.length } as React.CSSProperties}
		>
			{steps.map((step, index) => {
				const number = index + 1;
				const state =
					active === undefined
						? "static"
						: number === active
							? "current"
							: number < active
								? "done"
								: "upcoming";

				return (
					<li
						key={step.label}
						aria-current={state === "current" ? "step" : undefined}
						className={cn(
							"flex gap-2 rounded-xl border px-3 py-2 text-sm",
							state === "current" &&
								"border-primary bg-primary/5 font-medium text-foreground",
							state === "done" && "border-success/35 text-success",
							state === "upcoming" && "border-border/60 text-muted-foreground",
							state === "static" && "border-border/60 bg-muted/20",
						)}
					>
						<span
							className={cn(
								"mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
								state === "done" && "border-success/40",
							)}
						>
							{state === "done" ? <Check className="h-3 w-3" /> : number}
						</span>
						<span className="min-w-0">
							<span
								className={cn(
									"block leading-snug",
									state === "static" && "font-medium",
								)}
							>
								{step.label}
							</span>
							{step.description ? (
								<span className="mt-1 block text-xs text-muted-foreground">
									{step.description}
								</span>
							) : null}
						</span>
					</li>
				);
			})}
		</ol>
	);
}
