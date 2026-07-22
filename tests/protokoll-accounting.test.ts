import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { emptyCounts } from "@/lib/denominations";
import {
	CreateProtokollSchema,
	type CreateProtokollInput,
} from "@/lib/schemas";
import { deriveProtokollAccounting } from "@/server/services/protokoll";

function baseInput(
  overrides: Partial<CreateProtokollInput> = {},
): CreateProtokollInput {
  return {
    ...emptyCounts(),
    anlass_datum: "2026-06-21",
    kassennummer: "K1",
    kassenbezeichnung: "Hauptkasse",
		veranstaltungsbezeichnung: "Sommerfest 2026",
    gezaehlt_von: "Anna",
    geprueft_von: "Bob",
    bemerkung: "",
    wechselgeld_cent: 16000,
    kartenzahlung_cent: 5000,
    anzahl_100_eur: 2,
    anzahl_50_eur: 1,
    ausgaben: [
      {
        bezeichnung: "Einkauf",
        empfaenger: "Markt",
        beleg_nr: "B1",
        betrag_cent: 1200,
        ust_basis_punkte: 1900,
      },
    ],
    umsatz_ust: [],
    umsatz_ust_basis: "post_card",
    ...overrides,
  } as CreateProtokollInput;
}

describe("deriveProtokollAccounting", () => {
	it("accepts one counting person without a separate checker", () => {
		const result = v.safeParse(CreateProtokollSchema, {
			...baseInput(),
			geprueft_von: "",
		});
		expect(result.success).toBe(true);
	});

	it("requires a concrete event label", () => {
		const result = v.safeParse(CreateProtokollSchema, {
			...baseInput(),
			veranstaltungsbezeichnung: "   ",
		});
		expect(result.success).toBe(false);
	});

  it("derives counted cash, bestand, and takings", () => {
    const result = deriveProtokollAccounting(baseInput());

    expect(result.gezaehlt_cent).toBe(25000);
    expect(result.ausgaben_cent).toBe(1200);
    expect(result.bestand_cent).toBe(26200);
    expect(result.tageseinnahmen_cent).toBe(10200);
    expect(result.umsatz_basis_cent).toBe(15200);
  });

  it("uses pre-card takings as VAT basis when configured", () => {
    const result = deriveProtokollAccounting(
      baseInput({
        umsatz_ust_basis: "pre_card",
        umsatz_ust: [{ ust_basis_punkte: 1900, betrag_cent: 10200 }],
      }),
    );

    expect(result.umsatz_basis_cent).toBe(10200);
  });

  it("rejects mismatched VAT revenue splits", () => {
    expect(() =>
      deriveProtokollAccounting(
        baseInput({
          umsatz_ust: [{ ust_basis_punkte: 1900, betrag_cent: 1 }],
        }),
      ),
    ).toThrow("Summe der USt.-Aufteilung");
  });

  it("rejects denomination counts outside PostgreSQL integer range", () => {
    const input = baseInput();
    (input as unknown as Record<string, number>).anzahl_500_eur = 2_147_483_648;

    expect(() => deriveProtokollAccounting(input)).toThrow(
      "überschreitet den zulässigen Bereich",
    );
  });

  it("rejects derived totals outside PostgreSQL integer range", () => {
    const input = baseInput();
    (input as unknown as Record<string, number>).anzahl_500_eur = 42_949;
    (input as unknown as Record<string, number>).anzahl_200_eur = 1;

    expect(() => deriveProtokollAccounting(input)).toThrow(
      "überschreitet den zulässigen Bereich",
    );
  });
});
