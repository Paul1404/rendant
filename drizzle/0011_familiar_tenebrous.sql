CREATE TABLE "anlass_aliase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_norm" text NOT NULL,
	"anlass_katalog_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anlass_aliase_alias_norm_unique" UNIQUE("alias_norm")
);
--> statement-breakpoint
CREATE TABLE "anlass_katalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"typ" text DEFAULT 'wiederkehrend' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anlass_katalog_name_unique" UNIQUE("name"),
	CONSTRAINT "anlass_katalog_typ_check" CHECK ("anlass_katalog"."typ" IN ('wiederkehrend', 'einmalig')),
	CONSTRAINT "anlass_katalog_name_check" CHECK (length(trim("anlass_katalog"."name")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "anlass_katalog_id" uuid;--> statement-breakpoint
ALTER TABLE "protokolle" ADD COLUMN "anlass_katalog_id" uuid;--> statement-breakpoint
ALTER TABLE "anlass_aliase" ADD CONSTRAINT "anlass_aliase_anlass_katalog_id_anlass_katalog_id_fk" FOREIGN KEY ("anlass_katalog_id") REFERENCES "public"."anlass_katalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anlass_aliase_katalog" ON "anlass_aliase" USING btree ("anlass_katalog_id");--> statement-breakpoint
CREATE INDEX "idx_anlass_katalog_order" ON "anlass_katalog" USING btree ("reihenfolge","name");--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_anlass_katalog_id_anlass_katalog_id_fk" FOREIGN KEY ("anlass_katalog_id") REFERENCES "public"."anlass_katalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protokolle" ADD CONSTRAINT "protokolle_anlass_katalog_id_anlass_katalog_id_fk" FOREIGN KEY ("anlass_katalog_id") REFERENCES "public"."anlass_katalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_historical_revenues_anlass_katalog_id" ON "historical_revenues" USING btree ("anlass_katalog_id");--> statement-breakpoint
CREATE INDEX "idx_protokolle_anlass_katalog_id" ON "protokolle" USING btree ("anlass_katalog_id");