import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

// A failed load must never look like a real result. Without this, an empty list
// and a broken request render identically: "0 Stunden", "keine Einträge" - which
// in an accounting tool reads as a fact about the books rather than a fault.
export function QueryError({
	title = "Daten konnten nicht geladen werden.",
	description,
	onRetry,
}: {
	title?: string;
	description?: string;
	onRetry?: () => void;
}) {
	return (
		<div
			role="alert"
			className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
		>
			<div>
				<p className="text-sm font-medium text-destructive">{title}</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{description ??
						"Die Anzeige ist unvollständig. Bitte erneut laden; die gespeicherten Daten sind unverändert."}
				</p>
			</div>
			{onRetry ? (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<RotateCcw className="mr-2 h-4 w-4" />
					Erneut versuchen
				</Button>
			) : null}
		</div>
	);
}
