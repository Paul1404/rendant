import postgres from "postgres";

declare global {
  var __svufoSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
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

export const sql = globalThis.__svufoSql ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__svufoSql = sql;
}
