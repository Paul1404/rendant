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
import {
  Banknote,
  Calculator,
  Coins,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  Save,
  Trash2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

type MwstMode = "none" | "p7" | "p19" | "custom";

type AusgabeDraft = {
  bezeichnung: string;
  empfaenger: string;
  beleg_nr: string;
  betrag_input: string;
  mwst_mode: MwstMode;
  mwst_custom_input: string;
};

const MWST_PRESET_BP: Record<Exclude<MwstMode, "custom">, number> = {
  none: 0,
  p7: 700,
  p19: 1900,
};

function emptyAusgabe(): AusgabeDraft {
  return {
    bezeichnung: "",
    empfaenger: "",
    beleg_nr: "",
    betrag_input: "",
    mwst_mode: "none",
    mwst_custom_input: "",
  };
}

function parseGermanPercent(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return Math.round(num * 100);
}

function ausgabeMwstBp(a: AusgabeDraft): number | null {
  if (a.mwst_mode === "custom") return parseGermanPercent(a.mwst_custom_input);
  return MWST_PRESET_BP[a.mwst_mode];
}

function mwstAnteilCent(bruttoCent: number, bp: number): number {
  if (bp <= 0) return 0;
  const netCent = Math.round((bruttoCent * 10000) / (10000 + bp));
  return bruttoCent - netCent;
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
  const [kassennummer, setKassennummer] = useState("");
  const [kassenbezeichnung, setKassenbezeichnung] = useState("");
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
  const mwstSummeCent = useMemo(() => {
    let total = 0;
    for (const a of ausgaben) {
      const brutto = parseGermanAmount(a.betrag_input);
      const bp = ausgabeMwstBp(a);
      if (brutto == null || bp == null) continue;
      total += mwstAnteilCent(brutto, bp);
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
    if (
      !kassennummer.trim() ||
      !kassenbezeichnung.trim() ||
      !anlass.trim() ||
      !gezaehltVon.trim() ||
      !gepruefftVon.trim()
    ) {
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
      mwst_basis_punkte: number;
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
      const bp = ausgabeMwstBp(a);
      if (bp == null) {
        toast.error("MwSt.-Satz ist ungültig (0–100 %)");
        return;
      }
      ausgabenPayload.push({
        bezeichnung: a.bezeichnung.trim(),
        empfaenger: a.empfaenger.trim(),
        beleg_nr: a.beleg_nr.trim(),
        betrag_cent: cent,
        mwst_basis_punkte: bp,
      });
    }

    const payload: Record<string, unknown> = {
      kassennummer: kassennummer.trim(),
      kassenbezeichnung: kassenbezeichnung.trim(),
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
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Kopfdaten
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Belegnummer</Label>
              <Input
                value={belegnummerPreview}
                readOnly
                tabIndex={-1}
                className="font-mono bg-muted/60"
              />
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                value={formatDateDe(heute)}
                readOnly
                tabIndex={-1}
                className="bg-muted/60"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kassennummer">Kassennummer</Label>
              <Input
                id="kassennummer"
                value={kassennummer}
                onChange={(e) => setKassennummer(e.target.value)}
                required
                maxLength={50}
                placeholder="z.B. K-01"
                className="font-mono"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kassenbezeichnung">Kassenbezeichnung</Label>
              <Input
                id="kassenbezeichnung"
                value={kassenbezeichnung}
                onChange={(e) => setKassenbezeichnung(e.target.value)}
                required
                maxLength={120}
                placeholder="z.B. Sportheim Theke"
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
              <span className="text-[11px] tabular-nums text-muted-foreground">
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
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Stückelung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
            <div>
              <h3 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Banknote className="h-3.5 w-3.5" />
                Scheine
              </h3>
              <DenominationSection
                kind="schein"
                counts={counts}
                setCount={setCount}
              />
            </div>
            <div>
              <h3 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Coins className="h-3.5 w-3.5" />
                Münzen
              </h3>
              <DenominationSection
                kind="muenze"
                counts={counts}
                setCount={setCount}
              />
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">Summe gezählt</span>
            <span className="font-mono tabular-nums">
              {formatCent(gezaehltCent)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" />
            Betriebliche Ausgaben
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addAusgabe}>
            <Plus className="mr-2 h-4 w-4" />
            Ausgabe hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {ausgaben.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              Keine Ausgaben erfasst.
            </p>
          ) : (
            ausgaben.map((a, i) => {
              const isLast = i === ausgaben.length - 1;
              const brutto = parseGermanAmount(a.betrag_input);
              const bp = ausgabeMwstBp(a);
              const mwst =
                brutto != null && bp != null
                  ? mwstAnteilCent(brutto, bp)
                  : null;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3"
                >
                  <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-12">
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

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      MwSt.
                    </span>
                    <div className="inline-flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-sm">
                      <MwstChip
                        active={a.mwst_mode === "none"}
                        onClick={() => updateAusgabe(i, "mwst_mode", "none")}
                      >
                        0 %
                      </MwstChip>
                      <MwstChip
                        active={a.mwst_mode === "p7"}
                        onClick={() => updateAusgabe(i, "mwst_mode", "p7")}
                      >
                        7 %
                      </MwstChip>
                      <MwstChip
                        active={a.mwst_mode === "p19"}
                        onClick={() => updateAusgabe(i, "mwst_mode", "p19")}
                      >
                        19 %
                      </MwstChip>
                      <MwstChip
                        active={a.mwst_mode === "custom"}
                        onClick={() => updateAusgabe(i, "mwst_mode", "custom")}
                      >
                        Andere
                      </MwstChip>
                    </div>
                    {a.mwst_mode === "custom" ? (
                      <div className="relative">
                        <Input
                          inputMode="decimal"
                          value={a.mwst_custom_input}
                          onFocus={selectOnFocus}
                          onChange={(e) =>
                            updateAusgabe(
                              i,
                              "mwst_custom_input",
                              e.target.value,
                            )
                          }
                          placeholder="0,0"
                          className="h-8 w-20 pr-7 text-right tabular-nums"
                          aria-label="MwSt.-Satz in Prozent"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    ) : null}
                    {bp != null && bp > 0 && mwst != null ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        davon MwSt.{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatCent(mwst)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
          {ausgaben.length > 0 && mwstSummeCent > 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Summe MwSt. (rechnerisch)</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatCent(mwstSummeCent)}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Zusammenfassung
          </CardTitle>
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
          <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Banknote className="h-4 w-4 text-primary" />
              Tageseinnahmen netto
            </span>
            <span className="font-mono text-base font-semibold tabular-nums text-primary">
              {tageseinnahmenCent == null ? "-" : formatCent(tageseinnahmenCent)}
            </span>
          </div>
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

function MwstChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
                (isZero ? "text-muted-foreground/50" : "text-foreground/80")
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
