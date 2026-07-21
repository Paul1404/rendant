CREATE TABLE "historical_revenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"anlass_datum" date NOT NULL,
	"anlass" text NOT NULL,
	"vergleichsgruppe" text NOT NULL,
	"umsatz_cent" integer NOT NULL,
	"ausgaben_cent" integer DEFAULT 0 NOT NULL,
	"bemerkung" text,
	"quellreferenz" text,
	"erstellt_von_user_id" text NOT NULL,
	"erstellt_von_name" text NOT NULL,
	"erstellt_von_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"storniert_am" timestamp with time zone,
	"storniert_von_user_id" text,
	"storniert_von_name" text,
	"storniert_von_email" text,
	"storno_grund" text,
	CONSTRAINT "historical_revenues_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "historical_revenues_anlass_check" CHECK (length(trim("historical_revenues"."anlass")) BETWEEN 1 AND 200),
	CONSTRAINT "historical_revenues_vergleichsgruppe_check" CHECK (length(trim("historical_revenues"."vergleichsgruppe")) BETWEEN 1 AND 120),
	CONSTRAINT "historical_revenues_umsatz_cent_check" CHECK ("historical_revenues"."umsatz_cent" >= 0),
	CONSTRAINT "historical_revenues_ausgaben_cent_check" CHECK ("historical_revenues"."ausgaben_cent" >= 0),
	CONSTRAINT "historical_revenues_bemerkung_check" CHECK ("historical_revenues"."bemerkung" IS NULL OR length("historical_revenues"."bemerkung") <= 2000),
	CONSTRAINT "historical_revenues_quellreferenz_check" CHECK ("historical_revenues"."quellreferenz" IS NULL OR length("historical_revenues"."quellreferenz") <= 500),
	CONSTRAINT "historical_revenues_storno_check" CHECK (("historical_revenues"."storniert_am" IS NULL AND "historical_revenues"."storniert_von_user_id" IS NULL AND "historical_revenues"."storniert_von_name" IS NULL AND "historical_revenues"."storniert_von_email" IS NULL AND "historical_revenues"."storno_grund" IS NULL) OR ("historical_revenues"."storniert_am" IS NOT NULL AND "historical_revenues"."storniert_von_user_id" IS NOT NULL AND "historical_revenues"."storniert_von_name" IS NOT NULL AND "historical_revenues"."storniert_von_email" IS NOT NULL AND length(trim("historical_revenues"."storno_grund")) BETWEEN 5 AND 500))
);
--> statement-breakpoint
CREATE INDEX "idx_historical_revenues_anlass_datum" ON "historical_revenues" USING btree ("anlass_datum");--> statement-breakpoint
CREATE INDEX "idx_historical_revenues_erstellt_von_user_id" ON "historical_revenues" USING btree ("erstellt_von_user_id");--> statement-breakpoint
CREATE INDEX "idx_historical_revenues_storniert_am" ON "historical_revenues" USING btree ("storniert_am");