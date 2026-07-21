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

const optionalText = (max: number, label: string) =>
	v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(max, `Höchstens ${label}`)),
		"",
	);

export const AnlassKatalogSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Bitte einen Namen angeben"),
		v.maxLength(120, "Höchstens 120 Zeichen"),
	),
	typ: v.picklist(["wiederkehrend", "einmalig"]),
	aktiv: v.boolean(),
});
export type AnlassKatalogFormInput = v.InferOutput<typeof AnlassKatalogSchema>;

export const VereinSettingsSchema = v.object({
	vereinsname: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Bitte einen Vereinsnamen angeben"),
		v.maxLength(120, "Höchstens 120 Zeichen"),
	),
	strasse: optionalText(120, "120 Zeichen"),
	plz: optionalText(10, "10 Zeichen"),
	ort: optionalText(120, "120 Zeichen"),
	vorstand: optionalText(400, "400 Zeichen"),
	registergericht: optionalText(120, "120 Zeichen"),
	registernummer: optionalText(40, "40 Zeichen"),
});
export type VereinSettingsInput = v.InferOutput<typeof VereinSettingsSchema>;

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
	// Optional link to the anlass catalog (plans/007). The `anlass` text above
	// stays the human label; this is the stable grouping key.
	anlass_katalog_id: v.optional(
		v.nullable(v.pipe(v.string(), v.maxLength(40))),
	),
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

export const EmailSecuritySchema = v.picklist(["starttls", "ssl", "none"]);
export type EmailSecurity = v.InferOutput<typeof EmailSecuritySchema>;

// SMTP transport + notification settings. The password is write-only: an empty
// string means "leave the stored password unchanged"; clear_password removes it.
// Host and recipients may be empty while the feature is disabled, so structural
// validation stays loose and the server checks completeness before sending.
export const EmailSettingsSchema = v.object({
	enabled: v.boolean(),
	host: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(255)), ""),
	port: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
	security: EmailSecuritySchema,
	user: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(255)), ""),
	password: v.optional(v.pipe(v.string(), v.maxLength(255)), ""),
	clear_password: v.optional(v.boolean(), false),
	from: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(255)), ""),
	notify_new_protokoll: v.boolean(),
	recipients: v.optional(v.pipe(v.string(), v.maxLength(4000)), ""),
});
export type EmailSettingsInput = v.InferOutput<typeof EmailSettingsSchema>;

export const TestEmailSchema = v.object({
	to: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(255)),
});
export type TestEmailInput = v.InferOutput<typeof TestEmailSchema>;

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

const historicalRevenueOptionalText = (maxLength: number) =>
	v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(maxLength))));

export const HistoricalRevenueCreateSchema = v.object({
	idempotency_key: v.pipe(v.string(), v.uuid()),
	anlass_datum: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
	anlass: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Bitte einen Anlass angeben"),
		v.maxLength(200),
	),
	vergleichsgruppe: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Bitte eine Vergleichsgruppe angeben"),
		v.maxLength(120),
	),
	umsatz_cent: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(0),
		v.maxValue(2_147_483_647),
	),
	ausgaben_cent: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2_147_483_647)),
		0,
	),
	bemerkung: historicalRevenueOptionalText(2000),
	quellreferenz: historicalRevenueOptionalText(500),
});
export type HistoricalRevenueCreateInput = v.InferOutput<
	typeof HistoricalRevenueCreateSchema
>;

export const HistoricalRevenueCancelSchema = v.object({
	id: v.pipe(v.string(), v.uuid()),
	storno_grund: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(5, "Bitte einen Stornogrund angeben"),
		v.maxLength(500),
	),
});
export type HistoricalRevenueCancelInput = v.InferOutput<
	typeof HistoricalRevenueCancelSchema
>;
