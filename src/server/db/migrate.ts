import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../logger";
import { ensureCredentialUser } from "../services/auth-accounts";
import { db, pool } from "./index";
import { appSettings } from "./schema";

// Production migrator. Runs as the Railway preDeploy step (db:migrate:prod) in
// a separate container clone with the same env, BEFORE the app container
// starts. Applies pending Drizzle migrations, ensures the settings singleton
// exists, and seeds the admin account from env on first deploy.

async function ensureSettingsRow(): Promise<void> {
	await db
		.insert(appSettings)
		.values({ id: 1 })
		.onConflictDoNothing({ target: appSettings.id });
}

type AdminSeedStatus = "disabled" | "created" | "linked" | "unchanged";

async function ensureAdminUser(): Promise<AdminSeedStatus> {
	const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
	const password = process.env.ADMIN_PASSWORD;
	if (!email || !password) {
		return "disabled";
	}

	const result = await ensureCredentialUser({
		email,
		name: process.env.ADMIN_NAME?.trim() || "Admin",
		role: "admin",
		password,
	});
	if (result.created) {
		return "created";
	}
	if (result.linked) return "linked";
	return "unchanged";
}

async function main(): Promise<void> {
	const startedAt = performance.now();
	await migrate(db, { migrationsFolder: "./drizzle" });
	await ensureSettingsRow();
	const adminSeed = await ensureAdminUser();
	await pool.end();
	logger.info("Database migration completed", {
		event: "database.migration.completed",
		durationMs: Math.round(performance.now() - startedAt),
		adminSeed,
	});
}

main().catch(async (err) => {
	logger.error("Database migration failed", {
		event: "database.migration.failed",
		err,
	});
	await pool.end().catch(() => undefined);
	process.exit(1);
});
