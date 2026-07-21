import { and, desc, eq, isNull } from "drizzle-orm";
import type { HistoricalRevenueCreateInput } from "@/lib/schemas";
import { db } from "@/server/db";
import { historicalRevenues } from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";

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

function nullableText(value: string | null | undefined): string | null {
	return value || null;
}

function matchesIdempotentRequest(
	row: HistoricalRevenueRow,
	input: HistoricalRevenueCreateInput,
	actor: AuthUser,
): boolean {
	return (
		row.anlass_datum === input.anlass_datum &&
		row.anlass === input.anlass &&
		row.vergleichsgruppe === input.vergleichsgruppe &&
		row.umsatz_cent === input.umsatz_cent &&
		row.ausgaben_cent === input.ausgaben_cent &&
		row.bemerkung === nullableText(input.bemerkung) &&
		row.quellreferenz === nullableText(input.quellreferenz) &&
		row.erstellt_von_user_id === actor.id
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

export async function createHistoricalRevenue(
	input: HistoricalRevenueCreateInput,
	actor: AuthUser,
): Promise<{ row: HistoricalRevenueRow; created: boolean }> {
	const inserted = await db
		.insert(historicalRevenues)
		.values({
			idempotency_key: input.idempotency_key,
			anlass_datum: input.anlass_datum,
			anlass: input.anlass,
			vergleichsgruppe: input.vergleichsgruppe,
			umsatz_cent: input.umsatz_cent,
			ausgaben_cent: input.ausgaben_cent,
			bemerkung: nullableText(input.bemerkung),
			quellreferenz: nullableText(input.quellreferenz),
			erstellt_von_user_id: actor.id,
			erstellt_von_name: actor.name,
			erstellt_von_email: actor.email,
		})
		.onConflictDoNothing({ target: historicalRevenues.idempotency_key })
		.returning();
	if (inserted[0]) return { row: inserted[0], created: true };

	const [existing] = await db
		.select()
		.from(historicalRevenues)
		.where(eq(historicalRevenues.idempotency_key, input.idempotency_key))
		.limit(1);
	if (!existing || !matchesIdempotentRequest(existing, input, actor)) {
		throw new HistoricalRevenueConflictError(
			"Idempotenzschlüssel wurde bereits für andere Daten verwendet",
			"idempotency_mismatch",
		);
	}
	return { row: existing, created: false };
}

export async function cancelHistoricalRevenue(
	id: string,
	stornoGrund: string,
	actor: AuthUser,
): Promise<HistoricalRevenueRow> {
	const cancelled = await db
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
