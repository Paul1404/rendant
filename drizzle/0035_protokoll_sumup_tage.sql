CREATE TABLE "protokoll_sumup_tage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protokoll_id" uuid NOT NULL,
	"datum" date NOT NULL,
	"anzahl" integer DEFAULT 0 NOT NULL,
	"brutto_cent" integer DEFAULT 0 NOT NULL,
	"erstattet_cent" integer DEFAULT 0 NOT NULL,
	"kartenzahlung_cent" integer DEFAULT 0 NOT NULL,
	"transaktionen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"freigegeben_am" timestamp with time zone,
	CONSTRAINT "protokoll_sumup_tage_cent_check" CHECK ("protokoll_sumup_tage"."anzahl" >= 0 AND "protokoll_sumup_tage"."brutto_cent" >= 0 AND "protokoll_sumup_tage"."erstattet_cent" >= 0 AND "protokoll_sumup_tage"."kartenzahlung_cent" >= 0)
);
--> statement-breakpoint
ALTER TABLE "protokoll_sumup_tage" ADD CONSTRAINT "protokoll_sumup_tage_protokoll_id_protokolle_id_fk" FOREIGN KEY ("protokoll_id") REFERENCES "public"."protokolle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_protokoll_sumup_tage_protokoll_id" ON "protokoll_sumup_tage" USING btree ("protokoll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "protokoll_sumup_tage_datum_aktiv_idx" ON "protokoll_sumup_tage" USING btree ("datum") WHERE "protokoll_sumup_tage"."freigegeben_am" IS NULL;