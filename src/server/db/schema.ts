import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigserial,
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type { DenominationCounts } from "@/lib/denominations";
import type { HistoricalProtocolParsedRow } from "@/lib/historical-protocol-import";

export type HistoricalRevenueVatSplit = {
	ust_basis_punkte: number;
	betrag_cent: number;
};

// Immutable source files are stored once per content hash. Drafts and booked
// historical revenues refer to them through their already persisted SHA256.
export const historicalSourceArchives = pgTable(
	"historical_source_archives",
	{
		sha256: text("sha256").primaryKey(),
		object_key: text("object_key").notNull().unique(),
		original_filename: text("original_filename").notNull(),
		content_type: text("content_type").notNull(),
		size_bytes: integer("size_bytes").notNull(),
		archived_at: timestamp("archived_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		archived_by_user_id: text("archived_by_user_id").notNull(),
		archived_by_name: text("archived_by_name").notNull(),
	},
	(t) => [
		check(
			"historical_source_archives_sha256_check",
			sql`${t.sha256} ~ '^[0-9a-f]{64}$'`,
		),
		check(
			"historical_source_archives_size_check",
			sql`${t.size_bytes} > 0 AND ${t.size_bytes} <= 41943040`,
		),
		check(
			"historical_source_archives_filename_check",
			sql`length(trim(${t.original_filename})) BETWEEN 1 AND 255`,
		),
	],
);

// Money is always stored as integer cents. Conversion happens only at the
// form input and at display time.

export const protokolle = pgTable(
	"protokolle",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// Nullable only for rows created before idempotency was introduced. Every
		// new write supplies both values and the unique key protects replays.
		idempotency_key: uuid("idempotency_key").unique(),
		idempotency_payload_sha256: text("idempotency_payload_sha256"),
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
		// Stable, user-facing reporting category. Nullable for legacy rows, which
		// continue to use the detailed catalog/text comparison fallback below.
		umsatzbereich: text("umsatzbereich"),
		// Stable grouping key for the year-over-year comparison (see plans/007).
		// The free-text `anlass` above stays as the human label; this points at the
		// managed catalog entry. Nullable: legacy rows fall back to text grouping.
		anlass_katalog_id: uuid("anlass_katalog_id").references(
			() => anlassKatalog.id,
			{ onDelete: "set null" },
		),
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
		index("idx_protokolle_anlass_katalog_id").on(t.anlass_katalog_id),
		index("idx_protokolle_umsatzbereich").on(t.umsatzbereich),
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
		check(
			"protokolle_umsatzbereich_check",
			sql`${t.umsatzbereich} IS NULL OR ${t.umsatzbereich} IN ('wirtschaftsbetrieb', 'veranstaltungen', 'eintrittsgelder', 'verkauf_spielfeld', 'seniorennachmittag', 'sonstiges')`,
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

// Anlass catalog: the club's real recurring/one-off events, managed once by an
// admin (mirrors cash_registers). The catalog id is the stable grouping key for
// the year-over-year comparison; the free-text `anlass` on a protokoll stays as
// the human label for the PDF/audit. See plans/007.
export const anlassKatalog = pgTable(
	"anlass_katalog",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull().unique(),
		// 'wiederkehrend' rolls up per season; 'einmalig' compares year-to-year.
		typ: text("typ").notNull().default("wiederkehrend"),
		aktiv: boolean("aktiv").notNull().default(true),
		reihenfolge: integer("reihenfolge").notNull().default(0),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("idx_anlass_katalog_order").on(t.reihenfolge, t.name),
		check(
			"anlass_katalog_typ_check",
			sql`${t.typ} IN ('wiederkehrend', 'einmalig')`,
		),
		check(
			"anlass_katalog_name_check",
			sql`length(trim(${t.name})) BETWEEN 1 AND 120`,
		),
	],
);

// Normalized old spellings mapped to a catalog entry. Used to backfill existing
// protokolle and to suggest a match when a stray free-text anlass appears.
export const anlassAliase = pgTable(
	"anlass_aliase",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		alias_norm: text("alias_norm").notNull().unique(),
		anlass_katalog_id: uuid("anlass_katalog_id")
			.notNull()
			.references(() => anlassKatalog.id, { onDelete: "cascade" }),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("idx_anlass_aliase_katalog").on(t.anlass_katalog_id)],
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
		helferstunde_wert_cent: integer("helferstunde_wert_cent")
			.notNull()
			.default(600),
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
		// One timestamp per settings group. The row is a singleton shared by five
		// separate forms, so a single shared value would make saving one form
		// conflict with the next form on the same page - including for a single
		// admin working alone. Each group's optimistic check uses its own stamp.
		belegnummer_updated_at: timestamp("belegnummer_updated_at", {
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		umsatz_ust_updated_at: timestamp("umsatz_ust_updated_at", {
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		helferstunde_wert_updated_at: timestamp("helferstunde_wert_updated_at", {
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		verein_updated_at: timestamp("verein_updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		email_updated_at: timestamp("email_updated_at", { withTimezone: true })
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
			"app_settings_helferstunde_wert_check",
			sql`${t.helferstunde_wert_cent} BETWEEN 1 AND 100000`,
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

/**
 * Helper-hour categories are data, not code: the club can add, rename and
 * retire departments without a deployment. The eight original categories are
 * seeded by migration and flagged `system`, so they stay referenceable by
 * historical allocations and exports even after being deactivated.
 */
export const helperHourCategories = pgTable(
	"helper_hour_categories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		code: text("code").notNull().unique(),
		label: text("label").notNull(),
		art: text("art").notNull().default("abteilung"),
		sortierung: integer("sortierung").notNull().default(0),
		aktiv: boolean("aktiv").notNull().default(true),
		system: boolean("system").notNull().default(false),
		erstellt_von_user_id: text("erstellt_von_user_id"),
		erstellt_von_name: text("erstellt_von_name"),
		erstellt_am: timestamp("erstellt_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
		aktualisiert_am: timestamp("aktualisiert_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("helper_hour_categories_label_unique").on(
			sql`lower(trim(${t.label}))`,
		),
		index("idx_helper_hour_categories_sort").on(t.sortierung, t.label),
		check(
			"helper_hour_categories_code_check",
			sql`${t.code} ~ '^[a-z0-9][a-z0-9_]{0,39}$'`,
		),
		check(
			"helper_hour_categories_label_check",
			sql`length(trim(${t.label})) BETWEEN 1 AND 60`,
		),
		check(
			"helper_hour_categories_art_check",
			sql`${t.art} IN ('verein', 'abteilung')`,
		),
	],
);

/**
 * "When the list writes X, mean Y." Applied on every import, so a spelling the
 * club has already judged never has to be corrected again: a rename would
 * otherwise be undone by the next import, which replaces the monthly sheets.
 */
export const helperHourNameAliases = pgTable(
	"helper_hour_name_aliases",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		von_nachname: text("von_nachname").notNull(),
		von_vorname: text("von_vorname").notNull(),
		nach_nachname: text("nach_nachname").notNull(),
		nach_vorname: text("nach_vorname").notNull(),
		bemerkung: text("bemerkung").notNull().default(""),
		erstellt_von_user_id: text("erstellt_von_user_id").notNull(),
		erstellt_von_name: text("erstellt_von_name").notNull(),
		erstellt_am: timestamp("erstellt_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("helper_hour_name_aliases_source_unique").on(
			sql`lower(trim(${t.von_nachname}))`,
			sql`lower(trim(${t.von_vorname}))`,
		),
		check(
			"helper_hour_name_aliases_source_check",
			sql`length(trim(${t.von_nachname} || ${t.von_vorname})) > 0`,
		),
		check(
			"helper_hour_name_aliases_target_check",
			sql`length(trim(${t.nach_nachname})) > 0 AND length(trim(${t.nach_vorname})) > 0`,
		),
		// A target that is itself a source would chain, and the order in which
		// aliases apply would start to matter.
		check(
			"helper_hour_name_aliases_distinct_check",
			sql`lower(trim(${t.von_nachname})) <> lower(trim(${t.nach_nachname})) OR lower(trim(${t.von_vorname})) <> lower(trim(${t.nach_vorname}))`,
		),
	],
);

export const helperHours = pgTable(
	"helper_hours",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		idempotency_key: uuid("idempotency_key").notNull().unique(),
		datum: date("datum", { mode: "string" }).notNull(),
		veranstaltung: text("veranstaltung").notNull(),
		nachname: text("nachname").notNull().default(""),
		vorname: text("vorname").notNull().default(""),
		gemeldete_summe_minuten: integer("gemeldete_summe_minuten").notNull(),
		bemerkung: text("bemerkung").notNull().default(""),
		quelle: text("quelle").notNull().default("manuell"),
		quelle_datei: text("quelle_datei"),
		quelle_sha256: text("quelle_sha256"),
		quelle_blatt: text("quelle_blatt"),
		quelle_zeile: integer("quelle_zeile"),
		import_warnungen: jsonb("import_warnungen")
			.$type<string[]>()
			.notNull()
			.default([]),
		import_originalwerte: jsonb("import_originalwerte").$type<{
			vorname: string;
			nachname: string;
			datum: string;
			allocations: Record<string, number>;
			gemeldete_summe_minuten: number;
		}>(),
		import_korrektur: jsonb("import_korrektur").$type<{
			vorname: string;
			nachname: string;
			allocations: Record<string, number>;
			gemeldete_summe_minuten: number;
			acceptedIssues: string[];
		}>(),
		erstellt_von_user_id: text("erstellt_von_user_id").notNull(),
		erstellt_von_name: text("erstellt_von_name").notNull(),
		erstellt_am: timestamp("erstellt_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("helper_hours_source_row_unique").on(
			t.quelle_sha256,
			t.quelle_blatt,
			t.quelle_zeile,
		),
		index("idx_helper_hours_datum").on(t.datum),
		index("idx_helper_hours_name").on(t.nachname, t.vorname),
		index("idx_helper_hours_sheet").on(t.quelle, t.quelle_blatt),
		check(
			"helper_hours_event_check",
			sql`length(trim(${t.veranstaltung})) BETWEEN 1 AND 160`,
		),
		check(
			"helper_hours_name_check",
			sql`length(trim(${t.nachname} || ${t.vorname})) > 0 OR ${t.quelle} = 'excel'`,
		),
		check(
			"helper_hours_source_check",
			sql`${t.quelle} IN ('manuell', 'excel')`,
		),
		check("helper_hours_minutes_check", sql`${t.gemeldete_summe_minuten} > 0`),
	],
);

/**
 * One row per category an entry contributes minutes to. Replaces the former
 * fixed minute columns so new categories need no schema change. Only positive
 * allocations are stored; the absence of a row means zero.
 */
export const helperHourAllocations = pgTable(
	"helper_hour_allocations",
	{
		helper_hour_id: uuid("helper_hour_id")
			.notNull()
			.references(() => helperHours.id, { onDelete: "cascade" }),
		kategorie_id: uuid("kategorie_id")
			.notNull()
			.references(() => helperHourCategories.id, { onDelete: "restrict" }),
		minuten: integer("minuten").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.helper_hour_id, t.kategorie_id] }),
		index("idx_helper_hour_allocations_category").on(t.kategorie_id),
		check("helper_hour_allocations_minutes_check", sql`${t.minuten} > 0`),
	],
);

/**
 * Department purchases. Booked in euro, but presented as the hours they
 * consume: the helper-hour view is currency free, so a purchase is shown as
 * `betrag_cent` converted at the current hourly value.
 */
export const helperHourExpenses = pgTable(
	"helper_hour_expenses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		idempotency_key: uuid("idempotency_key").notNull().unique(),
		kategorie_id: uuid("kategorie_id")
			.notNull()
			.references(() => helperHourCategories.id, { onDelete: "restrict" }),
		datum: date("datum", { mode: "string" }).notNull(),
		bezeichnung: text("bezeichnung").notNull(),
		betrag_cent: integer("betrag_cent").notNull(),
		bemerkung: text("bemerkung").notNull().default(""),
		quelle: text("quelle").notNull().default("manuell"),
		quelle_datei: text("quelle_datei"),
		quelle_sha256: text("quelle_sha256"),
		quelle_blatt: text("quelle_blatt"),
		quelle_zeile: integer("quelle_zeile"),
		storniert_am: timestamp("storniert_am", { withTimezone: true }),
		storno_grund: text("storno_grund"),
		storniert_von_user_id: text("storniert_von_user_id"),
		storniert_von_name: text("storniert_von_name"),
		erstellt_von_user_id: text("erstellt_von_user_id").notNull(),
		erstellt_von_name: text("erstellt_von_name").notNull(),
		erstellt_am: timestamp("erstellt_am", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("helper_hour_expenses_source_row_unique").on(
			t.quelle_sha256,
			t.quelle_blatt,
			t.quelle_zeile,
		),
		index("idx_helper_hour_expenses_category_date").on(t.kategorie_id, t.datum),
		check(
			"helper_hour_expenses_description_check",
			sql`length(trim(${t.bezeichnung})) BETWEEN 1 AND 200`,
		),
		check("helper_hour_expenses_amount_check", sql`${t.betrag_cent} > 0`),
		check(
			"helper_hour_expenses_source_check",
			sql`${t.quelle} IN ('manuell', 'excel')`,
		),
		check(
			"helper_hour_expenses_cancellation_check",
			sql`(${t.storniert_am} IS NULL AND ${t.storno_grund} IS NULL AND ${t.storniert_von_user_id} IS NULL AND ${t.storniert_von_name} IS NULL) OR (${t.storniert_am} IS NOT NULL AND length(trim(${t.storno_grund})) >= 5 AND ${t.storniert_von_user_id} IS NOT NULL AND ${t.storniert_von_name} IS NOT NULL)`,
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
		umsatzbereich: text("umsatzbereich"),
		// Unifies historical entries under the same catalog as protokolle (plans/007).
		// Nullable during migration; `vergleichsgruppe` stays for backward compat.
		anlass_katalog_id: uuid("anlass_katalog_id").references(
			() => anlassKatalog.id,
			{ onDelete: "set null" },
		),
		umsatz_cent: integer("umsatz_cent").notNull(),
		ausgaben_cent: integer("ausgaben_cent").notNull().default(0),
		bemerkung: text("bemerkung"),
		quellreferenz: text("quellreferenz"),
		// Structured evidence from the historical cash-protocol folder import.
		// Manual legacy entries leave these nullable. The source hash is the
		// durable deduplication boundary, while the remaining fields keep useful
		// cash, card, VAT and denomination detail available for later reports.
		quelle_sha256: text("quelle_sha256"),
		quelle_pfad: text("quelle_pfad"),
		quelle_format: text("quelle_format"),
		quelle_belegnummer: text("quelle_belegnummer"),
		quelle_datum_herkunft: text("quelle_datum_herkunft"),
		kassennummer: text("kassennummer"),
		kassenbezeichnung: text("kassenbezeichnung"),
		gezaehlt_von: text("gezaehlt_von"),
		wechselgeld_cent: integer("wechselgeld_cent"),
		kartenzahlung_cent: integer("kartenzahlung_cent"),
		gezaehlt_cent: integer("gezaehlt_cent"),
		tageseinnahmen_bar_cent: integer("tageseinnahmen_bar_cent"),
		stueckelung: jsonb("stueckelung").$type<DenominationCounts>(),
		umsatz_ust: jsonb("umsatz_ust").$type<HistoricalRevenueVatSplit[]>(),
		import_warnungen: jsonb("import_warnungen").$type<string[]>(),
		korrigiert_von_id: uuid("korrigiert_von_id").references(
			(): AnyPgColumn => historicalRevenues.id,
			{ onDelete: "restrict" },
		),
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
		uniqueIndex("historical_revenues_quelle_sha256_unique")
			.on(t.quelle_sha256)
			.where(sql`${t.quelle_sha256} IS NOT NULL`),
		uniqueIndex("historical_revenues_korrigiert_von_unique")
			.on(t.korrigiert_von_id)
			.where(sql`${t.korrigiert_von_id} IS NOT NULL`),
		index("idx_historical_revenues_anlass_datum").on(t.anlass_datum),
		index("idx_historical_revenues_anlass_katalog_id").on(t.anlass_katalog_id),
		index("idx_historical_revenues_umsatzbereich").on(t.umsatzbereich),
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
		check(
			"historical_revenues_umsatzbereich_check",
			sql`${t.umsatzbereich} IS NULL OR ${t.umsatzbereich} IN ('wirtschaftsbetrieb', 'veranstaltungen', 'eintrittsgelder', 'verkauf_spielfeld', 'seniorennachmittag', 'sonstiges')`,
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
			"historical_revenues_quelle_pfad_check",
			sql`${t.quelle_pfad} IS NULL OR length(${t.quelle_pfad}) <= 1000`,
		),
		check(
			"historical_revenues_quelle_format_check",
			sql`${t.quelle_format} IS NULL OR ${t.quelle_format} IN ('ods', 'xlsx')`,
		),
		check(
			"historical_revenues_quelle_datum_herkunft_check",
			sql`${t.quelle_datum_herkunft} IS NULL OR ${t.quelle_datum_herkunft} IN ('workbook', 'file_modified')`,
		),
		check(
			"historical_revenues_source_amounts_check",
			sql`(${t.wechselgeld_cent} IS NULL OR ${t.wechselgeld_cent} >= 0) AND (${t.kartenzahlung_cent} IS NULL OR ${t.kartenzahlung_cent} >= 0) AND (${t.gezaehlt_cent} IS NULL OR ${t.gezaehlt_cent} >= 0) AND (${t.tageseinnahmen_bar_cent} IS NULL OR ${t.tageseinnahmen_bar_cent} >= 0)`,
		),
		check(
			"historical_revenues_storno_check",
			sql`(${t.storniert_am} IS NULL AND ${t.storniert_von_user_id} IS NULL AND ${t.storniert_von_name} IS NULL AND ${t.storniert_von_email} IS NULL AND ${t.storno_grund} IS NULL) OR (${t.storniert_am} IS NOT NULL AND ${t.storniert_von_user_id} IS NOT NULL AND ${t.storniert_von_name} IS NOT NULL AND ${t.storniert_von_email} IS NOT NULL AND length(trim(${t.storno_grund})) BETWEEN 5 AND 500)`,
		),
	],
);

// A protocol-folder analysis becomes a durable workspace before any accounting
// rows are written. The immutable parser result stays in `detected_row`; users
// and MCP edit only the explicit working columns on each item.
export const historicalProtocolImportDrafts = pgTable(
	"historical_protocol_import_drafts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		digest: text("digest").notNull().unique(),
		folder_name: text("folder_name").notNull(),
		status: text("status").notNull().default("editing"),
		revision: integer("revision").notNull().default(1),
		files: integer("files").notNull(),
		spreadsheet_files: integer("spreadsheet_files").notNull(),
		created_by_user_id: text("created_by_user_id").notNull(),
		created_by_name: text("created_by_name").notNull(),
		created_by_email: text("created_by_email").notNull(),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		imported_at: timestamp("imported_at", { withTimezone: true }),
		imported_by_user_id: text("imported_by_user_id"),
		imported_by_name: text("imported_by_name"),
		result_created: integer("result_created"),
		result_skipped: integer("result_skipped"),
		archived_at: timestamp("archived_at", { withTimezone: true }),
		archived_by_user_id: text("archived_by_user_id"),
		archived_by_name: text("archived_by_name"),
	},
	(t) => [
		index("idx_historical_protocol_import_drafts_status_updated").on(
			t.status,
			t.updated_at,
		),
		check(
			"historical_protocol_import_drafts_status_check",
			sql`${t.status} IN ('editing', 'ready', 'imported', 'archived')`,
		),
		check(
			"historical_protocol_import_drafts_revision_check",
			sql`${t.revision} >= 1`,
		),
		check(
			"historical_protocol_import_drafts_counts_check",
			sql`${t.files} >= 1 AND ${t.spreadsheet_files} >= 0 AND ${t.spreadsheet_files} <= ${t.files}`,
		),
	],
);

export const historicalProtocolImportItems = pgTable(
	"historical_protocol_import_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		draft_id: uuid("draft_id")
			.notNull()
			.references(() => historicalProtocolImportDrafts.id, {
				onDelete: "cascade",
			}),
		file_index: integer("file_index").notNull(),
		path: text("path").notNull(),
		parser_status: text("parser_status").notNull(),
		parser_reason: text("parser_reason").notNull(),
		decision: text("decision").notNull(),
		effective_date: date("effective_date", { mode: "string" }),
		detail: text("detail").notNull(),
		umsatzbereich: text("umsatzbereich"),
		revenue_cent: integer("revenue_cent"),
		expenses_cent: integer("expenses_cent"),
		classification_key: text("classification_key").notNull(),
		classification_confidence: text("classification_confidence").notNull(),
		correction_note: text("correction_note"),
		detected_row: jsonb("detected_row")
			.$type<HistoricalProtocolParsedRow>()
			.notNull(),
		revision: integer("revision").notNull().default(1),
		updated_by_user_id: text("updated_by_user_id").notNull(),
		updated_by_name: text("updated_by_name").notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("historical_protocol_import_items_draft_file_unique").on(
			t.draft_id,
			t.file_index,
		),
		index("idx_historical_protocol_import_items_draft_decision").on(
			t.draft_id,
			t.decision,
		),
		index("idx_historical_protocol_import_items_draft_parser_status").on(
			t.draft_id,
			t.parser_status,
		),
		check(
			"historical_protocol_import_items_parser_status_check",
			sql`${t.parser_status} IN ('ready', 'review', 'already_imported', 'existing_protocol', 'duplicate_file', 'skipped', 'error')`,
		),
		check(
			"historical_protocol_import_items_decision_check",
			sql`${t.decision} IN ('include', 'review', 'exclude')`,
		),
		check(
			"historical_protocol_import_items_area_check",
			sql`${t.umsatzbereich} IS NULL OR ${t.umsatzbereich} IN ('wirtschaftsbetrieb', 'veranstaltungen', 'eintrittsgelder', 'verkauf_spielfeld', 'seniorennachmittag', 'sonstiges')`,
		),
		check(
			"historical_protocol_import_items_amounts_check",
			sql`(${t.revenue_cent} IS NULL OR ${t.revenue_cent} >= 0) AND (${t.expenses_cent} IS NULL OR ${t.expenses_cent} >= 0)`,
		),
		check(
			"historical_protocol_import_items_detail_check",
			sql`length(trim(${t.detail})) BETWEEN 1 AND 120`,
		),
		check(
			"historical_protocol_import_items_note_check",
			sql`${t.correction_note} IS NULL OR length(${t.correction_note}) <= 1000`,
		),
	],
);

export const historicalProtocolImportReviewPhases = pgTable(
	"historical_protocol_import_review_phases",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		draft_id: uuid("draft_id")
			.notNull()
			.references(() => historicalProtocolImportDrafts.id, {
				onDelete: "cascade",
			}),
		name: text("name").notNull(),
		kind: text("kind").notNull(),
		status: text("status").notNull().default("active"),
		filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
		revision: integer("revision").notNull().default(1),
		created_by_user_id: text("created_by_user_id").notNull(),
		created_by_name: text("created_by_name").notNull(),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completed_by_user_id: text("completed_by_user_id"),
		completed_by_name: text("completed_by_name"),
		completed_at: timestamp("completed_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("historical_protocol_import_review_phases_name_unique").on(
			t.draft_id,
			t.name,
		),
		index("idx_historical_protocol_import_review_phases_draft_status").on(
			t.draft_id,
			t.status,
		),
		check(
			"historical_protocol_import_review_phases_kind_check",
			sql`${t.kind} IN ('source', 'date', 'amount', 'assignment', 'tax', 'denomination', 'final')`,
		),
		check(
			"historical_protocol_import_review_phases_status_check",
			sql`${t.status} IN ('active', 'completed')`,
		),
		check(
			"historical_protocol_import_review_phases_name_check",
			sql`length(trim(${t.name})) BETWEEN 3 AND 120`,
		),
		check(
			"historical_protocol_import_review_phases_revision_check",
			sql`${t.revision} >= 1`,
		),
	],
);

export const historicalProtocolImportReviewItems = pgTable(
	"historical_protocol_import_review_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		phase_id: uuid("phase_id")
			.notNull()
			.references(() => historicalProtocolImportReviewPhases.id, {
				onDelete: "cascade",
			}),
		item_id: uuid("item_id")
			.notNull()
			.references(() => historicalProtocolImportItems.id, {
				onDelete: "cascade",
			}),
		status: text("status").notNull().default("pending"),
		note: text("note"),
		revision: integer("revision").notNull().default(1),
		updated_by_user_id: text("updated_by_user_id").notNull(),
		updated_by_name: text("updated_by_name").notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("historical_protocol_import_review_items_unique").on(
			t.phase_id,
			t.item_id,
		),
		index("idx_historical_protocol_import_review_items_phase_status").on(
			t.phase_id,
			t.status,
		),
		index("idx_historical_protocol_import_review_items_item").on(t.item_id),
		check(
			"historical_protocol_import_review_items_status_check",
			sql`${t.status} IN ('pending', 'accepted', 'issue', 'not_applicable')`,
		),
		check(
			"historical_protocol_import_review_items_note_check",
			sql`${t.note} IS NULL OR length(trim(${t.note})) BETWEEN 3 AND 1000`,
		),
		check(
			"historical_protocol_import_review_items_revision_check",
			sql`${t.revision} >= 1`,
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
