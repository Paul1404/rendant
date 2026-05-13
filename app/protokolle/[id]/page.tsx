import { notFound } from "next/navigation";
import { getProtokoll } from "@/server/services/protokoll";
import { formatCent } from "@/lib/money";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";
import { DENOMINATIONS } from "@/lib/denominations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { StornoDialog } from "@/components/storno-dialog";
import { RegeneratePdfButton } from "@/components/regenerate-pdf-button";
import {
  ArrowLeft,
  Banknote,
  Calculator,
  Coins,
  Copy,
  Download,
  FileText,
  Fingerprint,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  formatUstSatz as formatUstSatzLib,
  groupByUstRate,
  hasUstBreakdown,
  ustAnteilCent,
} from "@/lib/ust";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ProtokollDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const detail = await getProtokoll(id);
  if (!detail) notFound();
  const { protokoll, ausgaben, umsatzUst } = detail;
  const sumScheine = DENOMINATIONS.filter((d) => d.kind === "schein").reduce(
    (s, d) => s + protokoll.counts[d.key] * d.cent,
    0,
  );
  const sumMuenzen = DENOMINATIONS.filter((d) => d.kind === "muenze").reduce(
    (s, d) => s + protokoll.counts[d.key] * d.cent,
    0,
  );
  const isStorno = !!protokoll.storniert_am;

  return (
    <div className="space-y-6">
      <Link
        href="/protokolle"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Übersicht
      </Link>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-card/70 px-5 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_18px_-8px_rgba(0,0,0,0.06)] ring-1 ring-foreground/[0.03] sm:px-7 sm:py-7",
          isStorno ? "border-destructive/30" : "border-border/70",
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl",
            isStorno
              ? "bg-gradient-to-br from-destructive/12 to-transparent"
              : "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent",
          )}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/90">
              Beleg
            </p>
            <h1 className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-foreground">
              {protokoll.belegnummer}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Erstellt am {formatDateTimeDe(protokoll.erstellt_am)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isStorno ? (
              <Badge variant="destructive">storniert</Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                aktiv
              </span>
            )}
            <RegeneratePdfButton protokollId={protokoll.id} />
            <Link href={`/protokolle/neu?duplicate=${protokoll.id}`}>
              <Button variant="outline" size="sm">
                <Copy className="mr-2 h-4 w-4" />
                Wie dieses
              </Button>
            </Link>
            <a href={`/api/protokolle/${protokoll.id}/pdf`}>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
            </a>
            {isStorno && protokoll.storno_pdf_s3_key ? (
              <a href={`/api/protokolle/${protokoll.id}/storno-pdf`}>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Storno-PDF
                </Button>
              </a>
            ) : null}
            {!isStorno ? <StornoDialog protokollId={protokoll.id} /> : null}
          </div>
        </div>
      </div>

      {isStorno ? (
        <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <TriangleAlert className="h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              Storniert am{" "}
              {protokoll.storniert_am
                ? formatDateTimeDe(protokoll.storniert_am)
                : ""}
            </p>
            <p className="text-sm text-destructive/90">
              Grund: {protokoll.storno_grund}
            </p>
          </div>
        </div>
      ) : null}

      {!protokoll.pdf_s3_key ? (
        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              PDF wurde noch nicht erzeugt
            </p>
            <p className="text-sm text-amber-700/90 dark:text-amber-300/90">
              Die Daten sind gespeichert, aber das PDF konnte beim Anlegen
              nicht erzeugt werden. Über &bdquo;PDF neu erzeugen&ldquo; oben
              kannst du es jetzt nachholen.
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Kopfdaten
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          {protokoll.kassennummer ? (
            <KV
              label="Kassennummer"
              value={protokoll.kassennummer}
              mono
            />
          ) : null}
          {protokoll.kassenbezeichnung ? (
            <KV
              label="Kassenbezeichnung"
              value={protokoll.kassenbezeichnung}
            />
          ) : null}
          <KV label="Anlass" value={protokoll.anlass} />
          <KV label="Datum" value={formatDateDe(protokoll.anlass_datum)} />
          <KV label="Gezählt von" value={protokoll.gezaehlt_von} />
          <KV label="Geprüft von" value={protokoll.geprueft_von} />
          {protokoll.bemerkung ? (
            <div className="sm:col-span-2">
              <KV label="Bemerkung" value={protokoll.bemerkung} />
            </div>
          ) : null}
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
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Wert
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                    Anzahl
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                    Einzelwert
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                    Teilbetrag
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DENOMINATIONS.map((d) => {
                  const count = protokoll.counts[d.key];
                  const isZero = count === 0;
                  return (
                    <TableRow
                      key={d.key}
                      className={isZero ? "text-muted-foreground/70" : ""}
                    >
                      <TableCell className="font-mono">{d.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCent(d.cent)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {isZero ? "—" : formatCent(count * d.cent)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col gap-1 text-sm">
            <SumRow label="Zwischensumme Scheine" cent={sumScheine} />
            <SumRow label="Zwischensumme Münzen" cent={sumMuenzen} />
            <SumRow
              label="Gezählter Endbestand"
              cent={protokoll.gezaehlt_cent}
              bold
            />
          </div>
        </CardContent>
      </Card>

      {ausgaben.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" />
              Betriebliche Ausgaben
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Bezeichnung
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Empfänger
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Beleg-Nr.
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                      USt.
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                      Betrag
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ausgaben.map((a) => {
                    const bp = a.ust_basis_punkte ?? 0;
                    const ust = ustAnteilCent(a.betrag_cent, bp);
                    return (
                      <TableRow key={a.id}>
                        <TableCell>{a.bezeichnung}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.empfaenger || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {a.beleg_nr || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {bp === 0 ? "—" : formatUstSatzLib(bp)}
                          {bp > 0 ? (
                            <span className="ml-1 text-[10px] text-muted-foreground/70">
                              ({formatCent(ust)})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatCent(a.betrag_cent)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Separator className="my-3" />
            <SumRow
              label="Summe Ausgaben"
              cent={protokoll.ausgaben_cent}
              bold
            />
            <UstBreakdown ausgaben={ausgaben} bruttoCent={protokoll.ausgaben_cent} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Zusammenfassung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <SumRow
            label="Anfangsbestand (Wechselgeld)"
            cent={protokoll.wechselgeld_cent}
          />
          <SumRow label="Gezählter Endbestand" cent={protokoll.gezaehlt_cent} />
          <SumRow
            label="Betriebliche Ausgaben"
            cent={protokoll.ausgaben_cent}
          />
          <SumRow
            label="Kassenbestand brutto"
            cent={protokoll.bestand_cent}
            bold
          />
          {protokoll.kartenzahlung_cent > 0 ? (
            <SumRow
              label="Kartenzahlung"
              cent={protokoll.kartenzahlung_cent}
            />
          ) : null}
          <Separator className="my-3" />
          {protokoll.kartenzahlung_cent > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  Tageseinnahmen netto (ohne Kartenzahlung)
                </span>
                <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                  {formatCent(protokoll.tageseinnahmen_cent)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Banknote className="h-4 w-4 text-primary" />
                  Tageseinnahmen netto (mit Kartenzahlung)
                </span>
                <span className="font-mono text-base font-semibold tabular-nums text-primary">
                  {formatCent(
                    protokoll.tageseinnahmen_cent +
                      protokoll.kartenzahlung_cent,
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Banknote className="h-4 w-4 text-primary" />
                Tageseinnahmen netto
              </span>
              <span className="font-mono text-base font-semibold tabular-nums text-primary">
                {formatCent(protokoll.tageseinnahmen_cent)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {umsatzUst.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Umsatz nach USt.
              {protokoll.kartenzahlung_cent > 0 ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {protokoll.umsatz_ust_basis === "pre_card"
                    ? "(ohne Kartenzahlung)"
                    : "(inkl. Kartenzahlung)"}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UmsatzUstBreakdown splits={umsatzUst} />
          </CardContent>
        </Card>
      ) : null}

      {protokoll.pdf_sha256 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              Prüfsumme
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 break-all font-mono text-xs text-muted-foreground">
            <p>
              <span className="mr-1 text-foreground">SHA256:</span>
              {protokoll.pdf_sha256}
            </p>
            {protokoll.storno_pdf_sha256 ? (
              <p>
                <span className="mr-1 text-foreground">Storno-SHA256:</span>
                {protokoll.storno_pdf_sha256}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function UstBreakdown({
  ausgaben,
  bruttoCent,
}: {
  ausgaben: Array<{ betrag_cent: number; ust_basis_punkte: number }>;
  bruttoCent: number;
}) {
  const groups = groupByUstRate(ausgaben);
  if (!hasUstBreakdown(groups)) return null;
  const totalNetto = groups.reduce((s, g) => s + g.netto_cent, 0);
  const totalUst = groups.reduce((s, g) => s + g.ust_cent, 0);
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        USt.-Aufgliederung
      </p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Satz
              </th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Netto
              </th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                USt.
              </th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Brutto
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.bp} className="border-t border-border/60">
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {formatUstSatzLib(g.bp)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatCent(g.netto_cent)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {g.ust_cent === 0 ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    formatCent(g.ust_cent)
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatCent(g.brutto_cent)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-foreground/20 font-medium">
              <td className="px-3 py-1.5">Summe</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {formatCent(totalNetto)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {formatCent(totalUst)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {formatCent(bruttoCent)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UmsatzUstBreakdown({
  splits,
}: {
  splits: Array<{ ust_basis_punkte: number; betrag_cent: number }>;
}) {
  const groups = groupByUstRate(splits);
  const totalNetto = groups.reduce((s, g) => s + g.netto_cent, 0);
  const totalUst = groups.reduce((s, g) => s + g.ust_cent, 0);
  const totalBrutto = groups.reduce((s, g) => s + g.brutto_cent, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Satz
            </th>
            <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Netto
            </th>
            <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              USt.
            </th>
            <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Brutto
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.bp} className="border-t border-border/60">
              <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                {formatUstSatzLib(g.bp)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {formatCent(g.netto_cent)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {g.ust_cent === 0 ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : (
                  formatCent(g.ust_cent)
                )}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {formatCent(g.brutto_cent)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-foreground/20 font-medium">
            <td className="px-3 py-1.5">Summe</td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
              {formatCent(totalNetto)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
              {formatCent(totalUst)}
            </td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
              {formatCent(totalBrutto)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 whitespace-pre-wrap text-sm text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SumRow({
  label,
  cent,
  bold,
}: {
  label: string;
  cent: number;
  bold?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1",
        bold ? "font-medium" : "text-sm text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums text-foreground">
        {formatCent(cent)}
      </span>
    </div>
  );
}
