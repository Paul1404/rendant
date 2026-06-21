import { cn } from "@/lib/utils";

// The SVUFO app mark (the tally coin) is a static asset and the product's whole
// visual identity. The club it runs for is shown elsewhere only as a quiet
// "läuft für ..." line, never as a competing logo.
const SVUFO_MARK = "/logo.svg";

type Props = {
	variant?: "bar" | "hero";
	className?: string;
};

export function BrandLockup({ variant = "bar", className }: Props) {
	if (variant === "hero") {
		return (
			<span
				className={cn(
					"inline-flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full shadow-lg shadow-primary/25 ring-1 ring-foreground/10",
					className,
				)}
			>
				<img
					src={SVUFO_MARK}
					alt="SVUFO"
					width={144}
					height={144}
					className="h-full w-full object-cover"
				/>
			</span>
		);
	}

	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-foreground/10">
				<img
					src={SVUFO_MARK}
					alt="SVUFO"
					width={72}
					height={72}
					className="h-full w-full object-cover"
				/>
			</span>
			<span className="hidden flex-col leading-tight sm:flex">
				<span className="wordmark text-sm text-foreground">SVUFO</span>
				<span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
					Kassenzählprotokoll
				</span>
			</span>
		</div>
	);
}
