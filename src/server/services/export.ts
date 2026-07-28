import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { csvDocument } from "@/lib/csv";
import { formatCentPlain } from "@/lib/money";
import { formatUstSatz } from "@/lib/ust";
import { db } from "@/server/db";
import {
	anlassAliase,
	anlassKatalog,
	appSettings,
	ausgaben,
	belegnummerSequences,
	cashRegisters,
	historicalRevenues,
	protokolle,
	protokollUmsatzUst,
} from "@/server/db/schema";
import { vatSummary } from "@/server/services/reports";
import packageJson from "../../../package.json";

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

type ProtokollArchiveRow = typeof protokolle.$inferSelect & {
	ausgaben: (typeof ausgaben.$inferSelect)[];
	umsatz_ust: (typeof protokollUmsatzUst.$inferSelect)[];
};

export type SafeAppSettings = Omit<
	typeof appSettings.$inferSelect,
	"smtp_password_enc"
>;

export type BusinessArchiveCollections = {
	protokolle: ProtokollArchiveRow[];
	historische_umsaetze: (typeof historicalRevenues.$inferSelect)[];
	umsatzgruppen: (typeof anlassKatalog.$inferSelect)[];
	umsatzgruppen_aliase: (typeof anlassAliase.$inferSelect)[];
	kassen: (typeof cashRegisters.$inferSelect)[];
	belegnummer_sequenzen: (typeof belegnummerSequences.$inferSelect)[];
	einstellungen: SafeAppSettings | null;
};

export type BusinessArchive = {
	// Stable external protocol marker retained for existing archive consumers.
	format: "svufo-business-archive";
	schemaVersion: 1;
	appVersion: string;
	exportedAt: string;
	range: { von: string; bis: string };
	counts: Record<keyof BusinessArchiveCollections, number>;
	data: BusinessArchiveCollections;
	excluded: string[];
};

export function sanitizeAppSettingsForArchive(
	settings: typeof appSettings.$inferSelect,
): SafeAppSettings {
	const { smtp_password_enc: _excluded, ...safe } = settings;
	return safe;
}

export function buildBusinessArchive(
	collections: BusinessArchiveCollections,
	meta: { von: string; bis: string; exportedAt?: string },
): BusinessArchive {
	return {
		format: "svufo-business-archive",
		schemaVersion: 1,
		appVersion: packageJson.version,
		exportedAt: meta.exportedAt ?? new Date().toISOString(),
		range: { von: meta.von, bis: meta.bis },
		counts: {
			protokolle: collections.protokolle.length,
			historische_umsaetze: collections.historische_umsaetze.length,
			umsatzgruppen: collections.umsatzgruppen.length,
			umsatzgruppen_aliase: collections.umsatzgruppen_aliase.length,
			kassen: collections.kassen.length,
			belegnummer_sequenzen: collections.belegnummer_sequenzen.length,
			einstellungen: collections.einstellungen ? 1 : 0,
		},
		data: collections,
		excluded: [
			"Anmeldedaten, Sitzungen und Einladungs-Tokens",
			"Audit-Log",
			"verschluesseltes SMTP-Passwort",
			"PDF-Dateiinhalte im Objektspeicher",
		],
	};
}

// Structured business archive for the selected period. This is deliberately
// not called a database backup: auth data, secrets, audit rows and S3 objects
// require the separate PostgreSQL/object-storage recovery process.
export async function exportJson(
	von: string,
	bis: string,
): Promise<BusinessArchive> {
	const protoRows = await db
		.select()
		.from(protokolle)
		.where(
			and(gte(protokolle.anlass_datum, von), lte(protokolle.anlass_datum, bis)),
		)
		.orderBy(asc(protokolle.anlass_datum), asc(protokolle.belegnummer));

	const ids = protoRows.map((p) => p.id);
	const [
		ausgabenRows,
		umsatzRows,
		historicalRows,
		catalogRows,
		aliasRows,
		registerRows,
		sequenceRows,
		settingsRows,
	] = await Promise.all([
		ids.length
			? db.select().from(ausgaben).where(inArray(ausgaben.protokoll_id, ids))
			: Promise.resolve([]),
		ids.length
			? db
					.select()
					.from(protokollUmsatzUst)
					.where(inArray(protokollUmsatzUst.protokoll_id, ids))
			: Promise.resolve([]),
		db
			.select()
			.from(historicalRevenues)
			.where(
				and(
					gte(historicalRevenues.anlass_datum, von),
					lte(historicalRevenues.anlass_datum, bis),
				),
			)
			.orderBy(
				asc(historicalRevenues.anlass_datum),
				asc(historicalRevenues.created_at),
			),
		db.select().from(anlassKatalog).orderBy(asc(anlassKatalog.reihenfolge)),
		db.select().from(anlassAliase).orderBy(asc(anlassAliase.alias_norm)),
		db.select().from(cashRegisters).orderBy(asc(cashRegisters.reihenfolge)),
		db
			.select()
			.from(belegnummerSequences)
			.orderBy(asc(belegnummerSequences.year)),
		db.select().from(appSettings).limit(1),
	]);

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

	const setting = settingsRows[0];
	const safeSettings = setting ? sanitizeAppSettingsForArchive(setting) : null;

	return buildBusinessArchive(
		{
			protokolle: protoRows.map((p) => ({
				...p,
				ausgaben: (ausgabenByProto.get(p.id) ?? []).sort(
					(a, b) => a.reihenfolge - b.reihenfolge,
				),
				umsatz_ust: (umsatzByProto.get(p.id) ?? []).sort(
					(a, b) => a.reihenfolge - b.reihenfolge,
				),
			})),
			historische_umsaetze: historicalRows,
			umsatzgruppen: catalogRows,
			umsatzgruppen_aliase: aliasRows,
			kassen: registerRows,
			belegnummer_sequenzen: sequenceRows,
			einstellungen: safeSettings,
		},
		{ von, bis },
	);
}
