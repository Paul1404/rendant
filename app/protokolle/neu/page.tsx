import { sql } from "@/lib/db";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { getUmsatzUstBasisDefault } from "@/server/services/settings";
import { listCashRegisters } from "@/server/services/cash-registers";
import { ProtokollForm } from "@/components/protokoll-form";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function NewProtokollPage() {
  const [belegnummer, umsatzUstBasisDefault, registers] = await Promise.all([
    previewNextBelegnummer(sql),
    getUmsatzUstBasisDefault(),
    listCashRegisters(),
  ]);
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
      <ProtokollForm
        belegnummerPreview={belegnummer}
        umsatzUstBasisDefault={umsatzUstBasisDefault}
        registers={registers}
      />
    </div>
  );
}
