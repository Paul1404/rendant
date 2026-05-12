import type { Sql, TransactionSql } from "postgres";
import { sql } from "@/lib/db";

export type YearFormat = "long" | "short";
export type Separator = "-" | "/" | "." | "_";
export type UmsatzUstBasis = "pre_card" | "post_card";

export type BelegnummerSettings = {
  min_digits: number;
  prefix: string;
  include_year: boolean;
  year_format: YearFormat;
  separator: Separator;
};

export const DEFAULT_BELEGNUMMER_SETTINGS: BelegnummerSettings = {
  min_digits: 2,
  prefix: "",
  include_year: false,
  year_format: "long",
  separator: "-",
};

export const DEFAULT_UMSATZ_UST_BASIS: UmsatzUstBasis = "post_card";

type Row = {
  belegnummer_min_digits: number;
  belegnummer_prefix: string;
  belegnummer_include_year: boolean;
  belegnummer_year_format: string;
  belegnummer_separator: string;
};

type UstBasisRow = {
  umsatz_ust_basis: string;
};

function rowToSettings(row: Row): BelegnummerSettings {
  return {
    min_digits: Number(row.belegnummer_min_digits),
    prefix: row.belegnummer_prefix,
    include_year: row.belegnummer_include_year,
    year_format: (row.belegnummer_year_format === "short" ? "short" : "long"),
    separator: ((["-", "/", ".", "_"].includes(row.belegnummer_separator)
      ? row.belegnummer_separator
      : "-") as Separator),
  };
}

function normalizeUmsatzUstBasis(value: unknown): UmsatzUstBasis {
  return value === "pre_card" ? "pre_card" : "post_card";
}

export async function getBelegnummerSettings(
  client: Sql | TransactionSql = sql,
): Promise<BelegnummerSettings> {
  const rows = await client<Row[]>`
    SELECT belegnummer_min_digits, belegnummer_prefix,
           belegnummer_include_year, belegnummer_year_format,
           belegnummer_separator
    FROM app_settings WHERE id = 1
  `;
  if (rows.length === 0) return DEFAULT_BELEGNUMMER_SETTINGS;
  return rowToSettings(rows[0]);
}

export async function updateBelegnummerSettings(
  patch: BelegnummerSettings,
): Promise<BelegnummerSettings> {
  const rows = await sql<Row[]>`
    UPDATE app_settings
    SET belegnummer_min_digits = ${patch.min_digits},
        belegnummer_prefix = ${patch.prefix},
        belegnummer_include_year = ${patch.include_year},
        belegnummer_year_format = ${patch.year_format},
        belegnummer_separator = ${patch.separator},
        updated_at = now()
    WHERE id = 1
    RETURNING belegnummer_min_digits, belegnummer_prefix,
              belegnummer_include_year, belegnummer_year_format,
              belegnummer_separator
  `;
  if (rows.length === 0) {
    throw new Error("Einstellungen konnten nicht aktualisiert werden");
  }
  return rowToSettings(rows[0]);
}

export async function getUmsatzUstBasisDefault(
  client: Sql | TransactionSql = sql,
): Promise<UmsatzUstBasis> {
  const rows = await client<UstBasisRow[]>`
    SELECT umsatz_ust_basis FROM app_settings WHERE id = 1
  `;
  if (rows.length === 0) return DEFAULT_UMSATZ_UST_BASIS;
  return normalizeUmsatzUstBasis(rows[0].umsatz_ust_basis);
}

export async function updateUmsatzUstBasisDefault(
  basis: UmsatzUstBasis,
): Promise<UmsatzUstBasis> {
  const rows = await sql<UstBasisRow[]>`
    UPDATE app_settings
    SET umsatz_ust_basis = ${basis},
        updated_at = now()
    WHERE id = 1
    RETURNING umsatz_ust_basis
  `;
  if (rows.length === 0) {
    throw new Error("Einstellungen konnten nicht aktualisiert werden");
  }
  return normalizeUmsatzUstBasis(rows[0].umsatz_ust_basis);
}

export function formatBelegnummerWithSettings(
  sequence: number,
  year: number,
  s: BelegnummerSettings,
): string {
  const parts: string[] = [];
  if (s.prefix) parts.push(s.prefix);
  if (s.include_year) {
    parts.push(
      s.year_format === "short"
        ? String(year % 100).padStart(2, "0")
        : String(year),
    );
  }
  parts.push(String(sequence).padStart(s.min_digits, "0"));
  return parts.join(s.separator);
}
