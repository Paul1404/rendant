"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Ban } from "lucide-react";

export function StornoDialog({ protokollId }: { protokollId: string }) {
  const router = useRouter();
  const [grund, setGrund] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (grund.trim().length < 5) {
      toast.error("Bitte mindestens 5 Zeichen Begruendung angeben");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/protokolle/${protokollId}/storno`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storno_grund: grund.trim() }),
      });
      if (res.status === 200) {
        toast.success("Beleg storniert");
        setOpen(false);
        router.refresh();
        return;
      }
      let msg = "Stornierung fehlgeschlagen";
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
            Eine Stornierung kann nicht rueckgaengig gemacht werden. Der Beleg
            bleibt aus Aufbewahrungsgruenden erhalten und wird als storniert
            markiert. Eine Korrektur erfolgt durch ein neues Protokoll.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="storno_grund">Begruendung</Label>
          <Textarea
            id="storno_grund"
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={3}
            minLength={5}
            maxLength={500}
            placeholder="z.B. Falsche Anzahl 50 EUR Scheine erfasst"
          />
          <p className="text-xs text-neutral-500">
            Mindestens 5 Zeichen, maximal 500.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={pending}
          >
            Stornieren
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
