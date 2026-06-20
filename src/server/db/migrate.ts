import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { auth } from "../auth";
import { logger } from "../logger";
import { user as userTable } from "./auth-schema";
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

	const existing = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);
	if (existing.length > 0) {
		logger.info("Admin existiert bereits, Seed uebersprungen");
		return;
	}

	const ctx = await auth.$context;
	const hash = await ctx.password.hash(password);
	const created = await ctx.internalAdapter.createUser({
		email,
		name: process.env.ADMIN_NAME?.trim() || "Admin",
		emailVerified: true,
		role: "admin",
	});
	await ctx.internalAdapter.linkAccount({
		userId: created.id,
		providerId: "credential",
		accountId: created.id,
		password: hash,
	});
	logger.info("Admin angelegt", { email });
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
