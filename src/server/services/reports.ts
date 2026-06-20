import { and, gte, inArray, isNull, lte } from "drizzle-orm";
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
export async function vatSummary(
	von: string,
	bis: string,
): Promise<VatSummary> {
	const activeRows = await db
		.select({ id: protokolle.id })
		.from(protokolle)
		.where(
			and(
				isNull(protokolle.storniert_am),
				gte(protokolle.anlass_datum, von),
				lte(protokolle.anlass_datum, bis),
			),
		);
	const ids = activeRows.map((r) => r.id);
	if (ids.length === 0) return { revenue: [], expenses: [] };

	const [umsatzRows, ausgabenRows] = await Promise.all([
		db
			.select({
				betrag_cent: protokollUmsatzUst.betrag_cent,
				ust_basis_punkte: protokollUmsatzUst.ust_basis_punkte,
			})
			.from(protokollUmsatzUst)
			.where(inArray(protokollUmsatzUst.protokoll_id, ids)),
		db
			.select({
				betrag_cent: ausgaben.betrag_cent,
				ust_basis_punkte: ausgaben.ust_basis_punkte,
			})
			.from(ausgaben)
			.where(inArray(ausgaben.protokoll_id, ids)),
	]);

	return {
		revenue: groupByUstRate(
			umsatzRows.map((r) => ({
				betrag_cent: Number(r.betrag_cent),
				ust_basis_punkte: Number(r.ust_basis_punkte ?? 0),
			})),
		),
		expenses: groupByUstRate(
			ausgabenRows.map((r) => ({
				betrag_cent: Number(r.betrag_cent),
				ust_basis_punkte: Number(r.ust_basis_punkte ?? 0),
			})),
		),
	};
}
