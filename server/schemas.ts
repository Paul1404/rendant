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
});

export const CreateProtokollSchema = z.object({
  anlass: z.string().min(1).max(200),
  gezaehlt_von: z.string().min(1).max(120),
  geprueft_von: z.string().min(1).max(120),
  bemerkung: z.string().max(2000).default(""),
  wechselgeld_cent: z.number().int().min(0),
  ...counts,
  ausgaben: z.array(AusgabeSchema).max(100).default([]),
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
