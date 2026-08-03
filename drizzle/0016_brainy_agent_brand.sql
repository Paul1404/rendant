ALTER TABLE "historical_revenues" ADD COLUMN "quelle_sha256" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "quelle_pfad" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "quelle_format" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "quelle_belegnummer" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "quelle_datum_herkunft" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "kassennummer" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "kassenbezeichnung" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "gezaehlt_von" text;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "wechselgeld_cent" integer;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "kartenzahlung_cent" integer;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "gezaehlt_cent" integer;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "tageseinnahmen_bar_cent" integer;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "stueckelung" jsonb;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "umsatz_ust" jsonb;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "import_warnungen" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "historical_revenues_quelle_sha256_unique" ON "historical_revenues" USING btree ("quelle_sha256") WHERE "historical_revenues"."quelle_sha256" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_quelle_pfad_check" CHECK ("historical_revenues"."quelle_pfad" IS NULL OR length("historical_revenues"."quelle_pfad") <= 1000);--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_quelle_format_check" CHECK ("historical_revenues"."quelle_format" IS NULL OR "historical_revenues"."quelle_format" IN ('ods', 'xlsx'));--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_quelle_datum_herkunft_check" CHECK ("historical_revenues"."quelle_datum_herkunft" IS NULL OR "historical_revenues"."quelle_datum_herkunft" IN ('workbook', 'file_modified'));--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_source_amounts_check" CHECK (("historical_revenues"."wechselgeld_cent" IS NULL OR "historical_revenues"."wechselgeld_cent" >= 0) AND ("historical_revenues"."kartenzahlung_cent" IS NULL OR "historical_revenues"."kartenzahlung_cent" >= 0) AND ("historical_revenues"."gezaehlt_cent" IS NULL OR "historical_revenues"."gezaehlt_cent" >= 0) AND ("historical_revenues"."tageseinnahmen_bar_cent" IS NULL OR "historical_revenues"."tageseinnahmen_bar_cent" >= 0));