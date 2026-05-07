import { Hono } from "hono";
import { authRoutes } from "@/server/routes/auth";
import { protokolleRoutes } from "@/server/routes/protokolle";
import { sql } from "@/lib/db";

const app = new Hono().basePath("/api");

app.get("/health", async (c) => {
  try {
    await sql`SELECT 1`;
    return c.json({ ok: true, db: true });
  } catch (err) {
    console.error("Health-Check Fehler", err);
    return c.json({ ok: false, db: false }, 503);
  }
});

app.route("/auth", authRoutes);
app.route("/protokolle", protokolleRoutes);

app.onError((err, c) => {
  console.error("API Fehler", err);
  return c.json({ error: "Interner Fehler" }, 500);
});

app.notFound((c) => c.json({ error: "Nicht gefunden" }, 404));

export default app;
