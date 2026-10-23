import { csvDocument } from "@/lib/csv";
import { formatDateDe } from "@/lib/date";
import { formatCentPlain } from "@/lib/money";

export type RevenueExportRow = {
	date: string;
	occasion: string;
	revenueArea?: string;
	comparisonGroup: string;
	revenueCent: number;
	// Historical totals have no reliable payment split. Null is not zero.
	revenueCashCent: number | null;
	revenueCardCent: number | null;
	expensesCent: number;
	source: "Kassenzählprotokoll" | "Altunterlage";
	reference: string;
	status: "aktiv" | "storniert";
	note: string;
};

export const REVENUE_EXPORT_HEADERS = [
	"Datum",
	"Jahr",
	"Umsatzbereich",
	"Details",
	"Barumsatz EUR",
	"Kartenumsatz EUR",
	"Gesamtumsatz brutto EUR",
	"Zahlungsaufteilung",
	"Ausgaben EUR",
	"Überschuss EUR",
	"Quelle",
	"Quellreferenz",
	"Status",
	"Bemerkung",
] as const;

export function revenuePaymentSplitLabel(row: RevenueExportRow): string {
	return row.revenueCashCent === null || row.revenueCardCent === null
		? "Aufteilung unbekannt"
		: "Getrennt erfasst";
}

export function revenueCsvDocument(rows: RevenueExportRow[]): string {
	return csvDocument([
		[...REVENUE_EXPORT_HEADERS],
		...rows.map((row) => [
			formatDateDe(row.date),
			row.date.slice(0, 4),
			row.revenueArea || row.comparisonGroup,
			row.occasion.includes(" · ")
				? row.occasion.slice(row.occasion.indexOf(" · ") + 3)
				: row.occasion,
			row.revenueCashCent === null ? "" : formatCentPlain(row.revenueCashCent),
			row.revenueCardCent === null ? "" : formatCentPlain(row.revenueCardCent),
			formatCentPlain(row.revenueCent),
			revenuePaymentSplitLabel(row),
			formatCentPlain(row.expensesCent),
			formatCentPlain(row.revenueCent - row.expensesCent),
			row.source,
			row.reference,
			row.status,
			row.note,
		]),
	]);
}
