import { cpus, freemem, loadavg, totalmem } from "node:os";
import { HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db, pool } from "@/server/db";
import { logger } from "@/server/logger";
import { getS3BucketName, getS3Client } from "@/server/services/s3";

type LfioStatus = "up" | "down" | "degraded" | "unknown";
type MetricUnit = "bytes" | "ms" | "%" | "count" | "ops/s" | "s";

type LfioMetric =
	| number
	| {
			value: number;
			unit?: MetricUnit;
			label?: string;
			group?: string;
	  };

type LfioPayload = {
	assetKey: string;
	name?: string;
	status: LfioStatus;
	latencyMs?: number;
	message?: string;
	metrics?: Record<string, LfioMetric>;
	metadata?: Record<string, unknown>;
};

type HealthSnapshot = {
	ok: boolean;
	db: boolean;
	status: LfioStatus;
	latencyMs: number;
	message: string;
	checkedAt: string;
};

type DbMetricsRow = {
	database_name: string;
	version: string;
	connections_active: string | number;
	connections_max: string | number;
	db_size_bytes: string | number;
	cache_hit_ratio_pct: string | number | null;
	deadlocks: string | number;
	is_replica: boolean;
	replication_lag_ms: string | number | null;
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

function metric(
	value: number | null | undefined,
	unit: MetricUnit,
	group?: string,
	label?: string,
): LfioMetric | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return { value, unit, group, label };
}

function compactMetrics(
	metrics: Record<string, LfioMetric | undefined>,
): Record<string, LfioMetric> {
	return Object.fromEntries(
		Object.entries(metrics).filter((entry): entry is [string, LfioMetric] => {
			return entry[1] !== undefined;
		}),
	);
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function isS3Configured(): boolean {
	return Boolean(
		process.env.S3_BUCKET_NAME?.trim() &&
			process.env.AWS_ACCESS_KEY_ID?.trim() &&
			process.env.AWS_SECRET_ACCESS_KEY?.trim(),
	);
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

async function collectApiPayload(): Promise<LfioPayload> {
	const started = performance.now();

	try {
		const health = await collectHealthSnapshot();
		const activeUsers = await countActiveUsers();
		const latencyMs = Math.round(performance.now() - started);

		return {
			assetKey: "api",
			name: "SVUFO Application",
			status: health.status,
			latencyMs: health.latencyMs,
			message: health.message,
			metrics: compactMetrics({
				activeUsers: metric(activeUsers, "count", "HTTP"),
				openConnections: metric(pool.totalCount, "count", "HTTP"),
				idleConnections: metric(pool.idleCount, "count", "HTTP"),
				waitingRequests: metric(pool.waitingCount, "count", "HTTP"),
				processUptimeSec: metric(Math.round(process.uptime()), "s", "Runtime"),
				collectorLatencyMs: metric(latencyMs, "ms", "LFIO"),
			}),
			metadata: {
				checkedAt: health.checkedAt,
				nodeEnv: process.env.NODE_ENV ?? "development",
				version:
					typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined,
			},
		};
	} catch (err) {
		log.warn("LFIO API metrics collection failed", { err });
		return downPayload("api", "SVUFO Application", err);
	}
}

async function countActiveUsers(): Promise<number | undefined> {
	try {
		const result = await pool.query<{ active_users: string }>(
			`select count(distinct user_id)::text as active_users
			 from "session"
			 where expires_at > now()`,
		);
		return toNumber(result.rows[0]?.active_users);
	} catch (err) {
		log.debug("Active user metric unavailable", { err });
		return undefined;
	}
}

async function collectDbPayload(): Promise<LfioPayload> {
	const started = performance.now();

	try {
		const [metricsResult, slowQueries] = await Promise.all([
			pool.query<DbMetricsRow>(`
				select
					current_database() as database_name,
					version() as version,
					stats.numbackends::text as connections_active,
					(select setting from pg_settings where name = 'max_connections') as connections_max,
					pg_database_size(current_database())::text as db_size_bytes,
					case
						when stats.blks_hit + stats.blks_read = 0 then null
						else round((stats.blks_hit::numeric / (stats.blks_hit + stats.blks_read)) * 100, 2)
					end::text as cache_hit_ratio_pct,
					stats.deadlocks::text as deadlocks,
					pg_is_in_recovery() as is_replica,
					case
						when pg_is_in_recovery() and pg_last_xact_replay_timestamp() is not null
							then round(extract(epoch from now() - pg_last_xact_replay_timestamp()) * 1000)
						else null
					end::text as replication_lag_ms
				from pg_stat_database stats
				where stats.datname = current_database()
			`),
			countSlowQueries(),
		]);

		const row = metricsResult.rows[0];
		if (!row) throw new Error("No pg_stat_database row returned");

		const latencyMs = Math.round(performance.now() - started);
		const connectionsActive = toNumber(row.connections_active);
		const connectionsMax = toNumber(row.connections_max);
		const dbSizeBytes = toNumber(row.db_size_bytes);
		const cacheHitRatioPct = toNumber(row.cache_hit_ratio_pct);
		const deadlocks = toNumber(row.deadlocks);
		const replicationLagMs = toNumber(row.replication_lag_ms);
		const connectionPct =
			connectionsActive !== undefined && connectionsMax
				? (connectionsActive / connectionsMax) * 100
				: undefined;
		const degraded =
			latencyMs > DEGRADED_LATENCY_MS ||
			(connectionPct !== undefined && connectionPct >= 80) ||
			(replicationLagMs !== undefined && replicationLagMs >= 5_000) ||
			(cacheHitRatioPct !== undefined && cacheHitRatioPct < 95);

		return {
			assetKey: "db",
			name: "SVUFO PostgreSQL",
			status: degraded ? "degraded" : "up",
			latencyMs,
			message: degraded
				? "Database reachable with degraded signals"
				: "Database OK",
			metrics: compactMetrics({
				connectionsActive: metric(
					connectionsActive,
					"count",
					"Database",
					"Active connections",
				),
				connectionsMax: metric(
					connectionsMax,
					"count",
					"Database",
					"Max connections",
				),
				connectionUsagePct: metric(connectionPct, "%", "Database"),
				dbSizeBytes: metric(dbSizeBytes, "bytes", "Database"),
				cacheHitRatioPct: metric(cacheHitRatioPct, "%", "Database"),
				replicationLagMs: metric(replicationLagMs, "ms", "Database"),
				deadlocks: metric(deadlocks, "count", "Database"),
				slowQueries: metric(slowQueries, "count", "Database"),
			}),
			metadata: {
				engine: row.version.split(" on ")[0],
				database: row.database_name,
				role: row.is_replica ? "replica" : "primary",
			},
		};
	} catch (err) {
		log.warn("LFIO database metrics collection failed", { err });
		return downPayload("db", "SVUFO PostgreSQL", err);
	}
}

async function countSlowQueries(): Promise<number | undefined> {
	try {
		const extension = await pool.query<{ exists: boolean }>(
			"select exists(select 1 from pg_extension where extname = 'pg_stat_statements')",
		);
		if (!extension.rows[0]?.exists) return undefined;

		const result = await pool.query<{ slow_queries: string }>(
			`select count(*)::text as slow_queries
			 from pg_stat_statements
			 where mean_exec_time >= 1000`,
		);
		return toNumber(result.rows[0]?.slow_queries);
	} catch (err) {
		log.debug("Slow query metric unavailable", { err });
		return undefined;
	}
}

async function collectBucketPayload(): Promise<LfioPayload | undefined> {
	if (!isS3Configured()) return undefined;

	const started = performance.now();

	try {
		const client = getS3Client();
		const bucket = getS3BucketName();
		await client.send(new HeadBucketCommand({ Bucket: bucket }));

		let continuationToken: string | undefined;
		let objectCount = 0;
		let totalSizeBytes = 0;

		do {
			const page = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					ContinuationToken: continuationToken,
				}),
			);

			for (const object of page.Contents ?? []) {
				objectCount += 1;
				totalSizeBytes += object.Size ?? 0;
			}
			continuationToken = page.NextContinuationToken;
		} while (continuationToken);

		const latencyMs = Math.round(performance.now() - started);
		const degraded = latencyMs > 10_000;

		return {
			assetKey: "bucket",
			name: "SVUFO Object Storage",
			status: degraded ? "degraded" : "up",
			latencyMs,
			message: degraded ? "Bucket listing is slow" : "Bucket reachable",
			metrics: compactMetrics({
				objectCount: metric(objectCount, "count", "Bucket"),
				totalSizeBytes: metric(totalSizeBytes, "bytes", "Bucket"),
			}),
			metadata: {
				bucket,
				endpoint: process.env.AWS_ENDPOINT_URL_S3,
				region: process.env.AWS_DEFAULT_REGION ?? "auto",
			},
		};
	} catch (err) {
		log.warn("LFIO bucket metrics collection failed", { err });
		return downPayload("bucket", "SVUFO Object Storage", err);
	}
}

function collectSystemPayload(): LfioPayload {
	const memoryTotal = totalmem();
	const memoryFree = freemem();
	const memoryPct =
		memoryTotal > 0
			? ((memoryTotal - memoryFree) / memoryTotal) * 100
			: undefined;
	const cpuCount = cpus().length || 1;
	const cpuPct = Math.min((loadavg()[0] / cpuCount) * 100, 100);

	return {
		assetKey: "system",
		name: "SVUFO Runtime",
		status:
			(memoryPct !== undefined && memoryPct >= 90) || cpuPct >= 90
				? "degraded"
				: "up",
		message: "Runtime metrics collected",
		metrics: compactMetrics({
			cpuPct: metric(cpuPct, "%", "System"),
			memoryPct: metric(memoryPct, "%", "System"),
			memoryTotalBytes: metric(memoryTotal, "bytes", "System"),
			memoryFreeBytes: metric(memoryFree, "bytes", "System"),
			processRssBytes: metric(process.memoryUsage().rss, "bytes", "Process"),
			processHeapUsedBytes: metric(
				process.memoryUsage().heapUsed,
				"bytes",
				"Process",
			),
		}),
		metadata: {
			platform: process.platform,
			arch: process.arch,
			node: process.version,
		},
	};
}

function downPayload(
	assetKey: string,
	name: string,
	err: unknown,
): LfioPayload {
	return {
		assetKey,
		name,
		status: "down",
		message: err instanceof Error ? err.message : "Metric collection failed",
		metadata: {
			checkedAt: new Date().toISOString(),
		},
	};
}

async function collectLfioPayloads(): Promise<LfioPayload[]> {
	const collected = await Promise.all([
		collectApiPayload(),
		collectDbPayload(),
		collectBucketPayload(),
		Promise.resolve(collectSystemPayload()),
	]);

	return collected.filter((payload): payload is LfioPayload =>
		Boolean(payload),
	);
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
		const payloads = await collectLfioPayloads();
		await Promise.all(payloads.map((payload) => postToLfio(token, payload)));
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
