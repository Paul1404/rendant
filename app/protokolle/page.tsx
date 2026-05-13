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
import { ArrowUpRight, Plus, Download, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

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

  const aktiveCount = items.filter((p) => !p.storniert_am).length;
  const sumAktiv = items
    .filter((p) => !p.storniert_am)
    .reduce((s, p) => s + p.tageseinnahmen_cent, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Buchhaltung"
        title="Kassenzählprotokolle"
        description="Übersicht aller erfassten Kassenzählprotokolle. Für die Erstellung neuer Belege oder den CSV-Export für den Steuerberater."
        actions={
          <>
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
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Aktive Belege"
          value={String(aktiveCount)}
          hint={
            includeStorniert
              ? `${items.length - aktiveCount} storniert ausgeblendet`
              : "im aktuellen Filter"
          }
        />
        <StatCard
          label="Summe Tageseinnahmen"
          value={formatCent(sumAktiv)}
          hint="netto, ohne Stornos"
          mono
        />
        <StatCard
          label="Filter"
          value={includeStorniert ? "Alle Belege" : "Nur aktive"}
          hint={
            includeStorniert
              ? "inkl. stornierter Belege"
              : "stornierte ausgeblendet"
          }
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="inline-flex items-center gap-0 rounded-lg border border-border bg-background/60 p-0.5 shadow-sm">
          <FilterTab href="/protokolle" active={!includeStorniert}>
            Aktive
          </FilterTab>
          <FilterTab href="/protokolle?storno=true" active={includeStorniert}>
            Mit stornierten
          </FilterTab>
        </div>
        {items.length > 0 ? (
          <span className="tabular-nums text-muted-foreground">
            {items.length} {items.length === 1 ? "Eintrag" : "Einträge"}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Receipt className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Noch keine Protokolle
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Lege das erste Kassenzählprotokoll an, um den Kassenbestand und die
            Tageseinnahmen zu erfassen.
          </p>
          <Link href="/protokolle/neu" className="mt-2">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Neues Protokoll
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm ring-1 ring-foreground/5">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Belegnummer
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Datum
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Anlass
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  Tageseinnahmen
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow
                  key={p.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <TableCell className="font-mono text-sm font-medium">
                    {p.belegnummer}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateDe(p.anlass_datum)}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-sm">
                    {p.anlass}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCent(p.tageseinnahmen_cent)}
                  </TableCell>
                  <TableCell>
                    {p.storniert_am ? (
                      <Badge variant="destructive">storniert</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        aktiv
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/protokolle/${p.id}`}
                      className="inline-flex items-center gap-1 text-sm text-primary opacity-70 transition group-hover:opacity-100 hover:underline"
                    >
                      Anzeigen
                      <ArrowUpRight className="h-3.5 w-3.5" />
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

function StatCard({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 shadow-sm ring-1 ring-foreground/5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
