import postgres, { type Sql } from "postgres";

declare global {
  var __svufoSql: Sql | undefined;
}

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL ist nicht gesetzt");
  }
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    prepare: false,
  });
}

function getClient(): Sql {
  if (globalThis.__svufoSql) return globalThis.__svufoSql;
  const client = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalThis.__svufoSql = client;
  }
  return client;
}

export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, thisArg, args: unknown[]) {
    const client = getClient() as unknown as (...a: unknown[]) => unknown;
    return Reflect.apply(client, thisArg, args);
  },
  get(_target, prop, receiver) {
    return Reflect.get(getClient() as unknown as object, prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getClient() as unknown as object, prop);
  },
}) as Sql;
