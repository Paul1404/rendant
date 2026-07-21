import { and, gte, lte } from "drizzle-orm";
import { type RevenueExportRow, revenueCsvDocument } from "@/lib/revenue-csv";
import { db } from "@/server/db";
import { historicalRevenues, protokolle } from "@/server/db/schema";

export type RevenueExport = {
	csv: string;
	count: number;
	totalCent: number;
};

export async function exportRevenueCsv(
	von: string,
	bis: string,
): Promise<RevenueExport> {
	const [protocolRows, historicalRows] = await Promise.all([
		db
			.select({
				date: protokolle.anlass_datum,
				occasion: protokolle.anlass,
				revenueCashCent: protokolle.tageseinnahmen_cent,
				revenueCardCent: protokolle.kartenzahlung_cent,
				expensesCent: protokolle.ausgaben_cent,
				reference: protokolle.belegnummer,
				cancelledAt: protokolle.storniert_am,
				note: protokolle.bemerkung,
			})
			.from(protokolle)
			.where(
				and(
					gte(protokolle.anlass_datum, von),
					lte(protokolle.anlass_datum, bis),
				),
			),
		db
			.select({
				date: historicalRevenues.anlass_datum,
				occasion: historicalRevenues.anlass,
				comparisonGroup: historicalRevenues.vergleichsgruppe,
				revenueCent: historicalRevenues.umsatz_cent,
				expensesCent: historicalRevenues.ausgaben_cent,
				reference: historicalRevenues.quellreferenz,
				cancelledAt: historicalRevenues.storniert_am,
				note: historicalRevenues.bemerkung,
			})
			.from(historicalRevenues)
			.where(
				and(
					gte(historicalRevenues.anlass_datum, von),
					lte(historicalRevenues.anlass_datum, bis),
				),
			),
	]);

	const rows: RevenueExportRow[] = [
		...protocolRows.map((row) => ({
			date: row.date,
			occasion: row.occasion,
			comparisonGroup: row.occasion,
			revenueCent:
				Number(row.revenueCashCent) + Number(row.revenueCardCent ?? 0),
			expensesCent: Number(row.expensesCent),
			source: "Kassenzählprotokoll" as const,
			reference: row.reference,
			status: row.cancelledAt ? ("storniert" as const) : ("aktiv" as const),
			note: row.note,
		})),
		...historicalRows.map((row) => ({
			date: row.date,
			occasion: row.occasion,
			comparisonGroup: row.comparisonGroup,
			revenueCent: Number(row.revenueCent),
			expensesCent: Number(row.expensesCent),
			source: "Altunterlage" as const,
			reference: row.reference ?? "",
			status: row.cancelledAt ? ("storniert" as const) : ("aktiv" as const),
			note: row.note ?? "",
		})),
	].sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			a.occasion.localeCompare(b.occasion, "de-DE") ||
			a.source.localeCompare(b.source, "de-DE"),
	);

	const csv = revenueCsvDocument(rows);

	return {
		csv,
		count: rows.length,
		totalCent: rows
			.filter((row) => row.status === "aktiv")
			.reduce((sum, row) => sum + row.revenueCent, 0),
	};
}
