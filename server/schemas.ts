import { z } from "zod";
import { DENOMINATION_KEYS } from "@/lib/denominations";

const counts: Record<string, z.ZodNumber> = {};
for (const key of DENOMINATION_KEYS) {
  counts[key] = z.number().int().min(0);
}

export const AusgabeSchema = z.object({
  bezeichnung: z.string().min(1).max(200),
  empfaenger: z.string().max(200).default(""),
  beleg_nr: z.string().max(100).default(""),
  betrag_cent: z.number().int().min(0),
  ust_basis_punkte: z.number().int().min(0).max(10000).default(0),
});

export const UmsatzUstSplitSchema = z.object({
  ust_basis_punkte: z.number().int().min(0).max(10000),
  betrag_cent: z.number().int().min(0),
});

export const UmsatzUstBasisSchema = z.enum(["pre_card", "post_card"]);

export type UmsatzUstBasis = z.infer<typeof UmsatzUstBasisSchema>;

export const UmsatzUstBasisSettingsSchema = z.object({
  umsatz_ust_basis: UmsatzUstBasisSchema,
});

export type UmsatzUstBasisSettingsInput = z.infer<
  typeof UmsatzUstBasisSettingsSchema
>;

export const CreateProtokollSchema = z.object({
  belegnummer: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9._\-/]+$/)
    .optional(),
  kassennummer: z.string().min(1).max(50),
  kassenbezeichnung: z.string().min(1).max(120),
  anlass: z.string().min(1).max(200),
  gezaehlt_von: z.string().min(1).max(120),
  geprueft_von: z.string().min(1).max(120),
  bemerkung: z.string().max(2000).default(""),
  wechselgeld_cent: z.number().int().min(0),
  kartenzahlung_cent: z.number().int().min(0).default(0),
  erstellt_am: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ...counts,
  ausgaben: z.array(AusgabeSchema).max(100).default([]),
  umsatz_ust: z.array(UmsatzUstSplitSchema).max(20).default([]),
  umsatz_ust_basis: UmsatzUstBasisSchema.default("post_card"),
});

export type CreateProtokollInput = z.infer<typeof CreateProtokollSchema>;

export const StornoSchema = z.object({
  storno_grund: z.string().min(5).max(500),
});

export type StornoInput = z.infer<typeof StornoSchema>;

export const ExportQuerySchema = z.object({
  von: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ExportQuery = z.infer<typeof ExportQuerySchema>;

export const CashRegisterSchema = z.object({
  kassennummer: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(
      /^[A-Za-z0-9._\-/]+$/,
      "Nur Buchstaben, Ziffern und . _ - / erlaubt",
    ),
  kassenbezeichnung: z.string().trim().min(1).max(120),
  wechselgeld_cent: z.number().int().min(0).max(1_000_000_00),
});

export type CashRegisterInput = z.infer<typeof CashRegisterSchema>;

export const BelegnummerSettingsSchema = z.object({
  min_digits: z.number().int().min(1).max(6),
  prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9_-]*$/, "Nur Buchstaben, Ziffern, Bindestrich, Unterstrich")
    .default(""),
  include_year: z.boolean(),
  year_format: z.enum(["long", "short"]),
  separator: z.enum(["-", "/", ".", "_"]),
});

export type BelegnummerSettingsInput = z.infer<typeof BelegnummerSettingsSchema>;
