import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

export function RegeneratePdfButton({ protokollId }: { protokollId: string }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [pending, startTransition] = useTransition();

	function regenerate() {
		startTransition(async () => {
			try {
				await orpcClient.protokolle.regeneratePdf({ id: protokollId });
				toast.success("PDF neu erzeugt");
				await queryClient.invalidateQueries();
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Neu erzeugen fehlgeschlagen"));
			}
		});
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					onClick={regenerate}
					disabled={pending}
					aria-label="PDF neu erzeugen"
				>
					{pending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<RefreshCw className="h-4 w-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent>PDF neu erzeugen</TooltipContent>
		</Tooltip>
	);
}
