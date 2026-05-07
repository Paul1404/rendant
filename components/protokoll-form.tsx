"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import {
  DENOMINATIONS,
  emptyCounts,
  sumGezaehltCent,
  type DenominationCounts,
  type DenominationKey,
} from "@/lib/denominations";
import {
  formatCent,
  formatCentPlain,
  parseGermanAmount,
} from "@/lib/money";
import {
  WECHSELGELD_DEFAULT_CENT,
} from "@/lib/constants";
import { formatDateDe } from "@/lib/date";

type AusgabeDraft = {
  bezeichnung: string;
  empfaenger: string;
  beleg_nr: string;
  betrag_input: string;
};

function emptyAusgabe(): AusgabeDraft {
  return { bezeichnung: "", empfaenger: "", beleg_nr: "", betrag_input: "" };
}

const BEMERKUNG_MAX = 2000;

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

function blurOnWheel(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function ProtokollForm({
  belegnummerPreview,
}: {
  belegnummerPreview: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [counts, setCounts] = useState<DenominationCounts>(emptyCounts());
  const [anlass, setAnlass] = useState("");
  const [gezaehltVon, setGezaehltVon] = useState("");
  const [gepruefftVon, setGepruefftVon] = useState("");
  const [bemerkung, setBemerkung] = useState("");
  const [wechselgeldInput, setWechselgeldInput] = useState(
    formatCentPlain(WECHSELGELD_DEFAULT_CENT),
  );
  const [ausgaben, setAusgaben] = useState<AusgabeDraft[]>([]);

  const lastAusgabeRef = useRef<HTMLInputElement | null>(null);
  const focusLastAusgabe = useRef(false);

  useEffect(() => {
    if (focusLastAusgabe.current) {
      lastAusgabeRef.current?.focus();
      focusLastAusgabe.current = false;
    }
  }, [ausgaben.length]);

  const wechselgeldCent = useMemo(
    () => parseGermanAmount(wechselgeldInput) ?? -1,
    [wechselgeldInput],
  );
  const gezaehltCent = useMemo(() => sumGezaehltCent(counts), [counts]);
  const ausgabenCent = useMemo(() => {
    let total = 0;
    for (const a of ausgaben) {
      const v = parseGermanAmount(a.betrag_input);
      if (v == null) return null;
      total += v;
    }
    return total;
  }, [ausgaben]);
  const bestandCent =
    ausgabenCent == null ? null : gezaehltCent + ausgabenCent;
  const tageseinnahmenCent =
    bestandCent == null || wechselgeldCent < 0
      ? null
      : bestandCent - wechselgeldCent;

  function setCount(key: DenominationKey, raw: string) {
    const num = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return;
    setCounts((c) => ({ ...c, [key]: num }));
  }

  function updateAusgabe<K extends keyof AusgabeDraft>(
    idx: number,
    key: K,
    value: AusgabeDraft[K],
  ) {
    setAusgaben((list) =>
      list.map((a, i) => (i === idx ? { ...a, [key]: value } : a)),
    );
  }

  function addAusgabe() {
    focusLastAusgabe.current = true;
    setAusgaben((list) => [...list, emptyAusgabe()]);
  }
  function removeAusgabe(idx: number) {
    setAusgaben((list) => list.filter((_, i) => i !== idx));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!anlass.trim() || !gezaehltVon.trim() || !gepruefftVon.trim()) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    if (wechselgeldCent < 0) {
      toast.error("Wechselgeld ist ungültig");
      return;
    }
    const ausgabenPayload: Array<{
      bezeichnung: string;
      empfaenger: string;
      beleg_nr: string;
      betrag_cent: number;
    }> = [];
    for (const a of ausgaben) {
      if (!a.bezeichnung.trim()) {
        toast.error("Ausgabe ohne Bezeichnung");
        return;
      }
      const cent = parseGermanAmount(a.betrag_input);
      if (cent == null || cent < 0) {
        toast.error("Ausgabe-Betrag ist ungültig");
        return;
      }
      ausgabenPayload.push({
        bezeichnung: a.bezeichnung.trim(),
        empfaenger: a.empfaenger.trim(),
        beleg_nr: a.beleg_nr.trim(),
        betrag_cent: cent,
      });
    }

    const payload: Record<string, unknown> = {
      anlass: anlass.trim(),
      gezaehlt_von: gezaehltVon.trim(),
      geprueft_von: gepruefftVon.trim(),
      bemerkung: bemerkung.trim(),
      wechselgeld_cent: wechselgeldCent,
      ausgaben: ausgabenPayload,
    };
    for (const d of DENOMINATIONS) payload[d.key] = counts[d.key];

    startTransition(async () => {
      const res = await fetch("/api/protokolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        const body = (await res.json()) as { id: string };
        toast.success("Protokoll gespeichert");
        router.replace(`/protokolle/${body.id}`);
        router.refresh();
        return;
      }
      let msg = "Speichern fehlgeschlagen";
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {
        // ignore
      }
      toast.error(msg);
    });
  }

  const heute = new Date();

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Kopfdaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Belegnummer</Label>
              <Input
                value={belegnummerPreview}
                readOnly
                tabIndex={-1}
                className="font-mono bg-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                value={formatDateDe(heute)}
                readOnly
                tabIndex={-1}
                className="bg-slate-100"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="anlass">Anlass</Label>
            <Input
              id="anlass"
              value={anlass}
              onChange={(e) => setAnlass(e.target.value)}
              required
              autoFocus
              maxLength={200}
              placeholder="z.B. Heimspiel 1. Mannschaft"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gezaehlt_von">Gezählt von</Label>
              <Input
                id="gezaehlt_von"
                value={gezaehltVon}
                onChange={(e) => setGezaehltVon(e.target.value)}
                required
                maxLength={120}
                autoComplete="name"
                placeholder="Vor- und Nachname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geprueft_von">Geprüft von</Label>
              <Input
                id="geprueft_von"
                value={gepruefftVon}
                onChange={(e) => setGepruefftVon(e.target.value)}
                required
                maxLength={120}
                autoComplete="name"
                placeholder="Vor- und Nachname"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bemerkung">Bemerkung</Label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {bemerkung.length} / {BEMERKUNG_MAX}
              </span>
            </div>
            <Textarea
              id="bemerkung"
              value={bemerkung}
              onChange={(e) => setBemerkung(e.target.value)}
              rows={3}
              maxLength={BEMERKUNG_MAX}
              placeholder="Optional"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stückelung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <h3 className="font-medium mb-2">Scheine</h3>
              <DenominationSection
                kind="schein"
                counts={counts}
                setCount={setCount}
              />
            </div>
            <div>
              <h3 className="font-medium mb-2">Münzen</h3>
              <DenominationSection
                kind="muenze"
                counts={counts}
                setCount={setCount}
              />
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex justify-between items-center text-sm">
            <span className="font-medium">Summe gezählt</span>
            <span className="font-mono tabular-nums">
              {formatCent(gezaehltCent)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Betriebliche Ausgaben</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addAusgabe}>
            <Plus className="mr-2 h-4 w-4" />
            Ausgabe hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {ausgaben.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Ausgaben erfasst.</p>
          ) : (
            ausgaben.map((a, i) => {
              const isLast = i === ausgaben.length - 1;
              return (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start border rounded-md p-3"
                >
                  <div className="md:col-span-4 space-y-1">
                    <Label htmlFor={`bez-${i}`}>Bezeichnung</Label>
                    <Input
                      id={`bez-${i}`}
                      ref={isLast ? lastAusgabeRef : undefined}
                      value={a.bezeichnung}
                      onChange={(e) =>
                        updateAusgabe(i, "bezeichnung", e.target.value)
                      }
                      required
                      placeholder="z.B. Pizzakauf"
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label htmlFor={`emp-${i}`}>Empfänger</Label>
                    <Input
                      id={`emp-${i}`}
                      value={a.empfaenger}
                      onChange={(e) =>
                        updateAusgabe(i, "empfaenger", e.target.value)
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label htmlFor={`bel-${i}`}>Beleg-Nr.</Label>
                    <Input
                      id={`bel-${i}`}
                      value={a.beleg_nr}
                      onChange={(e) =>
                        updateAusgabe(i, "beleg_nr", e.target.value)
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label htmlFor={`bet-${i}`}>Betrag EUR</Label>
                    <Input
                      id={`bet-${i}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={a.betrag_input}
                      onFocus={selectOnFocus}
                      onChange={(e) =>
                        updateAusgabe(i, "betrag_input", e.target.value)
                      }
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="md:col-span-1 flex md:items-end md:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Ausgabe entfernen"
                      onClick={() => removeAusgabe(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wechselgeld">Anfangsbestand (Wechselgeld) EUR</Label>
              <Input
                id="wechselgeld"
                inputMode="decimal"
                value={wechselgeldInput}
                onFocus={selectOnFocus}
                onChange={(e) => setWechselgeldInput(e.target.value)}
                required
                className="text-right tabular-nums"
              />
            </div>
          </div>
          <Separator className="my-2" />
          <SummaryRow label="Gezählter Endbestand" cent={gezaehltCent} />
          <SummaryRow
            label="Betriebliche Ausgaben"
            cent={ausgabenCent}
          />
          <SummaryRow
            label="Kassenbestand brutto"
            cent={bestandCent}
            bold
          />
          <SummaryRow
            label="Anfangsbestand (Wechselgeld)"
            cent={wechselgeldCent < 0 ? null : wechselgeldCent}
          />
          <Separator />
          <SummaryRow
            label="Tageseinnahmen netto"
            cent={tageseinnahmenCent}
            highlight
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Speichern&hellip;
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Speichern und PDF erzeugen
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function DenominationSection({
  kind,
  counts,
  setCount,
}: {
  kind: "schein" | "muenze";
  counts: DenominationCounts;
  setCount: (key: DenominationKey, raw: string) => void;
}) {
  return (
    <div className="space-y-1">
      {DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
        const count = counts[d.key];
        const teil = count * d.cent;
        const isZero = count === 0;
        return (
          <div
            key={d.key}
            className="grid grid-cols-12 items-center gap-2 text-sm"
          >
            <Label
              htmlFor={d.key}
              className="col-span-3 text-right font-mono"
            >
              {d.label}
            </Label>
            <Input
              id={d.key}
              type="number"
              min={0}
              step={1}
              value={isZero ? "" : count}
              placeholder="0"
              onChange={(e) => setCount(d.key, e.target.value)}
              onFocus={selectOnFocus}
              onWheel={blurOnWheel}
              className="col-span-4 text-right tabular-nums"
            />
            <span
              className={
                "col-span-5 text-right font-mono tabular-nums " +
                (isZero ? "text-slate-300" : "text-slate-600")
              }
            >
              {isZero ? "—" : formatCent(teil)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryRow({
  label,
  cent,
  bold,
  highlight,
}: {
  label: string;
  cent: number | null;
  bold?: boolean;
  highlight?: boolean;
}) {
  const display = cent == null ? "-" : formatCent(cent);
  return (
    <div
      className={
        "flex justify-between items-center py-1 " +
        (highlight ? "text-base font-semibold" : "text-sm") +
        (bold ? " font-medium" : "")
      }
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{display}</span>
    </div>
  );
}
