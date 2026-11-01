import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ClubAccessDenied({ vereinsname }: { vereinsname: string }) {
	const [pending, setPending] = useState(false);
	return (
		<main id="main-content" className="mx-auto w-full max-w-lg px-4 py-12">
			<h1 className="font-heading text-2xl">Kein Zugang zu diesem Verein</h1>
			<p className="mt-3 text-sm">
				Dein angemeldetes Konto hat keinen aktiven Zugang zu {vereinsname}.
				Melde dich mit einem anderen Konto an oder bitte einen Vereinsadmin um
				eine Einladung oder Freischaltung.
			</p>
			<Button
				className="mt-6"
				disabled={pending}
				onClick={async () => {
					setPending(true);
					try {
						const { error } = await authClient.signOut();
						if (error) throw new Error("Abmelden fehlgeschlagen");
						window.location.assign("/login");
					} catch {
						toast.error("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
						setPending(false);
					}
				}}
			>
				{pending
					? "Wird abgemeldet…"
					: "Abmelden und mit anderem Konto anmelden"}
			</Button>
		</main>
	);
}
