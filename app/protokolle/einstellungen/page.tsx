import { PageHeader } from "@/components/page-header";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { UmsatzUstBasisForm } from "@/components/umsatz-ust-basis-form";
import {
  getBelegnummerSettings,
  getUmsatzUstBasisDefault,
} from "@/server/services/settings";
import { previewNextBelegnummer } from "@/server/services/belegnummer";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const [settings, preview, umsatzUstBasis] = await Promise.all([
    getBelegnummerSettings(),
    previewNextBelegnummer(),
    getUmsatzUstBasisDefault(),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <PageHeader
          eyebrow="Einstellungen"
          title="Belegnummer-Format"
          description="Aussehen der Belegnummer für neue Protokolle. Wir empfehlen, das Format während eines Geschäftsjahres nicht mehr zu ändern – das Finanzamt verlangt eine Begründung für Format­wechsel mitten im Jahr."
        />
        <div className="mx-auto max-w-3xl">
          <BelegnummerSettingsForm initial={settings} serverPreview={preview} />
        </div>
      </section>

      <section className="space-y-6">
        <PageHeader
          eyebrow="Einstellungen"
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
