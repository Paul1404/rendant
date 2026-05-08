import { sql } from "@/lib/db";
import { formatCentPlain } from "@/lib/money";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";

const HEADERS = [
  "Belegnummer",
  "Datum",
  "Kassennummer",
  "Kassenbezeichnung",
  "Anlass",
  "Gezählt von",
  "Geprüft von",
  "Wechselgeld EUR",
  "Gezählt EUR",
  "Ausgaben EUR",
  "MwSt EUR",
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

function mwstAnteilCent(bruttoCent: number, bp: number): number {
  if (bp <= 0) return 0;
  const netCent = Math.round((bruttoCent * 10000) / (10000 + bp));
  return bruttoCent - netCent;
}

export async function exportCsv(von: string, bis: string): Promise<string> {
  const rows = await sql<
    {
      id: string;
      belegnummer: string;
      erstellt_am: Date;
      kassennummer: string;
      kassenbezeichnung: string;
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
    SELECT id, belegnummer, erstellt_am, kassennummer, kassenbezeichnung,
           anlass, gezaehlt_von, geprueft_von,
           bemerkung, wechselgeld_cent, gezaehlt_cent, ausgaben_cent,
           bestand_cent, tageseinnahmen_cent, storniert_am, storno_grund
    FROM protokolle
    WHERE erstellt_am::date >= ${von}::date
      AND erstellt_am::date <= ${bis}::date
    ORDER BY belegnummer ASC
  `;

  const ids = rows.map((r) => r.id);
  const ausgabenRows = ids.length
    ? await sql<
        {
          protokoll_id: string;
          betrag_cent: number;
          mwst_basis_punkte: number;
        }[]
      >`
        SELECT protokoll_id, betrag_cent, mwst_basis_punkte
        FROM ausgaben
        WHERE protokoll_id IN ${sql(ids)}
      `
    : [];

  const mwstByProto = new Map<string, number>();
  for (const a of ausgabenRows) {
    const prev = mwstByProto.get(a.protokoll_id) ?? 0;
    mwstByProto.set(
      a.protokoll_id,
      prev + mwstAnteilCent(Number(a.betrag_cent), Number(a.mwst_basis_punkte)),
    );
  }

  const lines: string[] = [HEADERS.join(";")];
  for (const r of rows) {
    const status = r.storniert_am ? "storniert" : "aktiv";
    const mwst = mwstByProto.get(r.id) ?? 0;
    const cells = [
      r.belegnummer,
      formatDateDe(r.erstellt_am),
      r.kassennummer,
      r.kassenbezeichnung,
      r.anlass,
      r.gezaehlt_von,
      r.geprueft_von,
      formatCentPlain(Number(r.wechselgeld_cent)),
      formatCentPlain(Number(r.gezaehlt_cent)),
      formatCentPlain(Number(r.ausgaben_cent)),
      formatCentPlain(mwst),
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
