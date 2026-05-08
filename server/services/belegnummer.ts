import type { Sql, TransactionSql } from "postgres";
import { sql } from "@/lib/db";
import {
  formatBelegnummerWithSettings,
  getBelegnummerSettings,
  type BelegnummerSettings,
} from "@/server/services/settings";

export function extractTrailingNumber(belegnummer: string): number | null {
  const match = belegnummer.match(/(\d+)\D*$/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function maxSequenceForYear(
  client: Sql | TransactionSql,
  year: number,
): Promise<number> {
  const rows = await client<{ belegnummer: string }[]>`
    SELECT belegnummer FROM protokolle
    WHERE EXTRACT(YEAR FROM erstellt_am) = ${year}
  `;
  let max = 0;
  for (const row of rows) {
    const n = extractTrailingNumber(row.belegnummer);
    if (n !== null && n > max) max = n;
  }
  return max;
}

export function formatBelegnummer(
  sequence: number,
  year: number,
  settings: BelegnummerSettings,
): string {
  return formatBelegnummerWithSettings(sequence, year, settings);
}

export async function previewNextBelegnummer(
  client: Sql = sql,
  year = new Date().getFullYear(),
): Promise<string> {
  const [settings, maxSeq] = await Promise.all([
    getBelegnummerSettings(client),
    maxSequenceForYear(client, year),
  ]);
  return formatBelegnummer(maxSeq + 1, year, settings);
}

export async function nextBelegnummerInTx(
  tx: TransactionSql,
  year: number,
): Promise<string> {
  const settings = await getBelegnummerSettings(tx);
  const maxSeq = await maxSequenceForYear(tx, year);
  return formatBelegnummer(maxSeq + 1, year, settings);
}
