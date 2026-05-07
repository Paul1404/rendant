import Link from "next/link";
import { listProtokolle } from "@/server/services/protokoll";
import { formatDateDe } from "@/lib/date";
import { formatCent } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Download } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ storno?: string }>;

export default async function ProtokolleListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { storno } = await searchParams;
  const includeStorniert = storno === "true";
  const items = await listProtokolle({ includeStorniert });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            Buchhaltung
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Kassenzaehlprotokolle
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/protokolle/export">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </Link>
          <Link href="/protokolle/neu">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Neues Protokoll
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/protokolle"
            className={
              includeStorniert
                ? "text-slate-500 hover:text-slate-900"
                : "font-medium text-slate-900 underline underline-offset-4"
            }
          >
            Aktive
          </Link>
          <span className="h-3 w-px bg-slate-300" aria-hidden />
          <Link
            href="/protokolle?storno=true"
            className={
              includeStorniert
                ? "font-medium text-slate-900 underline underline-offset-4"
                : "text-slate-500 hover:text-slate-900"
            }
          >
            Mit stornierten
          </Link>
        </div>
        {items.length > 0 ? (
          <span className="tabular-nums text-slate-500">
            {items.length} {items.length === 1 ? "Eintrag" : "Eintraege"}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Noch keine Protokolle erfasst.
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Belegnummer</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Datum</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Anlass</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500 text-right">Tageseinnahmen</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.belegnummer}</TableCell>
                  <TableCell>{formatDateDe(p.erstellt_am)}</TableCell>
                  <TableCell>{p.anlass}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCent(p.tageseinnahmen_cent)}
                  </TableCell>
                  <TableCell>
                    {p.storniert_am ? (
                      <Badge variant="destructive">storniert</Badge>
                    ) : (
                      <Badge variant="secondary">aktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/protokolle/${p.id}`}
                      className="text-sm underline"
                    >
                      Anzeigen
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
