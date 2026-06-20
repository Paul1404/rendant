import { cn } from "@/lib/utils";

type PageHeaderProps = {
	eyebrow?: string;
	title: string;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
};

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<div
			className={cn(
				"reveal relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 px-5 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_18px_-8px_rgba(0,0,0,0.06)] ring-1 ring-foreground/[0.03] sm:px-7 sm:py-7",
				className,
			)}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-3xl"
			/>
			<div className="relative flex flex-wrap items-end justify-between gap-4">
				<div className="max-w-2xl">
					{eyebrow ? (
						<p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/90">
							{eyebrow}
						</p>
					) : null}
					<h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
						{title}
					</h1>
					{description ? (
						<div className="mt-2 text-sm text-muted-foreground">
							{description}
						</div>
					) : null}
				</div>
				{actions ? (
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				) : null}
			</div>
		</div>
	);
}
