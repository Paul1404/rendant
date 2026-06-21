import { eq, sql } from "drizzle-orm";
import { currentYearBerlin } from "@/lib/date";
import { type DbOrTx, db } from "@/server/db";
import { belegnummerSequences, protokolle } from "@/server/db/schema";
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

export function maxTrailingSequence(belegnummern: string[]): number {
	let max = 0;
	for (const belegnummer of belegnummern) {
		const n = extractTrailingNumber(belegnummer);
		if (n !== null && n > max) max = n;
	}
	return max;
}

export function nextSequenceAfterExisting(belegnummern: string[]): number {
	return maxTrailingSequence(belegnummern) + 1;
}

async function nextSequenceFromHistoryForYear(
	client: DbOrTx,
	year: number,
): Promise<number> {
	const rows = await client
		.select({ belegnummer: protokolle.belegnummer })
		.from(protokolle)
		.where(sql`EXTRACT(YEAR FROM ${protokolle.erstellt_am}) = ${year}`);
	return nextSequenceAfterExisting(rows.map((row) => row.belegnummer));
}

export function formatBelegnummer(
	sequence: number,
	year: number,
	settings: BelegnummerSettings,
): string {
	return formatBelegnummerWithSettings(sequence, year, settings);
}

export async function previewNextBelegnummer(
	year = currentYearBerlin(),
): Promise<string> {
	const [settings, sequenceRows] = await Promise.all([
		getBelegnummerSettings(),
		db
			.select({ next_sequence: belegnummerSequences.next_sequence })
			.from(belegnummerSequences)
			.where(eq(belegnummerSequences.year, year))
			.limit(1),
	]);
	const nextSequence =
		sequenceRows[0]?.next_sequence ??
		(await nextSequenceFromHistoryForYear(db, year));
	return formatBelegnummer(nextSequence, year, settings);
}

export async function nextBelegnummerInTx(
	tx: DbOrTx,
	year: number,
): Promise<string> {
	const settings = await getBelegnummerSettings();
	const existingRows = await tx
		.select({ next_sequence: belegnummerSequences.next_sequence })
		.from(belegnummerSequences)
		.where(eq(belegnummerSequences.year, year))
		.limit(1);

	if (existingRows.length > 0) {
		const rows = await tx
			.update(belegnummerSequences)
			.set({
				next_sequence: sql`${belegnummerSequences.next_sequence} + 1`,
				updated_at: new Date(),
			})
			.where(eq(belegnummerSequences.year, year))
			.returning({
				sequence: sql<number>`${belegnummerSequences.next_sequence} - 1`,
			});
		return formatBelegnummer(Number(rows[0].sequence), year, settings);
	}

	const reservedSequence = await nextSequenceFromHistoryForYear(tx, year);
	const rows = await tx
		.insert(belegnummerSequences)
		.values({
			year,
			next_sequence: reservedSequence + 1,
			updated_at: new Date(),
		})
		.onConflictDoUpdate({
			target: belegnummerSequences.year,
			set: {
				next_sequence: sql`${belegnummerSequences.next_sequence} + 1`,
				updated_at: new Date(),
			},
		})
		.returning({
			sequence: sql<number>`${belegnummerSequences.next_sequence} - 1`,
		});
	return formatBelegnummer(Number(rows[0].sequence), year, settings);
}
