import { sql } from "@/lib/db";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { ProtokollForm } from "@/components/protokoll-form";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function NewProtokollPage() {
  const belegnummer = await previewNextBelegnummer(sql);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Buchhaltung"
        title="Neues Kassenzählprotokoll"
        description={
          <>
            Belegnummer{" "}
            <span className="font-mono font-medium text-foreground">
              {belegnummer}
            </span>{" "}
            wird beim Speichern vergeben.
          </>
        }
      />
      <ProtokollForm belegnummerPreview={belegnummer} />
    </div>
  );
}
