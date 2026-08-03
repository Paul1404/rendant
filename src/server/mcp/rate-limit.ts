import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };

declare global {
	// eslint-disable-next-line no-var
	var __rendantMcpRateLimits: Map<string, Bucket> | undefined;
}

const WINDOW_MS = 60_000;
const TOKEN_LIMIT = 120;
const IP_LIMIT = 240;

export function enforceMcpIpRateLimit(ip: string): number | null {
	return enforce(`ip:${hash(ip)}`, IP_LIMIT);
}

export function enforceMcpTokenRateLimit(fingerprint: string): number | null {
	return enforce(`token:${fingerprint}`, TOKEN_LIMIT);
}

export function mcpRateLimitedResponse(retryAfterSeconds: number): Response {
	return Response.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32029,
				message: `Too many requests. Retry after ${retryAfterSeconds}s.`,
			},
			id: null,
		},
		{
			status: 429,
			headers: { "retry-after": String(retryAfterSeconds) },
		},
	);
}

function enforce(key: string, limit: number): number | null {
	const now = Date.now();
	if (!globalThis.__rendantMcpRateLimits) {
		globalThis.__rendantMcpRateLimits = new Map();
	}
	const buckets = globalThis.__rendantMcpRateLimits;
	const current = buckets.get(key);
	if (!current || current.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
		prune(buckets, now);
		return null;
	}
	current.count += 1;
	if (current.count <= limit) return null;
	return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}

function prune(buckets: Map<string, Bucket>, now: number): void {
	if (buckets.size < 1_000) return;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
