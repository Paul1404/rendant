import { describe, expect, it } from "vitest";
import {
	groupProtokollEvents,
	paginateProtokollEvents,
} from "@/lib/protokoll-groups";
import type { ProtokollRow } from "@/lib/protokoll-types";

function receipt(
	id: string,
	overrides: Partial<ProtokollRow> = {},
): ProtokollRow {
	return {
		id,
		anlass: "Kirchweih Samstag",
		anlass_datum: "2026-10-17",
		anlass_katalog_id: "kirchweih",
		umsatzbereich: "veranstaltungen",
		tageseinnahmen_cent: 21900,
		kartenzahlung_cent: 0,
		storniert_am: null,
		...overrides,
	} as ProtokollRow;
}

describe("receipt event groups", () => {
	it("collects interleaved receipts, preserving event and receipt order", () => {
		const groups = groupProtokollEvents([
			receipt("154"),
			receipt("other", { anlass_katalog_id: "other" }),
			receipt("153"),
		]);
		expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
			["154", "153"],
			["other"],
		]);
	});

	it("separates dates, catalogue identities and reporting areas", () => {
		expect(
			groupProtokollEvents([
				receipt("1"),
				receipt("2", { anlass_datum: "2026-10-18" }),
				receipt("3", { anlass_katalog_id: "other" }),
				receipt("4", { umsatzbereich: "eintrittsgelder" }),
			]).length,
		).toBe(4);
	});

	it("matches legacy labels conservatively without guessing catalogue membership", () => {
		const groups = groupProtokollEvents([
			receipt("1", { anlass_katalog_id: null }),
			receipt("2", { anlass_katalog_id: null, anlass: " kirchweih samstag " }),
			receipt("3", { anlass_katalog_id: null, anlass: "Kirchweih Sonntag" }),
			receipt("4"),
		]);
		expect(groups.map((group) => group.items.length)).toEqual([2, 1, 1]);
	});

	it("totals active cash and card revenue in cents, excluding cancellations", () => {
		const [group] = groupProtokollEvents([
			receipt("154"),
			receipt("153", { tageseinnahmen_cent: 97470, kartenzahlung_cent: 2000 }),
			receipt("152", { tageseinnahmen_cent: 145590 }),
			receipt("151", { tageseinnahmen_cent: 192280 }),
			receipt("cancelled", {
				storniert_am: new Date(),
				tageseinnahmen_cent: 999999,
				kartenzahlung_cent: 3000,
			}),
		]);
		expect(group.sumActiveCent).toBe(459240);
		expect(group.hasCardRevenue).toBe(true);
		expect(group.items).toHaveLength(5);
		expect(
			groupProtokollEvents([
				receipt("cancelled", {
					storniert_am: new Date(),
					kartenzahlung_cent: 3000,
				}),
			])[0],
		).toMatchObject({ sumActiveCent: 0, hasCardRevenue: false });
	});

	it("calculates summaries only from the supplied filtered selection", () => {
		const rows = [receipt("1"), receipt("2")];
		expect(
			groupProtokollEvents(rows.filter((row) => row.id === "1"))[0]
				.sumActiveCent,
		).toBe(21900);
	});

	it("keeps groups intact across page boundaries, including oversized groups", () => {
		const rows = Array.from({ length: 14 }, (_, i) =>
			receipt(String(i), {
				anlass_katalog_id: i < 3 ? "a" : i < 12 ? "b" : "c",
			}),
		);
		const pages = paginateProtokollEvents(groupProtokollEvents(rows), 5);
		expect(pages.map((page) => page.length)).toEqual([3, 9, 2]);
		expect(pages.flat()).toEqual(rows);
		expect(paginateProtokollEvents([], 25)).toEqual([]);
	});
});
