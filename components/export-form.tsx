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

export function ExportForm() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const [von, setVon] = useState(isoDate(startOfYear));
  const [bis, setBis] = useState(isoDate(now));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!von || !bis) return;
    const url = `/api/protokolle/export?von=${encodeURIComponent(
      von,
    )}&bis=${encodeURIComponent(bis)}`;
    window.location.href = url;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="von">Von</Label>
              <Input
                id="von"
                type="date"
                value={von}
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
                onChange={(e) => setBis(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit">
            <Download className="mr-2 h-4 w-4" />
            CSV herunterladen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
