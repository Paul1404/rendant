import { sql } from "drizzle-orm";
import { db } from "@/server/db";
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

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
	const started = performance.now();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			db.execute(sql`select 1`),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Database health check timed out")),
					PROBE_TIMEOUT_MS,
				);
			}),
		]);
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
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
