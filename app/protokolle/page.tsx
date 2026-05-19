import Link from "next/link";
import { listProtokolle } from "@/server/services/protokoll";
import { Button } from "@/components/ui/button";
import { Download, Plus, Receipt, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DashboardStatsRow } from "@/components/dashboard-stats";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { ProtokollList } from "@/components/protokoll-list";
import { formatCent } from "@/lib/money";
import {
  computeDashboardStats,
  filterByRange,
  filterBySearch,
  parseTimeRange,
} from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  storno?: string;
  q?: string;
  range?: string;
}>;

export default async function ProtokolleListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { storno, q, range } = await searchParams;
  const includeStorniert = storno === "true";
  const timeRange = parseTimeRange(range);
  const query = (q ?? "").trim();

  const all = await listProtokolle({ includeStorniert: true });
  const stats = computeDashboardStats(all);

  const visibleScope = includeStorniert
    ? all
    : all.filter((p) => !p.storniert_am);
  const ranged = filterByRange(visibleScope, timeRange);
  const items = filterBySearch(ranged, query);

  const hasAnyData = all.length > 0;
  const hasFilters = !!query || timeRange !== "all" || includeStorniert;
  const visibleSumCent = items
    .filter((p) => !p.storniert_am)
    .reduce((s, p) => s + p.tageseinnahmen_cent, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Buchhaltung"
        title="Kassenzählprotokolle"
        description="Übersicht der erfassten Belege. Neue Protokolle anlegen oder CSV für den Steuerberater exportieren."
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

      {hasAnyData ? <DashboardStatsRow stats={stats} /> : null}

      {hasAnyData ? (
        <div className="space-y-4">
          <DashboardToolbar
            initialQuery={query}
            initialRange={timeRange}
            includeStorniert={includeStorniert}
          />

          <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
            <span>
              {items.length === 0
                ? "Keine Treffer"
                : `${items.length} ${items.length === 1 ? "Eintrag" : "Einträge"}`}
              {items.length > 0 ? (
                <>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="font-mono tabular-nums">
                    Summe aktiv: {formatCent(visibleSumCent)}
                  </span>
                </>
              ) : null}
            </span>
            {hasFilters ? (
              <Link
                href="/protokolle"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Filter zurücksetzen
              </Link>
            ) : null}
          </div>

          {items.length === 0 ? (
            <NoResults hasFilters={hasFilters} />
          ) : (
            <ProtokollList items={items} />
          )}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Receipt className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Noch keine Protokolle
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Lege das erste Kassenzählprotokoll an, um Kassenbestand und
        Tageseinnahmen zu erfassen.
      </p>
      <Link href="/protokolle/neu" className="mt-2">
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Neues Protokoll
        </Button>
      </Link>
    </div>
  );
}

function NoResults({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">Keine Treffer</h3>
      <p className="max-w-sm text-xs text-muted-foreground">
        {hasFilters
          ? "Mit den aktuellen Filtern wurden keine Belege gefunden."
          : "Es sind keine Belege vorhanden."}
      </p>
      {hasFilters ? (
        <Link href="/protokolle" className="mt-1">
          <Button variant="outline" size="sm">
            Filter zurücksetzen
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
