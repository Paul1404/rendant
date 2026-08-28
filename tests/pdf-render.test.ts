import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/denominations";
import { renderProtokollPdf } from "@/server/services/pdf";

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

		expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buffer.length).toBeGreaterThan(1_000);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});
});
