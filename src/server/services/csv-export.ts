import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { csvCell } from "@/lib/csv";
import { formatDateDe, formatDateTimeDe } from "@/lib/date";
import { formatCentPlain } from "@/lib/money";
import { ustAnteilCent } from "@/lib/ust";
import { db } from "@/server/db";
import { ausgaben, protokolle } from "@/server/db/schema";

const HEADERS = [
	"Belegnummer",
	"Datum",
	"Kassennummer",
	"Kassenbezeichnung",
	"Anlass",
	"Gezählt von",
	"Geprüft von",
	"Wechselgeld EUR",
	"Gezählt EUR",
	"Ausgaben EUR",
	"USt EUR",
	"Bestand EUR",
	"Tageseinnahmen EUR",
	"Kartenzahlung EUR",
	"Tageseinnahmen inkl. Karte EUR",
	"Status",
	"Storniert am",
	"Storno-Grund",
	"Bemerkung",
];

export async function exportCsv(von: string, bis: string): Promise<string> {
	const rows = await db
		.select({
			id: protokolle.id,
			belegnummer: protokolle.belegnummer,
			anlass_datum: protokolle.anlass_datum,
			kassennummer: protokolle.kassennummer,
			kassenbezeichnung: protokolle.kassenbezeichnung,
			anlass: protokolle.anlass,
			gezaehlt_von: protokolle.gezaehlt_von,
			geprueft_von: protokolle.geprueft_von,
			bemerkung: protokolle.bemerkung,
			wechselgeld_cent: protokolle.wechselgeld_cent,
			kartenzahlung_cent: protokolle.kartenzahlung_cent,
			gezaehlt_cent: protokolle.gezaehlt_cent,
			ausgaben_cent: protokolle.ausgaben_cent,
			bestand_cent: protokolle.bestand_cent,
			tageseinnahmen_cent: protokolle.tageseinnahmen_cent,
			storniert_am: protokolle.storniert_am,
			storno_grund: protokolle.storno_grund,
		})
		.from(protokolle)
		.where(
			and(gte(protokolle.anlass_datum, von), lte(protokolle.anlass_datum, bis)),
		)
		.orderBy(asc(protokolle.belegnummer));

	const ids = rows.map((r) => r.id);
	const ausgabenRows = ids.length
		? await db
				.select({
					protokoll_id: ausgaben.protokoll_id,
					betrag_cent: ausgaben.betrag_cent,
					ust_basis_punkte: ausgaben.ust_basis_punkte,
				})
				.from(ausgaben)
				.where(inArray(ausgaben.protokoll_id, ids))
		: [];

	const ustByProto = new Map<string, number>();
	for (const a of ausgabenRows) {
		const prev = ustByProto.get(a.protokoll_id) ?? 0;
		ustByProto.set(
			a.protokoll_id,
			prev + ustAnteilCent(Number(a.betrag_cent), Number(a.ust_basis_punkte)),
		);
	}

	const lines: string[] = [HEADERS.join(";")];
	for (const r of rows) {
		const status = r.storniert_am ? "storniert" : "aktiv";
		const ust = ustByProto.get(r.id) ?? 0;
		const karte = Number(r.kartenzahlung_cent ?? 0);
		const tageseinnahmen = Number(r.tageseinnahmen_cent);
		const cells = [
			r.belegnummer,
			formatDateDe(r.anlass_datum),
			r.kassennummer,
			r.kassenbezeichnung,
			r.anlass,
			r.gezaehlt_von,
			r.geprueft_von,
			formatCentPlain(Number(r.wechselgeld_cent)),
			formatCentPlain(Number(r.gezaehlt_cent)),
			formatCentPlain(Number(r.ausgaben_cent)),
			formatCentPlain(ust),
			formatCentPlain(Number(r.bestand_cent)),
			formatCentPlain(tageseinnahmen),
			formatCentPlain(karte),
			formatCentPlain(tageseinnahmen + karte),
			status,
			r.storniert_am ? formatDateTimeDe(r.storniert_am) : "",
			r.storno_grund ?? "",
			r.bemerkung,
		];
		lines.push(cells.map(csvCell).join(";"));
	}
	return `﻿${lines.join("\r\n")}\r\n`;
}
