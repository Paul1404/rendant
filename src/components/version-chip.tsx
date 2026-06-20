import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

// Small build-version badge. The value comes from package.json; agents bump it
// on release and this updates automatically.
export function VersionChip({ className }: { className?: string }) {
	return (
		<a
			href="https://github.com/Paul1404/svufo/releases"
			target="_blank"
			rel="noreferrer"
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums transition-colors hover:border-border hover:text-foreground",
				className,
			)}
			title={`SVUFO v${APP_VERSION}`}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-success/80" />v{APP_VERSION}
		</a>
	);
}
