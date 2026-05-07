import { ExportForm } from "@/components/export-form";

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">CSV-Export</h1>
        <p className="text-sm text-slate-600 mt-1">
          Export aller Protokolle eines Zeitraums fuer Steuerberater oder
          DATEV. Trenner ist Semikolon, Betraege mit Dezimalkomma.
        </p>
      </div>
      <ExportForm />
    </div>
  );
}
