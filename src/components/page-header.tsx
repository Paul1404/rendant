import { cn } from "@/lib/utils";

type PageHeaderProps = {
	eyebrow?: string;
	title: string;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
};

// A page header is chrome, not content: plain type on the page background so the
// content cards below carry the visual weight. Strong title, quiet supporting
// text, actions pulled to the trailing edge.
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
				"reveal flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
				className,
			)}
		>
			<div className="max-w-2xl">
				{eyebrow ? (
					<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
						{eyebrow}
					</p>
				) : null}
				<h1 className="mt-1.5 text-2xl font-normal tracking-tight text-foreground sm:text-[1.75rem]">
					{title}
				</h1>
				{description ? (
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
