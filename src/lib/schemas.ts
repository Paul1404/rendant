import * as v from "valibot";
import { DENOMINATION_KEYS } from "@/lib/denominations";

// Validation schemas in Valibot, shared between the oRPC procedures (server)
// and the forms (client).

const intGte0 = v.pipe(v.number(), v.integer(), v.minValue(0));
const ustPunkte = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(10000),
);

const countsEntries = Object.fromEntries(
	DENOMINATION_KEYS.map((key) => [key, v.optional(intGte0, 0)]),
);

export const AusgabeSchema = v.object({
	bezeichnung: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	empfaenger: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
	beleg_nr: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
	betrag_cent: intGte0,
	ust_basis_punkte: v.optional(ustPunkte, 0),
});
export type AusgabeInput = v.InferOutput<typeof AusgabeSchema>;

export const UmsatzUstSplitSchema = v.object({
	ust_basis_punkte: ustPunkte,
	betrag_cent: intGte0,
});
export type UmsatzUstSplitInput = v.InferOutput<typeof UmsatzUstSplitSchema>;

export const UmsatzUstBasisSchema = v.picklist(["pre_card", "post_card"]);
export type UmsatzUstBasis = v.InferOutput<typeof UmsatzUstBasisSchema>;

export const UmsatzUstBasisSettingsSchema = v.object({
	umsatz_ust_basis: UmsatzUstBasisSchema,
});
export type UmsatzUstBasisSettingsInput = v.InferOutput<
	typeof UmsatzUstBasisSettingsSchema
>;

export const CreateProtokollSchema = v.object({
	belegnummer: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.minLength(1),
			v.maxLength(50),
			v.regex(/^[A-Za-z0-9._\-/]+$/),
		),
	),
	kassennummer: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
	kassenbezeichnung: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
	anlass: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	gezaehlt_von: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
	geprueft_von: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
	bemerkung: v.optional(v.pipe(v.string(), v.maxLength(2000)), ""),
	wechselgeld_cent: intGte0,
	kartenzahlung_cent: v.optional(intGte0, 0),
	anlass_datum: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
	...countsEntries,
	ausgaben: v.optional(v.pipe(v.array(AusgabeSchema), v.maxLength(100)), []),
	umsatz_ust: v.optional(
		v.pipe(v.array(UmsatzUstSplitSchema), v.maxLength(20)),
		[],
	),
	umsatz_ust_basis: v.optional(UmsatzUstBasisSchema, "post_card"),
});
export type CreateProtokollInput = v.InferOutput<typeof CreateProtokollSchema>;

export const StornoSchema = v.object({
	storno_grund: v.pipe(v.string(), v.minLength(5), v.maxLength(500)),
});
export type StornoInput = v.InferOutput<typeof StornoSchema>;

export const ExportQuerySchema = v.object({
	von: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
	bis: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
});
export type ExportQuery = v.InferOutput<typeof ExportQuerySchema>;

export const CashRegisterSchema = v.object({
	kassennummer: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1),
		v.maxLength(50),
		v.regex(
			/^[A-Za-z0-9._\-/]+$/,
			"Nur Buchstaben, Ziffern und . _ - / erlaubt",
		),
	),
	kassenbezeichnung: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1),
		v.maxLength(120),
	),
	wechselgeld_cent: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(0),
		v.maxValue(1_000_000_00),
	),
});
export type CashRegisterInput = v.InferOutput<typeof CashRegisterSchema>;

export const BelegnummerSettingsSchema = v.object({
	min_digits: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6)),
	prefix: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.maxLength(20),
			v.regex(
				/^[A-Za-z0-9_-]*$/,
				"Nur Buchstaben, Ziffern, Bindestrich, Unterstrich",
			),
		),
		"",
	),
	include_year: v.boolean(),
	year_format: v.picklist(["long", "short"]),
	separator: v.picklist(["-", "/", ".", "_"]),
});
export type BelegnummerSettingsInput = v.InferOutput<
	typeof BelegnummerSettingsSchema
>;

export const InviteCreateSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(200)),
	role: v.optional(v.picklist(["user", "admin"]), "user"),
});
export type InviteCreateInput = v.InferOutput<typeof InviteCreateSchema>;

export const InviteAcceptSchema = v.object({
	token: v.pipe(v.string(), v.minLength(1)),
	name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
	password: v.pipe(v.string(), v.minLength(8), v.maxLength(256)),
});
export type InviteAcceptInput = v.InferOutput<typeof InviteAcceptSchema>;
