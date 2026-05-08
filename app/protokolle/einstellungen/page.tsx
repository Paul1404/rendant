import { PageHeader } from "@/components/page-header";
import { BelegnummerSettingsForm } from "@/components/belegnummer-settings-form";
import { getBelegnummerSettings } from "@/server/services/settings";
import { previewNextBelegnummer } from "@/server/services/belegnummer";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const [settings, preview] = await Promise.all([
    getBelegnummerSettings(),
    previewNextBelegnummer(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Einstellungen"
        title="Belegnummer-Format"
        description="Aussehen der Belegnummer für neue Protokolle. Wir empfehlen, das Format während eines Geschäftsjahres nicht mehr zu ändern – das Finanzamt verlangt eine Begründung für Format­wechsel mitten im Jahr."
      />
      <div className="mx-auto max-w-3xl">
        <BelegnummerSettingsForm initial={settings} serverPreview={preview} />
      </div>
    </div>
  );
}
