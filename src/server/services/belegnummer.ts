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

// The sequence scope has to match the format scope. When the year is part of the
// number, "01" in 2027 cannot collide with "01" in 2026, so seeding from that
// year's history is right. When it is not, the number is globally unique and the
// sequence has to continue across the year boundary — seeding from a fresh
// year's (empty) history would allocate "01" again and hit the unique index on
// the first protokoll of every January.
async function nextSequenceFromHistory(
	client: DbOrTx,
	year: number,
	includeYear: boolean,
): Promise<number> {
	const query = client
		.select({ belegnummer: protokolle.belegnummer })
		.from(protokolle);
	const rows = includeYear
		? await query.where(
				sql`EXTRACT(YEAR FROM ${protokolle.erstellt_am}) = ${year}`,
			)
		: await query;
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
		(await nextSequenceFromHistory(db, year, settings.include_year));
	return formatBelegnummer(nextSequence, year, settings);
}

export async function nextBelegnummerInTx(
	tx: DbOrTx,
	year: number,
): Promise<string> {
	// `tx`, not the root client: see getBelegnummerSettings on why.
	const settings = await getBelegnummerSettings(tx);
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

	const reservedSequence = await nextSequenceFromHistory(
		tx,
		year,
		settings.include_year,
	);
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
