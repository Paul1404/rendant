import { renderToBuffer } from "@react-pdf/renderer";
import { createHash } from "node:crypto";
import { ProtokollDocument, type ProtokollPdfData } from "@/pdf/ProtokollDocument";
import { DENOMINATIONS } from "@/lib/denominations";

export function computeDataHash(
  data: Omit<ProtokollPdfData, "pdfHash" | "storno">,
  storno?: ProtokollPdfData["storno"],
): string {
  const canonical = {
    belegnummer: data.belegnummer,
    erstellt_am: data.erstellt_am.toISOString(),
    anlass: data.anlass,
    gezaehlt_von: data.gezaehlt_von,
    geprueft_von: data.geprueft_von,
    bemerkung: data.bemerkung,
    counts: Object.fromEntries(
      DENOMINATIONS.map((d) => [d.key, data.counts[d.key] ?? 0]),
    ),
    wechselgeld_cent: data.wechselgeld_cent,
    gezaehlt_cent: data.gezaehlt_cent,
    ausgaben_cent: data.ausgaben_cent,
    bestand_cent: data.bestand_cent,
    tageseinnahmen_cent: data.tageseinnahmen_cent,
    ausgaben: data.ausgaben.map((a) => ({
      bezeichnung: a.bezeichnung,
      empfaenger: a.empfaenger,
      beleg_nr: a.beleg_nr,
      betrag_cent: a.betrag_cent,
    })),
    storno: storno
      ? { am: storno.am.toISOString(), grund: storno.grund }
      : null,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export async function renderProtokollPdf(
  data: Omit<ProtokollPdfData, "pdfHash">,
): Promise<{ buffer: Buffer; hash: string }> {
  const hash = computeDataHash(data, data.storno);
  const buffer = await renderToBuffer(
    <ProtokollDocument data={{ ...data, pdfHash: hash }} />,
  );
  return { buffer, hash };
}
