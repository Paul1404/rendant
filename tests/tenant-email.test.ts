import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: new Map<string, Record<string, unknown>>(),
	sendMail: vi.fn(),
	createTransport: vi.fn(),
	optedIn: vi.fn(),
}));

vi.mock("@/server/db", async () => {
	const { requireTenant } = await import("@/server/tenant-context");
	return {
		db: {
			select: () => ({
				from: () => ({
					where: () => ({
						limit: async () => {
							const row = state.rows.get(requireTenant().id);
							return row ? [row] : [];
						},
					}),
				}),
			}),
		},
		globalDb: {},
	};
});
vi.mock("@/server/services/notification-prefs", () => ({
	listOptedInUserEmails: state.optedIn,
}));
vi.mock("nodemailer", () => ({
	default: { createTransport: state.createTransport },
}));

import {
	sendInvitationEmail,
	sendPasswordResetEmail,
	sendProtokollNotification,
} from "@/server/services/email";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";
import { logger } from "@/server/logger";

const ssv = {
	id: "7f97c068-56c1-43a6-9130-92e9000092d1",
	slug: "ssv-gaedheim",
	name: "SSV Demo",
};
const svu = { id: SVU_TENANT_ID, slug: "svu", name: "SVU Demo" };
const invite = {
	to: "new-member@example.invalid",
	inviteUrl: "https://ssv-gaedheim.rendant.app/invite/synthetic-token",
	role: "admin",
	invitedBy: null,
};
const proto = {
	id: "synthetic-protocol",
	belegnummer: "DEMO-1",
	anlass: "Demo",
	anlass_datum: "2026-11-01",
	kassenbezeichnung: "Demokasse",
	gezaehlt_von: "Demo",
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("VEREINSNAME", "SVU Deployment Name");
	vi.stubEnv("BETTER_AUTH_URL", "https://svu.rendant.app");
	vi.stubEnv(
		"AUTH_TRUSTED_ORIGINS",
		"https://svu.rendant.app,https://ssv-gaedheim.rendant.app",
	);
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_CANONICAL_BASE_DOMAIN", "rendant.app");
	state.rows.clear();
	for (const club of [ssv, svu]) {
		state.rows.set(club.id, {
			vereinsname: club.name,
			smtp_enabled: true,
			smtp_host: "smtp.example.invalid",
			smtp_port: "465",
			smtp_security: "ssl",
			smtp_user: `${club.slug}@example.invalid`,
			smtp_from: `${club.slug}@example.invalid`,
			smtp_password_enc: "",
			notify_new_protokoll: true,
			notify_recipients: `${club.slug}-extra@example.invalid`,
		});
	}
	state.createTransport.mockReturnValue({ sendMail: state.sendMail });
	state.sendMail.mockResolvedValue({ accepted: [invite.to] });
	state.optedIn.mockResolvedValue(["ssv-member@example.invalid"]);
});

describe("tenant email delivery with captured transport", () => {
	it("never sends invitation capabilities over unencrypted SMTP", async () => {
		state.rows.set(ssv.id, {
			...state.rows.get(ssv.id),
			smtp_security: "none",
		});
		expect(await withTenant(ssv, () => sendInvitationEmail(invite))).toBe(
			"skipped",
		);
		expect(state.createTransport).not.toHaveBeenCalled();
	});

	it("does not log invitation capability URLs echoed by a failing transport", async () => {
		const error = vi.spyOn(logger, "error").mockImplementation(() => {});
		state.sendMail.mockRejectedValue(
			new Error(`Rejected transport payload ${invite.inviteUrl}`),
		);
		expect(await withTenant(ssv, () => sendInvitationEmail(invite))).toBe(
			"failed",
		);
		expect(error).toHaveBeenCalledWith("Einladungs-E-Mail fehlgeschlagen");
		expect(JSON.stringify(error.mock.calls)).not.toContain(invite.inviteUrl);
	});
	it("keeps concurrent invitations on their club sender and branding", async () => {
		expect(
			await Promise.all([
				withTenant(ssv, () => sendInvitationEmail(invite)),
				withTenant(svu, () =>
					sendInvitationEmail({
						...invite,
						inviteUrl: "https://svu.rendant.app/invite/other-synthetic-token",
					}),
				),
			]),
		).toEqual(["sent", "sent"]);
		const mails = state.sendMail.mock.calls.map(([mail]) => mail);
		const ssvMail = mails.find(
			(mail) => mail.from === "ssv-gaedheim@example.invalid",
		);
		expect(ssvMail.to).toBe(invite.to);
		expect(ssvMail.html).toContain("SSV Demo");
		expect(ssvMail.html).toContain(invite.inviteUrl);
		expect(ssvMail.html).not.toContain("SVU");
		expect(ssvMail.cc).toBeUndefined();
		expect(ssvMail.bcc).toBeUndefined();
		expect(
			mails.find((mail) => mail.from === "svu@example.invalid").html,
		).toContain("SVU Demo");
		expect(state.createTransport).toHaveBeenCalledWith(
			expect.objectContaining({ secure: true }),
		);
	});

	it("does not fall back to another club when settings are absent or disabled", async () => {
		state.rows.delete(ssv.id);
		expect(await withTenant(ssv, () => sendInvitationEmail(invite))).toBe(
			"skipped",
		);
		await withTenant(ssv, () => sendProtokollNotification(proto));
		state.rows.set(ssv.id, { ...state.rows.get(svu.id), smtp_enabled: false });
		expect(await withTenant(ssv, () => sendInvitationEmail(invite))).toBe(
			"skipped",
		);
		await withTenant(ssv, () => sendProtokollNotification(proto));
		expect(state.createTransport).not.toHaveBeenCalled();
		expect(state.optedIn).not.toHaveBeenCalled();
	});

	it("skips incomplete SMTP rather than using another club's transport", async () => {
		const row = state.rows.get(ssv.id);
		state.rows.set(ssv.id, { ...row, smtp_host: "" });
		expect(await withTenant(ssv, () => sendInvitationEmail(invite))).toBe(
			"skipped",
		);
		await withTenant(ssv, () => sendProtokollNotification(proto));
		expect(state.createTransport).not.toHaveBeenCalled();
	});

	it("uses a neutral club name when SSV has not configured one", async () => {
		state.rows.set(ssv.id, { ...state.rows.get(ssv.id), vereinsname: "" });
		await withTenant(ssv, () => sendInvitationEmail(invite));
		const mail = state.sendMail.mock.calls[0][0];
		expect(mail.text).toContain("für Verein eingeladen");
		expect(mail.html).not.toContain("SVU Deployment Name");
	});

	it("sends notifications only to this club's selected recipients with its own link", async () => {
		await withTenant(ssv, () => sendProtokollNotification(proto));
		const mail = state.sendMail.mock.calls[0][0];
		expect(mail.from).toBe("ssv-gaedheim@example.invalid");
		expect(mail.to).toBe(
			"ssv-member@example.invalid, ssv-gaedheim-extra@example.invalid",
		);
		expect(mail.html).toContain("SSV Demo");
		expect(mail.text).toContain(
			"https://ssv-gaedheim.rendant.app/protokolle/synthetic-protocol",
		);
		expect(mail.html).not.toContain("SVU");
		expect(mail.cc).toBeUndefined();
		expect(mail.bcc).toBeUndefined();
	});

	it("reports failed invitation delivery without switching transport or recipients", async () => {
		state.sendMail.mockRejectedValue(new Error("synthetic SMTP unavailable"));
		expect(await withTenant(ssv, () => sendInvitationEmail(invite))).toBe(
			"failed",
		);
		expect(state.sendMail).toHaveBeenCalledOnce();
		expect(state.createTransport).toHaveBeenCalledOnce();
	});

	it("sends recovery through SSV only with the verified club label and URL", async () => {
		const resetUrl =
			"https://ssv-gaedheim.rendant.app/reset-password?token=synthetic-only";
		expect(
			await withTenant(ssv, () =>
				sendPasswordResetEmail({
					to: invite.to,
					resetUrl,
					verein: "SSV Trusted Name",
				}),
			),
		).toBe("sent");
		const mail = state.sendMail.mock.calls[0][0];
		expect(mail.from).toBe("ssv-gaedheim@example.invalid");
		expect(mail.to).toBe(invite.to);
		expect(mail.html).toContain("SSV Trusted Name");
		expect(mail.text).toContain(resetUrl);
		expect(mail.html).not.toContain("SVU");
		expect(mail.cc).toBeUndefined();
		expect(mail.bcc).toBeUndefined();
	});

	it("skips recovery when the invited club SMTP is missing, disabled or incomplete", async () => {
		const input = {
			to: invite.to,
			resetUrl: invite.inviteUrl,
			verein: ssv.name,
		};
		state.rows.delete(ssv.id);
		expect(await withTenant(ssv, () => sendPasswordResetEmail(input))).toBe(
			"skipped",
		);
		state.rows.set(ssv.id, { ...state.rows.get(svu.id), smtp_enabled: false });
		expect(await withTenant(ssv, () => sendPasswordResetEmail(input))).toBe(
			"skipped",
		);
		state.rows.set(ssv.id, { ...state.rows.get(svu.id), smtp_host: "" });
		expect(await withTenant(ssv, () => sendPasswordResetEmail(input))).toBe(
			"skipped",
		);
		state.rows.set(ssv.id, {
			...state.rows.get(svu.id),
			smtp_security: "none",
		});
		expect(await withTenant(ssv, () => sendPasswordResetEmail(input))).toBe(
			"skipped",
		);
		expect(state.createTransport).not.toHaveBeenCalled();
	});
});
