import { sql } from "@/lib/db";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { ProtokollForm } from "@/components/protokoll-form";

export const dynamic = "force-dynamic";

export default async function NewProtokollPage() {
  const belegnummer = await previewNextBelegnummer(sql);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Neues Kassenzaehlprotokoll</h1>
      <ProtokollForm belegnummerPreview={belegnummer} />
    </div>
  );
}
