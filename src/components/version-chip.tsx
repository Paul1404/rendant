import { useState } from "react";
import { ReleaseNotesDialog } from "@/components/release-notes-dialog";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

// Small build-version badge. The value comes from package.json; agents bump it
// on release and this updates automatically. Clicking opens the internal
// release notes parsed from CHANGELOG.md.
export function VersionChip({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums transition-colors hover:border-border hover:text-foreground",
					className,
				)}
				title={`SVUFO v${APP_VERSION}`}
			>
				<span className="h-1.5 w-1.5 rounded-full bg-success/80" />v
				{APP_VERSION}
			</button>
			<ReleaseNotesDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
