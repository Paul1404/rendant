import { useRouter } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { cn } from "@/lib/utils";

export type UmsatzUstBasis = "pre_card" | "post_card";

const OPTIONS: ReadonlyArray<{
	id: UmsatzUstBasis;
	label: string;
	hint: string;
}> = [
	{
		id: "post_card",
		label: "Mit Kartenzahlung",
		hint: "USt.-Aufteilung wird gegen die Tageseinnahmen inkl. Kartenzahlung geprüft.",
	},
	{
		id: "pre_card",
		label: "Ohne Kartenzahlung",
		hint: "USt.-Aufteilung wird gegen die reinen Bareinnahmen (vor Kartenzahlung) geprüft.",
	},
];

export function UmsatzUstBasisForm({ initial }: { initial: UmsatzUstBasis }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [value, setValue] = useState<UmsatzUstBasis>(initial);
	const [saved, setSaved] = useState<UmsatzUstBasis>(initial);
	const dirty = value !== saved;

	function save() {
		start(async () => {
			try {
				const data = await orpcClient.settings.updateUmsatzUstBasis({
					umsatz_ust_basis: value,
				});
				setSaved(data.umsatz_ust_basis);
				setValue(data.umsatz_ust_basis);
				toast.success("Einstellungen gespeichert");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Bezugsgröße</CardTitle>
				<CardDescription>
					Standard für neue Protokolle. Pro Protokoll kann beim Erfassen
					umgestellt werden.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{OPTIONS.map((o) => {
						const active = value === o.id;
						return (
							<button
								key={o.id}
								type="button"
								aria-pressed={active}
								onClick={() => setValue(o.id)}
								className={cn(
									"flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
									active
										? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20"
										: "border-border/60 bg-card hover:border-primary/40 hover:bg-muted/40",
								)}
							>
								<span
									className={cn(
										"text-sm font-medium",
										active ? "text-primary" : "text-foreground",
									)}
								>
									{o.label}
								</span>
								<span
									className={cn(
										"text-[11px] leading-relaxed",
										active ? "text-primary/80" : "text-muted-foreground",
									)}
								>
									{o.hint}
								</span>
							</button>
						);
					})}
				</div>
				<div className="flex items-center justify-end gap-2">
					{dirty ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setValue(saved)}
							disabled={pending}
						>
							Verwerfen
						</Button>
					) : null}
					<Button type="button" onClick={save} disabled={pending || !dirty}>
						{pending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						Speichern
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
