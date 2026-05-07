import { ExportForm } from "@/components/export-form";

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-[11px] uppercase tracking-wider text-slate-500">
          Buchhaltung
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          CSV-Export
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Export aller Protokolle eines Zeitraums für Steuerberater oder
          DATEV. Trenner ist Semikolon, Betraege mit Dezimalkomma.
        </p>
      </div>
      <ExportForm />
    </div>
  );
}
