import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Server-only Drizzle client backed by a node-postgres Pool. Never import this
// from a component or any client bundle: all DB access goes through oRPC
// procedures and server routes.

declare global {
	// eslint-disable-next-line no-var
	var __svufoPool: Pool | undefined;
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
	});
}

const pool = globalThis.__svufoPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
	globalThis.__svufoPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool, schema };

export type Database = typeof db;
// A drizzle handle that is either the root client or an open transaction;
// services that may run inside or outside a transaction accept this.
export type DbOrTx =
	| Database
	| Parameters<Parameters<Database["transaction"]>[0]>[0];
