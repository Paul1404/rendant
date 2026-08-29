import { emptyCounts } from "@/lib/denominations";
import { logger } from "@/server/logger";
import { renderProtokollPdf } from "@/server/services/pdf";

type PdfRenderInput = Parameters<typeof renderProtokollPdf>[0];
type PdfRenderer = typeof renderProtokollPdf;

export type PdfHealthSnapshot = {
	ok: boolean;
	status: "up" | "down";
	latencyMs: number;
	bytes?: number;
	message: string;
};

const MIN_PDF_BYTES = 5_000;
let readinessPromise: Promise<PdfHealthSnapshot> | undefined;
const log = logger.child({ capability: "pdf" });

export function pdfSmokeData(storno = true): PdfRenderInput {
	const counts = emptyCounts();
	counts.anzahl_100_eur = 1;
	counts.anzahl_50_eur = 4;
	counts.anzahl_20_eur = 8;
	counts.anzahl_10_eur = 6;
	counts.anzahl_2_eur = 12;
	counts.anzahl_1_eur = 16;
	counts.anzahl_50_cent = 10;

	return {
		belegnummer: "PDF-SMOKE",
		vereinsname: "Rendant Dokumentprüfung e.V.",
		verein: {
			name: "Rendant Dokumentprüfung e.V.",
			strasse: "Prüfweg 1",
			plz: "97508",
			ort: "Grettstadt",
			vorstand: "Max Mustermann, Erika Musterfrau",
			registergericht: "Amtsgericht Schweinfurt",
			registernummer: "VR 0000",
		},
		erstellt_am: new Date("2026-08-29T08:15:00.000Z"),
		anlass_datum: new Date("2026-08-28T00:00:00.000Z"),
		kassennummer: "1",
		kassenbezeichnung: "Produktive Dokumentprüfung",
		anlass:
			"Lange Testveranstaltung für die produktive PDF-Bereitschaftsprüfung",
		gezaehlt_von: "Max Mustermann",
		geprueft_von: "Erika Musterfrau",
		bemerkung:
			"Dieser feste Testdatensatz prüft Schriftarten, Tabellen, Umsatzsteuer und Seitenlayout.",
		counts,
		wechselgeld_cent: 10_000,
		kartenzahlung_cent: 8_300,
		gezaehlt_cent: 56_500,
		ausgaben_cent: 12_345,
		bestand_cent: 68_845,
		tageseinnahmen_cent: 54_800,
		ausgaben: [
			{
				bezeichnung: "Lebensmittel und Zutaten für die Veranstaltung",
				empfaenger: "Musterlieferant GmbH",
				beleg_nr: "A-1001",
				betrag_cent: 4_321,
				ust_basis_punkte: 700,
			},
			{
				bezeichnung: "Verbrauchsmaterial und Dekoration",
				empfaenger: "Beispielhandel",
				beleg_nr: "A-1002",
				betrag_cent: 5_678,
				ust_basis_punkte: 1_900,
			},
			{
				bezeichnung: "Gebühren",
				empfaenger: "Gemeinde",
				beleg_nr: "A-1003",
				betrag_cent: 2_346,
				ust_basis_punkte: 0,
			},
		],
		umsatz_ust: [
			{ ust_basis_punkte: 700, betrag_cent: 18_000 },
			{ ust_basis_punkte: 1_900, betrag_cent: 36_800 },
		],
		umsatz_ust_basis: "pre_card",
		...(storno
			? {
					storno: {
						am: new Date("2026-08-29T09:30:00.000Z"),
						grund: "Automatische Bereitschaftsprüfung",
					},
				}
			: {}),
	};
}

export function isValidPdfBuffer(buffer: Buffer): boolean {
	if (buffer.length < MIN_PDF_BYTES) return false;
	if (buffer.subarray(0, 5).toString() !== "%PDF-") return false;
	return buffer.subarray(-128).toString().includes("%%EOF");
}

export async function checkPdfReadiness(
	renderer: PdfRenderer = renderProtokollPdf,
): Promise<PdfHealthSnapshot> {
	const started = performance.now();
	try {
		const { buffer, hash } = await renderer(pdfSmokeData());
		if (!isValidPdfBuffer(buffer) || !/^[a-f0-9]{64}$/.test(hash)) {
			throw new Error("PDF renderer returned an invalid document");
		}
		return {
			ok: true,
			status: "up",
			latencyMs: Math.round(performance.now() - started),
			bytes: buffer.length,
			message: "PDF renderer OK",
		};
	} catch (err) {
		const latencyMs = Math.round(performance.now() - started);
		log.error("PDF readiness check failed", { err, latencyMs });
		return {
			ok: false,
			status: "down",
			latencyMs,
			message: "PDF renderer failed",
		};
	}
}

export function collectPdfHealthSnapshot(): Promise<PdfHealthSnapshot> {
	readinessPromise ??= checkPdfReadiness();
	return readinessPromise;
}
