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

async function ensureAdminUser(): Promise<void> {
	const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
	const password = process.env.ADMIN_PASSWORD;
	if (!email || !password) {
		logger.warn(
			"ADMIN_EMAIL/ADMIN_PASSWORD nicht gesetzt, Admin-Seed uebersprungen",
		);
		return;
	}

	const result = await ensureCredentialUser({
		email,
		name: process.env.ADMIN_NAME?.trim() || "Admin",
		role: "admin",
		password,
	});
	if (result.created) {
		logger.info("Admin angelegt", { email });
	} else if (result.linked) {
		logger.info("Admin-Zugang vervollstaendigt", { email });
	} else {
		logger.info("Admin existiert bereits, Seed uebersprungen", { email });
	}
}

async function main(): Promise<void> {
	logger.info("Migrationen werden angewendet");
	await migrate(db, { migrationsFolder: "./drizzle" });
	logger.info("Migrationen ok");
	await ensureSettingsRow();
	await ensureAdminUser();
	await pool.end();
	logger.info("Migration fertig");
}

main().catch((err) => {
	logger.error("Migration fehlgeschlagen", { err });
	process.exitCode = 1;
	pool.end().finally(() => process.exit(1));
});
