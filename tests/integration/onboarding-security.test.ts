import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({
	messages: [] as Array<{
		to: string;
		resetUrl: string;
		verein: string;
		tenantId: string;
	}>,
}));
vi.mock("@/server/services/email", async (original) => ({
	...(await original<typeof import("@/server/services/email")>()),
	sendPasswordResetEmail: async (input: {
		to: string;
		resetUrl: string;
		verein: string;
	}) => {
		const { requireTenant } = await import("@/server/tenant-context");
		mail.messages.push({ ...input, tenantId: requireTenant().id });
		return "sent" as const;
	},
}));
import { auth } from "@/server/auth";
import { globalDb, pool } from "@/server/db";
import { user, verification } from "@/server/db/auth-schema";
import { invitations } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import {
	acceptInvite,
	getValidInvite,
	InviteAlreadyRegisteredError,
} from "@/server/services/invitations";
import {
	inviteOperatorMember,
	revokeOperatorInvite,
	setOperatorMemberRole,
} from "@/server/services/operators";
import {
	requestInvitePasswordReset,
	requestMemberPasswordReset,
} from "@/server/services/password-recovery";
import { resolveOperatorSession } from "@/server/services/operator-auth";
import {
	isPlatformAdmin,
	listUserTenants,
	resolveTenantSession,
} from "@/server/services/tenants";
import { SVU_TENANT_ID } from "@/server/tenant-context";

const run = randomUUID();
const club = {
	id: randomUUID(),
	slug: `onboard-${run}`,
	name: "Synthetischer neuer Verein",
};
const other = {
	id: randomUUID(),
	slug: `second-${run}`,
	name: "Synthetischer anderer Verein",
};
const operator = {
	id: randomUUID(),
	name: "Synthetischer Betreiber",
	email: `operator-onboard-${run}@example.invalid`,
	role: "admin",
};
const password = "synthetic-existing-onboarding-password";
const newPassword = "synthetic-recovered-onboarding-password";
const host = `${club.slug}.rendant.app`;
const headers = () => new Headers({ host });

async function invite(email = `new-${randomUUID()}@example.invalid`) {
	return inviteOperatorMember(
		{ tenantId: club.id, email, role: "admin" },
		operator,
	);
}
async function identity() {
	const email = `existing-${randomUUID()}@example.invalid`;
	const created = await ensureCredentialUser({
		email,
		name: "Synthetisches bestehendes Konto",
		password,
		role: "user",
	});
	return { id: created.id, email, name: "Synthetisches bestehendes Konto" };
}
async function login(email: string, pass = password) {
	const response = await auth.handler(
		new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password: pass }),
		}),
	);
	const cookie = response.headers
		.getSetCookie()
		.map((part) => part.split(";")[0])
		.join("; ");
	return { status: response.status, cookie };
}
async function resetTokenFromLastMessage() {
	const url = new URL(mail.messages.at(-1)!.resetUrl);
	const token = url.searchParams.get("resetToken");
	if (!token) throw new Error("Synthetic reset message missing token");
	return token;
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error("Onboarding security requires an isolated test database");
	const database = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (database.rows[0]?.name !== "rendant_test")
		throw new Error(
			"Onboarding security refuses a database other than rendant_test",
		);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_ADMIN_HOST", "admin.rendant.app");
	vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", "");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv(
		"AUTH_TRUSTED_ORIGINS",
		`https://${host},https://${other.slug}.rendant.app`,
	);
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", operator.email);
	await globalDb.insert(tenants).values([club, other]);
	await globalDb.insert(user).values({ ...operator, emailVerified: true });
	await globalDb
		.insert(memberships)
		.values({ tenant_id: SVU_TENANT_ID, user_id: operator.id, role: "admin" });
});
afterAll(async () => {
	vi.unstubAllEnvs();
	await pool.end();
});

describe("first club admin onboarding security", () => {
	it("grants the first invited admin only this club and preserves last-admin/operator boundaries", async () => {
		const pending = await invite();
		const accepted = await acceptInvite({
			token: pending.token,
			name: "Erster synthetischer Admin",
			password,
			headers: headers(),
			audit: {},
		});
		expect(
			(
				await globalDb
					.select({ role: user.role })
					.from(user)
					.where(eq(user.id, accepted.userId))
			)[0].role,
		).toBe("user");
		expect(
			(await listUserTenants(accepted.userId)).map((row) => ({
				id: row.id,
				role: row.role,
			})),
		).toEqual([{ id: club.id, role: "admin" }]);
		expect(await isPlatformAdmin(accepted.userId)).toBe(false);
		const signed = await login(accepted.email);
		expect(signed.status).toBe(200);
		expect(
			(await resolveTenantSession(new Headers({ host, cookie: signed.cookie })))
				?.tenant,
		).toMatchObject({ id: club.id, role: "admin" });
		await expect(
			resolveTenantSession(
				new Headers({
					host: "rendant.sv-untereuerheim.de",
					cookie: signed.cookie,
				}),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			resolveTenantSession(
				new Headers({
					host,
					cookie: signed.cookie,
					"x-rendant-tenant": SVU_TENANT_ID,
				}),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			resolveOperatorSession(
				new Headers({ host: "admin.rendant.app", cookie: signed.cookie }),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			setOperatorMemberRole(
				{ tenantId: club.id, id: accepted.userId, role: "user" },
				operator,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			acceptInvite({
				token: pending.token,
				name: "Wiederverwendung",
				password,
				headers: headers(),
				audit: {},
			}),
		).rejects.toThrow("ungültig oder abgelaufen");
	});

	it("requires the matching authenticated identity without changing its password on invite acceptance", async () => {
		const existing = await identity();
		const pending = await invite(existing.email);
		await expect(
			acceptInvite({
				token: pending.token,
				password: newPassword,
				headers: headers(),
				audit: {},
			}),
		).rejects.toBeInstanceOf(InviteAlreadyRegisteredError);
		await expect(
			acceptInvite({
				token: pending.token,
				authenticatedUser: { ...existing, email: "wrong@example.invalid" },
				headers: headers(),
				audit: {},
			}),
		).rejects.toBeInstanceOf(InviteAlreadyRegisteredError);
		expect((await login(existing.email)).status).toBe(200);
		await acceptInvite({
			token: pending.token,
			authenticatedUser: existing,
			headers: headers(),
			audit: {},
		});
		expect((await login(existing.email)).status).toBe(200);
	});

	it("refuses expired, revoked and wrong-host invitation capabilities", async () => {
		const expired = await invite();
		await globalDb
			.update(invitations)
			.set({ expires_at: new Date("2000-01-01") })
			.where(
				and(eq(invitations.tenant_id, club.id), eq(invitations.id, expired.id)),
			);
		expect(await getValidInvite(expired.token, headers())).toBeNull();
		const revoked = await invite();
		await revokeOperatorInvite({ tenantId: club.id, id: revoked.id }, operator);
		await expect(
			acceptInvite({
				token: revoked.token,
				name: "Widerrufen",
				password,
				headers: headers(),
				audit: {},
			}),
		).rejects.toThrow("ungültig oder abgelaufen");
		const valid = await invite();
		await expect(
			acceptInvite({
				token: valid.token,
				name: "Falscher Verein",
				password,
				headers: new Headers({ host: `${other.slug}.rendant.app` }),
				audit: {},
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("club-scoped native password recovery", () => {
	it("recovers an existing invited identity on the invited club host, revokes sessions and consumes the native token once", async () => {
		const existing = await identity();
		const pending = await invite(existing.email);
		const signed = await login(existing.email);
		const count = mail.messages.length;
		expect(await requestInvitePasswordReset(pending.token, headers())).toEqual({
			ok: true,
		});
		expect(mail.messages.length).toBe(count + 1);
		const message = mail.messages.at(-1)!;
		expect(message.tenantId).toBe(club.id);
		expect(new URL(message.resetUrl).origin).toBe(`https://${host}`);
		expect(new URL(message.resetUrl).pathname.startsWith("/invite/")).toBe(
			true,
		);
		expect(message.verein).toBe(club.name);
		expect(await listUserTenants(existing.id)).toEqual([]);
		const token = await resetTokenFromLastMessage();
		await auth.api.resetPassword({ body: { token, newPassword } });
		expect(
			await auth.api.getSession({
				headers: new Headers({ cookie: signed.cookie }),
				query: { disableCookieCache: true },
			}),
		).toBeNull();
		expect((await login(existing.email)).status).toBe(401);
		expect((await login(existing.email, newPassword)).status).toBe(200);
		await expect(
			auth.api.resetPassword({ body: { token, newPassword: password } }),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
		await acceptInvite({
			token: pending.token,
			authenticatedUser: existing,
			headers: headers(),
			audit: {},
		});
		expect((await listUserTenants(existing.id)).map((row) => row.id)).toEqual([
			club.id,
		]);
	});

	it("allows active member recovery while returning the same result for unknown, foreign and banned identities", async () => {
		const existing = await identity();
		await globalDb
			.insert(memberships)
			.values({ tenant_id: club.id, user_id: existing.id, role: "admin" });
		const before = mail.messages.length;
		for (const [email, selected] of [
			["unknown@example.invalid", headers()],
			[existing.email, new Headers({ host: `${other.slug}.rendant.app` })],
			[existing.email, new Headers({ host: "admin.rendant.app" })],
		] as const)
			expect(await requestMemberPasswordReset(email, selected)).toEqual({
				ok: true,
			});
		expect(mail.messages.length).toBe(before);
		await globalDb
			.update(user)
			.set({ banned: true })
			.where(eq(user.id, existing.id));
		expect(await requestMemberPasswordReset(existing.email, headers())).toEqual(
			{ ok: true },
		);
		await globalDb
			.update(user)
			.set({ banned: false })
			.where(eq(user.id, existing.id));
		await globalDb
			.update(memberships)
			.set({ banned: true })
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, existing.id),
				),
			);
		expect(await requestMemberPasswordReset(existing.email, headers())).toEqual(
			{ ok: true },
		);
		expect(mail.messages.length).toBe(before);
		await globalDb
			.update(memberships)
			.set({ banned: false })
			.where(
				and(
					eq(memberships.tenant_id, club.id),
					eq(memberships.user_id, existing.id),
				),
			);
		await Promise.all([
			requestMemberPasswordReset(existing.email, headers()),
			requestMemberPasswordReset(existing.email, headers()),
		]);
		expect(mail.messages.length).toBe(before + 1);
		expect(new URL(mail.messages.at(-1)!.resetUrl).pathname).toBe("/login");
		await auth.api.requestPasswordReset({ body: { email: existing.email } });
		expect(mail.messages.length).toBe(before + 1);
	});

	it("does not send for new-account, expired, revoked or wrong-club invitations and expires native reset tokens", async () => {
		const before = mail.messages.length;
		const fresh = await invite();
		expect(await requestInvitePasswordReset(fresh.token, headers())).toEqual({
			ok: true,
		});
		const existing = await identity();
		const pending = await invite(existing.email);
		expect(
			await requestInvitePasswordReset(
				pending.token,
				new Headers({ host: `${other.slug}.rendant.app` }),
			),
		).toEqual({ ok: true });
		await revokeOperatorInvite({ tenantId: club.id, id: pending.id }, operator);
		expect(await requestInvitePasswordReset(pending.token, headers())).toEqual({
			ok: true,
		});
		expect(await requestInvitePasswordReset("nonexistent", headers())).toEqual({
			ok: true,
		});
		expect(mail.messages.length).toBe(before);
		const valid = await invite(existing.email);
		await requestInvitePasswordReset(valid.token, headers());
		const token = await resetTokenFromLastMessage();
		await globalDb
			.update(verification)
			.set({ expiresAt: new Date("2000-01-01") })
			.where(eq(verification.identifier, `reset-password:${token}`));
		await expect(
			auth.api.resetPassword({ body: { token, newPassword } }),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
		expect((await login(existing.email)).status).toBe(200);
	});
});

describe("native sign-in rate limits on the documented Railway IP boundary", () => {
	it("isolates concurrent real sign-ins by X-Real-IP while ignoring client-supplied forwarded chains", async () => {
		const first = await identity();
		const second = await identity();
		const context = await auth.$context;
		const wasEnabled = context.rateLimit.enabled;
		const firstIp = "198.51.100.170";
		const secondIp = "198.51.100.171";
		const signIn = async (email: string, ip: string, attempt: number) => (await auth.handler(new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip, "x-forwarded-for": `203.0.113.${attempt + 1}, 192.0.2.${attempt + 1}` }, body: JSON.stringify({ email, password }) }))).status;
		try {
			context.rateLimit.enabled = true;
			const outcomes = await Promise.all(Array.from({ length: 3 }, (_, attempt) => [signIn(first.email, firstIp, attempt), signIn(second.email, secondIp, attempt)]).flat());
			expect(outcomes).toEqual(Array(6).fill(200));
			expect(await signIn(first.email, firstIp, 7)).toBe(429);
			expect(await signIn(second.email, secondIp, 8)).toBe(429);
			expect(await signIn(first.email, "198.51.100.172", 9)).toBe(200);
		} finally {
			context.rateLimit.enabled = wasEnabled;
		}
	});
});
