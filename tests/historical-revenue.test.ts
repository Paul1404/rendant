import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	HistoricalRevenueCancelSchema,
	HistoricalRevenueCorrectSchema,
	HistoricalRevenueCreateSchema,
	HistoricalRevenuePageSchema,
} from "@/lib/schemas";

const validCreate = {
	idempotency_key: "019f84bc-9383-7301-95e6-c23483cfb28b",
	anlass_datum: "2024-05-01",
	anlass_katalog_id: "019f84bc-9383-7301-95e6-c23483cfb28c",
	umsatzbereich: "wirtschaftsbetrieb" as const,
	veranstaltungsbezeichnung: "Biergarteneröffnung am 1. Mai",
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
				anlass_datum: "2024-02-31",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				anlass_datum: "2999-12-31",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				umsatz_cent: -1,
			}).success,
		).toBe(false);
	});

	it("rejects unknown Umsatzbereiche", () => {
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				umsatzbereich: "biergarten",
			}).success,
		).toBe(false);
	});

	it("requires Details and validates the optional legacy catalog link", () => {
		const result = v.safeParse(HistoricalRevenueCreateSchema, {
			...validCreate,
			veranstaltungsbezeichnung: "   ",
		});
		expect(result.success).toBe(false);
		expect(
			v.safeParse(HistoricalRevenueCreateSchema, {
				...validCreate,
				anlass_katalog_id: "not-a-uuid",
			}).success,
		).toBe(false);
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

describe("historical revenue review schemas", () => {
	it("applies safe bounded page defaults", () => {
		const result = v.parse(HistoricalRevenuePageSchema, {});
		expect(result).toEqual({
			page: 1,
			page_size: 25,
			include_storniert: false,
			sort: "date",
			direction: "desc",
		});
		expect(
			v.safeParse(HistoricalRevenuePageSchema, { page_size: 1_000 }).success,
		).toBe(false);
	});

	it("requires a complete, reasoned correction", () => {
		const correction = {
			id: validCreate.idempotency_key,
			idempotency_key: validCreate.anlass_katalog_id,
			anlass_datum: validCreate.anlass_datum,
			anlass_katalog_id: null,
			umsatzbereich: validCreate.umsatzbereich,
			veranstaltungsbezeichnung: validCreate.veranstaltungsbezeichnung,
			umsatz_cent: validCreate.umsatz_cent,
			ausgaben_cent: validCreate.ausgaben_cent,
			bemerkung: validCreate.bemerkung,
			korrektur_grund: "Veranstaltung eindeutig zugeordnet",
		};
		expect(v.safeParse(HistoricalRevenueCorrectSchema, correction).success).toBe(
			true,
		);
		expect(
			v.safeParse(HistoricalRevenueCorrectSchema, {
				...correction,
				korrektur_grund: "Nein",
			}).success,
		).toBe(false);
	});
});
