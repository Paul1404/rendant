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
import { Download } from "lucide-react";

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
  const { protokoll, ausgaben } = detail;
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold font-mono">
            {protokoll.belegnummer}
          </h1>
          <p className="text-sm text-neutral-600">
            Erstellt am {formatDateTimeDe(protokoll.erstellt_am)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isStorno ? (
            <Badge variant="destructive">storniert</Badge>
          ) : (
            <Badge variant="secondary">aktiv</Badge>
          )}
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

      {isStorno ? (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6 space-y-1">
            <p className="font-medium text-red-900">
              Storniert am{" "}
              {protokoll.storniert_am
                ? formatDateTimeDe(protokoll.storniert_am)
                : ""}
            </p>
            <p className="text-sm text-red-900">
              Grund: {protokoll.storno_grund}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kopfdaten</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <KV label="Anlass" value={protokoll.anlass} />
          <KV label="Datum" value={formatDateDe(protokoll.erstellt_am)} />
          <KV label="Gezaehlt von" value={protokoll.gezaehlt_von} />
          <KV label="Geprueft von" value={protokoll.geprueft_von} />
          {protokoll.bemerkung ? (
            <div className="sm:col-span-2">
              <KV label="Bemerkung" value={protokoll.bemerkung} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stueckelung</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wert</TableHead>
                <TableHead className="text-right">Anzahl</TableHead>
                <TableHead className="text-right">Einzelwert</TableHead>
                <TableHead className="text-right">Teilbetrag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DENOMINATIONS.map((d) => {
                const count = protokoll.counts[d.key];
                return (
                  <TableRow key={d.key}>
                    <TableCell className="font-mono">{d.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCent(d.cent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCent(count * d.cent)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Separator className="my-3" />
          <div className="text-sm flex flex-col gap-1">
            <SumRow label="Zwischensumme Scheine" cent={sumScheine} />
            <SumRow label="Zwischensumme Muenzen" cent={sumMuenzen} />
            <SumRow
              label="Gezaehlter Endbestand"
              cent={protokoll.gezaehlt_cent}
              bold
            />
          </div>
        </CardContent>
      </Card>

      {ausgaben.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Betriebliche Ausgaben</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Empfaenger</TableHead>
                  <TableHead>Beleg-Nr.</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ausgaben.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.bezeichnung}</TableCell>
                    <TableCell>{a.empfaenger || "-"}</TableCell>
                    <TableCell>{a.beleg_nr || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCent(a.betrag_cent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Separator className="my-3" />
            <SumRow
              label="Summe Ausgaben"
              cent={protokoll.ausgaben_cent}
              bold
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <SumRow
            label="Anfangsbestand (Wechselgeld)"
            cent={protokoll.wechselgeld_cent}
          />
          <SumRow
            label="Gezaehlter Endbestand"
            cent={protokoll.gezaehlt_cent}
          />
          <SumRow
            label="Betriebliche Ausgaben"
            cent={protokoll.ausgaben_cent}
          />
          <SumRow
            label="Kassenbestand brutto"
            cent={protokoll.bestand_cent}
            bold
          />
          <Separator className="my-2" />
          <SumRow
            label="Tageseinnahmen netto"
            cent={protokoll.tageseinnahmen_cent}
            highlight
          />
        </CardContent>
      </Card>

      {protokoll.pdf_sha256 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pruefsumme</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 font-mono break-all">
            <p>SHA256: {protokoll.pdf_sha256}</p>
            {protokoll.storno_pdf_sha256 ? (
              <p>Storno-SHA256: {protokoll.storno_pdf_sha256}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function SumRow({
  label,
  cent,
  bold,
  highlight,
}: {
  label: string;
  cent: number;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "flex justify-between items-center " +
        (highlight
          ? "text-base font-semibold"
          : bold
            ? "font-medium"
            : "text-sm")
      }
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatCent(cent)}</span>
    </div>
  );
}
