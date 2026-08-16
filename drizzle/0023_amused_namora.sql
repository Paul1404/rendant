CREATE TABLE "helper_hour_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"abteilung" text NOT NULL,
	"datum" date NOT NULL,
	"bezeichnung" text NOT NULL,
	"betrag_cent" integer NOT NULL,
	"bemerkung" text DEFAULT '' NOT NULL,
	"storniert_am" timestamp with time zone,
	"storno_grund" text,
	"storniert_von_user_id" text,
	"storniert_von_name" text,
	"erstellt_von_user_id" text NOT NULL,
	"erstellt_von_name" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helper_hour_expenses_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "helper_hour_expenses_department_check" CHECK ("helper_hour_expenses"."abteilung" IN ('gesamtverein', 'fussball', 'korbball', 'tischtennis', 'darts', 'gymnastik', 'senioren', 'combo')),
	CONSTRAINT "helper_hour_expenses_description_check" CHECK (length(trim("helper_hour_expenses"."bezeichnung")) BETWEEN 1 AND 200),
	CONSTRAINT "helper_hour_expenses_amount_check" CHECK ("helper_hour_expenses"."betrag_cent" > 0),
	CONSTRAINT "helper_hour_expenses_cancellation_check" CHECK (("helper_hour_expenses"."storniert_am" IS NULL AND "helper_hour_expenses"."storno_grund" IS NULL AND "helper_hour_expenses"."storniert_von_user_id" IS NULL AND "helper_hour_expenses"."storniert_von_name" IS NULL) OR ("helper_hour_expenses"."storniert_am" IS NOT NULL AND length(trim("helper_hour_expenses"."storno_grund")) >= 5 AND "helper_hour_expenses"."storniert_von_user_id" IS NOT NULL AND "helper_hour_expenses"."storniert_von_name" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "helferstunde_wert_cent" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_helper_hour_expenses_department_date" ON "helper_hour_expenses" USING btree ("abteilung","datum");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_helferstunde_wert_check" CHECK ("app_settings"."helferstunde_wert_cent" BETWEEN 1 AND 100000);