import { lazy, Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

// The dialog parses the whole CHANGELOG.md at module scope, which is ~16 kB
// gzipped and grows with every release. Loading it lazily keeps it off every
// page load, including the login page for signed-out visitors.
const ReleaseNotesDialog = lazy(() =>
	import("@/components/release-notes-dialog").then((module) => ({
		default: module.ReleaseNotesDialog,
	})),
);

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
					"inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 font-mono text-[10px] leading-none text-muted-foreground tabular-nums transition-colors hover:border-border hover:text-foreground",
					className,
				)}
				title={`Rendant v${APP_VERSION}`}
			>
				<span className="h-1.5 w-1.5 rounded-full bg-success/80" />v
				{APP_VERSION}
			</button>
			{open ? (
				<Suspense fallback={null}>
					<ReleaseNotesDialog open={open} onOpenChange={setOpen} />
				</Suspense>
			) : null}
		</>
	);
}
