import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { auth } from "../auth";
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
		console.warn(
			"[migrate] ADMIN_EMAIL/ADMIN_PASSWORD nicht gesetzt, Admin-Seed uebersprungen",
		);
		return;
	}

	const existing = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);
	if (existing.length > 0) {
		console.info("[migrate] Admin existiert bereits, Seed uebersprungen");
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
	console.info(`[migrate] Admin angelegt: ${email}`);
}

async function main(): Promise<void> {
	console.info("[migrate] Migrationen werden angewendet...");
	await migrate(db, { migrationsFolder: "./drizzle" });
	console.info("[migrate] Migrationen ok");
	await ensureSettingsRow();
	await ensureAdminUser();
	await pool.end();
	console.info("[migrate] fertig");
}

main().catch((err) => {
	console.error("[migrate] fehlgeschlagen", err);
	process.exitCode = 1;
	pool.end().finally(() => process.exit(1));
});
