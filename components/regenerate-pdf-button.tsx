"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export function RegeneratePdfButton({ protokollId }: { protokollId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function regenerate() {
    startTransition(async () => {
      const res = await fetch(`/api/protokolle/${protokollId}/regenerate-pdf`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("PDF neu erzeugt");
        router.refresh();
        return;
      }
      let msg = "Neu erzeugen fehlgeschlagen";
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {
        // ignore
      }
      toast.error(msg);
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
