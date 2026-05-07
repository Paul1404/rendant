import { sql } from "@/lib/db";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import { ProtokollForm } from "@/components/protokoll-form";

export const dynamic = "force-dynamic";

export default async function NewProtokollPage() {
  const belegnummer = await previewNextBelegnummer(sql);
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-[11px] uppercase tracking-wider text-slate-500">
          Buchhaltung
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Neues Kassenzählprotokoll
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Belegnummer{" "}
          <span className="font-mono font-medium text-slate-700">
            {belegnummer}
          </span>{" "}
          wird beim Speichern vergeben.
        </p>
      </div>
      <ProtokollForm belegnummerPreview={belegnummer} />
    </div>
  );
}
