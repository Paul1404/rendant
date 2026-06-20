import { Link } from "@tanstack/react-router";
import { FileQuestion, RotateCcw, TriangleAlert } from "lucide-react";
import type { JSX } from "react";
import { Button } from "@/components/ui/button";

export function NotFoundView(): JSX.Element {
	return (
		<div className="flex min-h-[60vh] items-center justify-center px-4">
			<div className="flex max-w-md flex-col items-center gap-4 text-center">
				<div className="flex size-14 items-center justify-center rounded-full bg-muted">
					<FileQuestion className="size-6 text-muted-foreground" />
				</div>
				<h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
				<p className="text-sm text-muted-foreground">
					Diese Seite existiert nicht oder wurde verschoben.
				</p>
				<Button asChild>
					<Link to="/protokolle">Zur Übersicht</Link>
				</Button>
			</div>
		</div>
	);
}

export function ErrorView({
	error,
	reset,
}: {
	error?: Error;
	reset?: () => void;
}): JSX.Element {
	return (
		<div className="flex min-h-[60vh] items-center justify-center px-4">
			<div className="flex max-w-md flex-col items-center gap-4 text-center">
				<div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
					<TriangleAlert className="size-6 text-destructive" />
				</div>
				<h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
				<p className="text-sm text-muted-foreground">
					Beim Laden der Seite ist ein Fehler aufgetreten.
				</p>
				{import.meta.env.DEV && error?.message ? (
					<code className="block max-w-full overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
						{error.message}
					</code>
				) : null}
				<div className="flex flex-wrap items-center justify-center gap-2">
					{reset ? (
						<Button variant="outline" onClick={() => reset()}>
							<RotateCcw className="size-4" />
							Erneut versuchen
						</Button>
					) : null}
					<Button asChild>
						<Link to="/protokolle">Zur Übersicht</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
