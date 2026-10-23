import { sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { account, session, user } from "@/server/db/auth-schema";
import { logger } from "@/server/logger";

type HealthSnapshot = {
	ok: boolean;
	db: boolean;
	status: "up" | "down" | "degraded";
	latencyMs: number;
	message: string;
	checkedAt: string;
};

const log = logger.child({ capability: "health" });
const PROBE_TIMEOUT_MS = 10_000;
const DEGRADED_LATENCY_MS = 1_500;

async function withinHealthTimeout<T>(check: Promise<T>): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			check,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Readiness check timed out")),
					PROBE_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function collectAuthReadiness(): Promise<boolean> {
	try {
		await withinHealthTimeout(
			(async () => {
				const context = await auth.$context;
				if (!context.checkSchema)
					throw new Error("Auth schema check unavailable");
				await context.checkSchema();
				// The Drizzle adapter validates our declared model. Probe the physical
				// tables too: a missed migration can leave the model and PostgreSQL at
				// different revisions even when the adapter's verdict is clean.
				await Promise.all([
					db.select().from(user).limit(0),
					db.select().from(session).limit(0),
					db.select().from(account).limit(0),
				]);
				const result = await db.execute<{ issuer_optional: boolean }>(sql`
					select not exists (
						select 1 from information_schema.columns
						where table_schema = current_schema() and table_name = 'account'
							and column_name = 'issuer' and is_nullable = 'NO'
							and column_default is null
					) as issuer_optional
				`);
				if (!result.rows[0]?.issuer_optional) {
					throw new Error(
						"Legacy account issuer constraint blocks new accounts",
					);
				}
			})(),
		);
		return true;
	} catch (err) {
		log.error("Anmeldung nicht betriebsbereit", { err });
		return false;
	}
}

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
	const started = performance.now();
	try {
		await withinHealthTimeout(db.execute(sql`select 1`));
		const latencyMs = Math.round(performance.now() - started);
		const degraded = latencyMs > DEGRADED_LATENCY_MS;
		return {
			ok: true,
			db: true,
			status: degraded ? "degraded" : "up",
			latencyMs,
			message: degraded ? `database ping ${latencyMs}ms` : "database ping OK",
			checkedAt: new Date().toISOString(),
		};
	} catch (err) {
		const latencyMs = Math.round(performance.now() - started);
		log.error("Health-Check Fehler", { err });
		return {
			ok: false,
			db: false,
			status: "down",
			latencyMs,
			message: "database ping failed",
			checkedAt: new Date().toISOString(),
		};
	}
}
