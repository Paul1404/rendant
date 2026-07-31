import { cn } from "@/lib/utils";

type Props = {
	variant?: "bar" | "hero";
	onDark?: boolean;
	className?: string;
};

function RegisterMark({ compact = false }: { compact?: boolean }) {
	return (
		<svg
			viewBox="0 0 96 96"
			fill="none"
			aria-hidden="true"
			focusable="false"
			className="h-full w-full"
		>
			<g
				stroke="currentColor"
				strokeWidth={compact ? 11 : 8}
				strokeLinecap="butt"
				strokeLinejoin="miter"
			>
				<path d="M32 22V70" />
				<path d="M32 22H53C65 22 65 44 53 44H32" />
				<path d="M50 44L67 70" />
			</g>
			{compact ? null : (
				<path d="M22 80H74" stroke="currentColor" strokeWidth="4" />
			)}
		</svg>
	);
}

export function BrandLockup({
	variant = "bar",
	onDark = false,
	className,
}: Props) {
	const markColor = onDark ? "text-nav-accent" : "text-brass";

	if (variant === "hero") {
		return (
			<span
				className={cn(
					"inline-flex h-[72px] w-[72px] items-center justify-center",
					markColor,
					className,
				)}
			>
				<RegisterMark />
			</span>
		);
	}

	return (
		<div className={cn("flex items-center gap-3 text-foreground", className)}>
			<span
				className={cn(
					"inline-flex h-9 w-9 shrink-0 items-center justify-center",
					markColor,
				)}
			>
				<RegisterMark />
			</span>
			<span className="hidden flex-col leading-tight sm:flex">
				<span className="wordmark text-base text-current">Rendant</span>
				<span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-current/70">
					Finanzverwaltung
				</span>
			</span>
		</div>
	);
}
