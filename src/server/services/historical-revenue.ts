import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	isNull,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { HistoricalProtocolSource } from "@/lib/historical-protocol-import";
import type {
	HistoricalRevenueCorrectInput,
	HistoricalRevenueCreateInput,
	HistoricalRevenuePageInput,
} from "@/lib/schemas";
import { umsatzbereichLabel } from "@/lib/umsatzbereich";
import { type DbOrTx, db } from "@/server/db";
import {
	anlassKatalog,
	historicalRevenues,
	historicalSourceArchives,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { ilikeContains } from "@/server/services/search-pattern";

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

function matchesCorrectionRequest(
	row: HistoricalRevenueRow,
	input: HistoricalRevenueCorrectInput,
): boolean {
	const vergleichsgruppe = umsatzbereichLabel(input.umsatzbereich);
	return (
		row.korrigiert_von_id === input.id &&
		row.anlass_datum === input.anlass_datum &&
		row.anlass_katalog_id === input.anlass_katalog_id &&
		row.umsatzbereich === input.umsatzbereich &&
		row.vergleichsgruppe === vergleichsgruppe &&
		row.anlass === `${vergleichsgruppe} · ${input.veranstaltungsbezeichnung}` &&
		row.umsatz_cent === input.umsatz_cent &&
		row.ausgaben_cent === input.ausgaben_cent &&
		row.bemerkung === nullableText(input.bemerkung)
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

export async function listHistoricalRevenuePage(
	input: HistoricalRevenuePageInput,
) {
	const filters: SQL[] = [];
	if (!input.include_storniert) {
		filters.push(isNull(historicalRevenues.storniert_am));
	}
	if (input.year) {
		filters.push(
			gte(historicalRevenues.anlass_datum, `${input.year}-01-01`),
			lte(historicalRevenues.anlass_datum, `${input.year}-12-31`),
		);
	}
	if (input.umsatzbereich) {
		filters.push(eq(historicalRevenues.umsatzbereich, input.umsatzbereich));
	}
	if (input.query) {
		const query = ilikeContains(input.query);
		filters.push(
			or(
				ilike(historicalRevenues.anlass, query),
				ilike(historicalRevenues.vergleichsgruppe, query),
				ilike(historicalRevenues.quellreferenz, query),
				ilike(historicalRevenues.quelle_pfad, query),
				ilike(historicalRevenues.kassenbezeichnung, query),
			) as SQL,
		);
	}
	const where = filters.length > 0 ? and(...filters) : undefined;
	const [{ total }] = await db
		.select({ total: count() })
		.from(historicalRevenues)
		.where(where);
	const sortColumn =
		input.sort === "revenue"
			? historicalRevenues.umsatz_cent
			: input.sort === "expenses"
				? historicalRevenues.ausgaben_cent
				: input.sort === "result"
					? sql`${historicalRevenues.umsatz_cent} - ${historicalRevenues.ausgaben_cent}`
					: input.sort === "created_at"
						? historicalRevenues.created_at
						: historicalRevenues.anlass_datum;
	const order = input.direction === "asc" ? asc(sortColumn) : desc(sortColumn);
	const rows = await db
		.select({
			revenue: historicalRevenues,
			archiveSha256: historicalSourceArchives.sha256,
		})
		.from(historicalRevenues)
		.leftJoin(
			historicalSourceArchives,
			eq(historicalRevenues.quelle_sha256, historicalSourceArchives.sha256),
		)
		.where(where)
		.orderBy(order, desc(historicalRevenues.id))
		.limit(input.page_size)
		.offset((input.page - 1) * input.page_size);
	return {
		page: input.page,
		pageSize: input.page_size,
		total,
		pageCount: Math.ceil(total / input.page_size),
		items: rows.map(({ revenue, archiveSha256 }) => ({
			...revenue,
			source_archived: Boolean(archiveSha256),
		})),
	};
}

export async function getHistoricalRevenueDetails(id: string) {
	const [row] = await db
		.select()
		.from(historicalRevenues)
		.where(eq(historicalRevenues.id, id))
		.limit(1);
	if (!row) throw new HistoricalRevenueNotFoundError();
	const [predecessor, successor] = await Promise.all([
		row.korrigiert_von_id
			? db
					.select()
					.from(historicalRevenues)
					.where(eq(historicalRevenues.id, row.korrigiert_von_id))
					.limit(1)
			: Promise.resolve([]),
		db
			.select()
			.from(historicalRevenues)
			.where(eq(historicalRevenues.korrigiert_von_id, row.id))
			.limit(1),
	]);
	const sourceRow = row.quelle_sha256 ? row : predecessor[0];
	const [archive] = sourceRow?.quelle_sha256
		? await db
				.select()
				.from(historicalSourceArchives)
				.where(eq(historicalSourceArchives.sha256, sourceRow.quelle_sha256))
				.limit(1)
		: [];
	return {
		...row,
		predecessor: predecessor[0] ?? null,
		successor: successor[0] ?? null,
		source: sourceRow
			? {
					sha256: sourceRow.quelle_sha256,
					path: sourceRow.quelle_pfad,
					format: sourceRow.quelle_format,
					protocolNumber: sourceRow.quelle_belegnummer,
					cashRegisterNumber: sourceRow.kassennummer,
					cashRegisterLabel: sourceRow.kassenbezeichnung,
					countedBy: sourceRow.gezaehlt_von,
					openingCent: sourceRow.wechselgeld_cent,
					cardCent: sourceRow.kartenzahlung_cent,
					countedCent: sourceRow.gezaehlt_cent,
					cashRevenueCent: sourceRow.tageseinnahmen_bar_cent,
					denominations: sourceRow.stueckelung,
					vat: sourceRow.umsatz_ust,
					warnings: sourceRow.import_warnungen,
					archive: archive ?? null,
				}
			: null,
	};
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

export async function correctHistoricalRevenue(
	input: HistoricalRevenueCorrectInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">,
): Promise<{
	original: HistoricalRevenueRow;
	replacement: HistoricalRevenueRow;
}> {
	return db.transaction(async (tx) => {
		const [replayed] = await tx
			.select()
			.from(historicalRevenues)
			.where(eq(historicalRevenues.idempotency_key, input.idempotency_key))
			.limit(1);
		if (replayed) {
			if (!matchesCorrectionRequest(replayed, input)) {
				throw new HistoricalRevenueConflictError(
					"Idempotenzschlüssel wurde bereits für andere Daten verwendet",
					"idempotency_mismatch",
				);
			}
			const [original] = await tx
				.select()
				.from(historicalRevenues)
				.where(eq(historicalRevenues.id, input.id))
				.limit(1);
			if (!original) throw new HistoricalRevenueNotFoundError();
			return { original, replacement: replayed };
		}

		const [original] = await tx
			.select()
			.from(historicalRevenues)
			.where(eq(historicalRevenues.id, input.id))
			.limit(1)
			.for("update");
		if (!original) throw new HistoricalRevenueNotFoundError();
		if (original.storniert_am) {
			throw new HistoricalRevenueConflictError(
				"Historischer Umsatz wurde bereits storniert oder korrigiert",
				"already_cancelled",
			);
		}
		const [existingCorrection] = await tx
			.select({ id: historicalRevenues.id })
			.from(historicalRevenues)
			.where(eq(historicalRevenues.korrigiert_von_id, original.id))
			.limit(1);
		if (existingCorrection) {
			throw new HistoricalRevenueConflictError(
				"Für diesen Umsatz existiert bereits eine Korrektur",
				"already_cancelled",
			);
		}
		const [catalog] = input.anlass_katalog_id
			? await tx
					.select({ id: anlassKatalog.id })
					.from(anlassKatalog)
					.where(eq(anlassKatalog.id, input.anlass_katalog_id))
					.limit(1)
					.for("key share")
			: [];
		if (input.anlass_katalog_id && !catalog) {
			throw new HistoricalRevenueCatalogError();
		}
		const vergleichsgruppe = umsatzbereichLabel(input.umsatzbereich);
		const anlass = `${vergleichsgruppe} · ${input.veranstaltungsbezeichnung}`;
		if (anlass.length > 200) {
			throw new HistoricalRevenueInputError(
				"Veranstaltungsbezeichnung ist zusammen mit der Umsatzgruppe zu lang",
			);
		}
		const [replacement] = await tx
			.insert(historicalRevenues)
			.values({
				idempotency_key: input.idempotency_key,
				anlass_datum: input.anlass_datum,
				anlass,
				vergleichsgruppe,
				umsatzbereich: input.umsatzbereich,
				anlass_katalog_id: catalog?.id ?? null,
				umsatz_cent: input.umsatz_cent,
				ausgaben_cent: input.ausgaben_cent,
				bemerkung: nullableText(input.bemerkung),
				quellreferenz:
					`Korrektur zu ${original.quellreferenz ?? original.id}`.slice(0, 500),
				korrigiert_von_id: original.id,
				erstellt_von_user_id: actor.id,
				erstellt_von_name: actor.name,
				erstellt_von_email: actor.email,
			})
			.returning();
		const [cancelled] = await tx
			.update(historicalRevenues)
			.set({
				storniert_am: new Date(),
				storniert_von_user_id: actor.id,
				storniert_von_name: actor.name,
				storniert_von_email: actor.email,
				storno_grund: input.korrektur_grund.slice(0, 500),
			})
			.where(
				and(
					eq(historicalRevenues.id, original.id),
					isNull(historicalRevenues.storniert_am),
				),
			)
			.returning();
		if (!replacement || !cancelled) {
			throw new HistoricalRevenueConflictError(
				"Der Umsatz wurde zwischenzeitlich geändert",
				"already_cancelled",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.corrected",
			actor,
			subject: {
				type: "historischer_umsatz",
				id: replacement.id,
				label: replacement.anlass,
			},
			metadata: {
				...audit.metadata,
				ursprung_id: original.id,
				grund: input.korrektur_grund,
				vorher_umsatz_cent: original.umsatz_cent,
				nachher_umsatz_cent: replacement.umsatz_cent,
				vorher_ausgaben_cent: original.ausgaben_cent,
				nachher_ausgaben_cent: replacement.ausgaben_cent,
			},
		});
		return { original: cancelled, replacement };
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
