import { useRouter } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

export function RegeneratePdfButton({ protokollId }: { protokollId: string }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function regenerate() {
		startTransition(async () => {
			try {
				await orpcClient.protokolle.regeneratePdf({ id: protokollId });
				toast.success("PDF neu erzeugt");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Neu erzeugen fehlgeschlagen"));
			}
		});
	}

	return (
		<Button
			variant="outline"
			size="icon"
			onClick={regenerate}
			disabled={pending}
			title="PDF neu erzeugen"
			aria-label="PDF neu erzeugen"
		>
			{pending ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<RefreshCw className="h-4 w-4" />
			)}
		</Button>
	);
}
