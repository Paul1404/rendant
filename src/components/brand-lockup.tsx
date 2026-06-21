import { cn } from "@/lib/utils";

// The SVUFO app mark (the tally squircle) is a static asset and always the
// product's own identity, independent of the configurable club logo.
const SVUFO_MARK = "/logo.svg";

type Props = {
	vereinsname: string;
	logoUrl: string;
	variant?: "bar" | "hero";
	className?: string;
};

// Co-brand lockup: "SVUFO × <club>". The club side only appears when a custom
// club logo is configured (otherwise logoUrl falls back to the SVUFO mark).
export function BrandLockup({
	vereinsname,
	logoUrl,
	variant = "bar",
	className,
}: Props) {
	const hasClub = !!logoUrl && logoUrl !== SVUFO_MARK;

	if (variant === "hero") {
		return (
			<div
				role="img"
				className={cn("flex items-center justify-center gap-4", className)}
				aria-label={hasClub ? `SVUFO und ${vereinsname}` : "SVUFO"}
			>
				<span className="inline-flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[1.3rem] shadow-lg shadow-primary/25 ring-1 ring-foreground/10">
					<img
						src={SVUFO_MARK}
						alt="SVUFO"
						width={144}
						height={144}
						className="h-full w-full object-cover"
					/>
				</span>
				{hasClub ? (
					<>
						<Cross hero />
						<span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-[1.3rem] bg-white p-2.5 shadow-lg shadow-foreground/10 ring-1 ring-foreground/10">
							<img
								src={logoUrl}
								alt=""
								className="h-full w-auto object-contain"
							/>
						</span>
					</>
				) : null}
			</div>
		);
	}

	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] shadow-sm ring-1 ring-foreground/10">
				<img
					src={SVUFO_MARK}
					alt="SVUFO"
					width={72}
					height={72}
					className="h-full w-full object-cover"
				/>
			</span>
			<span className="hidden flex-col leading-tight sm:flex">
				<span className="text-sm font-semibold tracking-tight text-foreground">
					SVUFO
				</span>
				<span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
					Kassenzählprotokoll
				</span>
			</span>
			{hasClub ? (
				<>
					<Cross />
					<span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white p-1 ring-1 ring-foreground/10">
						<img
							src={logoUrl}
							alt=""
							className="h-full w-auto object-contain"
						/>
					</span>
					<span className="hidden max-w-[12rem] truncate text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground lg:block">
						{vereinsname}
					</span>
				</>
			) : null}
		</div>
	);
}

function Cross({ hero }: { hero?: boolean }) {
	return (
		<span
			aria-hidden
			className={cn(
				"select-none font-light text-muted-foreground/50",
				hero ? "text-2xl" : "text-base",
			)}
		>
			&times;
		</span>
	);
}
