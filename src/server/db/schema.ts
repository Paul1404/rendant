import { sql } from "drizzle-orm";
import {
	bigserial,
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// Money is always stored as integer cents. Conversion happens only at the
// form input and at display time.

export const protokolle = pgTable(
	"protokolle",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		belegnummer: text("belegnummer").notNull().unique(),
		erstellt_von_user_id: text("erstellt_von_user_id"),
		erstellt_von_name: text("erstellt_von_name"),
		erstellt_am: timestamp("erstellt_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
		anlass_datum: date("anlass_datum", { mode: "string" }).notNull(),
		kassennummer: text("kassennummer").notNull().default(""),
		kassenbezeichnung: text("kassenbezeichnung").notNull().default(""),
		anlass: text("anlass").notNull(),
		gezaehlt_von: text("gezaehlt_von").notNull(),
		geprueft_von: text("geprueft_von").notNull(),
		bemerkung: text("bemerkung").notNull().default(""),

		// 15 denominations, count per coin/note kind.
		anzahl_500_eur: integer("anzahl_500_eur").notNull().default(0),
		anzahl_200_eur: integer("anzahl_200_eur").notNull().default(0),
		anzahl_100_eur: integer("anzahl_100_eur").notNull().default(0),
		anzahl_50_eur: integer("anzahl_50_eur").notNull().default(0),
		anzahl_20_eur: integer("anzahl_20_eur").notNull().default(0),
		anzahl_10_eur: integer("anzahl_10_eur").notNull().default(0),
		anzahl_5_eur: integer("anzahl_5_eur").notNull().default(0),
		anzahl_2_eur: integer("anzahl_2_eur").notNull().default(0),
		anzahl_1_eur: integer("anzahl_1_eur").notNull().default(0),
		anzahl_50_cent: integer("anzahl_50_cent").notNull().default(0),
		anzahl_20_cent: integer("anzahl_20_cent").notNull().default(0),
		anzahl_10_cent: integer("anzahl_10_cent").notNull().default(0),
		anzahl_5_cent: integer("anzahl_5_cent").notNull().default(0),
		anzahl_2_cent: integer("anzahl_2_cent").notNull().default(0),
		anzahl_1_cent: integer("anzahl_1_cent").notNull().default(0),

		wechselgeld_cent: integer("wechselgeld_cent").notNull(),
		kartenzahlung_cent: integer("kartenzahlung_cent").notNull().default(0),
		gezaehlt_cent: integer("gezaehlt_cent").notNull(),
		ausgaben_cent: integer("ausgaben_cent").notNull(),
		bestand_cent: integer("bestand_cent").notNull(),
		tageseinnahmen_cent: integer("tageseinnahmen_cent").notNull(),
		umsatz_ust_basis: text("umsatz_ust_basis").notNull().default("post_card"),

		pdf_s3_key: text("pdf_s3_key"),
		pdf_sha256: text("pdf_sha256"),
		storniert_am: timestamp("storniert_am", { withTimezone: true }),
		storniert_von_user_id: text("storniert_von_user_id"),
		storniert_von_name: text("storniert_von_name"),
		storno_grund: text("storno_grund"),
		storno_pdf_s3_key: text("storno_pdf_s3_key"),
		storno_pdf_sha256: text("storno_pdf_sha256"),
	},
	(t) => [
		index("idx_protokolle_erstellt_am").on(t.erstellt_am),
		index("idx_protokolle_storniert_am").on(t.storniert_am),
		index("idx_protokolle_anlass_datum").on(t.anlass_datum),
		index("idx_protokolle_erstellt_von_user_id").on(t.erstellt_von_user_id),
		index("idx_protokolle_storniert_von_user_id").on(t.storniert_von_user_id),
		check("protokolle_wechselgeld_cent_check", sql`${t.wechselgeld_cent} >= 0`),
		check(
			"protokolle_kartenzahlung_cent_check",
			sql`${t.kartenzahlung_cent} >= 0`,
		),
		check("protokolle_gezaehlt_cent_check", sql`${t.gezaehlt_cent} >= 0`),
		check("protokolle_ausgaben_cent_check", sql`${t.ausgaben_cent} >= 0`),
		check("protokolle_bestand_cent_check", sql`${t.bestand_cent} >= 0`),
		check(
			"protokolle_umsatz_ust_basis_check",
			sql`${t.umsatz_ust_basis} IN ('pre_card', 'post_card')`,
		),
	],
);

export const ausgaben = pgTable(
	"ausgaben",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		protokoll_id: uuid("protokoll_id")
			.notNull()
			.references(() => protokolle.id, { onDelete: "cascade" }),
		bezeichnung: text("bezeichnung").notNull(),
		empfaenger: text("empfaenger").notNull().default(""),
		beleg_nr: text("beleg_nr").notNull().default(""),
		betrag_cent: integer("betrag_cent").notNull(),
		ust_basis_punkte: integer("ust_basis_punkte").notNull().default(0),
		reihenfolge: integer("reihenfolge").notNull().default(0),
	},
	(t) => [
		index("idx_ausgaben_protokoll_id").on(t.protokoll_id),
		check("ausgaben_betrag_cent_check", sql`${t.betrag_cent} >= 0`),
		check(
			"ausgaben_ust_basis_punkte_check",
			sql`${t.ust_basis_punkte} >= 0 AND ${t.ust_basis_punkte} <= 10000`,
		),
	],
);

export const protokollUmsatzUst = pgTable(
	"protokoll_umsatz_ust",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		protokoll_id: uuid("protokoll_id")
			.notNull()
			.references(() => protokolle.id, { onDelete: "cascade" }),
		ust_basis_punkte: integer("ust_basis_punkte").notNull(),
		betrag_cent: integer("betrag_cent").notNull(),
		reihenfolge: integer("reihenfolge").notNull().default(0),
	},
	(t) => [
		index("idx_protokoll_umsatz_ust_protokoll_id").on(t.protokoll_id),
		check(
			"protokoll_umsatz_ust_basis_punkte_check",
			sql`${t.ust_basis_punkte} >= 0 AND ${t.ust_basis_punkte} <= 10000`,
		),
		check("protokoll_umsatz_ust_betrag_cent_check", sql`${t.betrag_cent} >= 0`),
	],
);

export const cashRegisters = pgTable(
	"cash_registers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		kassennummer: text("kassennummer").notNull().unique(),
		kassenbezeichnung: text("kassenbezeichnung").notNull(),
		wechselgeld_cent: integer("wechselgeld_cent").notNull().default(16000),
		reihenfolge: integer("reihenfolge").notNull().default(0),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("idx_cash_registers_order").on(t.reihenfolge, t.kassennummer),
		check(
			"cash_registers_wechselgeld_cent_check",
			sql`${t.wechselgeld_cent} >= 0`,
		),
	],
);

export const appSettings = pgTable(
	"app_settings",
	{
		id: integer("id").primaryKey().default(1),
		belegnummer_min_digits: integer("belegnummer_min_digits")
			.notNull()
			.default(2),
		belegnummer_prefix: text("belegnummer_prefix").notNull().default(""),
		belegnummer_include_year: boolean("belegnummer_include_year")
			.notNull()
			.default(false),
		belegnummer_year_format: text("belegnummer_year_format")
			.notNull()
			.default("long"),
		belegnummer_separator: text("belegnummer_separator").notNull().default("-"),
		umsatz_ust_basis: text("umsatz_ust_basis").notNull().default("post_card"),
		// Club this deployment runs for. Empty means "fall back to the VEREINSNAME
		// env var, then a generic default". Configured in-app under Einstellungen.
		vereinsname: text("vereinsname").notNull().default(""),
		// Vereinsstammdaten für die rechtlich vollständige PDF-Fußzeile. Alle in
		// den Einstellungen pflegbar; leere Felder werden im PDF ausgelassen.
		verein_strasse: text("verein_strasse").notNull().default(""),
		verein_plz: text("verein_plz").notNull().default(""),
		verein_ort: text("verein_ort").notNull().default(""),
		verein_vorstand: text("verein_vorstand").notNull().default(""),
		verein_registergericht: text("verein_registergericht")
			.notNull()
			.default(""),
		verein_registernummer: text("verein_registernummer").notNull().default(""),
		// E-Mail-Benachrichtigungen. SMTP-Zugang und Empfänger werden in der App
		// unter Einstellungen gepflegt. Das Passwort liegt verschlüsselt vor
		// (AES-256-GCM, Schlüssel aus BETTER_AUTH_SECRET), nie im Klartext.
		smtp_enabled: boolean("smtp_enabled").notNull().default(false),
		smtp_host: text("smtp_host").notNull().default(""),
		smtp_port: integer("smtp_port").notNull().default(587),
		smtp_security: text("smtp_security").notNull().default("starttls"),
		smtp_user: text("smtp_user").notNull().default(""),
		smtp_password_enc: text("smtp_password_enc").notNull().default(""),
		smtp_from: text("smtp_from").notNull().default(""),
		notify_new_protokoll: boolean("notify_new_protokoll")
			.notNull()
			.default(true),
		notify_recipients: text("notify_recipients").notNull().default(""),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("app_settings_singleton_check", sql`${t.id} = 1`),
		check(
			"app_settings_min_digits_check",
			sql`${t.belegnummer_min_digits} BETWEEN 1 AND 6`,
		),
		check(
			"app_settings_year_format_check",
			sql`${t.belegnummer_year_format} IN ('long', 'short')`,
		),
		check(
			"app_settings_separator_check",
			sql`${t.belegnummer_separator} IN ('-', '/', '.', '_')`,
		),
		check(
			"app_settings_umsatz_ust_basis_check",
			sql`${t.umsatz_ust_basis} IN ('pre_card', 'post_card')`,
		),
		check(
			"app_settings_smtp_security_check",
			sql`${t.smtp_security} IN ('starttls', 'ssl', 'none')`,
		),
		check(
			"app_settings_smtp_port_check",
			sql`${t.smtp_port} BETWEEN 1 AND 65535`,
		),
	],
);

export const loginAttempts = pgTable(
	"login_attempts",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		ip: text("ip").notNull(),
		versucht_am: timestamp("versucht_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
		erfolgreich: boolean("erfolgreich").notNull(),
	},
	(t) => [index("idx_login_attempts_ip_versucht_am").on(t.ip, t.versucht_am)],
);

// Append-only security and business audit trail. The application exposes no
// update or delete operation for this table. Metadata is deliberately limited
// to non-secret context by the audit service.
export const auditEvents = pgTable(
	"audit_events",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		event_at: timestamp("event_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		category: text("category").notNull(),
		action: text("action").notNull(),
		success: boolean("success").notNull().default(true),
		actor_user_id: text("actor_user_id"),
		actor_email: text("actor_email"),
		actor_name: text("actor_name"),
		actor_role: text("actor_role"),
		subject_type: text("subject_type"),
		subject_id: text("subject_id"),
		subject_label: text("subject_label"),
		request_id: uuid("request_id").notNull().defaultRandom(),
		ip_address: text("ip_address"),
		user_agent: text("user_agent"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(t) => [
		index("idx_audit_events_event_at").on(t.event_at),
		index("idx_audit_events_category_event_at").on(t.category, t.event_at),
		index("idx_audit_events_action_event_at").on(t.action, t.event_at),
		index("idx_audit_events_actor_user_id").on(t.actor_user_id),
		index("idx_audit_events_subject").on(t.subject_type, t.subject_id),
	],
);

// Imported revenue figures that predate the cash-counting workflow. Entries
// are immutable accounting records: corrections happen through cancellation
// plus a new entry, never by overwriting history.
export const historicalRevenues = pgTable(
	"historical_revenues",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		idempotency_key: uuid("idempotency_key").notNull().unique(),
		anlass_datum: date("anlass_datum", { mode: "string" }).notNull(),
		anlass: text("anlass").notNull(),
		vergleichsgruppe: text("vergleichsgruppe").notNull(),
		umsatz_cent: integer("umsatz_cent").notNull(),
		ausgaben_cent: integer("ausgaben_cent").notNull().default(0),
		bemerkung: text("bemerkung"),
		quellreferenz: text("quellreferenz"),
		erstellt_von_user_id: text("erstellt_von_user_id").notNull(),
		erstellt_von_name: text("erstellt_von_name").notNull(),
		erstellt_von_email: text("erstellt_von_email").notNull(),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		storniert_am: timestamp("storniert_am", { withTimezone: true }),
		storniert_von_user_id: text("storniert_von_user_id"),
		storniert_von_name: text("storniert_von_name"),
		storniert_von_email: text("storniert_von_email"),
		storno_grund: text("storno_grund"),
	},
	(t) => [
		index("idx_historical_revenues_anlass_datum").on(t.anlass_datum),
		index("idx_historical_revenues_erstellt_von_user_id").on(
			t.erstellt_von_user_id,
		),
		index("idx_historical_revenues_storniert_am").on(t.storniert_am),
		check(
			"historical_revenues_anlass_check",
			sql`length(trim(${t.anlass})) BETWEEN 1 AND 200`,
		),
		check(
			"historical_revenues_vergleichsgruppe_check",
			sql`length(trim(${t.vergleichsgruppe})) BETWEEN 1 AND 120`,
		),
		check("historical_revenues_umsatz_cent_check", sql`${t.umsatz_cent} >= 0`),
		check(
			"historical_revenues_ausgaben_cent_check",
			sql`${t.ausgaben_cent} >= 0`,
		),
		check(
			"historical_revenues_bemerkung_check",
			sql`${t.bemerkung} IS NULL OR length(${t.bemerkung}) <= 2000`,
		),
		check(
			"historical_revenues_quellreferenz_check",
			sql`${t.quellreferenz} IS NULL OR length(${t.quellreferenz}) <= 500`,
		),
		check(
			"historical_revenues_storno_check",
			sql`(${t.storniert_am} IS NULL AND ${t.storniert_von_user_id} IS NULL AND ${t.storniert_von_name} IS NULL AND ${t.storniert_von_email} IS NULL AND ${t.storno_grund} IS NULL) OR (${t.storniert_am} IS NOT NULL AND ${t.storniert_von_user_id} IS NOT NULL AND ${t.storniert_von_name} IS NOT NULL AND ${t.storniert_von_email} IS NOT NULL AND length(trim(${t.storno_grund})) BETWEEN 5 AND 500)`,
		),
	],
);

export const belegnummerSequences = pgTable(
	"belegnummer_sequences",
	{
		year: integer("year").primaryKey(),
		next_sequence: integer("next_sequence").notNull().default(1),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("belegnummer_sequences_year_check", sql`${t.year} >= 2000`),
		check(
			"belegnummer_sequences_next_sequence_check",
			sql`${t.next_sequence} >= 1`,
		),
	],
);

// Invitations: the seeded admin invites further users. Open sign-up is
// disabled in better-auth, so an account can only be created by accepting a
// valid, unexpired, unused invite.
export const invitations = pgTable(
	"invitations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		email: text("email").notNull(),
		token: text("token").notNull().unique(),
		role: text("role").notNull().default("user"),
		invited_by: text("invited_by"),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
		accepted_at: timestamp("accepted_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("idx_invitations_email").on(t.email)],
);
