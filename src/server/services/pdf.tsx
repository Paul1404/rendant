import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { DENOMINATIONS } from "@/lib/denominations";
import {
	ProtokollDocument,
	type ProtokollPdfData,
} from "@/pdf/ProtokollDocument";

export function computeDataHash(
	data: Omit<ProtokollPdfData, "pdfHash" | "storno">,
	storno?: ProtokollPdfData["storno"],
): string {
	const canonical = {
		belegnummer: data.belegnummer,
		erstellt_am: data.erstellt_am.toISOString(),
		anlass_datum: data.anlass_datum.toISOString().slice(0, 10),
		kassennummer: data.kassennummer,
		kassenbezeichnung: data.kassenbezeichnung,
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
			ust_basis_punkte: a.ust_basis_punkte ?? 0,
		})),
		umsatz_ust: data.umsatz_ust.map((u) => ({
			ust_basis_punkte: u.ust_basis_punkte ?? 0,
			betrag_cent: u.betrag_cent,
		})),
		umsatz_ust_basis: data.umsatz_ust_basis,
		storno: storno
			? { am: storno.am.toISOString(), grund: storno.grund }
			: null,
	};
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
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
