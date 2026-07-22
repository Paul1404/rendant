import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AnlassKatalogEntry, AnlassTyp } from "@/lib/anlass";
import { db } from "@/server/db";
import {
	anlassKatalog,
	historicalRevenues,
	protokolle,
} from "@/server/db/schema";

export type AnlassKatalogInput = {
	name: string;
	typ: AnlassTyp;
	aktiv: boolean;
};

type Row = typeof anlassKatalog.$inferSelect;

function rowToEntry(row: Row): AnlassKatalogEntry {
	return {
		id: row.id,
		name: row.name,
		typ: row.typ === "einmalig" ? "einmalig" : "wiederkehrend",
		aktiv: row.aktiv,
		reihenfolge: Number(row.reihenfolge),
	};
}

export async function listKatalog(): Promise<AnlassKatalogEntry[]> {
	const rows = await db
		.select()
		.from(anlassKatalog)
		.orderBy(asc(anlassKatalog.reihenfolge), asc(anlassKatalog.name));
	return rows.map(rowToEntry);
}

export async function createKatalog(
	input: AnlassKatalogInput,
): Promise<AnlassKatalogEntry> {
	const maxRow = await db
		.select({ max: sql<number | null>`max(${anlassKatalog.reihenfolge})` })
		.from(anlassKatalog);
	const currentMax = maxRow[0]?.max;
	const nextOrder = currentMax == null ? 0 : Number(currentMax) + 1;
	const rows = await db
		.insert(anlassKatalog)
		.values({
			name: input.name,
			typ: input.typ,
			aktiv: input.aktiv,
			reihenfolge: nextOrder,
		})
		.returning();
	return rowToEntry(rows[0]);
}

export async function updateKatalog(
	id: string,
	input: AnlassKatalogInput,
): Promise<AnlassKatalogEntry | null> {
	const rows = await db
		.update(anlassKatalog)
		.set({
			name: input.name,
			typ: input.typ,
			aktiv: input.aktiv,
			updated_at: new Date(),
		})
		.where(eq(anlassKatalog.id, id))
		.returning();
	if (rows.length === 0) return null;
	return rowToEntry(rows[0]);
}

export async function deleteKatalog(
	id: string,
): Promise<
	| { status: "deleted"; entry: AnlassKatalogEntry }
	| { status: "referenced"; references: number }
	| { status: "not_found" }
> {
	return db.transaction(async (tx) => {
		// The row lock makes the reference check and deletion one concurrency
		// boundary. Foreign-key writers must wait, so a newly assigned record
		// cannot be silently detached by ON DELETE SET NULL between two queries.
		const target = await tx
			.select()
			.from(anlassKatalog)
			.where(eq(anlassKatalog.id, id))
			.limit(1)
			.for("update");
		if (!target[0]) return { status: "not_found" as const };

		const [p, h] = await Promise.all([
			tx
				.select({ n: sql<number>`count(*)` })
				.from(protokolle)
				.where(eq(protokolle.anlass_katalog_id, id)),
			tx
				.select({ n: sql<number>`count(*)` })
				.from(historicalRevenues)
				.where(eq(historicalRevenues.anlass_katalog_id, id)),
		]);
		const references = Number(p[0]?.n ?? 0) + Number(h[0]?.n ?? 0);
		if (references > 0) {
			return { status: "referenced" as const, references };
		}

		const rows = await tx
			.delete(anlassKatalog)
			.where(eq(anlassKatalog.id, id))
			.returning();
		return rows[0]
			? { status: "deleted" as const, entry: rowToEntry(rows[0]) }
			: { status: "not_found" as const };
	});
}

export async function bulkAssignKatalog(input: {
	targetId: string;
	sourceId: string | null;
	targetName?: string;
	protokollIds: string[];
	historicalIds: string[];
}): Promise<{
	entry: AnlassKatalogEntry;
	protocols: number;
	historical: number;
	skipped: number;
} | null> {
	return db.transaction(async (tx) => {
		const targetRows = await tx
			.select()
			.from(anlassKatalog)
			.where(eq(anlassKatalog.id, input.targetId))
			.limit(1);
		const target = targetRows[0];
		if (!target) return null;

		let entry = rowToEntry(target);
		if (input.targetName && input.targetName !== target.name) {
			const renamed = await tx
				.update(anlassKatalog)
				.set({ name: input.targetName, updated_at: new Date() })
				.where(
					and(
						eq(anlassKatalog.id, input.targetId),
						eq(anlassKatalog.updated_at, target.updated_at),
					),
				)
				.returning();
			if (!renamed[0]) throw new AnlassKatalogConcurrencyError();
			entry = rowToEntry(renamed[0]);
		}
		const protocolSource = input.sourceId
			? eq(protokolle.anlass_katalog_id, input.sourceId)
			: isNull(protokolle.anlass_katalog_id);
		const historicalSource = input.sourceId
			? eq(historicalRevenues.anlass_katalog_id, input.sourceId)
			: isNull(historicalRevenues.anlass_katalog_id);

		const protocolRows = input.protokollIds.length
			? await tx
					.update(protokolle)
					.set({ anlass_katalog_id: input.targetId })
					.where(
						and(inArray(protokolle.id, input.protokollIds), protocolSource),
					)
					.returning({ id: protokolle.id })
			: [];
		const historicalRows = input.historicalIds.length
			? await tx
					.update(historicalRevenues)
					.set({ anlass_katalog_id: input.targetId })
					.where(
						and(
							inArray(historicalRevenues.id, input.historicalIds),
							historicalSource,
						),
					)
					.returning({ id: historicalRevenues.id })
			: [];

		return {
			entry,
			protocols: protocolRows.length,
			historical: historicalRows.length,
			skipped:
				input.protokollIds.length +
				input.historicalIds.length -
				protocolRows.length -
				historicalRows.length,
		};
	});
}

export class AnlassKatalogConcurrencyError extends Error {
	constructor() {
		super("Umsatzgruppe wurde zwischenzeitlich geändert");
		this.name = "AnlassKatalogConcurrencyError";
	}
}
