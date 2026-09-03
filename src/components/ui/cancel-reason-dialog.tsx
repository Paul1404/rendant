import { Loader2 } from "lucide-react";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const CANCEL_REASON_MIN = 5;
export const CANCEL_REASON_MAX = 500;

// Shared capture for the reasons the audit trail keeps. window.prompt is not
// good enough for these: a reason that fails the length check is lost with the
// prompt, the browser can suppress repeat dialogs and silently remove the only
// way to cancel anything, and the value it returns is easy to submit untrimmed.
export function CancelReasonDialog({
	trigger,
	title,
	description,
	confirmLabel,
	pending = false,
	onConfirm,
}: {
	trigger: React.ReactNode;
	title: string;
	description: React.ReactNode;
	confirmLabel: string;
	pending?: boolean;
	onConfirm: (reason: string) => Promise<void> | void;
}) {
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const fieldId = `cancel-reason-${title.replace(/\W+/g, "-").toLowerCase()}`;

	const trimmedLength = reason.trim().length;
	const tooShort = trimmedLength > 0 && trimmedLength < CANCEL_REASON_MIN;
	const canConfirm = trimmedLength >= CANCEL_REASON_MIN && !pending;

	async function confirm() {
		const trimmed = reason.trim();
		if (trimmed.length < CANCEL_REASON_MIN) {
			toast.error(
				`Bitte mindestens ${CANCEL_REASON_MIN} Zeichen Begründung angeben`,
			);
			return;
		}
		// The trimmed value is what gets validated, so it is also what gets sent.
		await onConfirm(trimmed);
		setOpen(false);
		setReason("");
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setReason("");
			}}
		>
			<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor={fieldId}>Begründung</Label>
						<span
							className={
								tooShort
									? "text-[11px] tabular-nums text-destructive"
									: "text-[11px] tabular-nums text-muted-foreground"
							}
						>
							{trimmedLength} / {CANCEL_REASON_MAX}
						</span>
					</div>
					<Textarea
						id={fieldId}
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						rows={3}
						minLength={CANCEL_REASON_MIN}
						maxLength={CANCEL_REASON_MAX}
					/>
					<p className="text-xs text-muted-foreground">
						Mindestens {CANCEL_REASON_MIN} Zeichen, maximal {CANCEL_REASON_MAX}.
					</p>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
					<AlertDialogAction
						onClick={(event) => {
							event.preventDefault();
							void confirm();
						}}
						disabled={!canConfirm}
					>
						{pending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{confirmLabel}&hellip;
							</>
						) : (
							confirmLabel
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
