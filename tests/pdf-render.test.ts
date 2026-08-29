import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/denominations";
import { renderProtokollPdf } from "@/server/services/pdf";
import {
	isValidPdfBuffer,
	pdfSmokeData,
} from "@/server/services/pdf-health";

function expectPdf(buffer: Buffer, hash: string): void {
	expect(isValidPdfBuffer(buffer)).toBe(true);
	expect(hash).toMatch(/^[a-f0-9]{64}$/);
}

describe("renderProtokollPdf", () => {
	it("renders a complete protocol document", async () => {
		const { buffer, hash } = await renderProtokollPdf({
			belegnummer: "130",
			vereinsname: "Sportverein Untereuerheim e.V.",
			verein: {
				name: "Sportverein Untereuerheim e.V.",
				strasse: "Musterstraße 1",
				plz: "97508",
				ort: "Grettstadt",
				vorstand: "Max Mustermann",
				registergericht: "Amtsgericht Schweinfurt",
				registernummer: "VR 0000",
			},
			erstellt_am: new Date("2026-08-28T13:22:00.000Z"),
			anlass_datum: new Date("2026-08-28T00:00:00.000Z"),
			kassennummer: "1",
			kassenbezeichnung: "Sportheim",
			anlass: "Testveranstaltung",
			gezaehlt_von: "Test Person",
			geprueft_von: "Prüf Person",
			bemerkung: "",
			counts: emptyCounts(),
			wechselgeld_cent: 0,
			kartenzahlung_cent: 0,
			gezaehlt_cent: 0,
			ausgaben_cent: 0,
			bestand_cent: 0,
			tageseinnahmen_cent: 0,
			ausgaben: [],
			umsatz_ust: [],
			umsatz_ust_basis: "pre_card",
		});

		expectPdf(buffer, hash);
	});

	it("renders the production readiness fixture with and without cancellation", async () => {
		const [active, cancelled] = await Promise.all([
			renderProtokollPdf(pdfSmokeData(false)),
			renderProtokollPdf(pdfSmokeData(true)),
		]);

		expectPdf(active.buffer, active.hash);
		expectPdf(cancelled.buffer, cancelled.hash);
		expect(cancelled.buffer.length).toBeGreaterThan(active.buffer.length);
	});
});
