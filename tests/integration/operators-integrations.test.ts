import { createHash, randomUUID } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { and, eq, sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const capture = vi.hoisted(() => ({
	messages: [] as {
		config: Record<string, unknown>;
		message: Record<string, unknown>;
	}[],
	requests: [] as { url: string; authorization: string }[],
	beforeSumupReply: null as null | (() => Promise<void>),
	failAfterMailCapture: false,
}));
vi.mock("nodemailer", () => ({
	default: {
		createTransport: (config: Record<string, unknown>) => ({
			sendMail: async (message: Record<string, unknown>) => {
				capture.messages.push({ config, message });
				if (capture.failAfterMailCapture)
					throw new Error("synthetic-smtp-password-a");
				return {
					messageId: "synthetic-capture",
					accepted: [message.to],
					rejected: [],
				};
			},
			close: () => {},
		}),
	},
}));
vi.mock("@/server/services/s3", async (original) => ({
	...(await original<typeof import("@/server/services/s3")>()),
	downloadPdf: () => {
		throw new Error("Technical configuration must not read documents");
	},
	uploadPdf: () => {
		throw new Error("Technical configuration must not create documents");
	},
}));

import { auth } from "@/server/auth";
import { db, globalDb, pool } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { appSettings, auditEvents, datevDeliveries } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { createORPCContext } from "@/server/orpc/context";
import { type AppRouter, router } from "@/server/orpc/router";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import {
	getOperatorIntegrations,
	updateOperatorEmailSettings,
	updateOperatorSumupSettings,
	updateOperatorDatevSettings,
	sendOperatorTestEmail,
	testOperatorSumupConnection,
} from "@/server/services/operator-integrations";
import { encryptSecret, decryptSecret } from "@/server/services/secret-box";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const password = "synthetic-operator-integrations-password";
const handler = new RPCHandler(router);
async function fixture() {
	const run = randomUUID();
	const a = {
		id: randomUUID(),
		slug: `tech-a-${run}`,
		name: "Synthetische Technik A",
	};
	const b = {
		id: randomUUID(),
		slug: `tech-b-${run}`,
		name: "Synthetische Technik B",
	};
	await globalDb.insert(tenants).values([a, b]);
	for (const club of [a, b])
		await withTenant(club, () =>
			db
				.insert(appSettings)
				.values({ tenant_id: club.id, id: 1, vereinsname: club.name }),
		);
	const email = `technical-operator-${run}@example.invalid`;
	const identity = await ensureCredentialUser({
		email,
		name: "Synthetischer Betreiber",
		password,
		role: "user",
	});
	const operator = {
		id: identity.id,
		email,
		name: "Synthetischer Betreiber",
		role: "admin" as const,
	};
	await globalDb
		.insert(memberships)
		.values({ tenant_id: SVU_TENANT_ID, user_id: operator.id, role: "admin" });
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", email);
	return { a, b, operator };
}
async function row(club: { id: string; slug: string; name: string }) {
	return withTenant(
		club,
		async () =>
			(await db.select().from(appSettings).where(eq(appSettings.id, 1)))[0],
	);
}
function emailPatch(
	tenantId: string,
	expected_updated_at: string,
	suffix = "a",
	passwordValue = "synthetic-smtp-password-a",
) {
	return {
		tenantId,
		expected_updated_at,
		enabled: true,
		host: `smtp-${suffix}.example.invalid`,
		port: 587,
		security: "starttls" as const,
		user: `smtp-${suffix}@example.invalid`,
		password: passwordValue,
		clear_password: false,
		from: `sender-${suffix}@example.invalid`,
		notify_new_protokoll: true,
		recipients: `notify-${suffix}@example.invalid`,
	};
}
async function cookieFor(email: string) {
	const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
	const response = await auth.handler(
		new Request(`${base}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: base },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(response.status).toBe(200);
	return response.headers
		.getSetCookie()
		.map((part) => part.split(";")[0])
		.join("; ");
}
function rpc(
	cookie: string,
	host: string,
	headers: Record<string, string> = {},
) {
	return createORPCClient<RouterClient<AppRouter>>(
		new RPCLink({
			url: `https://${host}/api/rpc`,
			headers: { host, cookie, ...headers },
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

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error(
			"Operator integration settings require an isolated test database",
		);
	const result = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (!result.rows[0]?.name.endsWith("_test"))
		throw new Error("Operator integration settings refuse a non-test database");
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
});
beforeEach(() => {
	capture.messages.length = 0;
	capture.requests.length = 0;
	capture.beforeSumupReply = null;
	capture.failAfterMailCapture = false;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (
				url.origin !== "https://api.sumup.com" ||
				url.pathname !== "/v0.1/memberships"
			)
				throw new Error("Unexpected external request");
			const authorization =
				new Headers(
					init?.headers ??
						(input instanceof Request ? input.headers : undefined),
				).get("authorization") ?? "";
			capture.requests.push({ url: url.toString(), authorization });
			if (capture.beforeSumupReply) {
				const callback = capture.beforeSumupReply;
				capture.beforeSumupReply = null;
				await callback();
			}
			const suffix = authorization.endsWith("-b") ? "b" : "a";
			return new Response(
				JSON.stringify({
					items: [
						{
							status: "accepted",
							resource: {
								type: "merchant",
								id: `merchant-${suffix}`,
								name: `Synthetischer Händler ${suffix}`,
							},
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}),
	);
});
afterAll(async () => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	await pool.end();
});

describe("operator-only technical configuration", () => {
	it("returns sanitized configuration without joining the operator to the destination club", async () => {
		const { a, operator } = await fixture();
		const smtp = "synthetic-stored-smtp";
		const sumup = "synthetic-stored-sumup";
		const token = `synthetic-mcp-${randomUUID()}`;
		const encrypted = {
			smtp: encryptSecret(smtp),
			sumup: encryptSecret(sumup),
			mcp: encryptSecret(token),
		};
		await withTenant(a, () =>
			db
				.update(appSettings)
				.set({
					smtp_password_enc: encrypted.smtp,
					sumup_api_key_enc: encrypted.sumup,
					mcp_override: true,
					mcp_enabled: true,
					mcp_token_enc: encrypted.mcp,
					mcp_token_sha256: createHash("sha256").update(token).digest("hex"),
					helferstunde_wert_cent: 9876,
				})
				.where(eq(appSettings.id, 1)),
		);
		const view = await getOperatorIntegrations(a.id, operator);
		expect(view.email.has_password).toBe(true);
		expect(view.sumup.has_api_key).toBe(true);
		expect(view.mcp.has_token).toBe(true);
		const output = JSON.stringify(view);
		for (const secret of [smtp, sumup, token, ...Object.values(encrypted)])
			expect(output).not.toContain(secret);
		expect(output).not.toMatch(
			/smtp_password_enc|sumup_api_key_enc|mcp_token_enc|mcp_token_sha256|helferstunde_wert_cent|9876/,
		);
		expect(
			await globalDb
				.select({ id: memberships.user_id })
				.from(memberships)
				.where(
					and(
						eq(memberships.tenant_id, a.id),
						eq(memberships.user_id, operator.id),
					),
				),
		).toHaveLength(0);
		expect(capture.messages).toHaveLength(0);
	});

	it("rejects unlisted club Admins even with global Admin flags before any technical side effect", async () => {
		const { a, operator } = await fixture();
		const email = `unlisted-technical-${randomUUID()}@example.invalid`;
		const identity = await ensureCredentialUser({
			email,
			name: "Synthetischer Vereinsadmin",
			password,
			role: "admin",
		});
		const outsider = {
			id: identity.id,
			email,
			name: "Synthetischer Vereinsadmin",
			role: "admin",
		};
		await globalDb.insert(memberships).values([
			{ tenant_id: a.id, user_id: identity.id, role: "admin" },
			{ tenant_id: SVU_TENANT_ID, user_id: identity.id, role: "admin" },
		]);
		const before = await getOperatorIntegrations(a.id, operator);
		await expect(getOperatorIntegrations(a.id, outsider)).rejects.toMatchObject(
			{ code: "FORBIDDEN" },
		);
		await expect(
			updateOperatorEmailSettings(
				emailPatch(a.id, before.email.updated_at!),
				outsider,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			sendOperatorTestEmail(
				{ tenantId: a.id, to: "local-capture@example.invalid" },
				outsider,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			testOperatorSumupConnection({ tenantId: a.id }, outsider),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(capture.messages).toHaveLength(0);
		expect(capture.requests).toHaveLength(0);
		expect((await row(a)).smtp_password_enc).toBe("");
	});

	it("keeps concurrent destination configuration and audit scopes isolated", async () => {
		const { a, b, operator } = await fixture();
		const [beforeA, beforeB] = await Promise.all([
			getOperatorIntegrations(a.id, operator),
			getOperatorIntegrations(b.id, operator),
		]);
		await Promise.all([
			updateOperatorEmailSettings(
				emailPatch(
					a.id,
					beforeA.email.updated_at!,
					"a",
					"synthetic-password-a",
				),
				operator,
			),
			updateOperatorEmailSettings(
				emailPatch(
					b.id,
					beforeB.email.updated_at!,
					"b",
					"synthetic-password-b",
				),
				operator,
			),
		]);
		const [afterA, afterB] = await Promise.all([
			getOperatorIntegrations(a.id, operator),
			getOperatorIntegrations(b.id, operator),
		]);
		expect(afterA.email.host).toBe("smtp-a.example.invalid");
		expect(afterB.email.host).toBe("smtp-b.example.invalid");
		expect(decryptSecret((await row(a)).smtp_password_enc)).toBe(
			"synthetic-password-a",
		);
		expect(decryptSecret((await row(b)).smtp_password_enc)).toBe(
			"synthetic-password-b",
		);
		for (const club of [a, b]) {
			const events = await withTenant(club, () =>
				db
					.select({
						actor: auditEvents.actor_user_id,
						metadata: auditEvents.metadata,
					})
					.from(auditEvents)
					.where(eq(auditEvents.action, "settings.email_changed")),
			);
			expect(events).toHaveLength(1);
			expect(events[0].actor).toBe(operator.id);
			expect(JSON.stringify(events)).not.toContain("synthetic-password");
			expect(JSON.stringify(events)).not.toContain("v1:");
		}
		expect(capture.messages).toHaveLength(0);
	});

	it("retains an existing SMTP secret on blank input and clears only when requested", async () => {
		const { a, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		const saved = await updateOperatorEmailSettings(
			emailPatch(a.id, before.email.updated_at!),
			operator,
		);
		const ciphertext = (await row(a)).smtp_password_enc;
		const retained = await updateOperatorEmailSettings(
			emailPatch(a.id, saved.updated_at!, "a", ""),
			operator,
		);
		expect((await row(a)).smtp_password_enc).toBe(ciphertext);
		expect(retained.has_password).toBe(true);
		const cleared = await updateOperatorEmailSettings(
			{ ...emailPatch(a.id, retained.updated_at!), clear_password: true },
			operator,
		);
		expect(cleared.has_password).toBe(false);
		expect((await row(a)).smtp_password_enc).toBe("");
		expect(capture.messages).toHaveLength(0);
	});

	it("rejects one competing save even when the wall clock equals the old stamp", async () => {
		const { a, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(before.email.updated_at!));
		try {
			const results = await Promise.allSettled([
				updateOperatorEmailSettings(
					emailPatch(a.id, before.email.updated_at!, "a"),
					operator,
				),
				updateOperatorEmailSettings(
					emailPatch(a.id, before.email.updated_at!, "b"),
					operator,
				),
			]);
			expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
			expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
			expect(results.find((r) => r.status === "rejected")).toMatchObject({
				reason: { name: "SettingsConcurrencyError" },
			});
			const after = await getOperatorIntegrations(a.id, operator);
			expect(Date.parse(after.email.updated_at!)).toBeGreaterThan(
				Date.parse(before.email.updated_at!),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("binds each SumUp key to the correct merchant, retains it on blank input and clears it explicitly", async () => {
		const { a, b, operator } = await fixture();
		const [initialA, initialB] = await Promise.all([
			getOperatorIntegrations(a.id, operator),
			getOperatorIntegrations(b.id, operator),
		]);
		const [savedA, savedB] = await Promise.all([
			updateOperatorSumupSettings(
				{
					tenantId: a.id,
					enabled: true,
					api_key: "synthetic-sumup-a",
					clear_api_key: false,
					expected_updated_at: initialA.sumup.updated_at!,
				},
				operator,
			),
			updateOperatorSumupSettings(
				{
					tenantId: b.id,
					enabled: true,
					api_key: "synthetic-sumup-b",
					clear_api_key: false,
					expected_updated_at: initialB.sumup.updated_at!,
				},
				operator,
			),
		]);
		expect(savedA.merchant_code).toBe("merchant-a");
		expect(savedB.merchant_code).toBe("merchant-b");
		const encrypted = (await row(a)).sumup_api_key_enc;
		// Another technical group must not stale the SumUp stamp.
		await updateOperatorEmailSettings(
			emailPatch(a.id, initialA.email.updated_at!),
			operator,
		);
		const retained = await updateOperatorSumupSettings(
			{
				tenantId: a.id,
				enabled: true,
				api_key: "",
				clear_api_key: false,
				expected_updated_at: savedA.updated_at!,
			},
			operator,
		);
		expect((await row(a)).sumup_api_key_enc).toBe(encrypted);
		expect(capture.requests).toHaveLength(2);
		await testOperatorSumupConnection({ tenantId: a.id }, operator);
		expect(capture.requests).toHaveLength(3);
		const cleared = await updateOperatorSumupSettings(
			{
				tenantId: a.id,
				enabled: true,
				clear_api_key: true,
				api_key: "ignored-new-key",
				expected_updated_at: retained.updated_at!,
			},
			operator,
		);
		expect(cleared).toMatchObject({
			enabled: false,
			has_api_key: false,
			merchant_code: "",
			merchant_name: "",
		});
		expect(capture.requests).toHaveLength(3);
		expect((await row(b)).sumup_api_key_enc).not.toBe("");
		expect(capture.messages).toHaveLength(0);
	});

	it("rechecks operator authority after external SumUp verification before committing", async () => {
		const { a, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		capture.beforeSumupReply = async () => {
			await globalDb
				.update(memberships)
				.set({ banned: true })
				.where(
					and(
						eq(memberships.tenant_id, SVU_TENANT_ID),
						eq(memberships.user_id, operator.id),
					),
				);
		};
		await expect(
			updateOperatorSumupSettings(
				{
					tenantId: a.id,
					enabled: true,
					api_key: "synthetic-sumup-a",
					clear_api_key: false,
					expected_updated_at: before.sumup.updated_at!,
				},
				operator,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect((await row(a)).sumup_api_key_enc).toBe("");
		expect((await row(a)).sumup_updated_at.toISOString()).toBe(
			before.sumup.updated_at,
		);
		await expect(getOperatorIntegrations(a.id, operator)).rejects.toMatchObject(
			{ code: "FORBIDDEN" },
		);
		expect(capture.messages).toHaveLength(0);
	});

	it("changes DATEV connection settings without sending or claiming a delivery", async () => {
		const { a, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		const saved = await updateOperatorDatevSettings(
			{
				tenantId: a.id,
				enabled: true,
				recipient: "synthetic-destination@uploadmail.datev.de",
				sender: "synthetic-sender@example.invalid",
				expected_updated_at: before.datev.updated_at,
			},
			operator,
		);
		expect(saved.enabled).toBe(true);
		await expect(
			updateOperatorDatevSettings(
				{
					tenantId: a.id,
					enabled: false,
					recipient: "",
					sender: "",
					expected_updated_at: before.datev.updated_at,
				},
				operator,
			),
		).rejects.toMatchObject({ name: "SettingsConcurrencyError" });
		expect(capture.messages).toHaveLength(0);
		expect(
			await withTenant(a, () =>
				db.select({ id: datevDeliveries.protokoll_id }).from(datevDeliveries),
			),
		).toHaveLength(0);
	});

	it("sends a single locally captured test email only after its explicit call", async () => {
		const { a, b, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		await updateOperatorEmailSettings(
			emailPatch(a.id, before.email.updated_at!),
			operator,
		);
		expect(capture.messages).toHaveLength(0);
		await sendOperatorTestEmail(
			{ tenantId: a.id, to: "local-capture@example.invalid" },
			operator,
		);
		expect(capture.messages).toHaveLength(1);
		expect(capture.messages[0].config).toMatchObject({
			host: "smtp-a.example.invalid",
			requireTLS: true,
		});
		expect(capture.messages[0].message.to).toBe(
			"local-capture@example.invalid",
		);
		expect(String(capture.messages[0].message.text)).toContain(a.name);
		expect(String(capture.messages[0].message.text)).not.toContain(b.name);
	});

	it("records an explicit test intent but never retries an ambiguous local SMTP failure", async () => {
		const { a, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		await updateOperatorEmailSettings(
			emailPatch(a.id, before.email.updated_at!),
			operator,
		);
		capture.failAfterMailCapture = true;
		let failure: unknown;
		try {
			await sendOperatorTestEmail(
				{ tenantId: a.id, to: "local-capture@example.invalid" },
				operator,
			);
		} catch (error) {
			failure = error;
		}
		expect(failure).toMatchObject({ code: "BAD_REQUEST" });
		expect((failure as Error).message).not.toContain(
			"synthetic-smtp-password-a",
		);
		expect((failure as Error).message.toLowerCase()).toContain("postfach");
		expect(capture.messages).toHaveLength(1);
		const events = await withTenant(a, () =>
			db
				.select({ action: auditEvents.action })
				.from(auditEvents)
				.where(eq(auditEvents.action, "settings.email_test_requested")),
		);
		expect(events).toHaveLength(1);
	});

	it("rolls back the target settings and stamp if the audit insert fails", async () => {
		const { a, operator } = await fixture();
		const before = await getOperatorIntegrations(a.id, operator);
		const original = await row(a);
		const suffix = randomUUID().replaceAll("-", "");
		const name = `fail_technical_audit_${suffix}`;
		await globalDb.execute(
			sql.raw(
				`create function public.${name}() returns trigger language plpgsql as $$ begin if new.tenant_id = '${a.id}'::uuid then raise exception 'Synthetic technical audit failure'; end if; return new; end $$`,
			),
		);
		await globalDb.execute(
			sql.raw(
				`create trigger ${name} before insert on public.audit_events for each row execute function public.${name}()`,
			),
		);
		try {
			await expect(
				updateOperatorEmailSettings(
					emailPatch(a.id, before.email.updated_at!),
					operator,
				),
			).rejects.toThrow();
		} finally {
			await globalDb.execute(
				sql.raw(`drop trigger ${name} on public.audit_events`),
			);
			await globalDb.execute(sql.raw(`drop function public.${name}()`));
		}
		const after = await row(a);
		expect(after.smtp_host).toBe(original.smtp_host);
		expect(after.smtp_password_enc).toBe(original.smtp_password_enc);
		expect(after.email_updated_at).toEqual(original.email_updated_at);
	});

	it("denies club hosts and financial RPC even after successful operator configuration reads", async () => {
		const { a, b, operator } = await fixture();
		const cookie = await cookieFor(operator.email);
		const central = rpc(cookie, "admin.rendant.app");
		const [initial] = await Promise.all([
			central.operators.integrationSettings({ tenantId: a.id }),
			central.operators.integrationSettings({ tenantId: b.id }),
		]);
		await central.operators.updateEmail(
			emailPatch(a.id, initial.email.updated_at!),
		);
		await expect(central.registers.list()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			rpc(cookie, "admin.rendant.app", {
				"x-rendant-tenant": a.id,
			}).registers.list(),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			rpc(cookie, `${a.slug}.rendant.app`).operators.integrationSettings({
				tenantId: a.id,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
