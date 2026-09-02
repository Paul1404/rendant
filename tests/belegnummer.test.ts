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
    expect(extractTrailingNumber("Rendant-2026-0001")).toBe(1);
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

  it("builds the full Rendant-2026-0001 shape", () => {
    expect(
      formatBelegnummerWithSettings(1, 2026, {
        min_digits: 4,
        prefix: "Rendant",
        include_year: true,
        year_format: "long",
        separator: "-",
      }),
    ).toBe("Rendant-2026-0001");
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
    expect(maxTrailingSequence(["Rendant-2026-0001", "Rendant-2026-0042"])).toBe(42);
    expect(maxTrailingSequence(["abc", "2026-12"])).toBe(12);
  });

  it("starts at one when there is no existing trailing number", () => {
    expect(nextSequenceAfterExisting([])).toBe(1);
    expect(nextSequenceAfterExisting(["abc"])).toBe(1);
  });

  it("initializes first-use sequences after the highest existing number", () => {
    expect(nextSequenceAfterExisting(["Rendant-2026-0001", "CUSTOM-0099"])).toBe(100);
  });
});

describe("year rollover with the default (year-less) format", () => {
  // Regression: the sequence used to be seeded from the current year's history
  // only. With the default format the number carries no year, so the first
  // protokoll of a new year re-allocated "01" and collided with the global
  // unique index, failing every retry identically.
  const lastYear = ["01", "02", "42"];

  it("continues past the previous year instead of restarting at one", () => {
    expect(nextSequenceAfterExisting(lastYear)).toBe(43);
    expect(formatBelegnummer(43, 2027, DEFAULT_BELEGNUMMER_SETTINGS)).toBe("43");
  });

  it("never re-issues a number that already exists", () => {
    const next = formatBelegnummer(
      nextSequenceAfterExisting(lastYear),
      2027,
      DEFAULT_BELEGNUMMER_SETTINGS,
    );
    expect(lastYear).not.toContain(next);
  });

  it("still restarts per year when the year is part of the number", () => {
    const settings = { ...DEFAULT_BELEGNUMMER_SETTINGS, include_year: true };
    expect(formatBelegnummer(1, 2027, settings)).toBe("2027-01");
    expect(formatBelegnummer(1, 2026, settings)).toBe("2026-01");
  });
});
