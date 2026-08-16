CREATE TABLE "helper_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"datum" date NOT NULL,
	"veranstaltung" text NOT NULL,
	"nachname" text DEFAULT '' NOT NULL,
	"vorname" text DEFAULT '' NOT NULL,
	"gesamtverein_minuten" integer DEFAULT 0 NOT NULL,
	"fussball_minuten" integer DEFAULT 0 NOT NULL,
	"korbball_minuten" integer DEFAULT 0 NOT NULL,
	"tischtennis_minuten" integer DEFAULT 0 NOT NULL,
	"darts_minuten" integer DEFAULT 0 NOT NULL,
	"gymnastik_minuten" integer DEFAULT 0 NOT NULL,
	"senioren_minuten" integer DEFAULT 0 NOT NULL,
	"combo_minuten" integer DEFAULT 0 NOT NULL,
	"gemeldete_summe_minuten" integer NOT NULL,
	"bemerkung" text DEFAULT '' NOT NULL,
	"quelle" text DEFAULT 'manuell' NOT NULL,
	"quelle_datei" text,
	"quelle_sha256" text,
	"quelle_blatt" text,
	"quelle_zeile" integer,
	"import_warnungen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"erstellt_von_user_id" text NOT NULL,
	"erstellt_von_name" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helper_hours_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "helper_hours_event_check" CHECK (length(trim("helper_hours"."veranstaltung")) BETWEEN 1 AND 160),
	CONSTRAINT "helper_hours_name_check" CHECK (length(trim("helper_hours"."nachname" || "helper_hours"."vorname")) > 0 OR "helper_hours"."quelle" = 'excel'),
	CONSTRAINT "helper_hours_source_check" CHECK ("helper_hours"."quelle" IN ('manuell', 'excel')),
	CONSTRAINT "helper_hours_minutes_check" CHECK ("helper_hours"."gesamtverein_minuten" >= 0 AND "helper_hours"."fussball_minuten" >= 0 AND "helper_hours"."korbball_minuten" >= 0 AND "helper_hours"."tischtennis_minuten" >= 0 AND "helper_hours"."darts_minuten" >= 0 AND "helper_hours"."gymnastik_minuten" >= 0 AND "helper_hours"."senioren_minuten" >= 0 AND "helper_hours"."combo_minuten" >= 0 AND "helper_hours"."gemeldete_summe_minuten" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hours_source_row_unique" ON "helper_hours" USING btree ("quelle_sha256","quelle_blatt","quelle_zeile");--> statement-breakpoint
CREATE INDEX "idx_helper_hours_datum" ON "helper_hours" USING btree ("datum");--> statement-breakpoint
CREATE INDEX "idx_helper_hours_name" ON "helper_hours" USING btree ("nachname","vorname");