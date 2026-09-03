import { Loader2 } from "lucide-react";
import { useState } from "react";

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

// Replaces window.confirm for the app's irreversible actions. The native dialog
// can be suppressed by the browser's "prevent additional dialogs" checkbox,
// which silently removes the only way to perform the action, and it cannot show
// the consequence with any structure. This keeps focus management and keyboard
// handling from Radix.
export function ConfirmDialog({
	trigger,
	title,
	description,
	confirmLabel,
	pending = false,
	destructive = false,
	open: controlledOpen,
	onOpenChange,
	onConfirm,
}: {
	// Omitted when the action starts from something other than a button, such as
	// a select changing value; pass `open`/`onOpenChange` instead.
	trigger?: React.ReactNode;
	title: string;
	description: React.ReactNode;
	confirmLabel: string;
	pending?: boolean;
	destructive?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onConfirm: () => Promise<void> | void;
}) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = onOpenChange ?? setUncontrolledOpen;

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			{trigger ? (
				<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
			) : null}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
					<AlertDialogAction
						data-destructive={destructive ? "true" : undefined}
						onClick={(event) => {
							event.preventDefault();
							void (async () => {
								await onConfirm();
								setOpen(false);
							})();
						}}
						disabled={pending}
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
