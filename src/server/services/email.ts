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

	const rows = await db
		.update(appSettings)
		.set(set)
		.where(eq(appSettings.id, 1))
		.returning();
	if (rows.length === 0) {
		throw new Error("Einstellungen konnten nicht aktualisiert werden");
	}
	return rowToSettings(rows[0]);
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

// Sends the FYI mail for a newly counted protokoll. No-op when notifications are
// disabled or no recipients are configured. Never throws.
export async function sendProtokollNotification(
	proto: ProtokollNotification,
): Promise<void> {
	try {
		const row = await loadRow();
		if (!row) return;
		if (!row.smtp_enabled || !row.notify_new_protokoll) return;
		const { valid: recipients } = parseRecipients(row.notify_recipients);
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

		const lines = [
			`Es wurde ein neues Kassenzählprotokoll erfasst.`,
			``,
			`Belegnummer: ${proto.belegnummer}`,
			`Kasse: ${proto.kassenbezeichnung}`,
			`Anlass: ${proto.anlass}`,
			`Datum: ${datum}`,
			`Gezählt von: ${proto.gezaehlt_von}`,
		];
		if (link) {
			lines.push(``, `Protokoll öffnen: ${link}`);
		}
		lines.push(``, `Diese Nachricht dient nur zur Information.`, `${verein}`);
		const text = lines.join("\n");

		const transport = buildTransport(transportInfo.cfg);
		await transport.sendMail({
			from: transportInfo.from,
			to: recipients.join(", "),
			subject: `Neues Kassenzählprotokoll ${proto.belegnummer}`,
			text,
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
	});
}
