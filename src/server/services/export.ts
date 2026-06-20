import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { formatCentPlain } from "@/lib/money";
import { formatUstSatz } from "@/lib/ust";
import { db } from "@/server/db";
import { ausgaben, protokolle, protokollUmsatzUst } from "@/server/db/schema";
import { vatSummary } from "@/server/services/reports";

function csvCell(value: string): string {
	const needsQuote = /[;"\n\r]/.test(value);
	const escaped = value.replace(/"/g, '""');
	return needsQuote ? `"${escaped}"` : escaped;
}

function csvDocument(rows: string[][]): string {
	const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
	return `﻿${body}\r\n`;
}

// USt-Auswertung: VAT grouped by rate for the period, split into Umsatzsteuer
// (auf den Umsatz) und Vorsteuer (auf Ausgaben), with totals and the Zahllast.
export async function exportUstCsv(von: string, bis: string): Promise<string> {
	const { revenue, expenses } = await vatSummary(von, bis);
	const rows: string[][] = [
		["Bereich", "USt-Satz", "Netto EUR", "USt EUR", "Brutto EUR"],
	];

	let ustTotal = 0;
	for (const g of revenue) {
		ustTotal += g.ust_cent;
		rows.push([
			"Umsatz",
			formatUstSatz(g.bp),
			formatCentPlain(g.netto_cent),
			formatCentPlain(g.ust_cent),
			formatCentPlain(g.brutto_cent),
		]);
	}

	let vorsteuerTotal = 0;
	for (const g of expenses) {
		vorsteuerTotal += g.ust_cent;
		rows.push([
			"Ausgaben",
			formatUstSatz(g.bp),
			formatCentPlain(g.netto_cent),
			formatCentPlain(g.ust_cent),
			formatCentPlain(g.brutto_cent),
		]);
	}

	rows.push([]);
	rows.push(["Umsatzsteuer", "", "", formatCentPlain(ustTotal), ""]);
	rows.push(["Vorsteuer", "", "", formatCentPlain(vorsteuerTotal), ""]);
	rows.push([
		"Zahllast",
		"",
		"",
		formatCentPlain(ustTotal - vorsteuerTotal),
		"",
	]);

	return csvDocument(rows);
}

export type JsonExport = {
	exportedAt: string;
	range: { von: string; bis: string };
	count: number;
	protokolle: Array<
		typeof protokolle.$inferSelect & {
			ausgaben: (typeof ausgaben.$inferSelect)[];
			umsatz_ust: (typeof protokollUmsatzUst.$inferSelect)[];
		}
	>;
};

// Full structured backup of every protokoll (incl. storniert) in the period
// with its child rows. Intended as a portable archive / re-import source.
export async function exportJson(
	von: string,
	bis: string,
): Promise<JsonExport> {
	const protoRows = await db
		.select()
		.from(protokolle)
		.where(
			and(gte(protokolle.anlass_datum, von), lte(protokolle.anlass_datum, bis)),
		)
		.orderBy(asc(protokolle.anlass_datum), asc(protokolle.belegnummer));

	const ids = protoRows.map((p) => p.id);
	const [ausgabenRows, umsatzRows] = ids.length
		? await Promise.all([
				db.select().from(ausgaben).where(inArray(ausgaben.protokoll_id, ids)),
				db
					.select()
					.from(protokollUmsatzUst)
					.where(inArray(protokollUmsatzUst.protokoll_id, ids)),
			])
		: [[], []];

	const ausgabenByProto = new Map<string, (typeof ausgaben.$inferSelect)[]>();
	for (const a of ausgabenRows) {
		const list = ausgabenByProto.get(a.protokoll_id) ?? [];
		list.push(a);
		ausgabenByProto.set(a.protokoll_id, list);
	}
	const umsatzByProto = new Map<
		string,
		(typeof protokollUmsatzUst.$inferSelect)[]
	>();
	for (const u of umsatzRows) {
		const list = umsatzByProto.get(u.protokoll_id) ?? [];
		list.push(u);
		umsatzByProto.set(u.protokoll_id, list);
	}

	return {
		exportedAt: new Date().toISOString(),
		range: { von, bis },
		count: protoRows.length,
		protokolle: protoRows.map((p) => ({
			...p,
			ausgaben: (ausgabenByProto.get(p.id) ?? []).sort(
				(a, b) => a.reihenfolge - b.reihenfolge,
			),
			umsatz_ust: (umsatzByProto.get(p.id) ?? []).sort(
				(a, b) => a.reihenfolge - b.reihenfolge,
			),
		})),
	};
}
