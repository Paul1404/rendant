import { describe, expect, it } from "vitest";
import {
	formatCent,
	formatCentCompact,
	formatCentPlain,
	formatCentSymbol,
	formatPercent,
	parseGermanAmount,
} from "@/lib/money";

describe("parseGermanAmount", () => {
  it("parses plain euro amounts to cent", () => {
    expect(parseGermanAmount("160")).toBe(16000);
    expect(parseGermanAmount("0,99")).toBe(99);
    expect(parseGermanAmount("5,00")).toBe(500);
  });

  it("treats dots as thousand separators", () => {
    expect(parseGermanAmount("1.234,56")).toBe(123456);
    expect(parseGermanAmount("1.234")).toBe(123400);
  });

  it("handles negative amounts", () => {
    expect(parseGermanAmount("-5,00")).toBe(-500);
  });

  it("rejects empty and non-numeric input", () => {
    expect(parseGermanAmount("")).toBeNull();
    expect(parseGermanAmount("   ")).toBeNull();
    expect(parseGermanAmount("abc")).toBeNull();
  });

  it("rejects more than two decimal places", () => {
    expect(parseGermanAmount("1,234")).toBeNull();
  });
});

describe("formatCentPlain", () => {
  it("formats cent without currency suffix", () => {
    expect(formatCentPlain(123456)).toBe("1234,56");
    expect(formatCentPlain(5)).toBe("0,05");
    expect(formatCentPlain(0)).toBe("0,00");
  });

  it("keeps the sign for negatives", () => {
    expect(formatCentPlain(-99)).toBe("-0,99");
  });
});

describe("formatCent", () => {
  it("formats with thousands separator and EUR suffix", () => {
    expect(formatCent(16000)).toBe("160,00 EUR");
    expect(formatCent(123456)).toBe("1.234,56 EUR");
    expect(formatCent(-500)).toBe("-5,00 EUR");
  });
});

describe("formatCentCompact", () => {
	it("keeps six-figure euro amounts in the readable thousands scale", () => {
		expect(formatCentCompact(12_345_600)).toBe("123,5k €");
		expect(formatCentCompact(100_000_000)).toBe("1M €");
	});
});

describe("parse/format round-trip", () => {
  it("survives a round-trip through cent", () => {
    for (const cent of [0, 5, 99, 16000, 123456, -500]) {
      expect(parseGermanAmount(formatCentPlain(cent))).toBe(cent);
    }
  });
});

describe("formatCentSymbol", () => {
	it("keeps the figures of formatCent but uses the symbol", () => {
		expect(formatCentSymbol(0)).toBe("0,00 €");
		expect(formatCentSymbol(123456)).toBe("1.234,56 €");
		expect(formatCentSymbol(-500)).toBe("-5,00 €");
	});
});

describe("formatPercent", () => {
	it("uses one decimal and a space before the sign", () => {
		expect(formatPercent(5)).toBe("5,0 %");
		expect(formatPercent(62.44)).toBe("62,4 %");
		expect(formatPercent(0)).toBe("0,0 %");
	});

	it("marks a share that would round away instead of printing zero", () => {
		expect(formatPercent(0.04)).toBe("< 0,1 %");
		expect(formatPercent(-0.04)).toBe("> -0,1 %");
		expect(formatPercent(0.05)).toBe("0,1 %");
	});

	it("adds the plus for deltas", () => {
		expect(formatPercent(18.5, { sign: true })).toBe("+18,5 %");
		expect(formatPercent(-4, { sign: true })).toBe("-4,0 %");
		expect(formatPercent(0, { sign: true })).toBe("0,0 %");
	});

	it("survives values that are not numbers", () => {
		expect(formatPercent(Number.NaN)).toBe("0,0 %");
		expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("0,0 %");
	});
});
