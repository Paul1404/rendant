import { Callout, CalloutList } from "@/components/ui/callout";
import type { SanityWarning } from "@/lib/sanity-checks";

export function SanityWarnings({ warnings }: { warnings: SanityWarning[] }) {
	if (warnings.length === 0) return null;
	return (
		<Callout
			tone="warning"
			title={
				warnings.length === 1
					? "Hinweis vor dem Speichern"
					: "Hinweise vor dem Speichern"
			}
		>
			<CalloutList items={warnings} />
			<p className="pt-1 text-[11px]">
				Du kannst trotzdem speichern. Die Hinweise blockieren nichts.
			</p>
		</Callout>
	);
}
