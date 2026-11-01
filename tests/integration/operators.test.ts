import { randomUUID } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth";
import { db, globalDb, pool } from "@/server/db";
import { account, user } from "@/server/db/auth-schema";
import {
	appSettings,
	auditEvents,
	invitations,
	protokolle,
} from "@/server/db/schema";
import { memberships } from "@/server/db/tenant-schema";
import {
	authenticateMcpRequest,
	validateMcpRequestBoundary,
} from "@/server/mcp/auth";
import { createORPCContext } from "@/server/orpc/context";
import { type AppRouter, router } from "@/server/orpc/router";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import { acceptInvite } from "@/server/services/invitations";
import { resolveOperatorSession } from "@/server/services/operator-auth";
import { listUserTenants } from "@/server/services/tenants";
import {
	SVU_TENANT_ID,
	withRequestTenant,
	withTenant,
} from "@/server/tenant-context";

const runId = randomUUID();
const operatorEmail = `operator-${runId}@example.invalid`;
const unlistedEmail = `unlisted-admin-${runId}@example.invalid`;
const outsiderEmail = `not-svu-${runId}@example.invalid`;
const password = "synthetic-operator-integration-password";
const operatorHost = "admin.rendant.app";
const handler = new RPCHandler(router);
let operatorId: string;
let unlistedId: string;
let operatorCookie: string;
let unlistedCookie: string;
let outsiderCookie: string;
let target: { id: string; slug: string; name: string; url: string | null };
let other: typeof target;

function rpc(
	cookie?: string,
	host = operatorHost,
	extraHeaders: Record<string, string> = {},
) {
	return createORPCClient<RouterClient<AppRouter>>(
		new RPCLink({
			url: `https://${host}/api/rpc`,
			headers: { host, ...(cookie ? { cookie } : {}), ...extraHeaders },
			fetch: async (request) => {
				const result = await handler.handle(request, {
					prefix: "/api/rpc",
					context: await createORPCContext(request),
				});
				return result.response ?? new Response("Not found", { status: 404 });
			},
		}),
	);
}

async function provision(email: string, name: string, role = "user") {
	const identity = await ensureCredentialUser({ email, name, password, role });
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
	expect(cookies.some((value) => /;\s*domain=/i.test(value))).toBe(false);
	return {
		id: identity.id,
		cookie: cookies.map((value) => value.split(";")[0]).join("; "),
	};
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error("Operator tests require an isolated database");
	const database = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (!database.rows[0]?.name.endsWith("_test"))
		throw new Error("Operator tests refuse a non-test database");
	const operator = await provision(operatorEmail, "Synthetischer Betreiber");
	const unlisted = await provision(
		unlistedEmail,
		"Nicht freigeschalteter SVU Admin",
		"admin",
	);
	const outsider = await provision(
		outsiderEmail,
		"Freigeschaltet ohne SVU Mitgliedschaft",
		"admin",
	);
	operatorId = operator.id;
	unlistedId = unlisted.id;
	operatorCookie = operator.cookie;
	unlistedCookie = unlisted.cookie;
	outsiderCookie = outsider.cookie;
	await globalDb.insert(memberships).values([
		{ tenant_id: SVU_TENANT_ID, user_id: operatorId, role: "admin" },
		{ tenant_id: SVU_TENANT_ID, user_id: unlistedId, role: "admin" },
	]);
	vi.stubEnv("TENANT_ADMIN_HOST", operatorHost);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv(
		"TENANT_CANONICAL_HOSTS_JSON",
		JSON.stringify({ svu: "sv-untereuerheim.rendant.app" }),
	);
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", `${operatorEmail},${outsiderEmail}`);
	target = await rpc(operatorCookie).operators.create({
		name: "Synthetischer Operatorverein",
		slug: `operator-${runId}`,
	});
	other = await rpc(operatorCookie).operators.create({
		name: "Zweiter Operatorverein",
		slug: `other-${runId}`,
	});
}, 30_000);

afterAll(async () => {
	vi.unstubAllEnvs();
	await pool.end();
});

describe("operator realm authorization", () => {
	it("requires the admin host, explicit email approval and live SVU admin membership", async () => {
		expect(
			(
				await resolveOperatorSession(
					new Headers({ host: operatorHost, cookie: operatorCookie }),
				)
			)?.user.id,
		).toBe(operatorId);
		for (const cookie of [unlistedCookie, outsiderCookie])
			await expect(rpc(cookie).operators.list()).rejects.toMatchObject({
				status: 403,
			});
		await expect(rpc().operators.list()).rejects.toMatchObject({ status: 401 });
		await expect(
			rpc(operatorCookie, "sv-untereuerheim.rendant.app").operators.list(),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			rpc(operatorCookie, "sv-untereuerheim.rendant.app", {
				"x-forwarded-host": operatorHost,
			}).operators.list(),
		).rejects.toMatchObject({ status: 403 });
	});

	it("never grants a financial tenant on the admin host even for a verified operator", async () => {
		const selectors: Record<string, string>[] = [
			{},
			{ "x-rendant-tenant": SVU_TENANT_ID },
			{ "x-rendant-tenant": target.id },
		];
		for (const headers of selectors) {
			await expect(
				rpc(
					`${operatorCookie}; rendant-tenant=${SVU_TENANT_ID}`,
					operatorHost,
					headers,
				).settings.getVerein(),
			).rejects.toMatchObject({ status: 403 });
			await expect(
				rpc(operatorCookie, operatorHost, headers).registers.list(),
			).rejects.toMatchObject({ status: 403 });
		}
		let executed = false;
		const response = await withRequestTenant(
			new Request(
				`https://${operatorHost}/api/export/json?tenant=${SVU_TENANT_ID}`,
				{ headers: { cookie: operatorCookie } },
			),
			async () => {
				executed = true;
				return Response.json({ unsafe: true });
			},
		);
		expect(response.status).toBe(403);
		expect(executed).toBe(false);
	});

	it("does not turn an allowlisted admin hostname into an MCP financial backdoor", () => {
		vi.stubEnv("MCP_ALLOWED_ORIGINS", `https://${operatorHost}`);
		vi.stubEnv(
			"MCP_BEARER_TOKEN",
			"synthetic-operator-boundary-token-32-plus-characters",
		);
		const request = new Request(`https://${operatorHost}/api/mcp`, {
			headers: { authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` },
		});
		expect(validateMcpRequestBoundary(request)?.status).toBe(403);
		expect(authenticateMcpRequest(request)).toBeNull();
	});
});

describe("audited operator tenant management", () => {
	it("creates honest zero-member clubs without granting financial access to the creator", async () => {
		const metadata = (await rpc(operatorCookie).operators.list()).find(
			(row) => row.id === target.id,
		);
		expect(metadata).toMatchObject({
			id: target.id,
			memberCount: 0,
			adminCount: 0,
			url: null,
		});
		expect(
			await globalDb
				.select()
				.from(memberships)
				.where(eq(memberships.tenant_id, target.id)),
		).toEqual([]);
		expect(
			(await listUserTenants(operatorId)).some((row) => row.id === target.id),
		).toBe(false);
		await expect(
			rpc(operatorCookie).operators.create({
				name: "Reservierter Betreibername",
				slug: "admin",
			}),
		).rejects.toMatchObject({ status: 400 });
	});

	it("does not create invitation capabilities or misleading URLs before a club origin is approved", async () => {
		await expect(
			rpc(operatorCookie).operators.invite({
				tenantId: target.id,
				email: `unready-${runId}@example.invalid`,
				role: "admin",
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(
			await globalDb
				.select()
				.from(invitations)
				.where(eq(invitations.tenant_id, target.id)),
		).toEqual([]);
	});

	it("renames metadata and display settings while preserving existing signed protocol facts", async () => {
		const protocolId = randomUUID();
		await withTenant(target, () =>
			db
				.insert(protokolle)
				.values({
					id: protocolId,
					belegnummer: "OPERATOR-ORIGINAL",
					anlass_datum: "2026-11-01",
					anlass: "Synthetischer Altbeleg",
					gezaehlt_von: "Test",
					geprueft_von: "Test",
					wechselgeld_cent: 0,
					gezaehlt_cent: 12345,
					ausgaben_cent: 0,
					bestand_cent: 12345,
					tageseinnahmen_cent: 12345,
					pdf_s3_key: `tenants/${target.id}/original.pdf`,
					pdf_sha256: "a".repeat(64),
				}),
		);
		const before = await globalDb
			.select()
			.from(protokolle)
			.where(eq(protokolle.id, protocolId));
		const renamed = await rpc(operatorCookie).operators.rename({
			tenantId: target.id,
			name: "Geprüfter synthetischer Vereinsname",
		});
		expect(renamed).toMatchObject({
			id: target.id,
			slug: target.slug,
			name: "Geprüfter synthetischer Vereinsname",
		});
		expect(
			await globalDb
				.select()
				.from(protokolle)
				.where(eq(protokolle.id, protocolId)),
		).toEqual(before);
		expect(
			await globalDb
				.select()
				.from(appSettings)
				.where(eq(appSettings.tenant_id, target.id)),
		).toMatchObject([{ vereinsname: renamed.name }]);
		expect(
			await globalDb
				.select()
				.from(auditEvents)
				.where(
					and(
						eq(auditEvents.tenant_id, target.id),
						eq(auditEvents.action, "settings.tenant_renamed"),
					),
				),
		).toHaveLength(1);
	});

	it("issues a club-specific invite, hides existing tokens and revokes only the chosen club's invite", async () => {
		vi.stubEnv(
			"AUTH_TRUSTED_ORIGINS",
			`https://${target.slug}.rendant.app,https://${other.slug}.rendant.app`,
		);
		vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app");
		const invite = await rpc(operatorCookie).operators.invite({
			tenantId: target.id,
			email: `member-${runId}@example.invalid`,
			role: "admin",
		});
		expect(invite.inviteUrl).toBe(
			`https://${target.slug}.rendant.app/invite/${invite.token}`,
		);
		const listed = await rpc(operatorCookie).operators.invites({
			tenantId: target.id,
		});
		expect(listed).toHaveLength(1);
		expect(listed[0]).not.toHaveProperty("token");
		await expect(
			rpc(operatorCookie).operators.revoke({
				tenantId: other.id,
				id: invite.id,
			}),
		).rejects.toMatchObject({ status: 404 });
		await rpc(operatorCookie).operators.revoke({
			tenantId: target.id,
			id: invite.id,
		});
		expect(
			await rpc(operatorCookie).operators.invites({ tenantId: target.id }),
		).toEqual([]);
	});

	it("invites the first member without adding the operator or changing global roles", async () => {
		const email = `first-member-${runId}@example.invalid`;
		const invite = await rpc(operatorCookie).operators.invite({
			tenantId: target.id,
			email,
			role: "admin",
		});
		const accepted = await acceptInvite({
			token: invite.token,
			name: "Erster Vereinsadmin",
			password,
			audit: {},
		});
		const members = await rpc(operatorCookie).operators.members({
			tenantId: target.id,
		});
		expect(members.members).toMatchObject([
			{ id: accepted.userId, role: "admin", email },
		]);
		expect(
			(
				await globalDb.select().from(user).where(eq(user.id, accepted.userId))
			)[0].role,
		).toBe("user");
		await expect(
			rpc(operatorCookie).operators.setRole({
				tenantId: target.id,
				id: accepted.userId,
				role: "user",
			}),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			rpc(operatorCookie).operators.setBanned({
				tenantId: target.id,
				id: accepted.userId,
				banned: true,
			}),
		).rejects.toMatchObject({ status: 409 });
	});

	it("retains one active admin under concurrent operator demotions and keeps global identity intact", async () => {
		const first = (
			await rpc(operatorCookie).operators.members({ tenantId: target.id })
		).members[0];
		await globalDb
			.insert(memberships)
			.values({ tenant_id: target.id, user_id: unlistedId, role: "admin" });
		await globalDb
			.insert(memberships)
			.values({ tenant_id: other.id, user_id: unlistedId, role: "admin" });
		const identity = await globalDb
			.select()
			.from(user)
			.where(eq(user.id, unlistedId));
		const credentials = await globalDb
			.select()
			.from(account)
			.where(eq(account.userId, unlistedId));
		const results = await Promise.allSettled([
			rpc(operatorCookie).operators.setRole({
				tenantId: target.id,
				id: first.id,
				role: "user",
			}),
			rpc(operatorCookie).operators.setRole({
				tenantId: target.id,
				id: unlistedId,
				role: "user",
			}),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			(
				await rpc(operatorCookie).operators.members({ tenantId: target.id })
			).members.filter((row) => row.role === "admin" && !row.banned),
		).toHaveLength(1);
		expect(
			await globalDb.select().from(user).where(eq(user.id, unlistedId)),
		).toEqual(identity);
		expect(
			await globalDb
				.select()
				.from(account)
				.where(eq(account.userId, unlistedId)),
		).toEqual(credentials);
		expect(
			(await rpc(operatorCookie).operators.members({ tenantId: other.id }))
				.members[0].role,
		).toBe("admin");
	});
});

describe("fresh operator revocation", () => {
	it("rechecks membership and email approval on every read and write", async () => {
		await globalDb
			.update(memberships)
			.set({ banned: true })
			.where(
				and(
					eq(memberships.tenant_id, SVU_TENANT_ID),
					eq(memberships.user_id, operatorId),
				),
			);
		try {
			await expect(rpc(operatorCookie).operators.list()).rejects.toMatchObject({
				status: 403,
			});
			await expect(
				rpc(operatorCookie).operators.rename({
					tenantId: target.id,
					name: "Darf nicht speichern",
				}),
			).rejects.toMatchObject({ status: 403 });
		} finally {
			await globalDb
				.update(memberships)
				.set({ banned: false })
				.where(
					and(
						eq(memberships.tenant_id, SVU_TENANT_ID),
						eq(memberships.user_id, operatorId),
					),
				);
		}
		vi.stubEnv("PLATFORM_ADMIN_EMAILS", outsiderEmail);
		try {
			await expect(rpc(operatorCookie).operators.list()).rejects.toMatchObject({
				status: 403,
			});
		} finally {
			vi.stubEnv("PLATFORM_ADMIN_EMAILS", `${operatorEmail},${outsiderEmail}`);
		}
		expect(
			(await rpc(operatorCookie).operators.members({ tenantId: target.id }))
				.tenant.name,
		).toBe("Geprüfter synthetischer Vereinsname");
	});
});
