import { readFileSync, statfsSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db, pool } from "@/server/db";
import { logger } from "@/server/logger";
import { getS3BucketName, getS3Client } from "@/server/services/s3";

type LfioStatus = "up" | "down" | "degraded" | "unknown";
type MetricUnit = "%" | "bytes" | "ms" | "ops/s" | "count";

type LfioMetric = {
	key: string;
	label: string;
	value: number;
	unit: MetricUnit;
	group?: string;
};

type LfioPayload = {
	assetKey: string;
	name: string;
	status: LfioStatus;
	message: string;
	latencyMs?: number;
	metrics?: LfioMetric[];
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

type CpuSample = {
	usage: NodeJS.CpuUsage;
	timeMs: number;
};

type RuntimeMemory = {
	usedBytes: number;
	limitBytes: number;
	source: "cgroup" | "process" | "host";
};

declare global {
	// eslint-disable-next-line no-var
	var __svufoLfioReporter: ReturnType<typeof setInterval> | undefined;
	// eslint-disable-next-line no-var
	var __svufoLfioReporterInFlight: boolean | undefined;
}

const LFIO_INGEST_URL = "https://lfio.pdcd.net/api/ingest";
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;
const DEFAULT_DEGRADE_SAMPLES = 3;
const DEFAULT_RECOVER_SAMPLES = 2;

const log = logger.child({ integration: "lfio" });
const gates = new Map<string, HysteresisGate>();
let previousCpuSample: CpuSample = {
	usage: process.cpuUsage(),
	timeMs: Date.now(),
};
let lastCpuPct = 0;

export class HysteresisGate {
	private badSamples = 0;
	private goodSamples = 0;
	private degraded = false;

	constructor(
		private readonly degradeSamples: number,
		private readonly recoverSamples: number,
	) {}

	evaluate(breached: boolean): { degraded: boolean; samples: number } {
		if (breached) {
			this.badSamples += 1;
			this.goodSamples = 0;
			if (!this.degraded && this.badSamples >= this.degradeSamples) {
				this.degraded = true;
			}
			return { degraded: this.degraded, samples: this.badSamples };
		}

		this.goodSamples += 1;
		this.badSamples = 0;
		if (this.degraded && this.goodSamples >= this.recoverSamples) {
			this.degraded = false;
		}
		return { degraded: this.degraded, samples: this.goodSamples };
	}
}

function envNumber(name: string, fallback: number, min = 0): number {
	const parsed = Number(process.env[name]);
	if (!Number.isFinite(parsed) || parsed < min) return fallback;
	return parsed;
}

function reportIntervalMs(): number {
	return envNumber("LFIO_REPORT_INTERVAL_MS", DEFAULT_INTERVAL_MS, 5_000);
}

function probeTimeoutMs(): number {
	return envNumber("LFIO_PROBE_TIMEOUT_MS", DEFAULT_PROBE_TIMEOUT_MS, 1_000);
}

function threshold(name: string, fallback: number): number {
	return envNumber(name, fallback);
}

function metric(
	key: string,
	label: string,
	value: number | null | undefined,
	unit: MetricUnit,
	group?: string,
): LfioMetric | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return { key, label, value, unit, group };
}

function metrics(items: Array<LfioMetric | undefined>): LfioMetric[] {
	return items.filter((item): item is LfioMetric => Boolean(item));
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

async function withTimeout<T>(
	label: string,
	promise: Promise<T>,
	timeoutMs = probeTimeoutMs(),
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function gateFor(assetKey: string): HysteresisGate {
	const existing = gates.get(assetKey);
	if (existing) return existing;
	const gate = new HysteresisGate(
		envNumber("LFIO_DEGRADE_SAMPLES", DEFAULT_DEGRADE_SAMPLES, 1),
		envNumber("LFIO_RECOVER_SAMPLES", DEFAULT_RECOVER_SAMPLES, 1),
	);
	gates.set(assetKey, gate);
	return gate;
}

function statusWithHysteresis(
	assetKey: string,
	breaches: string[],
	okMessage: string,
): { status: LfioStatus; message: string } {
	const result = gateFor(assetKey).evaluate(breaches.length > 0);
	if (result.degraded) {
		return {
			status: "degraded",
			message: `${breaches[0]} for ${result.samples} samples`,
		};
	}
	return { status: "up", message: okMessage };
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
		metadata: { checkedAt: new Date().toISOString() },
	};
}

export function calculateCpuPct(
	previous: CpuSample,
	current: CpuSample,
	coreCount: number,
): number {
	const elapsedUs = (current.timeMs - previous.timeMs) * 1000;
	const cores = Math.max(coreCount, 1);
	if (elapsedUs <= 0) return 0;

	const userDelta = current.usage.user - previous.usage.user;
	const systemDelta = current.usage.system - previous.usage.system;
	const usedUs = Math.max(userDelta + systemDelta, 0);
	return Math.min(100, Math.round((usedUs / (elapsedUs * cores)) * 100));
}

function sampleCpuPct(): number {
	const current = { usage: process.cpuUsage(), timeMs: Date.now() };
	const elapsedMs = current.timeMs - previousCpuSample.timeMs;
	if (elapsedMs < 1_000) return lastCpuPct;

	lastCpuPct = calculateCpuPct(previousCpuSample, current, cpus().length || 1);
	previousCpuSample = current;
	return lastCpuPct;
}

export function parseCgroupLimit(value: string): number | undefined {
	const trimmed = value.trim();
	if (!trimmed || trimmed === "max") return undefined;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	// v1 commonly reports a huge sentinel for "unlimited".
	if (parsed >= 9_000_000_000_000_000) return undefined;
	return parsed;
}

function readNumberFile(path: string): number | undefined {
	try {
		return parseCgroupLimit(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

export function readContainerMemoryLimitBytes(): number {
	return (
		readNumberFile("/sys/fs/cgroup/memory.max") ??
		readNumberFile("/sys/fs/cgroup/memory/memory.limit_in_bytes") ??
		totalmem()
	);
}

function readContainerMemoryUsedBytes(): {
	usedBytes: number | undefined;
	source: RuntimeMemory["source"];
} {
	const cgroupUsed =
		readNumberFile("/sys/fs/cgroup/memory.current") ??
		readNumberFile("/sys/fs/cgroup/memory/memory.usage_in_bytes");
	if (cgroupUsed !== undefined)
		return { usedBytes: cgroupUsed, source: "cgroup" };
	return { usedBytes: process.memoryUsage().rss, source: "process" };
}

export function calculateMemoryPct(
	usedBytes: number,
	limitBytes: number,
): number {
	if (limitBytes <= 0) return 0;
	return Math.min(100, Math.round((usedBytes / limitBytes) * 100));
}

function readRuntimeMemory(): RuntimeMemory {
	const limitBytes = readContainerMemoryLimitBytes();
	const used = readContainerMemoryUsedBytes();
	return {
		usedBytes: used.usedBytes ?? process.memoryUsage().rss,
		limitBytes,
		source: used.source === "cgroup" ? "cgroup" : "process",
	};
}

function readDiskPct(path = "/"): {
	diskPct: number;
	totalBytes: number;
	freeBytes: number;
} {
	const stat = statfsSync(path);
	const totalBytes = stat.blocks * stat.bsize;
	const freeBytes = stat.bfree * stat.bsize;
	const usedBytes = Math.max(totalBytes - freeBytes, 0);
	const diskPct =
		totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
	return { diskPct, totalBytes, freeBytes };
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
		await withTimeout("database health check", db.execute(sql`select 1`));
		const latencyMs = Math.round(performance.now() - started);
		const degraded =
			latencyMs > threshold("LFIO_DB_LATENCY_DEGRADED_MS", 1_500);

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

async function collectApiPayload(): Promise<LfioPayload> {
	const started = performance.now();

	try {
		const [health, activeUsers] = await Promise.all([
			collectHealthSnapshot(),
			countActiveUsers(),
		]);
		const latencyMs = Math.round(performance.now() - started);
		const waitingRequests = pool.waitingCount;
		const breaches: string[] = [];

		if (health.latencyMs > threshold("LFIO_API_LATENCY_DEGRADED_MS", 2_000)) {
			breaches.push(`api health latency ${health.latencyMs}ms`);
		}
		if (waitingRequests > threshold("LFIO_API_WAITING_REQUESTS_DEGRADED", 0)) {
			breaches.push(`pg pool waiting requests ${waitingRequests}`);
		}

		const status = health.ok
			? statusWithHysteresis("api", breaches, "API health check OK")
			: { status: "down" as const, message: health.message };

		return {
			assetKey: "api",
			name: "SVUFO Application",
			status: status.status,
			message: status.message,
			latencyMs: health.latencyMs,
			metrics: metrics([
				metric("activeUsers", "Active users", activeUsers, "count", "HTTP"),
				metric(
					"openConnections",
					"Open DB pool connections",
					pool.totalCount,
					"count",
					"HTTP",
				),
				metric(
					"idleConnections",
					"Idle DB pool connections",
					pool.idleCount,
					"count",
					"HTTP",
				),
				metric(
					"waitingRequests",
					"Waiting DB pool requests",
					waitingRequests,
					"count",
					"HTTP",
				),
				metric(
					"collectorLatencyMs",
					"Collector latency",
					latencyMs,
					"ms",
					"LFIO",
				),
			]),
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
		const result = await withTimeout(
			"active user count",
			pool.query<{ active_users: string }>(
				`select count(distinct user_id)::text as active_users
				 from "session"
				 where expires_at > now()`,
			),
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
			withTimeout(
				"postgres metrics",
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
			),
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
		const breaches: string[] = [];

		if (
			connectionsActive !== undefined &&
			connectionsMax !== undefined &&
			connectionPct !== undefined &&
			connectionPct >= threshold("LFIO_DB_CONNECTION_PCT_DEGRADED", 80)
		) {
			breaches.push(`pg connections ${connectionsActive}/${connectionsMax}`);
		}
		if (
			replicationLagMs !== undefined &&
			replicationLagMs >=
				threshold("LFIO_DB_REPLICATION_LAG_DEGRADED_MS", 5_000)
		) {
			breaches.push(`pg replication lag ${replicationLagMs}ms`);
		}
		if (
			cacheHitRatioPct !== undefined &&
			cacheHitRatioPct < threshold("LFIO_DB_CACHE_HIT_MIN_PCT", 95)
		) {
			breaches.push(`pg cache hit ratio ${cacheHitRatioPct}%`);
		}
		if (latencyMs > threshold("LFIO_DB_LATENCY_DEGRADED_MS", 1_500)) {
			breaches.push(`pg metrics latency ${latencyMs}ms`);
		}

		const status = statusWithHysteresis("db", breaches, "PostgreSQL OK");

		return {
			assetKey: "db",
			name: "SVUFO PostgreSQL",
			status: status.status,
			message: status.message,
			latencyMs,
			metrics: metrics([
				metric(
					"connectionsActive",
					"Active connections",
					connectionsActive,
					"count",
					"Database",
				),
				metric(
					"connectionsMax",
					"Max connections",
					connectionsMax,
					"count",
					"Database",
				),
				metric(
					"dbSizeBytes",
					"Database size",
					dbSizeBytes,
					"bytes",
					"Database",
				),
				metric("slowQueries", "Slow queries", slowQueries, "count", "Database"),
				metric(
					"cacheHitRatioPct",
					"Cache hit ratio",
					cacheHitRatioPct,
					"%",
					"Database",
				),
				metric(
					"replicationLagMs",
					"Replication lag",
					replicationLagMs,
					"ms",
					"Database",
				),
				metric("deadlocks", "Deadlocks", deadlocks, "count", "Database"),
			]),
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
		const extension = await withTimeout(
			"pg_stat_statements extension check",
			pool.query<{ exists: boolean }>(
				"select exists(select 1 from pg_extension where extname = 'pg_stat_statements')",
			),
		);
		if (!extension.rows[0]?.exists) return undefined;

		const result = await withTimeout(
			"slow query count",
			pool.query<{ slow_queries: string }>(
				`select count(*)::text as slow_queries
				 from pg_stat_statements
				 where mean_exec_time >= 1000`,
			),
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
		await withTimeout(
			"bucket head",
			client.send(new HeadBucketCommand({ Bucket: bucket })),
		);

		let continuationToken: string | undefined;
		let objectCount = 0;
		let totalSizeBytes = 0;

		do {
			const page = await withTimeout(
				"bucket list",
				client.send(
					new ListObjectsV2Command({
						Bucket: bucket,
						ContinuationToken: continuationToken,
					}),
				),
			);

			for (const object of page.Contents ?? []) {
				objectCount += 1;
				totalSizeBytes += object.Size ?? 0;
			}
			continuationToken = page.NextContinuationToken;
		} while (continuationToken);

		const latencyMs = Math.round(performance.now() - started);
		const breaches =
			latencyMs > threshold("LFIO_BUCKET_LATENCY_DEGRADED_MS", 10_000)
				? [`bucket listing latency ${latencyMs}ms`]
				: [];
		const status = statusWithHysteresis("bucket", breaches, "Bucket reachable");

		return {
			assetKey: "bucket",
			name: "SVUFO Object Storage",
			status: status.status,
			message: status.message,
			latencyMs,
			metrics: metrics([
				metric("objectCount", "Objects", objectCount, "count", "Bucket"),
				metric(
					"totalSizeBytes",
					"Total size",
					totalSizeBytes,
					"bytes",
					"Bucket",
				),
			]),
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
	try {
		const cpuPct = sampleCpuPct();
		const memory = readRuntimeMemory();
		const memoryPct = calculateMemoryPct(memory.usedBytes, memory.limitBytes);
		const disk = readDiskPct("/");
		const breaches: string[] = [];

		if (cpuPct >= threshold("LFIO_SYSTEM_CPU_DEGRADED_PCT", 90)) {
			breaches.push(`cpu ${cpuPct}%`);
		}
		if (memoryPct >= threshold("LFIO_SYSTEM_MEMORY_DEGRADED_PCT", 90)) {
			breaches.push(`memory ${memoryPct}%`);
		}
		if (disk.diskPct >= threshold("LFIO_SYSTEM_DISK_DEGRADED_PCT", 90)) {
			breaches.push(`disk ${disk.diskPct}%`);
		}

		const status = statusWithHysteresis("system", breaches, "Runtime OK");

		return {
			assetKey: "system",
			name: "SVUFO Runtime",
			status: status.status,
			message: status.message,
			metrics: metrics([
				metric("cpuPct", "CPU", cpuPct, "%", "System"),
				metric("memoryPct", "Memory", memoryPct, "%", "System"),
				metric(
					"memoryUsedBytes",
					"Memory used",
					memory.usedBytes,
					"bytes",
					"System",
				),
				metric(
					"memoryLimitBytes",
					"Memory limit",
					memory.limitBytes,
					"bytes",
					"System",
				),
				metric("diskPct", "Disk", disk.diskPct, "%", "System"),
				metric(
					"diskTotalBytes",
					"Disk total",
					disk.totalBytes,
					"bytes",
					"System",
				),
				metric("diskFreeBytes", "Disk free", disk.freeBytes, "bytes", "System"),
				metric(
					"processRssBytes",
					"Process RSS",
					process.memoryUsage().rss,
					"bytes",
					"Process",
				),
				metric(
					"processHeapUsedBytes",
					"Process heap used",
					process.memoryUsage().heapUsed,
					"bytes",
					"Process",
				),
			]),
			metadata: {
				platform: process.platform,
				arch: process.arch,
				node: process.version,
				memorySource: memory.source,
			},
		};
	} catch (err) {
		log.warn("LFIO runtime metrics collection failed", { err });
		return downPayload("system", "SVUFO Runtime", err);
	}
}

async function collectLfioPayloads(): Promise<LfioPayload[]> {
	const settled = await Promise.allSettled([
		collectApiPayload(),
		collectDbPayload(),
		collectBucketPayload(),
		Promise.resolve(collectSystemPayload()),
	]);

	const fallbackNames = [
		["api", "SVUFO Application"],
		["db", "SVUFO PostgreSQL"],
		["bucket", "SVUFO Object Storage"],
		["system", "SVUFO Runtime"],
	] as const;

	return settled
		.map((result, index) => {
			if (result.status === "fulfilled") return result.value;
			const [assetKey, name] = fallbackNames[index];
			return downPayload(assetKey, name, result.reason);
		})
		.filter((payload): payload is LfioPayload => Boolean(payload));
}

async function postToLfio(token: string, payload: LfioPayload): Promise<void> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), probeTimeoutMs());

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
