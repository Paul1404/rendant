import { useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

// Self-service toggle: every signed-in user decides whether they personally
// receive the "new protokoll" info mail. Saves immediately on change.
export function NotificationPrefForm({ initial }: { initial: boolean }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [notify, setNotify] = useState(initial);

	function toggle(next: boolean) {
		setNotify(next);
		start(async () => {
			try {
				await orpcClient.profile.setNotify({ notify: next });
				toast.success(
					next
						? "Du erhältst künftig Benachrichtigungen"
						: "Benachrichtigungen abbestellt",
				);
				await router.invalidate();
			} catch (e) {
				setNotify(!next);
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Meine Benachrichtigungen</CardTitle>
				<CardDescription>
					Lege fest, ob du selbst eine Info-E-Mail bekommst, sobald ein neues
					Kassenzählprotokoll erfasst wurde. Die E-Mail geht an die Adresse
					deines Kontos.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background px-3">
					<input
						id="notify-self"
						type="checkbox"
						checked={notify}
						disabled={pending}
						onChange={(e) => toggle(e.target.checked)}
						className="h-4 w-4 rounded border-input accent-primary"
					/>
					<Label
						htmlFor="notify-self"
						className="flex cursor-pointer items-center gap-2 text-sm font-normal"
					>
						Neue Protokolle per E-Mail erhalten
						{pending ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
						) : null}
					</Label>
				</div>
			</CardContent>
		</Card>
	);
}
