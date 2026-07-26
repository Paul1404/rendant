import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { historicalRevenues } from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { createHistoricalRevenueWithDb } from "@/server/services/historical-revenue";
import type { RevenueImportRow } from "@/server/services/revenue-import-xlsx";

export type HistoricalRevenueImportResult = {
	created: number;
	skipped: number;
};

function nullableText(value: string | null | undefined): string | null {
	return value || null;
}

function matchesImportedRow(
	existing: typeof historicalRevenues.$inferSelect,
	row: RevenueImportRow,
): boolean {
	return (
		existing.anlass_datum === row.anlass_datum &&
		existing.anlass_katalog_id === row.anlass_katalog_id &&
		existing.anlass ===
			`${existing.vergleichsgruppe} · ${row.veranstaltungsbezeichnung}` &&
		existing.umsatz_cent === row.umsatz_cent &&
		existing.ausgaben_cent === row.ausgaben_cent &&
		existing.bemerkung === nullableText(row.bemerkung) &&
		existing.quellreferenz === nullableText(row.quellreferenz)
	);
}

export async function inspectPreviouslyImportedRows(
	rows: RevenueImportRow[],
): Promise<{
	alreadyImported: Set<number>;
	conflicts: Set<number>;
}> {
	if (rows.length === 0) {
		return { alreadyImported: new Set(), conflicts: new Set() };
	}
	const existing = await db
		.select()
		.from(historicalRevenues)
		.where(
			inArray(
				historicalRevenues.idempotency_key,
				rows.map((row) => row.idempotency_key),
			),
		);
	const byKey = new Map(
		existing.map((entry) => [entry.idempotency_key, entry]),
	);
	const alreadyImported = new Set<number>();
	const conflicts = new Set<number>();
	for (const row of rows) {
		const previous = byKey.get(row.idempotency_key);
		if (!previous) continue;
		if (matchesImportedRow(previous, row)) alreadyImported.add(row.rowNumber);
		else conflicts.add(row.rowNumber);
	}
	return { alreadyImported, conflicts };
}

export async function findPotentialHistoricalRevenueDuplicates(
	rows: RevenueImportRow[],
): Promise<Set<number>> {
	if (rows.length === 0) return new Set();
	const dates = Array.from(new Set(rows.map((row) => row.anlass_datum)));
	const existing = await db
		.select()
		.from(historicalRevenues)
		.where(
			and(
				inArray(historicalRevenues.anlass_datum, dates),
				isNull(historicalRevenues.storniert_am),
			),
		);
	const duplicates = new Set<number>();
	for (const row of rows) {
		if (
			existing.some(
				(entry) =>
					entry.idempotency_key !== row.idempotency_key &&
					entry.anlass_datum === row.anlass_datum &&
					entry.anlass_katalog_id === row.anlass_katalog_id &&
					entry.anlass ===
						`${entry.vergleichsgruppe} · ${row.veranstaltungsbezeichnung}` &&
					entry.umsatz_cent === row.umsatz_cent &&
					entry.ausgaben_cent === row.ausgaben_cent,
			)
		) {
			duplicates.add(row.rowNumber);
		}
	}
	return duplicates;
}

export async function importHistoricalRevenues(
	rows: RevenueImportRow[],
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalRevenueImportResult> {
	return db.transaction(async (tx) => {
		let created = 0;
		let skipped = 0;
		for (const row of rows) {
			const result = await createHistoricalRevenueWithDb(tx, row, actor, {
				allowDifferentActor: true,
			});
			if (result.created) created += 1;
			else skipped += 1;
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.imported",
			actor,
			metadata: {
				...audit.metadata,
				zeilen: rows.length,
				angelegt: created,
				übersprungen: skipped,
			},
		});
		return { created, skipped };
	});
}
