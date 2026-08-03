import { and, desc, eq, isNull } from "drizzle-orm";
import type { HistoricalProtocolSource } from "@/lib/historical-protocol-import";
import type { HistoricalRevenueCreateInput } from "@/lib/schemas";
import { umsatzbereichLabel } from "@/lib/umsatzbereich";
import { type DbOrTx, db } from "@/server/db";
import { anlassKatalog, historicalRevenues } from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";

export type HistoricalRevenueRow = typeof historicalRevenues.$inferSelect;

export class HistoricalRevenueConflictError extends Error {
	constructor(
		message: string,
		public readonly reason: "idempotency_mismatch" | "already_cancelled",
	) {
		super(message);
		this.name = "HistoricalRevenueConflictError";
	}
}

export class HistoricalRevenueNotFoundError extends Error {
	constructor() {
		super("Historischer Umsatz nicht gefunden");
		this.name = "HistoricalRevenueNotFoundError";
	}
}

export class HistoricalRevenueCatalogError extends Error {
	constructor() {
		super("Umsatzgruppe wurde nicht gefunden");
		this.name = "HistoricalRevenueCatalogError";
	}
}

export class HistoricalRevenueInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HistoricalRevenueInputError";
	}
}

function nullableText(value: string | null | undefined): string | null {
	return value || null;
}

function matchesIdempotentRequest(
	row: HistoricalRevenueRow,
	input: HistoricalRevenueCreateInput,
	actor: AuthUser,
	allowDifferentActor: boolean,
	source?: HistoricalProtocolSource,
): boolean {
	return (
		row.anlass_datum === input.anlass_datum &&
		row.umsatzbereich === input.umsatzbereich &&
		row.anlass_katalog_id === input.anlass_katalog_id &&
		row.anlass ===
			`${row.vergleichsgruppe} · ${input.veranstaltungsbezeichnung}` &&
		row.umsatz_cent === input.umsatz_cent &&
		row.ausgaben_cent === input.ausgaben_cent &&
		row.bemerkung === nullableText(input.bemerkung) &&
		row.quellreferenz === nullableText(input.quellreferenz) &&
		(!source ||
			(row.quelle_sha256 === source.sha256 &&
				row.quelle_pfad === source.path &&
				row.quelle_format === source.format &&
				row.quelle_belegnummer === source.protocolNumber &&
				row.quelle_datum_herkunft === source.dateOrigin &&
				row.kassennummer === source.cashRegisterNumber &&
				row.kassenbezeichnung === source.cashRegisterLabel &&
				row.gezaehlt_von === source.countedBy &&
				row.wechselgeld_cent === source.openingCent &&
				row.kartenzahlung_cent === source.cardCent &&
				row.gezaehlt_cent === source.countedCent &&
				row.tageseinnahmen_bar_cent === source.cashRevenueCent)) &&
		(allowDifferentActor || row.erstellt_von_user_id === actor.id)
	);
}

export async function listHistoricalRevenues(): Promise<
	HistoricalRevenueRow[]
> {
	return db
		.select()
		.from(historicalRevenues)
		.orderBy(
			desc(historicalRevenues.anlass_datum),
			desc(historicalRevenues.created_at),
		);
}

export async function createHistoricalRevenueWithDb(
	database: DbOrTx,
	input: HistoricalRevenueCreateInput,
	actor: AuthUser,
	options: {
		allowDifferentActor?: boolean;
		source?: HistoricalProtocolSource;
	} = {},
): Promise<{ row: HistoricalRevenueRow; created: boolean }> {
	const [umsatzgruppe] = input.anlass_katalog_id
		? await database
				.select({ id: anlassKatalog.id, name: anlassKatalog.name })
				.from(anlassKatalog)
				.where(eq(anlassKatalog.id, input.anlass_katalog_id))
				.limit(1)
				.for("key share")
		: [];
	if (input.anlass_katalog_id && !umsatzgruppe)
		throw new HistoricalRevenueCatalogError();
	const bereich = umsatzbereichLabel(input.umsatzbereich);
	const anlass = `${bereich} · ${input.veranstaltungsbezeichnung}`;
	if (anlass.length > 200) {
		throw new HistoricalRevenueInputError(
			"Veranstaltungsbezeichnung ist zusammen mit der Umsatzgruppe zu lang",
		);
	}

	const inserted = await database
		.insert(historicalRevenues)
		.values({
			idempotency_key: input.idempotency_key,
			anlass_datum: input.anlass_datum,
			anlass,
			vergleichsgruppe: bereich,
			umsatzbereich: input.umsatzbereich,
			anlass_katalog_id: umsatzgruppe?.id ?? null,
			umsatz_cent: input.umsatz_cent,
			ausgaben_cent: input.ausgaben_cent,
			bemerkung: nullableText(input.bemerkung),
			quellreferenz: nullableText(input.quellreferenz),
			quelle_sha256: options.source?.sha256,
			quelle_pfad: options.source?.path,
			quelle_format: options.source?.format,
			quelle_belegnummer: options.source?.protocolNumber,
			quelle_datum_herkunft: options.source?.dateOrigin,
			kassennummer: options.source?.cashRegisterNumber,
			kassenbezeichnung: options.source?.cashRegisterLabel,
			gezaehlt_von: options.source?.countedBy,
			wechselgeld_cent: options.source?.openingCent,
			kartenzahlung_cent: options.source?.cardCent,
			gezaehlt_cent: options.source?.countedCent,
			tageseinnahmen_bar_cent: options.source?.cashRevenueCent,
			stueckelung: options.source?.denominations,
			umsatz_ust: options.source?.vat,
			import_warnungen: options.source?.warnings,
			erstellt_von_user_id: actor.id,
			erstellt_von_name: actor.name,
			erstellt_von_email: actor.email,
		})
		.onConflictDoNothing({ target: historicalRevenues.idempotency_key })
		.returning();
	if (inserted[0]) return { row: inserted[0], created: true };

	const [existing] = await database
		.select()
		.from(historicalRevenues)
		.where(eq(historicalRevenues.idempotency_key, input.idempotency_key))
		.limit(1);
	if (
		!existing ||
		!matchesIdempotentRequest(
			existing,
			input,
			actor,
			options.allowDifferentActor ?? false,
			options.source,
		)
	) {
		throw new HistoricalRevenueConflictError(
			"Idempotenzschlüssel wurde bereits für andere Daten verwendet",
			"idempotency_mismatch",
		);
	}
	return { row: existing, created: false };
}

export async function createHistoricalRevenue(
	input: HistoricalRevenueCreateInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">,
): Promise<{ row: HistoricalRevenueRow; created: boolean }> {
	return db.transaction(async (tx) => {
		const result = await createHistoricalRevenueWithDb(tx, input, actor);
		if (result.created) {
			await recordAuditEventStrict(tx, {
				...audit,
				category: "umsaetze",
				action: "umsaetze.created",
				actor,
				subject: {
					type: "historischer_umsatz",
					id: result.row.id,
					label: result.row.anlass,
				},
				metadata: {
					...audit.metadata,
					anlass_datum: result.row.anlass_datum,
					vergleichsgruppe: result.row.vergleichsgruppe,
					umsatz_cent: result.row.umsatz_cent,
					ausgaben_cent: result.row.ausgaben_cent,
				},
			});
		}
		return result;
	});
}

export async function cancelHistoricalRevenue(
	id: string,
	stornoGrund: string,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">,
): Promise<HistoricalRevenueRow> {
	const cancelled = await db.transaction(async (tx) => {
		const rows = await tx
			.update(historicalRevenues)
			.set({
				storniert_am: new Date(),
				storniert_von_user_id: actor.id,
				storniert_von_name: actor.name,
				storniert_von_email: actor.email,
				storno_grund: stornoGrund,
			})
			.where(
				and(
					eq(historicalRevenues.id, id),
					isNull(historicalRevenues.storniert_am),
				),
			)
			.returning();
		if (rows[0]) {
			await recordAuditEventStrict(tx, {
				...audit,
				category: "umsaetze",
				action: "umsaetze.cancelled",
				actor,
				subject: {
					type: "historischer_umsatz",
					id: rows[0].id,
					label: rows[0].anlass,
				},
				metadata: { ...audit.metadata, grund: stornoGrund },
			});
		}
		return rows;
	});
	if (cancelled[0]) return cancelled[0];

	const [existing] = await db
		.select({ id: historicalRevenues.id })
		.from(historicalRevenues)
		.where(eq(historicalRevenues.id, id))
		.limit(1);
	if (!existing) throw new HistoricalRevenueNotFoundError();
	throw new HistoricalRevenueConflictError(
		"Historischer Umsatz ist bereits storniert",
		"already_cancelled",
	);
}
