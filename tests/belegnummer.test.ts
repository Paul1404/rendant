import { describe, expect, it } from "vitest";
import {
  extractTrailingNumber,
  formatBelegnummer,
  maxTrailingSequence,
  nextSequenceAfterExisting,
} from "@/server/services/belegnummer";
import {
  DEFAULT_BELEGNUMMER_SETTINGS,
  formatBelegnummerWithSettings,
} from "@/server/services/settings";

describe("extractTrailingNumber", () => {
  it("reads the trailing sequence from a belegnummer", () => {
    expect(extractTrailingNumber("SVUFO-2026-0001")).toBe(1);
    expect(extractTrailingNumber("0042")).toBe(42);
    expect(extractTrailingNumber("2026-12")).toBe(12);
  });

  it("returns null when there is no number", () => {
    expect(extractTrailingNumber("abc")).toBeNull();
    expect(extractTrailingNumber("")).toBeNull();
  });
});

describe("formatBelegnummerWithSettings", () => {
  it("pads to the minimum digit count with defaults", () => {
    expect(formatBelegnummer(1, 2026, DEFAULT_BELEGNUMMER_SETTINGS)).toBe("01");
    expect(formatBelegnummer(42, 2026, DEFAULT_BELEGNUMMER_SETTINGS)).toBe("42");
  });

  it("builds the full SVUFO-2026-0001 shape", () => {
    expect(
      formatBelegnummerWithSettings(1, 2026, {
        min_digits: 4,
        prefix: "SVUFO",
        include_year: true,
        year_format: "long",
        separator: "-",
      }),
    ).toBe("SVUFO-2026-0001");
  });

  it("supports short year and alternative separators", () => {
    expect(
      formatBelegnummerWithSettings(7, 2026, {
        min_digits: 3,
        prefix: "K",
        include_year: true,
        year_format: "short",
        separator: "/",
      }),
    ).toBe("K/26/007");
  });
});

describe("sequence initialization helpers", () => {
  it("finds the highest trailing sequence in existing belegnummern", () => {
    expect(maxTrailingSequence(["SVUFO-2026-0001", "SVUFO-2026-0042"])).toBe(42);
    expect(maxTrailingSequence(["abc", "2026-12"])).toBe(12);
  });

  it("starts at one when there is no existing trailing number", () => {
    expect(nextSequenceAfterExisting([])).toBe(1);
    expect(nextSequenceAfterExisting(["abc"])).toBe(1);
  });

  it("initializes first-use sequences after the highest existing number", () => {
    expect(nextSequenceAfterExisting(["SVUFO-2026-0001", "CUSTOM-0099"])).toBe(100);
  });
});
