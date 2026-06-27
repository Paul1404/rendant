import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

type LfioStatus = "up" | "down" | "degraded" | "unknown";

type HealthSnapshot = {
	ok: boolean;
	db: boolean;
	status: LfioStatus;
	latencyMs: number;
	message: string;
	checkedAt: string;
};

type LfioPayload = {
	assetKey: string;
	name?: string;
	status: LfioStatus;
	latencyMs?: number;
	message?: string;
	metadata?: Record<string, unknown>;
};

declare global {
	// eslint-disable-next-line no-var
	var __svufoLfioReporter: ReturnType<typeof setInterval> | undefined;
	// eslint-disable-next-line no-var
	var __svufoLfioReporterInFlight: boolean | undefined;
}

const LFIO_INGEST_URL = "https://lfio.pdcd.net/api/ingest";
const DEFAULT_INTERVAL_MS = 60_000;
const DEGRADED_LATENCY_MS = 1_500;
const REQUEST_TIMEOUT_MS = 10_000;

const log = logger.child({ integration: "lfio" });

function reportIntervalMs(): number {
	const raw = process.env.LFIO_REPORT_INTERVAL_MS;
	if (!raw) return DEFAULT_INTERVAL_MS;

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 5_000) return DEFAULT_INTERVAL_MS;
	return parsed;
}

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
	const started = performance.now();

	try {
		await db.execute(sql`select 1`);
		const latencyMs = Math.round(performance.now() - started);
		const degraded = latencyMs > DEGRADED_LATENCY_MS;

		return {
			ok: true,
			db: true,
			status: degraded ? "degraded" : "up",
			latencyMs,
			message: degraded ? `Database check slow (${latencyMs} ms)` : "OK",
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
			message: "Database check failed",
			checkedAt: new Date().toISOString(),
		};
	}
}

function payloadsFromSnapshot(snapshot: HealthSnapshot): LfioPayload[] {
	return [
		{
			assetKey: "api",
			name: "SVUFO Application",
			status: snapshot.status,
			latencyMs: snapshot.latencyMs,
			message: snapshot.message,
			metadata: {
				db: snapshot.db,
				checkedAt: snapshot.checkedAt,
				nodeEnv: process.env.NODE_ENV ?? "development",
			},
		},
		{
			assetKey: "database",
			name: "SVUFO PostgreSQL",
			status: snapshot.db
				? snapshot.status === "degraded"
					? "degraded"
					: "up"
				: "down",
			latencyMs: snapshot.latencyMs,
			message: snapshot.db ? "Database reachable" : snapshot.message,
			metadata: {
				checkedAt: snapshot.checkedAt,
			},
		},
	];
}

async function postToLfio(token: string, payload: LfioPayload): Promise<void> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(LFIO_INGEST_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
			signal: controller.signal,
		});

		if (!response.ok) {
			log.warn("LFIO ingest returned a non-success response", {
				assetKey: payload.assetKey,
				status: response.status,
				statusText: response.statusText,
			});
		}
	} catch (err) {
		log.warn("LFIO ingest failed", { assetKey: payload.assetKey, err });
	} finally {
		clearTimeout(timeout);
	}
}

export async function reportHealthToLfio(): Promise<void> {
	const token = process.env.LFIO_INGEST_TOKEN?.trim();
	if (!token) return;

	if (globalThis.__svufoLfioReporterInFlight) return;
	globalThis.__svufoLfioReporterInFlight = true;

	try {
		const snapshot = await collectHealthSnapshot();
		await Promise.all(
			payloadsFromSnapshot(snapshot).map((payload) =>
				postToLfio(token, payload),
			),
		);
	} finally {
		globalThis.__svufoLfioReporterInFlight = false;
	}
}

export function startLfioHealthReporter(): void {
	if (globalThis.__svufoLfioReporter) return;

	if (!process.env.LFIO_INGEST_TOKEN?.trim()) {
		log.info("LFIO health reporting disabled; LFIO_INGEST_TOKEN is not set");
		return;
	}

	void reportHealthToLfio();
	const timer = setInterval(
		() => void reportHealthToLfio(),
		reportIntervalMs(),
	);
	timer.unref?.();
	globalThis.__svufoLfioReporter = timer;
}
