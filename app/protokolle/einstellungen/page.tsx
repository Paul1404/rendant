import { PageHeader } from "@/components/page-header";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { CashRegistersForm } from "@/components/cash-registers-form";
import { UmsatzUstBasisForm } from "@/components/umsatz-ust-basis-form";
import {
  getBelegnummerSettings,
  getUmsatzUstBasisDefault,
} from "@/server/services/settings";
import { listCashRegisters } from "@/server/services/cash-registers";
import { previewNextBelegnummer } from "@/server/services/belegnummer";

export const dynamic = "force-dynamic";

type SectionHeadingProps = {
  title: string;
  description: React.ReactNode;
};

function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function EinstellungenPage() {
  const [settings, preview, umsatzUstBasis, registers] = await Promise.all([
    getBelegnummerSettings(),
    previewNextBelegnummer(),
    getUmsatzUstBasisDefault(),
    listCashRegisters(),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Buchhaltung"
        title="Einstellungen"
        description="Vorlagen und Standardwerte für die Kassenzählprotokolle – Kassen, Belegnummer-Format und USt.-Aufteilung."
      />

      <section className="space-y-4">
        <SectionHeading
          title="Kassen"
          description="Vorlagen für Kassennummer, Kassenbezeichnung und Anfangsbestand (Wechselgeld). Beim Erfassen eines Protokolls lassen sich diese Werte mit einem Klick übernehmen."
        />
        <div className="mx-auto max-w-3xl">
          <CashRegistersForm initial={registers} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Belegnummer-Format"
          description="Aussehen der Belegnummer für neue Protokolle. Wir empfehlen, das Format während eines Geschäftsjahres nicht mehr zu ändern – das Finanzamt verlangt eine Begründung für Format­wechsel mitten im Jahr."
        />
        <div className="mx-auto max-w-3xl">
          <BelegnummerSettingsForm initial={settings} serverPreview={preview} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="USt.-Aufteilung"
          description="Standard, ob die Aufteilung des Umsatzes nach USt.-Sätzen auf die Tageseinnahmen vor oder nach Kartenzahlung bezogen wird."
        />
        <div className="mx-auto max-w-3xl">
          <UmsatzUstBasisForm initial={umsatzUstBasis} />
        </div>
      </section>
    </div>
  );
}
