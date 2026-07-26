// E-Mail notifications. SMTP transport and recipients are configured in-app
// (Einstellungen > Benachrichtigungen) and stored on the app_settings singleton.
// The password is held encrypted at rest (see secret-box). Sending is best
// effort: a failure is logged and never breaks the action that triggered it.

import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import * as v from "valibot";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { logger } from "@/server/logger";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import {
	callout,
	ctaBlock,
	detailsTable,
	emailShell,
	escapeHtml,
	paragraph,
} from "@/server/services/email-template";
import { listOptedInUserEmails } from "@/server/services/notification-prefs";
import { decryptSecret, encryptSecret } from "@/server/services/secret-box";
import { getVereinsname } from "@/server/services/settings";

export type EmailSecurity = "starttls" | "ssl" | "none";

// Shape returned to the client. The password is never sent back; has_password
// tells the form whether one is already stored.
export type EmailSettings = {
	enabled: boolean;
	host: string;
	port: number;
	security: EmailSecurity;
	user: string;
	from: string;
	has_password: boolean;
	notify_new_protokoll: boolean;
	recipients: string;
};

export type EmailSettingsPatch = {
	enabled: boolean;
	host: string;
	port: number;
	security: EmailSecurity;
	user: string;
	from: string;
	notify_new_protokoll: boolean;
	recipients: string;
	// Write-only. Empty string leaves the stored password untouched.
	password?: string;
	// Explicitly removes the stored password.
	clear_password?: boolean;
};

type SettingsRow = typeof appSettings.$inferSelect;

const EmailItemSchema = v.pipe(v.string(), v.email());

function normalizeSecurity(value: unknown): EmailSecurity {
	return value === "ssl" || value === "none"
		? value
		: ("starttls" as EmailSecurity);
}

// Splits a free-form recipients string (commas, semicolons or whitespace) into
// validated, de-duplicated addresses. Duplicates are compared case-insensitively
// but the first-seen spelling is kept.
export function parseRecipients(raw: string): {
	valid: string[];
	invalid: string[];
} {
	const tokens = raw
		.split(/[\s,;]+/)
		.map((t) => t.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const valid: string[] = [];
	const invalid: string[] = [];
	for (const token of tokens) {
		const key = token.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		if (v.safeParse(EmailItemSchema, token).success) valid.push(token);
		else invalid.push(token);
	}
	return { valid, invalid };
}

// Merges one or more address lists into a single de-duplicated list. Comparison
// is case-insensitive; the first-seen spelling wins. Empty tokens are dropped.
export function mergeRecipients(...lists: string[][]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const list of lists) {
		for (const raw of list) {
			const addr = raw.trim();
			if (!addr) continue;
			const key = addr.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(addr);
		}
	}
	return out;
}

async function loadRow(): Promise<SettingsRow | undefined> {
	const rows = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, 1))
		.limit(1);
	return rows[0];
}

function rowToSettings(row: SettingsRow): EmailSettings {
	return {
		enabled: row.smtp_enabled,
		host: row.smtp_host,
		port: Number(row.smtp_port),
		security: normalizeSecurity(row.smtp_security),
		user: row.smtp_user,
		from: row.smtp_from,
		has_password: row.smtp_password_enc.length > 0,
		notify_new_protokoll: row.notify_new_protokoll,
		recipients: row.notify_recipients,
	};
}

const DEFAULT_SETTINGS: EmailSettings = {
	enabled: false,
	host: "",
	port: 587,
	security: "starttls",
	user: "",
	from: "",
	has_password: false,
	notify_new_protokoll: true,
	recipients: "",
};

export async function getEmailSettings(): Promise<EmailSettings> {
	const row = await loadRow();
	return row ? rowToSettings(row) : DEFAULT_SETTINGS;
}

export async function updateEmailSettings(
	patch: EmailSettingsPatch,
	audit: RecordAuditInput,
): Promise<EmailSettings> {
	const { valid, invalid } = parseRecipients(patch.recipients);
	if (invalid.length > 0) {
		throw new Error(`Ungültige E-Mail-Adresse: ${invalid.join(", ")}`);
	}

	const set: Partial<SettingsRow> = {
		smtp_enabled: patch.enabled,
		smtp_host: patch.host.trim(),
		smtp_port: patch.port,
		smtp_security: patch.security,
		smtp_user: patch.user.trim(),
		smtp_from: patch.from.trim(),
		notify_new_protokoll: patch.notify_new_protokoll,
		notify_recipients: valid.join(", "),
		updated_at: new Date(),
	};

	if (patch.clear_password) {
		set.smtp_password_enc = "";
	} else if (patch.password && patch.password.length > 0) {
		set.smtp_password_enc = encryptSecret(patch.password);
	}

	return db.transaction(async (tx) => {
		const rows = await tx
			.update(appSettings)
			.set(set)
			.where(eq(appSettings.id, 1))
			.returning();
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await recordAuditEventStrict(tx, audit);
		return rowToSettings(rows[0]);
	});
}

type TransportConfig = {
	host: string;
	port: number;
	security: EmailSecurity;
	user: string;
	password: string;
};

function buildTransport(cfg: TransportConfig) {
	const transport = nodemailer.createTransport({
		host: cfg.host,
		port: cfg.port,
		// Implicit TLS for port 465 (ssl), STARTTLS upgrade otherwise.
		secure: cfg.security === "ssl",
		...(cfg.security === "starttls" ? { requireTLS: true } : {}),
		...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password } } : {}),
	});
	return transport;
}

async function loadTransportConfig(): Promise<{
	cfg: TransportConfig;
	from: string;
} | null> {
	const row = await loadRow();
	if (!row) return null;
	const host = row.smtp_host.trim();
	if (!host) return null;
	const from = row.smtp_from.trim() || row.smtp_user.trim();
	if (!from) return null;
	return {
		cfg: {
			host,
			port: Number(row.smtp_port),
			security: normalizeSecurity(row.smtp_security),
			user: row.smtp_user.trim(),
			password: decryptSecret(row.smtp_password_enc),
		},
		from,
	};
}

function formatGermanDate(isoDate: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!m) return isoDate;
	return `${m[3]}.${m[2]}.${m[1]}`;
}

export type ProtokollNotification = {
	id: string;
	belegnummer: string;
	anlass: string;
	anlass_datum: string;
	kassenbezeichnung: string;
	gezaehlt_von: string;
};

export type InvitationEmailStatus = "sent" | "skipped" | "failed";

export type InvitationEmail = {
	to: string;
	inviteUrl: string;
	role: string;
	invitedBy: string | null;
};

// Sends the FYI mail for a newly counted protokoll. No-op when notifications are
// disabled or no recipients are configured. Never throws.
export async function sendProtokollNotification(
	proto: ProtokollNotification,
): Promise<void> {
	try {
		const row = await loadRow();
		if (!row) return;
		if (!row.smtp_enabled || !row.notify_new_protokoll) return;
		// Recipients are opted-in user accounts plus the free-form extra list.
		const { valid: extra } = parseRecipients(row.notify_recipients);
		const optedIn = await listOptedInUserEmails();
		const recipients = mergeRecipients(optedIn, extra);
		if (recipients.length === 0) return;

		const transportInfo = await loadTransportConfig();
		if (!transportInfo) {
			logger.warn("E-Mail-Benachrichtigung übersprungen: SMTP unvollständig", {
				belegnummer: proto.belegnummer,
			});
			return;
		}

		const verein = await getVereinsname();
		const datum = formatGermanDate(proto.anlass_datum);
		const base = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
		const link = base ? `${base}/protokolle/${proto.id}` : null;

		const rows: Array<[string, string]> = [
			["Belegnummer", proto.belegnummer],
			["Kasse", proto.kassenbezeichnung],
			["Veranstaltung", proto.anlass],
			["Datum", datum],
			["Gezählt von", proto.gezaehlt_von],
		];

		const blocks = [
			paragraph(
				"es wurde ein neues Kassenzählprotokoll erfasst. Die Eckdaten stehen unten. Die Beträge selbst sind bewusst nicht Teil dieser E-Mail.",
			),
			detailsTable(rows),
			callout(
				"Warum ohne Beträge?",
				"Diese Nachricht informiert nur darüber, <strong>dass</strong> gezählt wurde. Kassenbestand, Ausgaben und Tageseinnahmen sind vertraulich und nur im geschützten Protokoll sichtbar.",
			),
		];
		if (link) {
			blocks.push(
				ctaBlock(
					link,
					"Protokoll öffnen",
					"Der Button führt zur Anmeldung. Erst nach dem Login siehst du das vollständige Protokoll mit allen Beträgen.",
				),
			);
		}

		const html = emailShell({
			preheader: `Neues Protokoll ${proto.belegnummer}. Zum Ansehen bitte anmelden.`,
			eyebrow: "Benachrichtigung",
			heading: "Neues Kassenzählprotokoll",
			blocks,
			verein,
		});

		const text = [
			"Es wurde ein neues Kassenzählprotokoll erfasst.",
			"",
			`Belegnummer: ${proto.belegnummer}`,
			`Kasse: ${proto.kassenbezeichnung}`,
			`Veranstaltung: ${proto.anlass}`,
			`Datum: ${datum}`,
			`Gezählt von: ${proto.gezaehlt_von}`,
			"",
			"Warum ohne Beträge? Diese Nachricht informiert nur darüber, dass gezählt wurde. Kassenbestand, Ausgaben und Tageseinnahmen sind vertraulich und nur im geschützten Protokoll sichtbar.",
			...(link
				? [
						"",
						`Protokoll öffnen (Anmeldung erforderlich): ${link}`,
						"Erst nach dem Login siehst du das vollständige Protokoll mit allen Beträgen.",
					]
				: []),
			"",
			"Diese Nachricht dient nur zur Information.",
			verein,
		].join("\n");

		const transport = buildTransport(transportInfo.cfg);
		await transport.sendMail({
			from: transportInfo.from,
			to: recipients.join(", "),
			subject: `Neues Kassenzählprotokoll ${proto.belegnummer}`,
			text,
			html,
		});
		logger.info("E-Mail-Benachrichtigung gesendet", {
			belegnummer: proto.belegnummer,
			recipients: recipients.length,
		});
	} catch (err) {
		logger.error("E-Mail-Benachrichtigung fehlgeschlagen", {
			belegnummer: proto.belegnummer,
			err,
		});
	}
}

// Sends an account invitation to the invited address. Never throws: the invite
// link remains available in the admin UI when SMTP is disabled or delivery fails.
export async function sendInvitationEmail(
	invite: InvitationEmail,
): Promise<InvitationEmailStatus> {
	try {
		const recipient = invite.to.trim();
		if (!v.safeParse(EmailItemSchema, recipient).success) return "skipped";

		const row = await loadRow();
		if (!row?.smtp_enabled) return "skipped";

		const transportInfo = await loadTransportConfig();
		if (!transportInfo) {
			logger.warn("Einladungs-E-Mail übersprungen: SMTP unvollständig", {
				to: recipient,
			});
			return "skipped";
		}

		const verein = await getVereinsname();
		const role = invite.role === "admin" ? "Administrator" : "Benutzer";

		const rows: Array<[string, string]> = [["Rolle", role]];
		if (invite.invitedBy) rows.push(["Eingeladen von", invite.invitedBy]);

		const html = emailShell({
			preheader: `Einladung zu SVUFO für ${verein}. Konto in wenigen Schritten anlegen.`,
			eyebrow: "Einladung",
			heading: "Willkommen bei SVUFO",
			blocks: [
				paragraph(
					`du wurdest eingeladen, SVUFO für <strong>${escapeHtml(verein)}</strong> zu nutzen. Lege dazu in wenigen Schritten dein Konto an.`,
				),
				detailsTable(rows),
				ctaBlock(
					invite.inviteUrl,
					"Konto anlegen",
					"Der Link ist 7 Tage gültig und kann nur einmal verwendet werden.",
				),
			],
			verein,
		});

		const text = [
			`Du wurdest zu SVUFO für ${verein} eingeladen.`,
			``,
			`Rolle: ${role}`,
			...(invite.invitedBy ? [`Eingeladen von: ${invite.invitedBy}`] : []),
			``,
			`Konto anlegen: ${invite.inviteUrl}`,
			``,
			`Der Link ist 7 Tage gültig und kann nur einmal verwendet werden.`,
		].join("\n");

		const transport = buildTransport(transportInfo.cfg);
		await transport.sendMail({
			from: transportInfo.from,
			to: recipient,
			subject: `Einladung zu SVUFO`,
			text,
			html,
		});
		logger.info("Einladungs-E-Mail gesendet", { to: recipient });
		return "sent";
	} catch (err) {
		logger.error("Einladungs-E-Mail fehlgeschlagen", {
			to: invite.to,
			err,
		});
		return "failed";
	}
}

// Sends a one-off test mail to verify the SMTP configuration from the admin UI.
// Uses the currently stored settings. Throws on failure so the UI can show why.
export async function sendTestEmail(to: string): Promise<void> {
	const recipient = to.trim();
	if (!v.safeParse(EmailItemSchema, recipient).success) {
		throw new Error("Ungültige Empfängeradresse");
	}
	const transportInfo = await loadTransportConfig();
	if (!transportInfo) {
		throw new Error(
			"SMTP ist nicht vollständig konfiguriert (Host und Absender erforderlich)",
		);
	}
	const verein = await getVereinsname();
	const html = emailShell({
		preheader: "Test-E-Mail von SVUFO. Die SMTP-Konfiguration funktioniert.",
		eyebrow: "SMTP-Test",
		heading: "Test-E-Mail",
		blocks: [
			paragraph(
				"dies ist eine Test-E-Mail von SVUFO. Wenn du sie erhältst, ist die SMTP-Konfiguration korrekt und Benachrichtigungen können versendet werden.",
			),
			callout(
				"Alles bereit",
				"Neue Protokolle und Einladungen werden ab jetzt zuverlässig per E-Mail zugestellt.",
			),
		],
		verein,
	});
	const transport = buildTransport(transportInfo.cfg);
	await transport.sendMail({
		from: transportInfo.from,
		to: recipient,
		subject: `SVUFO Test-E-Mail`,
		text: [
			`Dies ist eine Test-E-Mail von ${verein}.`,
			``,
			`Wenn du diese Nachricht erhältst, ist die SMTP-Konfiguration korrekt.`,
		].join("\n"),
		html,
	});
}
