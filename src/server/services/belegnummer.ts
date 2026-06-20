import { sql } from "drizzle-orm";
import { type DbOrTx, db } from "@/server/db";
import { protokolle } from "@/server/db/schema";
import {
	type BelegnummerSettings,
	formatBelegnummerWithSettings,
	getBelegnummerSettings,
} from "@/server/services/settings";

export function extractTrailingNumber(belegnummer: string): number | null {
	const match = belegnummer.match(/(\d+)\D*$/);
	if (!match) return null;
	const n = Number.parseInt(match[1], 10);
	return Number.isFinite(n) ? n : null;
}

async function maxSequenceForYear(
	client: DbOrTx,
	year: number,
): Promise<number> {
	const rows = await client
		.select({ belegnummer: protokolle.belegnummer })
		.from(protokolle)
		.where(sql`EXTRACT(YEAR FROM ${protokolle.erstellt_am}) = ${year}`);
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
	year = new Date().getFullYear(),
): Promise<string> {
	const [settings, maxSeq] = await Promise.all([
		getBelegnummerSettings(),
		maxSequenceForYear(db, year),
	]);
	return formatBelegnummer(maxSeq + 1, year, settings);
}

export async function nextBelegnummerInTx(
	tx: DbOrTx,
	year: number,
): Promise<string> {
	const settings = await getBelegnummerSettings();
	const maxSeq = await maxSequenceForYear(tx, year);
	return formatBelegnummer(maxSeq + 1, year, settings);
}
