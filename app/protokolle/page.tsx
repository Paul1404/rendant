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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Kassenzaehlprotokolle</h1>
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

      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/protokolle"
          className={
            includeStorniert
              ? "text-neutral-500 hover:underline"
              : "font-medium underline"
          }
        >
          Aktive
        </Link>
        <span className="text-neutral-400">|</span>
        <Link
          href="/protokolle?storno=true"
          className={
            includeStorniert
              ? "font-medium underline"
              : "text-neutral-500 hover:underline"
          }
        >
          Mit stornierten
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-neutral-500">
          Noch keine Protokolle erfasst.
        </div>
      ) : (
        <div className="rounded-md border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Belegnummer</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Anlass</TableHead>
                <TableHead className="text-right">Tageseinnahmen</TableHead>
                <TableHead>Status</TableHead>
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
