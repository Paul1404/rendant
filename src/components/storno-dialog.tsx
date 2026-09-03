import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Ban, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

const STORNO_MIN = 5;
const STORNO_MAX = 500;

export function StornoDialog({ protokollId }: { protokollId: string }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [grund, setGrund] = useState("");
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	const trimmedLen = grund.trim().length;
	const tooShort = trimmedLen > 0 && trimmedLen < STORNO_MIN;
	const canConfirm = trimmedLen >= STORNO_MIN && !pending;

	function confirm() {
		if (trimmedLen < STORNO_MIN) {
			toast.error(`Bitte mindestens ${STORNO_MIN} Zeichen Begründung angeben`);
			return;
		}
		startTransition(async () => {
			try {
				await orpcClient.protokolle.storno({
					id: protokollId,
					storno_grund: grund.trim(),
				});
				toast.success("Beleg storniert");
				setOpen(false);
				await queryClient.invalidateQueries();
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Stornierung fehlgeschlagen"));
			}
		});
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" size="sm">
					<Ban className="mr-2 h-4 w-4" />
					Stornieren
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Beleg stornieren</AlertDialogTitle>
					<AlertDialogDescription>
						Eine Stornierung kann nicht rückgängig gemacht werden. Der Beleg
						bleibt aus Aufbewahrungsgründen erhalten und wird als storniert
						markiert. Eine Korrektur erfolgt durch ein neues Protokoll.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="storno_grund">Begründung</Label>
						<span
							className={
								tooShort
									? "text-[11px] tabular-nums text-destructive"
									: "text-[11px] tabular-nums text-muted-foreground"
							}
						>
							{trimmedLen} / {STORNO_MAX}
						</span>
					</div>
					<Textarea
						id="storno_grund"
						value={grund}
						onChange={(e) => setGrund(e.target.value)}
						rows={3}
						minLength={STORNO_MIN}
						maxLength={STORNO_MAX}
						placeholder="z. B. Falsche Anzahl 50 EUR Scheine erfasst"
					/>
					<p className="text-xs text-muted-foreground">
						Mindestens {STORNO_MIN} Zeichen, maximal {STORNO_MAX}.
					</p>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e) => {
							e.preventDefault();
							confirm();
						}}
						disabled={!canConfirm}
					>
						{pending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Stornieren&hellip;
							</>
						) : (
							"Stornieren"
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
