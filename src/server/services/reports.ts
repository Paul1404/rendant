import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { groupByUstRate, type UstGroup } from "@/lib/ust";
import { db } from "@/server/db";
import { ausgaben, protokolle, protokollUmsatzUst } from "@/server/db/schema";

export type VatSummary = {
	revenue: UstGroup[]; // Umsatzsteuer auf den Umsatz (aus protokoll_umsatz_ust)
	expenses: UstGroup[]; // Vorsteuer auf Ausgaben (aus ausgaben)
};

// VAT broken down by rate for all active protokolle whose anlass_datum falls in
// [von, bis]. Computed from the child tables, which the list endpoint does not
// carry, so this is its own server aggregation.
//
// Summed and grouped in PostgreSQL rather than in Node. The previous version
// first selected every matching protokoll id, then passed the whole list back as
// an `IN (...)` on two queries and pulled every child row over to group them
// here. The dashboard polls this every 15 seconds and "Alle Jahre" resolves to
// von = 2000-01-01, so the statement and the transferred rows both grew with the
// protocol count. This returns one row per VAT rate regardless of scale.
async function sumByRate(
	table: typeof protokollUmsatzUst | typeof ausgaben,
	von: string,
	bis: string,
): Promise<Array<{ betrag_cent: number; ust_basis_punkte: number }>> {
	const rows = await db
		.select({
			betrag_cent: sql<string>`sum(${table.betrag_cent})`,
			ust_basis_punkte: sql<number>`coalesce(${table.ust_basis_punkte}, 0)`,
		})
		.from(table)
		.innerJoin(protokolle, eq(table.protokoll_id, protokolle.id))
		.where(
			and(
				isNull(protokolle.storniert_am),
				gte(protokolle.anlass_datum, von),
				lte(protokolle.anlass_datum, bis),
			),
		)
		.groupBy(sql`coalesce(${table.ust_basis_punkte}, 0)`);
	return rows.map((row) => ({
		betrag_cent: Number(row.betrag_cent ?? 0),
		ust_basis_punkte: Number(row.ust_basis_punkte ?? 0),
	}));
}

export async function vatSummary(
	von: string,
	bis: string,
): Promise<VatSummary> {
	const [umsatzRows, ausgabenRows] = await Promise.all([
		sumByRate(protokollUmsatzUst, von, bis),
		sumByRate(ausgaben, von, bis),
	]);

	return {
		revenue: groupByUstRate(umsatzRows),
		expenses: groupByUstRate(ausgabenRows),
	};
}
