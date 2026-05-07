import type { Sql, TransactionSql } from "postgres";

export function formatBelegnummer(year: number, sequence: number): string {
  return `SVUFO-${year}-${String(sequence).padStart(4, "0")}`;
}

async function maxSequence(
  client: Sql | TransactionSql,
  prefix: string,
): Promise<number> {
  const rows = await client<{ belegnummer: string }[]>`
    SELECT belegnummer FROM protokolle
    WHERE belegnummer LIKE ${prefix + "%"}
    ORDER BY belegnummer DESC
    LIMIT 1
  `;
  if (rows.length === 0) return 0;
  const suffix = rows[0].belegnummer.slice(prefix.length);
  const n = Number.parseInt(suffix, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function previewNextBelegnummer(
  sql: Sql,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `SVUFO-${year}-`;
  const max = await maxSequence(sql, prefix);
  return formatBelegnummer(year, max + 1);
}

export async function nextBelegnummerInTx(
  tx: TransactionSql,
  year: number,
): Promise<string> {
  const prefix = `SVUFO-${year}-`;
  const max = await maxSequence(tx, prefix);
  return formatBelegnummer(year, max + 1);
}
