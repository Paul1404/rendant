export const AUDIT_CATEGORIES = [
	"auth",
	"users",
	"protokolle",
	"umsaetze",
	"exports",
	"settings",
	"kassen",
	"anlass",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditEventRow = {
	id: number;
	event_at: Date;
	category: string;
	action: string;
	success: boolean;
	actor_user_id: string | null;
	actor_email: string | null;
	actor_name: string | null;
	actor_role: string | null;
	subject_type: string | null;
	subject_id: string | null;
	subject_label: string | null;
	request_id: string;
	ip_address: string | null;
	user_agent: string | null;
	metadata: Record<string, unknown>;
};

export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
	auth: "Anmeldung",
	users: "Benutzer",
	protokolle: "Protokolle",
	umsaetze: "Umsätze",
	exports: "Exporte",
	settings: "Einstellungen",
	kassen: "Kassen",
	anlass: "Umsatzgruppen",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
	"auth.login_succeeded": "Angemeldet",
	"auth.login_failed": "Anmeldung fehlgeschlagen",
	"auth.login_rate_limited": "Anmeldung blockiert",
	"auth.logout": "Abgemeldet",
	"users.invite_created": "Einladung erstellt",
	"users.invite_revoked": "Einladung widerrufen",
	"users.invite_accepted": "Konto registriert",
	"users.notification_changed": "Benachrichtigung geändert",
	"users.role_changed": "Rolle geändert",
	"users.blocked": "Konto gesperrt",
	"users.unblocked": "Konto entsperrt",
	"protokolle.created": "Protokoll erstellt",
	"protokolle.cancelled": "Protokoll storniert",
	"protokolle.pdf_regenerated": "PDF neu erzeugt",
	"protokolle.pdf_viewed": "PDF angesehen",
	"protokolle.pdf_downloaded": "PDF heruntergeladen",
	"protokolle.storno_pdf_viewed": "Storno-PDF angesehen",
	"protokolle.storno_pdf_downloaded": "Storno-PDF heruntergeladen",
	"umsaetze.created": "Historischen Umsatz erfasst",
	"umsaetze.cancelled": "Historischen Umsatz storniert",
	"umsaetze.import_previewed": "Umsatzimport geprüft",
	"umsaetze.imported": "Historische Umsätze importiert",
	"exports.protokolle_csv": "Protokolle exportiert",
	"exports.umsaetze_csv": "Umsätze exportiert",
	"exports.umsaetze_xlsx": "Umsätze als Excel exportiert",
	"exports.umsaetze_import_vorlage": "Umsatz-Importvorlage exportiert",
	"exports.ust_csv": "USt. exportiert",
	"exports.backup_json": "Datensicherung exportiert",
	"settings.belegnummer_changed": "Belegnummern geändert",
	"settings.ust_basis_changed": "USt.-Grundlage geändert",
	"settings.verein_changed": "Vereinsdaten geändert",
	"settings.email_changed": "E-Mail-Einstellungen geändert",
	"settings.test_email_sent": "Test-E-Mail versendet",
	"kassen.created": "Kasse angelegt",
	"kassen.updated": "Kasse geändert",
	"kassen.deleted": "Kasse gelöscht",
	"anlass.created": "Umsatzgruppe angelegt",
	"anlass.updated": "Umsatzgruppe geändert",
	"anlass.deleted": "Umsatzgruppe gelöscht",
	"anlass.bulk_assigned": "Umsatzgruppen gesammelt zugeordnet",
};

export function auditActionLabel(action: string): string {
	return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditCategoryLabel(category: string): string {
	return AUDIT_CATEGORY_LABELS[category] ?? category;
}

const FORBIDDEN_METADATA_KEY =
	/(password|passwort|token|secret|cookie|authorization|credential|smtp_password)/i;

function sanitizeValue(value: unknown, depth: number): unknown {
	if (depth > 4) return "[gekürzt]";
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number"
	) {
		return value;
	}
	if (typeof value === "string") return value.slice(0, 500);
	if (Array.isArray(value)) {
		return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
	}
	if (typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value).slice(0, 50)) {
			result[key] = FORBIDDEN_METADATA_KEY.test(key)
				? "[REDACTED]"
				: sanitizeValue(child, depth + 1);
		}
		return result;
	}
	return String(value).slice(0, 500);
}

export function sanitizeAuditMetadata(
	metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
	return (sanitizeValue(metadata ?? {}, 0) ?? {}) as Record<string, unknown>;
}
