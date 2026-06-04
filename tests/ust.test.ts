import { describe, expect, it } from "vitest";
import {
  formatUstSatz,
  groupByUstRate,
  hasUstBreakdown,
  ustAnteilCent,
} from "@/lib/ust";

describe("ustAnteilCent", () => {
  it("extracts the tax share from a gross amount", () => {
    // 119,00 EUR gross at 19% => 19,00 EUR tax on 100,00 EUR net.
    expect(ustAnteilCent(11900, 1900)).toBe(1900);
    // 107,00 EUR gross at 7% => 7,00 EUR tax on 100,00 EUR net.
    expect(ustAnteilCent(10700, 700)).toBe(700);
  });

  it("returns zero for non-positive rates", () => {
    expect(ustAnteilCent(1000, 0)).toBe(0);
    expect(ustAnteilCent(1000, -5)).toBe(0);
  });
});

describe("formatUstSatz", () => {
  it("renders whole-percent rates without decimals", () => {
    expect(formatUstSatz(1900)).toBe("19 %");
    expect(formatUstSatz(700)).toBe("7 %");
    expect(formatUstSatz(0)).toBe("0 %");
  });

  it("renders fractional rates with a German decimal comma", () => {
    expect(formatUstSatz(1050)).toBe("10,5 %");
  });
});

describe("groupByUstRate", () => {
  it("aggregates expenses by rate and sorts ascending", () => {
    const groups = groupByUstRate([
      { betrag_cent: 11900, ust_basis_punkte: 1900 },
      { betrag_cent: 10700, ust_basis_punkte: 700 },
      { betrag_cent: 5000, ust_basis_punkte: 1900 },
    ]);

    expect(groups.map((g) => g.bp)).toEqual([700, 1900]);

    const seven = groups[0];
    expect(seven).toMatchObject({
      bp: 700,
      brutto_cent: 10700,
      ust_cent: 700,
      netto_cent: 10000,
    });

    const nineteen = groups[1];
    expect(nineteen.brutto_cent).toBe(16900);
    // brutto = ust + netto always holds.
    expect(nineteen.ust_cent + nineteen.netto_cent).toBe(nineteen.brutto_cent);
  });

  it("treats missing rate as zero", () => {
    const groups = groupByUstRate([
      { betrag_cent: 1000, ust_basis_punkte: 0 },
    ]);
    expect(groups).toEqual([
      { bp: 0, brutto_cent: 1000, ust_cent: 0, netto_cent: 1000 },
    ]);
  });
});

describe("hasUstBreakdown", () => {
  it("is true only when some group carries tax", () => {
    expect(
      hasUstBreakdown([
        { bp: 0, brutto_cent: 1000, ust_cent: 0, netto_cent: 1000 },
      ]),
    ).toBe(false);
    expect(
      hasUstBreakdown([
        { bp: 1900, brutto_cent: 11900, ust_cent: 1900, netto_cent: 10000 },
      ]),
    ).toBe(true);
  });
});
