"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export type UmsatzUstBasis = "pre_card" | "post_card";

const OPTIONS: ReadonlyArray<{
  id: UmsatzUstBasis;
  label: string;
  hint: string;
}> = [
  {
    id: "post_card",
    label: "Mit Kartenzahlung",
    hint: "USt.-Aufteilung wird gegen die Tageseinnahmen inkl. Kartenzahlung geprüft.",
  },
  {
    id: "pre_card",
    label: "Ohne Kartenzahlung",
    hint: "USt.-Aufteilung wird gegen die reinen Bareinnahmen (vor Kartenzahlung) geprüft.",
  },
];

export function UmsatzUstBasisForm({
  initial,
}: {
  initial: UmsatzUstBasis;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<UmsatzUstBasis>(initial);
  const [saved, setSaved] = useState<UmsatzUstBasis>(initial);
  const dirty = value !== saved;

  function save() {
    start(async () => {
      const res = await fetch("/api/settings/umsatz-ust-basis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ umsatz_ust_basis: value }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "Speichern fehlgeschlagen");
        return;
      }
      const data = (await res.json()) as { umsatz_ust_basis: UmsatzUstBasis };
      setSaved(data.umsatz_ust_basis);
      setValue(data.umsatz_ust_basis);
      toast.success("Einstellungen gespeichert");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bezugsgröße</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Standard für neue Protokolle. Pro Protokoll kann beim Erfassen
          umgestellt werden.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const active = value === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setValue(o.id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                  active
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card/40 hover:border-primary/40 hover:bg-card",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {o.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {o.hint}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2">
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setValue(saved)}
              disabled={pending}
            >
              Verwerfen
            </Button>
          ) : null}
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
