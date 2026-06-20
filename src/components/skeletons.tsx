import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
	return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

function HeaderBlock() {
	return (
		<div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 px-5 py-6 ring-1 ring-foreground/[0.03] sm:px-7 sm:py-7">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-3">
					<Skeleton className="h-3 w-24 bg-muted/40" />
					<Skeleton className="h-7 w-64" />
					<Skeleton className="h-4 w-48 bg-muted/40" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-24 bg-muted/40" />
					<Skeleton className="h-9 w-24 bg-muted/40" />
				</div>
			</div>
		</div>
	);
}

function CardBlock({ rows = 4 }: { rows?: number }) {
	return (
		<div className="rounded-xl border border-border/70 bg-card/40 p-5">
			<Skeleton className="mb-5 h-5 w-40" />
			<div className="space-y-3">
				{Array.from({ length: rows }, (_, i) => `row-${i}`).map((key) => (
					<div key={key} className="flex items-center justify-between gap-4">
						<Skeleton className="h-4 w-32 bg-muted/40" />
						<Skeleton className="h-4 w-20 bg-muted/40" />
					</div>
				))}
			</div>
		</div>
	);
}

export function DetailSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-3.5 w-40 bg-muted/40" />
			<HeaderBlock />
			<CardBlock rows={5} />
			<CardBlock rows={6} />
			<CardBlock rows={4} />
		</div>
	);
}

export function SettingsSkeleton() {
	return (
		<div className="space-y-10">
			<HeaderBlock />
			{Array.from({ length: 3 }, (_, i) => `section-${i}`).map((key) => (
				<section key={key} className="space-y-4">
					<div className="mx-auto max-w-3xl space-y-2">
						<Skeleton className="h-5 w-44" />
						<Skeleton className="h-4 w-full max-w-xl bg-muted/40" />
					</div>
					<div className="mx-auto max-w-3xl">
						<CardBlock rows={3} />
					</div>
				</section>
			))}
		</div>
	);
}

export function NeuSkeleton() {
	return (
		<div className="space-y-8">
			<HeaderBlock />
			<div className="rounded-xl border border-border/70 bg-card/40 p-5">
				<Skeleton className="mb-5 h-5 w-48" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{Array.from({ length: 6 }, (_, i) => `field-${i}`).map((key) => (
						<div key={key} className="space-y-2">
							<Skeleton className="h-3 w-24 bg-muted/40" />
							<Skeleton className="h-9 w-full bg-muted/40" />
						</div>
					))}
				</div>
				<Skeleton className="mt-6 h-10 w-40" />
			</div>
		</div>
	);
}
