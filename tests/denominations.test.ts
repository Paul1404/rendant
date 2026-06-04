import { describe, expect, it } from "vitest";
import {
  DENOMINATIONS,
  DENOMINATION_KEYS,
  emptyCounts,
  sumGezaehltCent,
} from "@/lib/denominations";

describe("denominations table", () => {
  it("has the 15 expected euro denominations", () => {
    expect(DENOMINATIONS).toHaveLength(15);
    expect(DENOMINATION_KEYS).toHaveLength(15);
  });

  it("is ordered from largest to smallest", () => {
    const cents = DENOMINATIONS.map((d) => d.cent);
    const sorted = [...cents].sort((a, b) => b - a);
    expect(cents).toEqual(sorted);
  });
});

describe("emptyCounts", () => {
  it("initialises every denomination to zero", () => {
    const counts = emptyCounts();
    expect(Object.keys(counts)).toHaveLength(15);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});

describe("sumGezaehltCent", () => {
  it("returns zero for empty counts", () => {
    expect(sumGezaehltCent(emptyCounts())).toBe(0);
  });

  it("sums denomination counts to cent", () => {
    const counts = emptyCounts();
    counts.anzahl_500_eur = 1; // 50000
    counts.anzahl_50_cent = 2; // 100
    counts.anzahl_1_cent = 3; // 3
    expect(sumGezaehltCent(counts)).toBe(50103);
  });
});
