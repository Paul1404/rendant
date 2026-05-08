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
  Percent,
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

type UstMode = "none" | "p7" | "p19" | "custom";

type AusgabeDraft = {
  bezeichnung: string;
  empfaenger: string;
  beleg_nr: string;
  betrag_input: string;
  ust_mode: UstMode;
  ust_custom_input: string;
};

type UmsatzUstDraft = {
  betrag_input: string;
  ust_mode: UstMode;
  ust_custom_input: string;
};

const UST_PRESET_BP: Record<Exclude<UstMode, "custom">, number> = {
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
    ust_mode: "none",
    ust_custom_input: "",
  };
}

function emptyUmsatzSplit(mode: UstMode = "none"): UmsatzUstDraft {
  return {
    betrag_input: "",
    ust_mode: mode,
    ust_custom_input: "",
  };
}

function umsatzUstBp(s: UmsatzUstDraft): number | null {
  if (s.ust_mode === "custom") return parseGermanPercent(s.ust_custom_input);
  return UST_PRESET_BP[s.ust_mode];
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

function ausgabeUstBp(a: AusgabeDraft): number | null {
  if (a.ust_mode === "custom") return parseGermanPercent(a.ust_custom_input);
  return UST_PRESET_BP[a.ust_mode];
}

function ustAnteilCent(bruttoCent: number, bp: number): number {
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
  const [belegnummer, setBelegnummer] = useState(belegnummerPreview);
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
  const [umsatzSplits, setUmsatzSplits] = useState<UmsatzUstDraft[]>([]);

  const lastAusgabeRef = useRef<HTMLInputElement | null>(null);
  const focusLastAusgabe = useRef(false);
  const lastUmsatzRef = useRef<HTMLInputElement | null>(null);
  const focusLastUmsatz = useRef(false);

  useEffect(() => {
    if (focusLastAusgabe.current) {
      lastAusgabeRef.current?.focus();
      focusLastAusgabe.current = false;
    }
  }, [ausgaben.length]);

  useEffect(() => {
    if (focusLastUmsatz.current) {
      lastUmsatzRef.current?.focus();
      focusLastUmsatz.current = false;
    }
  }, [umsatzSplits.length]);

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
  const ustSummeCent = useMemo(() => {
    let total = 0;
    for (const a of ausgaben) {
      const brutto = parseGermanAmount(a.betrag_input);
      const bp = ausgabeUstBp(a);
      if (brutto == null || bp == null) continue;
      total += ustAnteilCent(brutto, bp);
    }
    return total;
  }, [ausgaben]);
  const bestandCent =
    ausgabenCent == null ? null : gezaehltCent + ausgabenCent;
  const tageseinnahmenCent =
    bestandCent == null || wechselgeldCent < 0
      ? null
      : bestandCent - wechselgeldCent;

  const umsatzSplitSummeCent = useMemo(() => {
    let total = 0;
    for (const s of umsatzSplits) {
      const v = parseGermanAmount(s.betrag_input);
      if (v == null) return null;
      total += v;
    }
    return total;
  }, [umsatzSplits]);
  const umsatzDiffCent =
    umsatzSplitSummeCent == null || tageseinnahmenCent == null
      ? null
      : tageseinnahmenCent - umsatzSplitSummeCent;
  const umsatzUstSummeCent = useMemo(() => {
    let total = 0;
    for (const s of umsatzSplits) {
      const brutto = parseGermanAmount(s.betrag_input);
      const bp = umsatzUstBp(s);
      if (brutto == null || bp == null) continue;
      total += ustAnteilCent(brutto, bp);
    }
    return total;
  }, [umsatzSplits]);

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

  function updateUmsatz<K extends keyof UmsatzUstDraft>(
    idx: number,
    key: K,
    value: UmsatzUstDraft[K],
  ) {
    setUmsatzSplits((list) =>
      list.map((s, i) => (i === idx ? { ...s, [key]: value } : s)),
    );
  }
  function addUmsatzSplit(mode: UstMode = "none") {
    focusLastUmsatz.current = true;
    setUmsatzSplits((list) => [...list, emptyUmsatzSplit(mode)]);
  }
  function removeUmsatzSplit(idx: number) {
    setUmsatzSplits((list) => list.filter((_, i) => i !== idx));
  }
  function fillRestbetrag(idx: number) {
    if (tageseinnahmenCent == null) return;
    let other = 0;
    for (let i = 0; i < umsatzSplits.length; i++) {
      if (i === idx) continue;
      const v = parseGermanAmount(umsatzSplits[i].betrag_input);
      if (v == null) return;
      other += v;
    }
    const rest = tageseinnahmenCent - other;
    if (rest < 0) return;
    updateUmsatz(idx, "betrag_input", formatCentPlain(rest));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !belegnummer.trim() ||
      !kassennummer.trim() ||
      !kassenbezeichnung.trim() ||
      !anlass.trim() ||
      !gezaehltVon.trim() ||
      !gepruefftVon.trim()
    ) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    if (!/^[A-Za-z0-9._\-/]+$/.test(belegnummer.trim())) {
      toast.error(
        "Belegnummer darf nur Buchstaben, Ziffern und . _ - / enthalten",
      );
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
      ust_basis_punkte: number;
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
      const bp = ausgabeUstBp(a);
      if (bp == null) {
        toast.error("USt.-Satz ist ungültig (0–100 %)");
        return;
      }
      ausgabenPayload.push({
        bezeichnung: a.bezeichnung.trim(),
        empfaenger: a.empfaenger.trim(),
        beleg_nr: a.beleg_nr.trim(),
        betrag_cent: cent,
        ust_basis_punkte: bp,
      });
    }

    const umsatzPayload: Array<{
      ust_basis_punkte: number;
      betrag_cent: number;
    }> = [];
    if (umsatzSplits.length > 0) {
      if (tageseinnahmenCent == null || tageseinnahmenCent < 0) {
        toast.error(
          "Tageseinnahmen müssen gültig sein, bevor Umsatz nach USt. erfasst werden kann",
        );
        return;
      }
      for (const s of umsatzSplits) {
        const cent = parseGermanAmount(s.betrag_input);
        if (cent == null || cent < 0) {
          toast.error("Umsatz-Betrag ist ungültig");
          return;
        }
        const bp = umsatzUstBp(s);
        if (bp == null) {
          toast.error("USt.-Satz im Umsatz ist ungültig (0–100 %)");
          return;
        }
        umsatzPayload.push({ ust_basis_punkte: bp, betrag_cent: cent });
      }
      const splitSum = umsatzPayload.reduce((s, u) => s + u.betrag_cent, 0);
      if (splitSum !== tageseinnahmenCent) {
        toast.error(
          `Summe der USt.-Aufteilung (${formatCent(splitSum)}) muss den Tageseinnahmen (${formatCent(tageseinnahmenCent)}) entsprechen`,
        );
        return;
      }
    }

    const payload: Record<string, unknown> = {
      belegnummer: belegnummer.trim(),
      kassennummer: kassennummer.trim(),
      kassenbezeichnung: kassenbezeichnung.trim(),
      anlass: anlass.trim(),
      gezaehlt_von: gezaehltVon.trim(),
      geprueft_von: gepruefftVon.trim(),
      bemerkung: bemerkung.trim(),
      wechselgeld_cent: wechselgeldCent,
      ausgaben: ausgabenPayload,
      umsatz_ust: umsatzPayload,
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
              <Label htmlFor="belegnummer">Belegnummer</Label>
              <Input
                id="belegnummer"
                value={belegnummer}
                onChange={(e) => setBelegnummer(e.target.value)}
                required
                maxLength={50}
                className="font-mono"
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
              const bp = ausgabeUstBp(a);
              const ustCent =
                brutto != null && bp != null
                  ? ustAnteilCent(brutto, bp)
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
                      USt.
                    </span>
                    <div className="inline-flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-sm">
                      <UstChip
                        active={a.ust_mode === "none"}
                        onClick={() => updateAusgabe(i, "ust_mode", "none")}
                      >
                        0 %
                      </UstChip>
                      <UstChip
                        active={a.ust_mode === "p7"}
                        onClick={() => updateAusgabe(i, "ust_mode", "p7")}
                      >
                        7 %
                      </UstChip>
                      <UstChip
                        active={a.ust_mode === "p19"}
                        onClick={() => updateAusgabe(i, "ust_mode", "p19")}
                      >
                        19 %
                      </UstChip>
                      <UstChip
                        active={a.ust_mode === "custom"}
                        onClick={() => updateAusgabe(i, "ust_mode", "custom")}
                      >
                        Andere
                      </UstChip>
                    </div>
                    {a.ust_mode === "custom" ? (
                      <div className="relative">
                        <Input
                          inputMode="decimal"
                          value={a.ust_custom_input}
                          onFocus={selectOnFocus}
                          onChange={(e) =>
                            updateAusgabe(
                              i,
                              "ust_custom_input",
                              e.target.value,
                            )
                          }
                          placeholder="0,0"
                          className="h-8 w-20 pr-7 text-right tabular-nums"
                          aria-label="USt.-Satz in Prozent"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    ) : null}
                    {bp != null && bp > 0 && ustCent != null ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        davon USt.{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatCent(ustCent)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
          {ausgaben.length > 0 && ustSummeCent > 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Summe USt. (rechnerisch)</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatCent(ustSummeCent)}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            Umsatz nach USt.
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addUmsatzSplit("p7")}
            >
              <Plus className="mr-2 h-4 w-4" />
              7 %
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addUmsatzSplit("p19")}
            >
              <Plus className="mr-2 h-4 w-4" />
              19 %
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addUmsatzSplit("none")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Anteil
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Optional. Tageseinnahmen auf USt.-Sätze aufteilen (z. B. 500&nbsp;EUR
            zu 7&nbsp;% und 500&nbsp;EUR zu 19&nbsp;%). Die Summe muss den
            Tageseinnahmen entsprechen.
          </p>
          {umsatzSplits.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              Keine USt.-Aufteilung erfasst.
            </p>
          ) : (
            umsatzSplits.map((s, i) => {
              const isLast = i === umsatzSplits.length - 1;
              const brutto = parseGermanAmount(s.betrag_input);
              const bp = umsatzUstBp(s);
              const ustCent =
                brutto != null && bp != null
                  ? ustAnteilCent(brutto, bp)
                  : null;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3"
                >
                  <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-12">
                    <div className="md:col-span-7 space-y-1">
                      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        USt.-Satz
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-sm">
                          <UstChip
                            active={s.ust_mode === "none"}
                            onClick={() => updateUmsatz(i, "ust_mode", "none")}
                          >
                            0 %
                          </UstChip>
                          <UstChip
                            active={s.ust_mode === "p7"}
                            onClick={() => updateUmsatz(i, "ust_mode", "p7")}
                          >
                            7 %
                          </UstChip>
                          <UstChip
                            active={s.ust_mode === "p19"}
                            onClick={() => updateUmsatz(i, "ust_mode", "p19")}
                          >
                            19 %
                          </UstChip>
                          <UstChip
                            active={s.ust_mode === "custom"}
                            onClick={() =>
                              updateUmsatz(i, "ust_mode", "custom")
                            }
                          >
                            Andere
                          </UstChip>
                        </div>
                        {s.ust_mode === "custom" ? (
                          <div className="relative">
                            <Input
                              inputMode="decimal"
                              value={s.ust_custom_input}
                              onFocus={selectOnFocus}
                              onChange={(e) =>
                                updateUmsatz(
                                  i,
                                  "ust_custom_input",
                                  e.target.value,
                                )
                              }
                              placeholder="0,0"
                              className="h-8 w-20 pr-7 text-right tabular-nums"
                              aria-label="USt.-Satz in Prozent"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <Label htmlFor={`umsatz-bet-${i}`}>Brutto EUR</Label>
                      <Input
                        id={`umsatz-bet-${i}`}
                        ref={isLast ? lastUmsatzRef : undefined}
                        inputMode="decimal"
                        placeholder="0,00"
                        value={s.betrag_input}
                        onFocus={selectOnFocus}
                        onChange={(e) =>
                          updateUmsatz(i, "betrag_input", e.target.value)
                        }
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-end gap-1 md:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => fillRestbetrag(i)}
                        disabled={tageseinnahmenCent == null}
                        title="Restbetrag bis Tageseinnahmen einsetzen"
                      >
                        Rest
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="USt.-Aufteilung entfernen"
                        onClick={() => removeUmsatzSplit(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {bp != null && bp > 0 && ustCent != null ? (
                    <div className="mt-2 flex justify-end text-xs text-muted-foreground">
                      davon USt.&nbsp;
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCent(ustCent)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          {umsatzSplits.length > 0 ? (
            <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Summe Aufteilung</span>
                <span className="font-mono tabular-nums text-foreground">
                  {umsatzSplitSummeCent == null
                    ? "-"
                    : formatCent(umsatzSplitSummeCent)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tageseinnahmen</span>
                <span className="font-mono tabular-nums text-foreground">
                  {tageseinnahmenCent == null
                    ? "-"
                    : formatCent(tageseinnahmenCent)}
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between font-medium",
                  umsatzDiffCent === 0
                    ? "text-success"
                    : "text-destructive",
                )}
              >
                <span>Differenz</span>
                <span className="font-mono tabular-nums">
                  {umsatzDiffCent == null ? "-" : formatCent(umsatzDiffCent)}
                </span>
              </div>
              {umsatzUstSummeCent > 0 ? (
                <div className="flex items-center justify-between border-t border-border/50 pt-1 text-muted-foreground">
                  <span>Summe USt. (rechnerisch)</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {formatCent(umsatzUstSummeCent)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
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

function UstChip({
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
