CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"belegnummer_min_digits" integer DEFAULT 2 NOT NULL,
	"belegnummer_prefix" text DEFAULT '' NOT NULL,
	"belegnummer_include_year" boolean DEFAULT false NOT NULL,
	"belegnummer_year_format" text DEFAULT 'long' NOT NULL,
	"belegnummer_separator" text DEFAULT '-' NOT NULL,
	"umsatz_ust_basis" text DEFAULT 'post_card' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton_check" CHECK ("app_settings"."id" = 1),
	CONSTRAINT "app_settings_min_digits_check" CHECK ("app_settings"."belegnummer_min_digits" BETWEEN 1 AND 6),
	CONSTRAINT "app_settings_year_format_check" CHECK ("app_settings"."belegnummer_year_format" IN ('long', 'short')),
	CONSTRAINT "app_settings_separator_check" CHECK ("app_settings"."belegnummer_separator" IN ('-', '/', '.', '_')),
	CONSTRAINT "app_settings_umsatz_ust_basis_check" CHECK ("app_settings"."umsatz_ust_basis" IN ('pre_card', 'post_card'))
);
--> statement-breakpoint
CREATE TABLE "ausgaben" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protokoll_id" uuid NOT NULL,
	"bezeichnung" text NOT NULL,
	"empfaenger" text DEFAULT '' NOT NULL,
	"beleg_nr" text DEFAULT '' NOT NULL,
	"betrag_cent" integer NOT NULL,
	"ust_basis_punkte" integer DEFAULT 0 NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ausgaben_betrag_cent_check" CHECK ("ausgaben"."betrag_cent" >= 0),
	CONSTRAINT "ausgaben_ust_basis_punkte_check" CHECK ("ausgaben"."ust_basis_punkte" >= 0 AND "ausgaben"."ust_basis_punkte" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kassennummer" text NOT NULL,
	"kassenbezeichnung" text NOT NULL,
	"wechselgeld_cent" integer DEFAULT 16000 NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_registers_kassennummer_unique" UNIQUE("kassennummer"),
	CONSTRAINT "cash_registers_wechselgeld_cent_check" CHECK ("cash_registers"."wechselgeld_cent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"versucht_am" timestamp with time zone DEFAULT now() NOT NULL,
	"erfolgreich" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protokoll_umsatz_ust" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protokoll_id" uuid NOT NULL,
	"ust_basis_punkte" integer NOT NULL,
	"betrag_cent" integer NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "protokoll_umsatz_ust_basis_punkte_check" CHECK ("protokoll_umsatz_ust"."ust_basis_punkte" >= 0 AND "protokoll_umsatz_ust"."ust_basis_punkte" <= 10000),
	CONSTRAINT "protokoll_umsatz_ust_betrag_cent_check" CHECK ("protokoll_umsatz_ust"."betrag_cent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "protokolle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"belegnummer" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"anlass_datum" date NOT NULL,
	"kassennummer" text DEFAULT '' NOT NULL,
	"kassenbezeichnung" text DEFAULT '' NOT NULL,
	"anlass" text NOT NULL,
	"gezaehlt_von" text NOT NULL,
	"geprueft_von" text NOT NULL,
	"bemerkung" text DEFAULT '' NOT NULL,
	"anzahl_500_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_200_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_100_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_50_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_20_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_10_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_5_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_2_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_1_eur" integer DEFAULT 0 NOT NULL,
	"anzahl_50_cent" integer DEFAULT 0 NOT NULL,
	"anzahl_20_cent" integer DEFAULT 0 NOT NULL,
	"anzahl_10_cent" integer DEFAULT 0 NOT NULL,
	"anzahl_5_cent" integer DEFAULT 0 NOT NULL,
	"anzahl_2_cent" integer DEFAULT 0 NOT NULL,
	"anzahl_1_cent" integer DEFAULT 0 NOT NULL,
	"wechselgeld_cent" integer NOT NULL,
	"kartenzahlung_cent" integer DEFAULT 0 NOT NULL,
	"gezaehlt_cent" integer NOT NULL,
	"ausgaben_cent" integer NOT NULL,
	"bestand_cent" integer NOT NULL,
	"tageseinnahmen_cent" integer NOT NULL,
	"umsatz_ust_basis" text DEFAULT 'post_card' NOT NULL,
	"pdf_s3_key" text,
	"pdf_sha256" text,
	"storniert_am" timestamp with time zone,
	"storno_grund" text,
	"storno_pdf_s3_key" text,
	"storno_pdf_sha256" text,
	CONSTRAINT "protokolle_belegnummer_unique" UNIQUE("belegnummer"),
	CONSTRAINT "protokolle_wechselgeld_cent_check" CHECK ("protokolle"."wechselgeld_cent" >= 0),
	CONSTRAINT "protokolle_kartenzahlung_cent_check" CHECK ("protokolle"."kartenzahlung_cent" >= 0),
	CONSTRAINT "protokolle_gezaehlt_cent_check" CHECK ("protokolle"."gezaehlt_cent" >= 0),
	CONSTRAINT "protokolle_ausgaben_cent_check" CHECK ("protokolle"."ausgaben_cent" >= 0),
	CONSTRAINT "protokolle_bestand_cent_check" CHECK ("protokolle"."bestand_cent" >= 0),
	CONSTRAINT "protokolle_umsatz_ust_basis_check" CHECK ("protokolle"."umsatz_ust_basis" IN ('pre_card', 'post_card'))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_protokoll_id_protokolle_id_fk" FOREIGN KEY ("protokoll_id") REFERENCES "public"."protokolle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protokoll_umsatz_ust" ADD CONSTRAINT "protokoll_umsatz_ust_protokoll_id_protokolle_id_fk" FOREIGN KEY ("protokoll_id") REFERENCES "public"."protokolle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ausgaben_protokoll_id" ON "ausgaben" USING btree ("protokoll_id");--> statement-breakpoint
CREATE INDEX "idx_cash_registers_order" ON "cash_registers" USING btree ("reihenfolge","kassennummer");--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip_versucht_am" ON "login_attempts" USING btree ("ip","versucht_am");--> statement-breakpoint
CREATE INDEX "idx_protokoll_umsatz_ust_protokoll_id" ON "protokoll_umsatz_ust" USING btree ("protokoll_id");--> statement-breakpoint
CREATE INDEX "idx_protokolle_erstellt_am" ON "protokolle" USING btree ("erstellt_am");--> statement-breakpoint
CREATE INDEX "idx_protokolle_storniert_am" ON "protokolle" USING btree ("storniert_am");--> statement-breakpoint
CREATE INDEX "idx_protokolle_anlass_datum" ON "protokolle" USING btree ("anlass_datum");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");