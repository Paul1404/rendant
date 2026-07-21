import { asc, eq, sql } from "drizzle-orm";
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

// How many stored rows still point at this catalog entry. Deletion is blocked
// while referenced so we never silently drop a grouping; deactivate instead.
export async function countKatalogReferences(id: string): Promise<number> {
	const [p, h] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)` })
			.from(protokolle)
			.where(eq(protokolle.anlass_katalog_id, id)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(historicalRevenues)
			.where(eq(historicalRevenues.anlass_katalog_id, id)),
	]);
	return Number(p[0]?.n ?? 0) + Number(h[0]?.n ?? 0);
}

export async function deleteKatalog(
	id: string,
): Promise<AnlassKatalogEntry | null> {
	const rows = await db
		.delete(anlassKatalog)
		.where(eq(anlassKatalog.id, id))
		.returning();
	return rows[0] ? rowToEntry(rows[0]) : null;
}
