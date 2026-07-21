import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	HistoricalRevenueCancelSchema,
	HistoricalRevenueCreateSchema,
} from "@/lib/schemas";

const validCreate = {
	idempotency_key: "019f84bc-9383-7301-95e6-c23483cfb28b",
	anlass_datum: "2024-05-01",
	anlass: "Biergarteneröffnung",
	vergleichsgruppe: "Biergarteneröffnung",
	umsatz_cent: 123_456,
	ausgaben_cent: 12_300,
	bemerkung: "Übertrag aus dem Kassenbuch",
	quellreferenz: "Kassenbuch 2024, Seite 12",
};

describe("HistoricalRevenueCreateSchema", () => {
	it("accepts a complete historical revenue entry", () => {
		const result = v.safeParse(HistoricalRevenueCreateSchema, validCreate);
		expect(result.success).toBe(true);
	});

	it("keeps optional expenses, note and source reference optional", () => {
		const result = v.safeParse(HistoricalRevenueCreateSchema, {
			...validCreate,
			ausgaben_cent: undefined,
			bemerkung: undefined,
			quellreferenz: undefined,
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid dates, UUIDs and negative cent amounts", () => {
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				idempotency_key: "retry-1",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				anlass_datum: "01.05.2024",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				umsatz_cent: -1,
			}).success,
		).toBe(false);
	});

	it("requires a comparison group", () => {
		const result = v.safeParse(HistoricalRevenueCreateSchema, {
			...validCreate,
			vergleichsgruppe: "   ",
		});
		expect(result.success).toBe(false);
	});
});

describe("HistoricalRevenueCancelSchema", () => {
	it("accepts an item-bound cancellation reason", () => {
		const result = v.safeParse(HistoricalRevenueCancelSchema, {
			id: "019f84bc-9383-7301-95e6-c23483cfb28b",
			storno_grund: "Doppelt erfasst",
		});
		expect(result.success).toBe(true);
	});

	it("rejects short reasons and malformed IDs", () => {
		expect(
			v.safeParse(HistoricalRevenueCancelSchema, {
				id: "not-an-id",
				storno_grund: "Nein",
			}).success,
		).toBe(false);
	});
});
