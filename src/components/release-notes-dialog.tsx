import { Sparkles } from "lucide-react";
import type { JSX } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { RELEASES } from "@/lib/release-notes";
import { APP_VERSION } from "@/lib/version";

// Shows the internal release notes parsed from CHANGELOG.md. Controlled by the
// version chip in the footer and on the login screen.
export function ReleaseNotesDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-4 text-muted-foreground" />
						Was ist neu
					</DialogTitle>
					<DialogDescription>
						Änderungen und Verbesserungen in Rendant, neueste zuerst.
					</DialogDescription>
				</DialogHeader>
				<div className="-mr-2 max-h-[70vh] space-y-6 overflow-y-auto pr-2">
					{RELEASES.map((release) => (
						<section key={release.version} className="space-y-2">
							<div className="flex flex-wrap items-baseline gap-2">
								<h3 className="font-heading font-medium text-foreground text-sm">
									v{release.version}
								</h3>
								{release.version === APP_VERSION && (
									<span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 font-medium text-[10px] text-success leading-none">
										aktuell
									</span>
								)}
								{release.date && (
									<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
										{release.date}
									</span>
								)}
							</div>
							<ul className="list-disc space-y-1 pl-4 text-muted-foreground text-sm">
								{release.notes.map((note) => (
									<li key={note}>{note}</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
