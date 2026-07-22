import { describe, expect, it } from "vitest";
import {
  formatCent,
	formatCentCompact,
  formatCentPlain,
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
