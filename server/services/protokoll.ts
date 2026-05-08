import { sql } from "@/lib/db";
import { DENOMINATIONS, type DenominationCounts } from "@/lib/denominations";
import { S3_PREFIX } from "@/lib/constants";
import { formatFilenameStamp } from "@/lib/date";
import { nextBelegnummerInTx } from "@/server/services/belegnummer";
import { renderProtokollPdf } from "@/server/services/pdf";
import { uploadPdf, deletePdf } from "@/server/services/s3";
import type {
  CreateProtokollInput,
  StornoInput,
} from "@/server/schemas";

export type AusgabeRow = {
  id: string;
  bezeichnung: string;
  empfaenger: string;
  beleg_nr: string;
  betrag_cent: number;
  mwst_basis_punkte: number;
  reihenfolge: number;
};

export type ProtokollRow = {
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
  pdf_s3_key: string | null;
  pdf_sha256: string | null;
  storniert_am: Date | null;
  storno_grund: string | null;
  storno_pdf_s3_key: string | null;
  storno_pdf_sha256: string | null;
  counts: DenominationCounts;
};

const COUNT_COLS = DENOMINATIONS.map((d) => d.key);

function rowToProtokoll(row: Record<string, unknown>): ProtokollRow {
  const counts = {} as DenominationCounts;
  for (const key of COUNT_COLS) {
    counts[key] = Number(row[key] ?? 0);
  }
  return {
    id: row.id as string,
    belegnummer: row.belegnummer as string,
    erstellt_am: row.erstellt_am as Date,
    kassennummer: (row.kassennummer as string) ?? "",
    kassenbezeichnung: (row.kassenbezeichnung as string) ?? "",
    anlass: row.anlass as string,
    gezaehlt_von: row.gezaehlt_von as string,
    geprueft_von: row.geprueft_von as string,
    bemerkung: row.bemerkung as string,
    wechselgeld_cent: Number(row.wechselgeld_cent),
    gezaehlt_cent: Number(row.gezaehlt_cent),
    ausgaben_cent: Number(row.ausgaben_cent),
    bestand_cent: Number(row.bestand_cent),
    tageseinnahmen_cent: Number(row.tageseinnahmen_cent),
    pdf_s3_key: (row.pdf_s3_key as string | null) ?? null,
    pdf_sha256: (row.pdf_sha256 as string | null) ?? null,
    storniert_am: (row.storniert_am as Date | null) ?? null,
    storno_grund: (row.storno_grund as string | null) ?? null,
    storno_pdf_s3_key: (row.storno_pdf_s3_key as string | null) ?? null,
    storno_pdf_sha256: (row.storno_pdf_sha256 as string | null) ?? null,
    counts,
  };
}

function pdfKey(belegnummer: string, suffix: "" | "_STORNO"): string {
  return `${S3_PREFIX}/${belegnummer}${suffix}_${formatFilenameStamp(new Date())}.pdf`;
}

export async function listProtokolle(opts: {
  includeStorniert: boolean;
}): Promise<ProtokollRow[]> {
  const rows = opts.includeStorniert
    ? await sql`SELECT * FROM protokolle ORDER BY erstellt_am DESC`
    : await sql`SELECT * FROM protokolle WHERE storniert_am IS NULL ORDER BY erstellt_am DESC`;
  return rows.map(rowToProtokoll);
}

export async function getProtokoll(
  id: string,
): Promise<{ protokoll: ProtokollRow; ausgaben: AusgabeRow[] } | null> {
  const protoRows = await sql`SELECT * FROM protokolle WHERE id = ${id}`;
  if (protoRows.length === 0) return null;
  const ausgabenRows = await sql<AusgabeRow[]>`
    SELECT id, bezeichnung, empfaenger, beleg_nr, betrag_cent,
           mwst_basis_punkte, reihenfolge
    FROM ausgaben
    WHERE protokoll_id = ${id}
    ORDER BY reihenfolge ASC, id ASC
  `;
  return {
    protokoll: rowToProtokoll(protoRows[0] as Record<string, unknown>),
    ausgaben: ausgabenRows.map((a) => ({
      ...a,
      betrag_cent: Number(a.betrag_cent),
      mwst_basis_punkte: Number(a.mwst_basis_punkte ?? 0),
    })),
  };
}

export type CreateResult = { id: string; belegnummer: string };

export async function createProtokoll(
  input: CreateProtokollInput,
): Promise<CreateResult> {
  const counts: DenominationCounts = {} as DenominationCounts;
  let gezaehlt_cent = 0;
  for (const d of DENOMINATIONS) {
    const v = (input as unknown as Record<string, number>)[d.key] ?? 0;
    counts[d.key] = v;
    gezaehlt_cent += v * d.cent;
  }
  const ausgaben_cent = input.ausgaben.reduce((s, a) => s + a.betrag_cent, 0);
  const bestand_cent = gezaehlt_cent + ausgaben_cent;
  const tageseinnahmen_cent = bestand_cent - input.wechselgeld_cent;

  const year = new Date().getFullYear();
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const result = await sql.begin(async (tx) => {
        const belegnummer = await nextBelegnummerInTx(tx, year);
        const insertCols: Record<string, unknown> = {
          belegnummer,
          kassennummer: input.kassennummer,
          kassenbezeichnung: input.kassenbezeichnung,
          anlass: input.anlass,
          gezaehlt_von: input.gezaehlt_von,
          geprueft_von: input.geprueft_von,
          bemerkung: input.bemerkung,
          wechselgeld_cent: input.wechselgeld_cent,
          gezaehlt_cent,
          ausgaben_cent,
          bestand_cent,
          tageseinnahmen_cent,
        };
        for (const d of DENOMINATIONS) insertCols[d.key] = counts[d.key];
        const protoRows = await tx`
          INSERT INTO protokolle ${tx(insertCols)}
          RETURNING id, belegnummer, erstellt_am
        `;
        const proto = protoRows[0] as {
          id: string;
          belegnummer: string;
          erstellt_am: Date;
        };
        if (input.ausgaben.length > 0) {
          const rows = input.ausgaben.map((a, i) => ({
            protokoll_id: proto.id,
            bezeichnung: a.bezeichnung,
            empfaenger: a.empfaenger,
            beleg_nr: a.beleg_nr,
            betrag_cent: a.betrag_cent,
            mwst_basis_punkte: a.mwst_basis_punkte,
            reihenfolge: i,
          }));
          await tx`INSERT INTO ausgaben ${tx(rows)}`;
        }
        return proto;
      });

      const { buffer, hash } = await renderProtokollPdf({
        belegnummer: result.belegnummer,
        erstellt_am: result.erstellt_am,
        kassennummer: input.kassennummer,
        kassenbezeichnung: input.kassenbezeichnung,
        anlass: input.anlass,
        gezaehlt_von: input.gezaehlt_von,
        geprueft_von: input.geprueft_von,
        bemerkung: input.bemerkung,
        counts,
        wechselgeld_cent: input.wechselgeld_cent,
        gezaehlt_cent,
        ausgaben_cent,
        bestand_cent,
        tageseinnahmen_cent,
        ausgaben: input.ausgaben,
      });
      const key = pdfKey(result.belegnummer, "");
      await uploadPdf(key, buffer);
      await sql`
        UPDATE protokolle
        SET pdf_s3_key = ${key}, pdf_sha256 = ${hash}
        WHERE id = ${result.id}
      `;

      return { id: result.id, belegnummer: result.belegnummer };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "23505" && attempt < maxRetries) {
        continue;
      }
      throw e;
    }
  }
  throw new Error("Konnte Belegnummer nicht eindeutig vergeben");
}

export async function stornoProtokoll(
  id: string,
  input: StornoInput,
): Promise<void> {
  const detail = await getProtokoll(id);
  if (!detail) throw new Error("Protokoll nicht gefunden");
  if (detail.protokoll.storniert_am) {
    throw new Error("Protokoll ist bereits storniert");
  }
  const stornoAm = new Date();
  const { buffer, hash } = await renderProtokollPdf({
    belegnummer: detail.protokoll.belegnummer,
    erstellt_am: detail.protokoll.erstellt_am,
    kassennummer: detail.protokoll.kassennummer,
    kassenbezeichnung: detail.protokoll.kassenbezeichnung,
    anlass: detail.protokoll.anlass,
    gezaehlt_von: detail.protokoll.gezaehlt_von,
    geprueft_von: detail.protokoll.geprueft_von,
    bemerkung: detail.protokoll.bemerkung,
    counts: detail.protokoll.counts,
    wechselgeld_cent: detail.protokoll.wechselgeld_cent,
    gezaehlt_cent: detail.protokoll.gezaehlt_cent,
    ausgaben_cent: detail.protokoll.ausgaben_cent,
    bestand_cent: detail.protokoll.bestand_cent,
    tageseinnahmen_cent: detail.protokoll.tageseinnahmen_cent,
    ausgaben: detail.ausgaben,
    storno: { am: stornoAm, grund: input.storno_grund },
  });
  const key = pdfKey(detail.protokoll.belegnummer, "_STORNO");
  await uploadPdf(key, buffer);

  await sql`
    UPDATE protokolle
    SET storniert_am = ${stornoAm.toISOString()},
        storno_grund = ${input.storno_grund},
        storno_pdf_s3_key = ${key},
        storno_pdf_sha256 = ${hash}
    WHERE id = ${id}
  `;
}

export async function deleteAllPdfsForProtokoll(
  protokoll: ProtokollRow,
): Promise<void> {
  if (protokoll.pdf_s3_key) {
    await deletePdf(protokoll.pdf_s3_key).catch(() => {});
  }
  if (protokoll.storno_pdf_s3_key) {
    await deletePdf(protokoll.storno_pdf_s3_key).catch(() => {});
  }
}
