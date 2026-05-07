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
import { Ban, Loader2 } from "lucide-react";

const STORNO_MIN = 5;
const STORNO_MAX = 500;

export function StornoDialog({ protokollId }: { protokollId: string }) {
  const router = useRouter();
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
                "text-[11px] tabular-nums " +
                (tooShort ? "text-destructive" : "text-slate-400")
              }
            >
              {trimmedLen} / {STORNO_MAX}
            </span>
          </div>
          <Textarea
            id="storno_grund"
            autoFocus
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={3}
            minLength={STORNO_MIN}
            maxLength={STORNO_MAX}
            placeholder="z.B. Falsche Anzahl 50 EUR Scheine erfasst"
          />
          <p className="text-xs text-slate-500">
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
