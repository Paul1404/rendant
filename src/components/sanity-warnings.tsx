import { TriangleAlert } from "lucide-react";
import type { SanityWarning } from "@/lib/sanity-checks";

export function SanityWarnings({ warnings }: { warnings: SanityWarning[] }) {
	if (warnings.length === 0) return null;
	return (
		<div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
			<TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
			<div className="space-y-1">
				<p className="text-sm font-medium text-amber-700 dark:text-amber-300">
					{warnings.length === 1
						? "Hinweis vor dem Speichern"
						: "Hinweise vor dem Speichern"}
				</p>
				<ul className="space-y-1 text-sm text-amber-700/90 dark:text-amber-300/90">
					{warnings.map((w) => (
						<li key={w.id} className="flex gap-2">
							<span
								aria-hidden
								className="mt-1 inline-block size-1 shrink-0 rounded-full bg-amber-600/70 dark:bg-amber-400/70"
							/>
							<span>{w.message}</span>
						</li>
					))}
				</ul>
				<p className="pt-1 text-[11px] text-amber-700/80 dark:text-amber-300/80">
					Du kannst trotzdem speichern. Die Hinweise blockieren nichts.
				</p>
			</div>
		</div>
	);
}
