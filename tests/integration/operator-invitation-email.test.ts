import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const smtp = vi.hoisted(() => ({
	createTransport: vi.fn(),
	sendMail: vi.fn(),
}));
vi.mock("nodemailer", () => ({
	default: { createTransport: smtp.createTransport },
}));

import { OperatorInviteSchema } from "@/lib/schemas";
import * as v from "valibot";
import { db, globalDb, pool } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { appSettings, auditEvents, invitations } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import {
	inviteOperatorMember,
	listOperatorInvites,
} from "@/server/services/operators";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const run = randomUUID();
const club = {
	id: randomUUID(),
	slug: `mail-a-${run}`,
	name: "Synthetischer Zielverein",
};
const other = {
	id: randomUUID(),
	slug: `mail-b-${run}`,
	name: "Synthetischer Fremdverein",
};
const actor = {
	id: randomUUID(),
	email: `operator-mail-${run}@example.invalid`,
	name: "Synthetischer Betreiber",
	role: "admin",
};
const freshEmail = () => `invited-${randomUUID()}@example.invalid`;

async function configure(patch: Partial<typeof appSettings.$inferInsert>) {
	await withTenant(club, () =>
		db.update(appSettings).set(patch).where(eq(appSettings.id, 1)),
	);
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error("Invitation email tests require an isolated database");
	const database = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (database.rows[0]?.name !== "rendant_test")
		throw new Error(
			"Invitation email tests refuse a database other than rendant_test",
		);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", "");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv(
		"AUTH_TRUSTED_ORIGINS",
		`https://${club.slug}.rendant.app,https://${other.slug}.rendant.app`,
	);
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", actor.email);
	await globalDb.insert(user).values({ ...actor, emailVerified: true });
	await globalDb.insert(tenants).values([club, other]);
	await globalDb
		.insert(memberships)
		.values({ tenant_id: SVU_TENANT_ID, user_id: actor.id, role: "admin" });
	for (const tenant of [club, other])
		await withTenant(tenant, () =>
			db
				.insert(appSettings)
				.values({
					id: 1,
					vereinsname: tenant.name,
					smtp_enabled: true,
					smtp_host: `smtp-${tenant.id}.example.invalid`,
					smtp_port: 465,
					smtp_security: "ssl",
					smtp_user: `sender-${tenant.slug}@example.invalid`,
					smtp_from: `sender-${tenant.slug}@example.invalid`,
				}),
		);
});
beforeEach(async () => {
	vi.clearAllMocks();
	smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
	smtp.sendMail.mockResolvedValue({ accepted: ["synthetic"] });
	await configure({
		smtp_enabled: true,
		smtp_host: `smtp-${club.id}.example.invalid`,
		smtp_security: "ssl",
	});
});
afterAll(async () => {
	vi.unstubAllEnvs();
	await pool.end();
});

describe("explicit operator invitation delivery with captured SMTP", () => {
	it("defaults to link only and duplicate creation never implicitly sends an existing invitation", async () => {
		const email = freshEmail();
		expect(
			v.parse(OperatorInviteSchema, { tenantId: club.id, email, role: "admin" })
				.sendEmail,
		).toBe(false);
		const created = await inviteOperatorMember(
			{ tenantId: club.id, email, role: "admin" },
			actor,
		);
		expect(created.sendEmail).toBe(false);
		expect(created.email_status).toBe("skipped");
		const [audit] = await withTenant(club, () =>
			db
				.select({ metadata: auditEvents.metadata })
				.from(auditEvents)
				.where(
					and(
						eq(auditEvents.action, "users.invite_created"),
						eq(auditEvents.subject_id, created.id),
					),
				),
		);
		expect(audit.metadata).toMatchObject({
			operator: true,
			emailRequested: false,
		});
		expect(new URL(created.inviteUrl).host).toBe(`${club.slug}.rendant.app`);
		await expect(
			inviteOperatorMember(
				{ tenantId: club.id, email, role: "admin", sendEmail: true },
				actor,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(smtp.createTransport).not.toHaveBeenCalled();
	});

	it("sends only through the destination tenant after committing the invitation, without granting membership or returning secrets", async () => {
		const email = freshEmail();
		let committed = false;
		smtp.sendMail.mockImplementation(async () => {
			const rows = await globalDb
				.select({ id: invitations.id })
				.from(invitations)
				.where(
					and(eq(invitations.tenant_id, club.id), eq(invitations.email, email)),
				);
			committed = rows.length === 1;
			return { accepted: [email] };
		});
		const created = await inviteOperatorMember(
			{ tenantId: club.id, email, role: "admin", sendEmail: true },
			actor,
		);
		expect(committed).toBe(true);
		expect(created.email_status).toBe("sent");
		expect(created.sendEmail).toBe(true);
		const [audit] = await withTenant(club, () =>
			db
				.select({ metadata: auditEvents.metadata })
				.from(auditEvents)
				.where(
					and(
						eq(auditEvents.action, "users.invite_created"),
						eq(auditEvents.subject_id, created.id),
					),
				),
		);
		expect(audit.metadata).toMatchObject({
			operator: true,
			emailRequested: true,
		});
		expect("email_status" in audit.metadata).toBe(false);
		expect(smtp.createTransport.mock.calls[0][0].host).toBe(
			`smtp-${club.id}.example.invalid`,
		);
		const sent = smtp.sendMail.mock.calls[0][0];
		expect(sent.to).toBe(email);
		expect(sent.from).toBe(`sender-${club.slug}@example.invalid`);
		expect(sent.text.includes(club.name)).toBe(true);
		expect(sent.text.includes(other.name)).toBe(false);
		expect(sent.text.includes(created.inviteUrl)).toBe(true);
		expect(Object.keys(created).sort()).toEqual(
			[
				"accepted_at",
				"created_at",
				"email",
				"email_status",
				"expires_at",
				"id",
				"inviteUrl",
				"invited_by",
				"role",
				"sendEmail",
				"tenant_id",
				"token",
			].sort(),
		);
		expect(
			await globalDb
				.select({ id: memberships.user_id })
				.from(memberships)
				.where(eq(memberships.tenant_id, club.id)),
		).toEqual([]);
		const listed = await listOperatorInvites(club.id, actor);
		expect(listed.some((row) => "token" in row || "email_status" in row)).toBe(
			false,
		);
	});

	it("skips missing, disabled or unencrypted destination SMTP without falling back to another tenant", async () => {
		for (const patch of [
			{ smtp_enabled: false },
			{ smtp_enabled: true, smtp_host: "" },
			{ smtp_host: `smtp-${club.id}.example.invalid`, smtp_security: "none" },
		]) {
			await configure(patch);
			const created = await inviteOperatorMember(
				{
					tenantId: club.id,
					email: freshEmail(),
					role: "admin",
					sendEmail: true,
				},
				actor,
			);
			expect(created.email_status).toBe("skipped");
			expect(Boolean(created.inviteUrl)).toBe(true);
		}
		expect(smtp.createTransport).not.toHaveBeenCalled();
	});

	it("keeps the committed invitation and copy link on an unconfirmed SMTP attempt without resending on retry", async () => {
		const email = freshEmail();
		smtp.sendMail.mockRejectedValue(
			new Error("synthetic ambiguous SMTP outcome"),
		);
		const created = await inviteOperatorMember(
			{ tenantId: club.id, email, role: "admin", sendEmail: true },
			actor,
		);
		expect(created.email_status).toBe("failed");
		expect(Boolean(created.inviteUrl)).toBe(true);
		await expect(
			inviteOperatorMember(
				{ tenantId: club.id, email, role: "admin", sendEmail: true },
				actor,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(smtp.sendMail).toHaveBeenCalledTimes(1);
		expect(
			(
				await globalDb
					.select({ id: invitations.id })
					.from(invitations)
					.where(
						and(
							eq(invitations.tenant_id, club.id),
							eq(invitations.email, email),
						),
					)
			).length,
		).toBe(1);
	});

	it("allows only one concurrent creator and one SMTP attempt for a normalized recipient", async () => {
		const email = freshEmail();
		const results = await Promise.allSettled([
			inviteOperatorMember(
				{ tenantId: club.id, email, role: "admin", sendEmail: true },
				actor,
			),
			inviteOperatorMember(
				{
					tenantId: club.id,
					email: email.toUpperCase(),
					role: "admin",
					sendEmail: true,
				},
				actor,
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled").length,
		).toBe(1);
		expect(smtp.sendMail).toHaveBeenCalledTimes(1);
	});

	it("does not send or create an invitation after operator authority is revoked", async () => {
		const email = freshEmail();
		await globalDb
			.update(memberships)
			.set({ banned: true })
			.where(
				and(
					eq(memberships.tenant_id, SVU_TENANT_ID),
					eq(memberships.user_id, actor.id),
				),
			);
		try {
			await expect(
				inviteOperatorMember(
					{ tenantId: club.id, email, role: "admin", sendEmail: true },
					actor,
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(smtp.sendMail).not.toHaveBeenCalled();
			expect(
				(
					await globalDb
						.select({ id: invitations.id })
						.from(invitations)
						.where(
							and(
								eq(invitations.tenant_id, club.id),
								eq(invitations.email, email),
							),
						)
				).length,
			).toBe(0);
		} finally {
			await globalDb
				.update(memberships)
				.set({ banned: false })
				.where(
					and(
						eq(memberships.tenant_id, SVU_TENANT_ID),
						eq(memberships.user_id, actor.id),
					),
				);
		}
	});
});
