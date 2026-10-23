import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db, pool } from "@/server/db";
import { account, user } from "@/server/db/auth-schema";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import { collectAuthReadiness } from "@/server/services/health";

const userIds: string[] = [];
const password = "isolated-integration-password";
const baseUrl = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1") {
		throw new Error("Auth integration tests require an isolated test database");
	}
	const result = await pool.query<{ database: string }>(
		"select current_database() as database",
	);
	if (!result.rows[0]?.database.endsWith("_test")) {
		throw new Error("Auth tests refuse a database without _test suffix");
	}
});

afterAll(async () => {
	for (const id of userIds) await db.delete(user).where(eq(user.id, id));
	await pool.end();
});

async function provision() {
	const email = `auth-${randomUUID()}@example.invalid`;
	const created = await ensureCredentialUser({
		email,
		password,
		name: "Auth Integration",
		role: "user",
	});
	userIds.push(created.id);
	return { email, ...created };
}

async function signIn(email: string, inputPassword = password) {
	return auth.handler(
		new Request(`${baseUrl}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseUrl },
			body: JSON.stringify({ email, password: inputPassword }),
		}),
	);
}

describe("authentication after production migrations", () => {
	it("rejects an incompatible physical constraint and recovers after repair", async () => {
		// This suite only runs against an isolated *_test database before any
		// accounts are provisioned. Restore the migration's verdict even on failure.
		await pool.query("ALTER TABLE account ALTER COLUMN issuer SET NOT NULL");
		try {
			expect(await collectAuthReadiness()).toBe(false);
		} finally {
			await pool.query("ALTER TABLE account ALTER COLUMN issuer DROP NOT NULL");
		}
		expect(await collectAuthReadiness()).toBe(true);
	});

	it("validates the runtime schema, provisions a new account and retains provider uniqueness", async () => {
		expect(await collectAuthReadiness()).toBe(true);
		const created = await provision();
		expect(created).toMatchObject({ created: true, linked: true });
		const rows = await db
			.select()
			.from(account)
			.where(eq(account.userId, created.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			issuer: null,
			providerId: "credential",
			accountId: created.id,
		});
		await expect(
			db.insert(account).values({
				id: randomUUID(),
				userId: created.id,
				providerId: "credential",
				accountId: created.id,
			}),
		).rejects.toThrow();
		const repeated = await ensureCredentialUser({
			email: created.email,
			password,
			name: "Auth Integration",
			role: "user",
		});
		expect(repeated).toMatchObject({
			id: created.id,
			created: false,
			linked: false,
		});
	});

	it("signs in an existing issuer-bearing account and reads its session cookie", async () => {
		const created = await provision();
		await db
			.update(account)
			.set({ issuer: "local:credential" })
			.where(eq(account.userId, created.id));
		const response = await signIn(created.email);
		expect(response.status).toBe(200);
		const cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		expect(cookie).toContain("svufo.session_token=");
		const sessionResponse = await auth.handler(
			new Request(`${baseUrl}/api/auth/get-session`, { headers: { cookie } }),
		);
		expect(sessionResponse.status).toBe(200);
		const session = await sessionResponse.json();
		expect(session.user.id).toBe(created.id);
	});

	it("authenticates a new account without issuer and rejects the wrong password", async () => {
		const created = await provision();
		expect((await signIn(created.email)).status).toBe(200);
		expect((await signIn(created.email, "wrong-password")).status).toBe(401);
	});
});
