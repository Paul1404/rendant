import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ where: vi.fn() }));
vi.mock("@/server/db", () => ({
	db: {
		select: () => ({
			from: () => ({ leftJoin: () => ({ where: mocks.where }) }),
		}),
	},
}));
import {
	exportRevenueCsv,
	loadRevenueExportRows,
} from "@/server/services/revenue-export";

beforeEach(() => {
	mocks.where.mockReset();
	const common = {
		date: "2024-10-20",
		occasion: "Kirchweih",
		revenueArea: "wirtschaftsbetrieb",
		comparisonGroup: "Kirchweih",
		expensesCent: "1000",
		reference: "166",
		note: "",
	};
	mocks.where.mockResolvedValueOnce([
		{
			...common,
			revenueCashCent: "38050",
			revenueCardCent: "61800",
			cancelledAt: null,
		},
		{
			...common,
			reference: "167",
			revenueCashCent: "500",
			revenueCardCent: null,
			cancelledAt: new Date(),
		},
	]);
	mocks.where.mockResolvedValueOnce([
		{
			...common,
			revenueCent: "12345",
			legacyComparisonGroup: "Kirchweih",
			cancelledAt: null,
		},
	]);
});

describe("revenue export source mapping", () => {
	it("keeps protocol splits and leaves historical splits unknown", async () => {
		const rows = await loadRevenueExportRows("2024-01-01", "2024-12-31");
		expect(rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "Kassenzählprotokoll",
					reference: "166",
					revenueCashCent: 38050,
					revenueCardCent: 61800,
					revenueCent: 99850,
				}),
				expect.objectContaining({
					source: "Kassenzählprotokoll",
					reference: "167",
					revenueCashCent: 500,
					revenueCardCent: 0,
					revenueCent: 500,
					status: "storniert",
				}),
				expect.objectContaining({
					source: "Altunterlage",
					revenueCashCent: null,
					revenueCardCent: null,
					revenueCent: 12345,
				}),
			]),
		);
	});

	it("preserves the active total and includes cancelled rows with their status", async () => {
		const result = await exportRevenueCsv("2024-01-01", "2024-12-31");
		expect(result.count).toBe(3);
		expect(result.totalCent).toBe(112195);
		expect(result.csv).toContain("380,50;618,00;998,50;Getrennt erfasst");
		expect(result.csv).toContain(";;;123,45;Aufteilung unbekannt;");
		expect(result.csv).toContain(";167;storniert;");
	});
});
