import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				try {
					await db.execute(sql`select 1`);
					return Response.json({ ok: true, db: true });
				} catch (err) {
					logger.error("Health-Check Fehler", { err });
					return Response.json({ ok: false, db: false }, { status: 503 });
				}
			},
		},
	},
});
