import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth";
import { db, globalDb, pool } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import {
	resolveHostTenant,
	resolveTenantSession,
	TenantAccessError,
} from "@/server/services/tenants";
import { withRequestTenant, withTenant } from "@/server/tenant-context";

const baseDomain = "rendant.pdcd.net";
const runId = randomUUID();
const clubA = {
	id: randomUUID(),
	slug: `host-a-${runId}`,
	name: "Synthetischer Hostverein A",
};
const clubB = {
	id: randomUUID(),
	slug: `host-b-${runId}`,
	name: "Synthetischer Hostverein B",
};
const hostA = `${clubA.slug}.${baseDomain}`;
const hostB = `${clubB.slug}.${baseDomain}`;
let dualCookie: string;
let singleCookie: string;
const password = "synthetic-host-isolation-password";

async function provisionSession(email: string, name: string) {
	const identity = await ensureCredentialUser({
		email,
		name,
		password,
		role: "user",
	});
	const origin = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
	const response = await auth.handler(
		new Request(`${origin}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(response.status).toBe(200);
	const cookies = response.headers.getSetCookie();
	expect(cookies.some((cookie) => /;\s*domain=/i.test(cookie))).toBe(false);
	return {
		id: identity.id,
		cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; "),
	};
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1") {
		throw new Error("Hostname integration tests require an isolated database");
	}
	const database = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (!database.rows[0]?.name.endsWith("_test")) {
		throw new Error("Hostname integration tests refuse a non-test database");
	}
	vi.stubEnv("TENANT_BASE_DOMAIN", baseDomain);
	await globalDb.insert(tenants).values([clubA, clubB]);
	const dual = await provisionSession(
		`host-dual-${runId}@example.invalid`,
		"Beide Hostvereine",
	);
	const single = await provisionSession(
		`host-single-${runId}@example.invalid`,
		"Nur Hostverein A",
	);
	dualCookie = dual.cookie;
	singleCookie = single.cookie;
	await globalDb.insert(memberships).values([
		{ tenant_id: clubA.id, user_id: dual.id, role: "admin" },
		{ tenant_id: clubB.id, user_id: dual.id, role: "user" },
		{ tenant_id: clubA.id, user_id: single.id, role: "admin" },
	]);
	for (const club of [clubA, clubB]) {
		await withTenant(club, () =>
			db.insert(appSettings).values({ id: 1, vereinsname: club.name }),
		);
	}
}, 30_000);

afterAll(async () => {
	vi.unstubAllEnvs();
	await pool.end();
});

describe("registered tenant hostname authorization", () => {
	it("resolves only the requested registered club before authentication", async () => {
		expect(await resolveHostTenant(new Headers({ host: hostB }))).toEqual(
			clubB,
		);
		expect(
			await resolveHostTenant(new Headers({ host: baseDomain })),
		).toBeNull();
		expect(
			await resolveHostTenant(
				new Headers({ host: "rendant.sv-untereuerheim.de" }),
			),
		).toMatchObject({
			id: "00000000-0000-4000-8000-000000000001",
			slug: "svu",
		});
	});

	it("pins host membership and role despite another club's cookie", async () => {
		const resolved = await resolveTenantSession(
			new Headers({
				host: hostB,
				cookie: `${dualCookie}; rendant-tenant=${clubA.id}`,
			}),
		);
		expect(resolved?.tenant).toMatchObject({ ...clubB, role: "user" });
		expect(resolved?.user.role).toBe("user");
		const malformedPreference = await resolveTenantSession(
			new Headers({
				host: hostB,
				cookie: `${dualCookie}; rendant-tenant=%malformed`,
			}),
		);
		expect(malformedPreference?.tenant.id).toBe(clubB.id);
	});

	it("denies conflicting explicit selectors even for users in both clubs", async () => {
		for (const selector of [clubA.id, clubA.slug, "", "missing-club"]) {
			await expect(
				resolveTenantSession(
					new Headers({
						host: hostB,
						cookie: dualCookie,
						"x-rendant-tenant": selector,
					}),
				),
			).rejects.toBeInstanceOf(TenantAccessError);
		}
		for (const selector of [clubB.id, clubB.slug]) {
			expect(
				(
					await resolveTenantSession(
						new Headers({
							host: hostB,
							cookie: dualCookie,
							"x-rendant-tenant": selector,
						}),
					)
				)?.tenant.id,
			).toBe(clubB.id);
		}
	});

	it("never grants a club merely because an authenticated user knows its hostname", async () => {
		await expect(
			resolveTenantSession(
				new Headers({
					host: hostB,
					cookie: `${singleCookie}; rendant-tenant=${clubA.id}`,
				}),
			),
		).rejects.toBeInstanceOf(TenantAccessError);
	});

	it("rejects unregistered and nested club hosts before falling back to any membership", async () => {
		for (const host of [`missing-${runId}.${baseDomain}`, `nested.${hostA}`]) {
			await expect(
				resolveHostTenant(new Headers({ host })),
			).rejects.toBeInstanceOf(TenantAccessError);
			await expect(
				resolveTenantSession(new Headers({ host, cookie: dualCookie })),
			).rejects.toBeInstanceOf(TenantAccessError);
		}
	});

	it("ignores forwarded or custom host spoofing and retains shared-host switching", async () => {
		const pinned = await resolveTenantSession(
			new Headers({
				host: hostA,
				cookie: `${dualCookie}; rendant-tenant=${clubB.id}`,
				"x-forwarded-host": hostB,
				"x-rendant-host": hostB,
			}),
		);
		expect(pinned?.tenant.id).toBe(clubA.id);
		const shared = await resolveTenantSession(
			new Headers({
				host: baseDomain,
				cookie: dualCookie,
				"x-rendant-tenant": clubB.id,
			}),
		);
		expect(shared?.tenant.id).toBe(clubB.id);
	});
});

describe("hostname business request boundary", () => {
	it("loads only host-owned database settings with a different tenant preference", async () => {
		const response = await withRequestTenant(
			new Request(`https://${hostB}/api/example`, {
				headers: {
					host: hostB,
					cookie: `${dualCookie}; rendant-tenant=${clubA.id}`,
				},
			}),
			async ({ tenant }) =>
				Response.json({
					tenant: tenant.id,
					settings: await db.select().from(appSettings),
				}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			tenant: clubB.id,
			settings: [{ tenant_id: clubB.id, vereinsname: clubB.name }],
		});
	});

	it("rejects a conflicting query, mismatched HTTP authority and unauthorized host", async () => {
		let invoked = false;
		const work = async () => {
			invoked = true;
			return Response.json({ unsafe: true });
		};
		const conflict = await withRequestTenant(
			new Request(`https://${hostB}/api/example?tenant=${clubA.id}`, {
				headers: { host: hostB, cookie: dualCookie },
			}),
			work,
		);
		expect(conflict.status).toBe(403);
		const mismatch = await withRequestTenant(
			new Request(`https://${hostB}/api/example`, {
				headers: { host: hostA, cookie: dualCookie },
			}),
			work,
		);
		expect(mismatch.status).toBe(400);
		const unauthorized = await withRequestTenant(
			new Request(`https://${hostB}/api/example`, {
				headers: { host: hostB, cookie: singleCookie },
			}),
			work,
		);
		expect(unauthorized.status).toBe(403);
		expect(invoked).toBe(false);
	});

	it("does not invoke business code for unknown hosts or anonymous requests", async () => {
		let invoked = false;
		const work = async () => {
			invoked = true;
			return Response.json({ unsafe: true });
		};
		const unknown = await withRequestTenant(
			new Request(`https://missing-${runId}.${baseDomain}/api/example`),
			work,
		);
		expect(unknown.status).toBe(403);
		const anonymous = await withRequestTenant(
			new Request(`https://${hostB}/api/example`),
			work,
		);
		expect(anonymous.status).toBe(401);
		expect(invoked).toBe(false);
	});
});
