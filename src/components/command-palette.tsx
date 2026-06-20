import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Download, List, Plus, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatDateDe } from "@/lib/date";
import { orpc } from "@/lib/orpc";

const NAV_ITEMS = [
	{ to: "/protokolle", label: "Protokolle", icon: List },
	{ to: "/protokolle/neu", label: "Neues Protokoll", icon: Plus },
	{ to: "/protokolle/export", label: "Export", icon: Download },
	{ to: "/protokolle/einstellungen", label: "Einstellungen", icon: Settings },
] as const;

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();

	const { data: protokolle } = useQuery(
		orpc.protokolle.list.queryOptions({ input: { includeStorniert: true } }),
	);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	function go(to: string, params?: Record<string, string>) {
		setOpen(false);
		// biome-ignore lint/suspicious/noExplicitAny: dynamic navigation target
		navigate({ to, params } as any);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				showCloseButton={false}
				className="overflow-hidden p-0 sm:max-w-lg"
			>
				<DialogTitle className="sr-only">Befehlspalette</DialogTitle>
				<DialogDescription className="sr-only">
					Suchen oder zu einer Seite springen
				</DialogDescription>
				<Command className="flex flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-2">
					<div className="border-b border-border px-3">
						<Command.Input
							placeholder="Suchen oder springen…"
							className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</div>
					<Command.List className="max-h-[320px] overflow-y-auto overflow-x-hidden p-2">
						<Command.Empty className="py-6 text-center text-sm text-muted-foreground">
							Keine Treffer
						</Command.Empty>

						<Command.Group heading="Navigation">
							{NAV_ITEMS.map(({ to, label, icon: Icon }) => (
								<Command.Item
									key={to}
									value={`navigation ${label}`}
									onSelect={() => go(to)}
									className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
								>
									<Icon className="size-4 text-muted-foreground" />
									<span>{label}</span>
								</Command.Item>
							))}
						</Command.Group>

						{protokolle && protokolle.length > 0 ? (
							<Command.Group heading="Protokolle">
								{protokolle.map((p) => (
									<Command.Item
										key={p.id}
										value={`${p.belegnummer} ${p.anlass}`}
										onSelect={() => go("/protokolle/$id", { id: p.id })}
										className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
									>
										<span className="font-mono text-xs text-muted-foreground">
											{p.belegnummer}
										</span>
										<span className="min-w-0 flex-1 truncate">{p.anlass}</span>
										<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
											{formatDateDe(p.anlass_datum)}
										</span>
									</Command.Item>
								))}
							</Command.Group>
						) : null}
					</Command.List>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
