import Link from "next/link";
import { Settings, Wallet } from "lucide-react";
import { sql } from "@/lib/db";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { getUmsatzUstBasisDefault } from "@/server/services/settings";
import { listCashRegisters } from "@/server/services/cash-registers";
import { getProtokoll } from "@/server/services/protokoll";
import {
  ProtokollForm,
  type ProtokollInitialValues,
} from "@/components/protokoll-form";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ duplicate?: string }>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewProtokollPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { duplicate } = await searchParams;
  const dupId = duplicate && UUID_RE.test(duplicate) ? duplicate : null;

  const [belegnummer, umsatzUstBasisDefault, registers, duplicateSource] =
    await Promise.all([
      previewNextBelegnummer(sql),
      getUmsatzUstBasisDefault(),
      listCashRegisters(),
      dupId ? getProtokoll(dupId) : Promise.resolve(null),
    ]);

  const initialValues: ProtokollInitialValues | undefined = duplicateSource
    ? {
        kassennummer: duplicateSource.protokoll.kassennummer || undefined,
        kassenbezeichnung:
          duplicateSource.protokoll.kassenbezeichnung || undefined,
        anlass: duplicateSource.protokoll.anlass || undefined,
        gezaehlt_von: duplicateSource.protokoll.gezaehlt_von || undefined,
        geprueft_von: duplicateSource.protokoll.geprueft_von || undefined,
        wechselgeld_cent: duplicateSource.protokoll.wechselgeld_cent,
        umsatz_ust_basis: duplicateSource.protokoll.umsatz_ust_basis,
      }
    : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Buchhaltung"
        title="Neues Kassenzählprotokoll"
        description={
          <>
            Vorgeschlagene Belegnummer{" "}
            <span className="font-mono font-medium text-foreground">
              {belegnummer}
            </span>
            . Bei Bedarf anpassbar.
          </>
        }
      />

      {duplicateSource ? (
        <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Wallet className="h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Kopfdaten aus Beleg{" "}
              <span className="font-mono">
                {duplicateSource.protokoll.belegnummer}
              </span>{" "}
              übernommen
            </p>
            <p className="text-sm text-muted-foreground">
              Kassennummer, Kassenbezeichnung, Anlass, Wechselgeld und Namen
              sind vorausgefüllt. Stückelung, Ausgaben und USt.-Aufteilung
              bitte für diesen Tag neu erfassen.
            </p>
          </div>
        </div>
      ) : null}

      {registers.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Tipp: Kassen anlegen
              </p>
              <p className="text-sm text-muted-foreground">
                Lege deine Kassen einmalig an, um Kassennummer, Bezeichnung
                und Wechselgeld künftig mit einem Klick zu übernehmen.
              </p>
            </div>
          </div>
          <Link
            href="/protokolle/einstellungen"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" />
            Einstellungen öffnen
          </Link>
        </div>
      ) : null}

      <ProtokollForm
        belegnummerPreview={belegnummer}
        umsatzUstBasisDefault={umsatzUstBasisDefault}
        registers={registers}
        initialValues={initialValues}
      />
    </div>
  );
}
