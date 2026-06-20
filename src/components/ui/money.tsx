import { formatCent } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tone = "default" | "muted" | "positive" | "negative" | "primary";

const TONE: Record<Tone, string> = {
	default: "text-foreground",
	muted: "text-muted-foreground",
	positive: "text-success",
	negative: "text-destructive",
	primary: "text-primary",
};

// Consistent monetary display: tabular figures, non-breaking, tone by meaning.
// Pass `tone="auto"` semantics yourself via the caller; negative amounts are not
// auto-colored so the caller controls emphasis.
export function Money({
	cent,
	tone = "default",
	emphasis,
	className,
}: {
	cent: number;
	tone?: Tone;
	emphasis?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"font-mono tabular-nums whitespace-nowrap",
				emphasis && "font-semibold",
				TONE[tone],
				className,
			)}
		>
			{formatCent(cent)}
		</span>
	);
}
