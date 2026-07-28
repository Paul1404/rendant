import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Server-only Drizzle client backed by a node-postgres Pool. Never import this
// from a component or any client bundle: all DB access goes through oRPC
// procedures and server routes.

declare global {
	// eslint-disable-next-line no-var
	var __rendantPool: Pool | undefined;
}

function timeoutFromEnv(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isInteger(value) && value >= 1_000 && value <= 120_000
		? value
		: fallback;
}

function createPool(): Pool {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL ist nicht gesetzt");
	}
	return new Pool({
		connectionString,
		max: 10,
		idleTimeoutMillis: 20_000,
		connectionTimeoutMillis: timeoutFromEnv(
			"DATABASE_CONNECTION_TIMEOUT_MS",
			5_000,
		),
		query_timeout: timeoutFromEnv("DATABASE_QUERY_TIMEOUT_MS", 10_000),
		statement_timeout: timeoutFromEnv("DATABASE_QUERY_TIMEOUT_MS", 10_000),
	});
}

const pool = globalThis.__rendantPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
	globalThis.__rendantPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool, schema };

export type Database = typeof db;
// A drizzle handle that is either the root client or an open transaction;
// services that may run inside or outside a transaction accept this.
export type DbOrTx =
	| Database
	| Parameters<Parameters<Database["transaction"]>[0]>[0];
