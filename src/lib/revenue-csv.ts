import { csvDocument } from "@/lib/csv";
import { formatDateDe } from "@/lib/date";
import { formatCentPlain } from "@/lib/money";

export type RevenueExportRow = {
	date: string;
	occasion: string;
	comparisonGroup: string;
	revenueCent: number;
	expensesCent: number;
	source: "Kassenzählprotokoll" | "Altunterlage";
	reference: string;
	status: "aktiv" | "storniert";
	note: string;
};

export function revenueCsvDocument(rows: RevenueExportRow[]): string {
	return csvDocument([
		[
			"Datum",
			"Jahr",
			"Veranstaltung",
			"Umsatzgruppe",
			"Umsatz brutto EUR",
			"Ausgaben EUR",
			"Überschuss EUR",
			"Quelle",
			"Quellreferenz",
			"Status",
			"Bemerkung",
		],
		...rows.map((row) => [
			formatDateDe(row.date),
			row.date.slice(0, 4),
			row.occasion,
			row.comparisonGroup,
			formatCentPlain(row.revenueCent),
			formatCentPlain(row.expensesCent),
			formatCentPlain(row.revenueCent - row.expensesCent),
			row.source,
			row.reference,
			row.status,
			row.note,
		]),
	]);
}
