import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { legacyDomainRedirect } from "@/lib/canonical-domain";
import { auth } from "@/server/auth";
import { db, globalDb, pool } from "@/server/db";
import { account } from "@/server/db/auth-schema";
import { appSettings } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import { tenantPublicBaseUrl } from "@/server/services/public-url";
import {
	resolveHostTenant,
	resolveTenantSession,
	TenantAccessError,
} from "@/server/services/tenants";
import {
	SVU_TENANT_ID,
	withRequestTenant,
	withTenant,
} from "@/server/tenant-context";

const runId = randomUUID();
const canonical = JSON.stringify({
	svu: "sv-untereuerheim.rendant.app",
	"ssv-gaedheim": "ssv-gaedheim.rendant.app",
});
const oldSvuHosts = [
	"rendant.sv-untereuerheim.de",
	"svufo.sv-untereuerheim.de",
];
const oldSsv = "ssv-gaedheim.rendant.pdcd.net";
const newSvu = "sv-untereuerheim.rendant.app";
const newSsv = "ssv-gaedheim.rendant.app";
const password = "synthetic-product-domain-password";
let cookie: string;
let userId: string;
let ssvId: string;
let identityBefore: typeof account.$inferSelect;

function phase(active: boolean) {
	vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", active ? "rendant.app" : "");
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error("Domain migration tests require an isolated database");
	const database = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (!database.rows[0]?.name.endsWith("_test"))
		throw new Error("Domain migration tests refuse a non-test database");
	const email = `domain-transition-${runId}@example.invalid`;
	userId = (
		await ensureCredentialUser({
			email,
			name: "Synthetische Domainprüfung",
			password,
			role: "user",
		})
	).id;
	const origin = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
	const login = await auth.handler(
		new Request(`${origin}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(login.status).toBe(200);
	const loginCookies = login.headers.getSetCookie();
	expect(loginCookies.some((value) => /;\s*domain=/i.test(value))).toBe(false);
	cookie = loginCookies.map((value) => value.split(";")[0]).join("; ");
	[identityBefore] = await globalDb
		.select()
		.from(account)
		.where(eq(account.userId, userId));
	await globalDb
		.insert(tenants)
		.values({ slug: "ssv-gaedheim", name: "Synthetischer SSV Gädheim" })
		.onConflictDoNothing({ target: tenants.slug });
	[{ id: ssvId }] = await globalDb
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, "ssv-gaedheim"));
	await globalDb.insert(memberships).values([
		{ tenant_id: SVU_TENANT_ID, user_id: userId, role: "admin" },
		{ tenant_id: ssvId, user_id: userId, role: "user" },
	]);
	await withTenant(
		{ id: ssvId, slug: "ssv-gaedheim", name: "Synthetischer SSV Gädheim" },
		() =>
			db
				.insert(appSettings)
				.values({ id: 1, vereinsname: "Synthetischer SSV Gädheim" })
				.onConflictDoNothing({
					target: [appSettings.tenant_id, appSettings.id],
				}),
	);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", canonical);
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv("BETTER_AUTH_URL", `https://${oldSvuHosts[0]}`);
	vi.stubEnv(
		"AUTH_TRUSTED_ORIGINS",
		[oldSvuHosts[1], oldSsv, newSvu, newSsv]
			.map((host) => `https://${host}`)
			.join(","),
	);
}, 30_000);

afterAll(async () => {
	vi.unstubAllEnvs();
	await pool.end();
});

describe("stable identities across product-domain cutover", () => {
	it("maps the long SVU vanity hostname to the unchanged SVU slug and UUID", async () => {
		for (const active of [false, true]) {
			phase(active);
			for (const host of [...oldSvuHosts, newSvu]) {
				expect(await resolveHostTenant(new Headers({ host }))).toMatchObject({
					id: SVU_TENANT_ID,
					slug: "svu",
				});
				expect(
					(
						await resolveTenantSession(
							new Headers({
								host,
								cookie: `${cookie}; rendant-tenant=${ssvId}`,
							}),
						)
					)?.tenant,
				).toMatchObject({ id: SVU_TENANT_ID, slug: "svu", role: "admin" });
			}
			for (const host of [oldSsv, newSsv]) {
				expect(
					(
						await resolveTenantSession(
							new Headers({
								host,
								cookie: `${cookie}; rendant-tenant=${SVU_TENANT_ID}`,
							}),
						)
					)?.tenant,
				).toMatchObject({ id: ssvId, slug: "ssv-gaedheim", role: "user" });
			}
		}
		expect(
			await globalDb.select().from(account).where(eq(account.userId, userId)),
		).toEqual([identityBefore]);
	});

	it("never lets explicit selectors or forwarded headers reassign either club", async () => {
		for (const [host, foreignId] of [
			[newSvu, ssvId],
			[newSsv, SVU_TENANT_ID],
			[oldSvuHosts[0], ssvId],
			[oldSsv, SVU_TENANT_ID],
		]) {
			await expect(
				resolveTenantSession(
					new Headers({ host, cookie, "x-rendant-tenant": foreignId }),
				),
			).rejects.toBeInstanceOf(TenantAccessError);
		}
		expect(
			(
				await resolveTenantSession(
					new Headers({
						host: newSvu,
						cookie,
						"x-forwarded-host": newSsv,
						"x-rendant-host": newSsv,
					}),
				)
			)?.tenant.id,
		).toBe(SVU_TENANT_ID);
	});

	it("keeps old business APIs and writes host-bound before and after redirect activation", async () => {
		for (const active of [false, true]) {
			phase(active);
			for (const [host, expected] of [
				[oldSvuHosts[0], SVU_TENANT_ID],
				[oldSsv, ssvId],
			]) {
				for (const method of ["GET", "POST"]) {
					const request = new Request(`https://${host}/api/example`, {
						method,
						headers: { cookie, host },
					});
					expect(legacyDomainRedirect(request)).toBeNull();
					const response = await withRequestTenant(
						request,
						async ({ tenant }) =>
							Response.json({
								id: tenant.id,
								rows: await db.select().from(appSettings),
							}),
					);
					expect(response.status).toBe(200);
					const result = await response.json();
					expect(result.id).toBe(expected);
					expect(result.rows).toHaveLength(1);
					expect(result.rows[0].tenant_id).toBe(expected);
				}
			}
		}
	});
});

describe("staged redirects and public links", () => {
	it("retains working legacy pages and links before the DNS/TLS cutover gate", () => {
		phase(false);
		for (const host of [...oldSvuHosts, oldSsv])
			expect(
				legacyDomainRedirect(
					new Request(`https://${host}/protokolle?jahr=2026`),
				),
			).toBeNull();
		expect(tenantPublicBaseUrl({ id: SVU_TENANT_ID, slug: "svu" })).toBe(
			`https://${oldSvuHosts[0]}`,
		);
		expect(tenantPublicBaseUrl({ id: ssvId, slug: "ssv-gaedheim" })).toBe(
			`https://${oldSsv}`,
		);
	});

	it("redirects legacy pages to exact preferred hosts while retaining path and query", () => {
		phase(true);
		for (const [source, target] of [
			...oldSvuHosts.map((host) => [host, newSvu]),
			[oldSsv, newSsv],
		]) {
			const response = legacyDomainRedirect(
				new Request(
					`https://${source}/protokolle/einstellungen?jahr=2026&filter=a%2Fb`,
				),
			);
			expect(response?.status).toBe(308);
			expect(response?.headers.get("location")).toBe(
				`https://${target}/protokolle/einstellungen?jahr=2026&filter=a%2Fb`,
			);
		}
		for (const host of [newSvu, newSsv])
			expect(
				legacyDomainRedirect(new Request(`https://${host}/protokolle`)),
			).toBeNull();
		expect(tenantPublicBaseUrl({ id: SVU_TENANT_ID, slug: "svu" })).toBe(
			`https://${newSvu}`,
		);
		expect(tenantPublicBaseUrl({ id: ssvId, slug: "ssv-gaedheim" })).toBe(
			`https://${newSsv}`,
		);
	});

	it("keeps APIs, assets, server functions and all writes on their original host", () => {
		phase(true);
		for (const host of [...oldSvuHosts, oldSsv]) {
			for (const path of [
				"/api/health",
				"/api/rpc/settings/getVerein",
				"/api/mcp",
				"/assets/app.js",
				"/_serverFn/opaque-id",
				"/favicon.svg",
				"/manifest.webmanifest",
			]) {
				expect(
					legacyDomainRedirect(new Request(`https://${host}${path}`)),
				).toBeNull();
			}
			for (const method of ["POST", "PUT", "PATCH", "DELETE"])
				expect(
					legacyDomainRedirect(
						new Request(`https://${host}/protokolle`, { method }),
					),
				).toBeNull();
		}
	});
});
