import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	addIsoCalendarDays,
	isIsoCalendarDate,
	isoCalendarDayDifference,
} from "@/lib/date";
import { ExportQuerySchema } from "@/lib/schemas";

describe("ISO calendar dates", () => {
	it("validates real Gregorian dates", () => {
		expect(isIsoCalendarDate("2024-02-29")).toBe(true);
		expect(isIsoCalendarDate("2023-02-29")).toBe(false);
		expect(isIsoCalendarDate("2026-04-31")).toBe(false);
		expect(isIsoCalendarDate("2026-13-01")).toBe(false);
		expect(isIsoCalendarDate("2026-1-01")).toBe(false);
	});

	it("does calendar arithmetic without daylight-saving drift", () => {
		expect(addIsoCalendarDays("2026-03-29", 1)).toBe("2026-03-30");
		expect(addIsoCalendarDays("2026-01-01", -1)).toBe("2025-12-31");
		expect(isoCalendarDayDifference("2026-03-30", "2026-03-28")).toBe(2);
	});
});

describe("export date range", () => {
	it("rejects impossible and reversed ranges", () => {
		expect(
			v.safeParse(ExportQuerySchema, {
				von: "2026-02-30",
				bis: "2026-03-01",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(ExportQuerySchema, {
				von: "2026-03-02",
				bis: "2026-03-01",
			}).success,
		).toBe(false);
	});
});
