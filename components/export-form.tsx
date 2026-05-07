"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const NOW = new Date();
const TODAY = isoDate(NOW);

const PRESETS: ReadonlyArray<{
  label: string;
  range: () => { von: string; bis: string };
}> = [
  {
    label: "Aktuelles Jahr",
    range: () => ({
      von: isoDate(new Date(NOW.getFullYear(), 0, 1)),
      bis: TODAY,
    }),
  },
  {
    label: "Letztes Jahr",
    range: () => ({
      von: isoDate(new Date(NOW.getFullYear() - 1, 0, 1)),
      bis: isoDate(new Date(NOW.getFullYear() - 1, 11, 31)),
    }),
  },
  {
    label: "Aktueller Monat",
    range: () => ({
      von: isoDate(new Date(NOW.getFullYear(), NOW.getMonth(), 1)),
      bis: TODAY,
    }),
  },
  {
    label: "Letzte 30 Tage",
    range: () => {
      const start = new Date(NOW);
      start.setDate(start.getDate() - 29);
      return { von: isoDate(start), bis: TODAY };
    },
  },
];

export function ExportForm() {
  const startOfYear = new Date(NOW.getFullYear(), 0, 1);
  const [von, setVon] = useState(isoDate(startOfYear));
  const [bis, setBis] = useState(TODAY);

  const invalidRange = von > bis;

  function applyPreset(idx: number) {
    const r = PRESETS[idx].range();
    setVon(r.von);
    setBis(r.bis);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!von || !bis || invalidRange) return;
    const url = `/api/protokolle/export?von=${encodeURIComponent(
      von,
    )}&bis=${encodeURIComponent(bis)}`;
    window.location.href = url;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(i)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="von">Von</Label>
              <Input
                id="von"
                type="date"
                value={von}
                max={bis || undefined}
                onChange={(e) => setVon(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bis">Bis</Label>
              <Input
                id="bis"
                type="date"
                value={bis}
                min={von || undefined}
                max={TODAY}
                onChange={(e) => setBis(e.target.value)}
                required
              />
            </div>
          </div>
          {invalidRange ? (
            <p className="text-xs text-destructive">
              &laquo;Bis&raquo; muss nach &laquo;Von&raquo; liegen.
            </p>
          ) : null}
          <Button type="submit" disabled={invalidRange}>
            <Download className="mr-2 h-4 w-4" />
            CSV herunterladen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
