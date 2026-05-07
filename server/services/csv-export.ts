import { sql } from "@/lib/db";
import { formatCentPlain } from "@/lib/money";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";

const HEADERS = [
  "Belegnummer",
  "Datum",
  "Anlass",
  "Gezaehlt von",
  "Geprueft von",
  "Wechselgeld EUR",
  "Gezaehlt EUR",
  "Ausgaben EUR",
  "Bestand EUR",
  "Tageseinnahmen EUR",
  "Status",
  "Storniert am",
  "Storno-Grund",
  "Bemerkung",
];

function escapeCsv(value: string): string {
  const needsQuoting = /[;"\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export async function exportCsv(von: string, bis: string): Promise<string> {
  const rows = await sql<
    {
      belegnummer: string;
      erstellt_am: Date;
      anlass: string;
      gezaehlt_von: string;
      geprueft_von: string;
      bemerkung: string;
      wechselgeld_cent: number;
      gezaehlt_cent: number;
      ausgaben_cent: number;
      bestand_cent: number;
      tageseinnahmen_cent: number;
      storniert_am: Date | null;
      storno_grund: string | null;
    }[]
  >`
    SELECT belegnummer, erstellt_am, anlass, gezaehlt_von, geprueft_von,
           bemerkung, wechselgeld_cent, gezaehlt_cent, ausgaben_cent,
           bestand_cent, tageseinnahmen_cent, storniert_am, storno_grund
    FROM protokolle
    WHERE erstellt_am::date >= ${von}::date
      AND erstellt_am::date <= ${bis}::date
    ORDER BY belegnummer ASC
  `;

  const lines: string[] = [HEADERS.join(";")];
  for (const r of rows) {
    const status = r.storniert_am ? "storniert" : "aktiv";
    const cells = [
      r.belegnummer,
      formatDateDe(r.erstellt_am),
      r.anlass,
      r.gezaehlt_von,
      r.geprueft_von,
      formatCentPlain(Number(r.wechselgeld_cent)),
      formatCentPlain(Number(r.gezaehlt_cent)),
      formatCentPlain(Number(r.ausgaben_cent)),
      formatCentPlain(Number(r.bestand_cent)),
      formatCentPlain(Number(r.tageseinnahmen_cent)),
      status,
      r.storniert_am ? formatDateTimeDe(r.storniert_am) : "",
      r.storno_grund ?? "",
      r.bemerkung,
    ];
    lines.push(cells.map(escapeCsv).join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
