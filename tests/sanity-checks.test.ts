import { describe, expect, it } from "vitest";
import {
  runSanityChecks,
  type SanityCheckInput,
} from "@/lib/sanity-checks";

const TODAY = "2026-06-04";

function baseInput(overrides: Partial<SanityCheckInput> = {}): SanityCheckInput {
  return {
    gezaehltCent: 16100,
    wechselgeldCent: 16000,
    bestandCent: 16100,
    tageseinnahmenCent: 100,
    anyCountEntered: true,
    gezaehltVon: "Anna",
    geprueftVon: "Bob",
    presetWechselgeldCent: 16000,
    datum: TODAY,
    today: TODAY,
    ...overrides,
  };
}

function ids(input: SanityCheckInput): string[] {
  return runSanityChecks(input).map((w) => w.id);
}

describe("runSanityChecks", () => {
  it("returns no warnings for a clean protocol", () => {
    expect(runSanityChecks(baseInput())).toEqual([]);
  });

  it("flags negative daily takings", () => {
    expect(ids(baseInput({ tageseinnahmenCent: -5 }))).toContain(
      "negative-tageseinnahmen",
    );
  });

  it("does not flag negatives while values are still incomplete", () => {
    expect(
      ids(baseInput({ tageseinnahmenCent: -5, bestandCent: null })),
    ).not.toContain("negative-tageseinnahmen");
  });

  it("flags an empty count grid once the user has started", () => {
    expect(ids(baseInput({ anyCountEntered: false }))).toContain("no-counts");
  });

  it("flags large deviation from the register preset", () => {
    expect(ids(baseInput({ wechselgeldCent: 30000 }))).toContain(
      "wechselgeld-deviation",
    );
    expect(ids(baseInput({ wechselgeldCent: 20000 }))).not.toContain(
      "wechselgeld-deviation",
    );
  });

  it("enforces the four-eyes principle case-insensitively", () => {
    expect(
      ids(baseInput({ gezaehltVon: "Anna", geprueftVon: "  anna " })),
    ).toContain("vier-augen");
  });

  it("flags a future protocol date", () => {
    expect(ids(baseInput({ datum: "2026-06-05" }))).toContain("date-future");
  });

  it("flags a protocol older than 30 days", () => {
    expect(ids(baseInput({ datum: "2026-04-01" }))).toContain("date-old");
  });

  it("ignores malformed dates instead of warning", () => {
    const result = ids(baseInput({ datum: "not-a-date" }));
    expect(result).not.toContain("date-future");
    expect(result).not.toContain("date-old");
  });
});
