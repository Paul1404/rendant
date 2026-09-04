CREATE TABLE "helper_hour_allocations" (
	"helper_hour_id" uuid NOT NULL,
	"kategorie_id" uuid NOT NULL,
	"minuten" integer NOT NULL,
	CONSTRAINT "helper_hour_allocations_helper_hour_id_kategorie_id_pk" PRIMARY KEY("helper_hour_id","kategorie_id"),
	CONSTRAINT "helper_hour_allocations_minutes_check" CHECK ("helper_hour_allocations"."minuten" > 0)
);
--> statement-breakpoint
CREATE TABLE "helper_hour_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"art" text DEFAULT 'abteilung' NOT NULL,
	"sortierung" integer DEFAULT 0 NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"erstellt_von_user_id" text,
	"erstellt_von_name" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"aktualisiert_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helper_hour_categories_code_unique" UNIQUE("code"),
	CONSTRAINT "helper_hour_categories_code_check" CHECK ("helper_hour_categories"."code" ~ '^[a-z0-9][a-z0-9_]{0,39}$'),
	CONSTRAINT "helper_hour_categories_label_check" CHECK (length(trim("helper_hour_categories"."label")) BETWEEN 1 AND 60),
	CONSTRAINT "helper_hour_categories_art_check" CHECK ("helper_hour_categories"."art" IN ('verein', 'abteilung'))
);
--> statement-breakpoint
INSERT INTO "helper_hour_categories" ("code", "label", "art", "sortierung", "system")
VALUES
	('gesamtverein', 'Vereinsbeitrag', 'verein', 0, true),
	('fussball', 'Fußball', 'abteilung', 1, true),
	('korbball', 'Korbball', 'abteilung', 2, true),
	('tischtennis', 'Tischtennis', 'abteilung', 3, true),
	('darts', 'Darts', 'abteilung', 4, true),
	('gymnastik', 'Gymnastik', 'abteilung', 5, true),
	('senioren', 'Senioren', 'abteilung', 6, true),
	('combo', 'Combo', 'abteilung', 7, true)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" DROP CONSTRAINT "helper_hour_expenses_department_check";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP CONSTRAINT "helper_hours_manual_total_check";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP CONSTRAINT "helper_hours_minutes_check";--> statement-breakpoint
DROP INDEX "idx_helper_hour_expenses_department_date";--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ALTER COLUMN "abteilung" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD COLUMN "kategorie_id" uuid;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD COLUMN "quelle" text DEFAULT 'manuell' NOT NULL;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD COLUMN "quelle_datei" text;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD COLUMN "quelle_sha256" text;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD COLUMN "quelle_blatt" text;--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD COLUMN "quelle_zeile" integer;--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" ADD CONSTRAINT "helper_hour_allocations_helper_hour_id_helper_hours_id_fk" FOREIGN KEY ("helper_hour_id") REFERENCES "public"."helper_hours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" ADD CONSTRAINT "helper_hour_allocations_kategorie_id_helper_hour_categories_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "public"."helper_hour_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_helper_hour_allocations_category" ON "helper_hour_allocations" USING btree ("kategorie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_categories_label_unique" ON "helper_hour_categories" USING btree (lower(trim("label")));--> statement-breakpoint
CREATE INDEX "idx_helper_hour_categories_sort" ON "helper_hour_categories" USING btree ("sortierung","label");--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD CONSTRAINT "helper_hour_expenses_kategorie_id_helper_hour_categories_id_fk" FOREIGN KEY ("kategorie_id") REFERENCES "public"."helper_hour_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_expenses_source_row_unique" ON "helper_hour_expenses" USING btree ("quelle_sha256","quelle_blatt","quelle_zeile");--> statement-breakpoint
CREATE INDEX "idx_helper_hour_expenses_category_date" ON "helper_hour_expenses" USING btree ("kategorie_id","datum");--> statement-breakpoint
CREATE INDEX "idx_helper_hours_sheet" ON "helper_hours" USING btree ("quelle","quelle_blatt");--> statement-breakpoint
INSERT INTO "helper_hour_allocations" ("helper_hour_id", "kategorie_id", "minuten")
SELECT "h"."id", "c"."id", "quelle"."minuten"
FROM "helper_hours" AS "h"
CROSS JOIN LATERAL (
	VALUES
		('gesamtverein', "h"."gesamtverein_minuten"),
		('fussball', "h"."fussball_minuten"),
		('korbball', "h"."korbball_minuten"),
		('tischtennis', "h"."tischtennis_minuten"),
		('darts', "h"."darts_minuten"),
		('gymnastik', "h"."gymnastik_minuten"),
		('senioren', "h"."senioren_minuten"),
		('combo', "h"."combo_minuten")
) AS "quelle" ("code", "minuten")
JOIN "helper_hour_categories" AS "c" ON "c"."code" = "quelle"."code"
WHERE "quelle"."minuten" > 0
ON CONFLICT ("helper_hour_id", "kategorie_id") DO NOTHING;--> statement-breakpoint
UPDATE "helper_hour_expenses" AS "e"
SET "kategorie_id" = "c"."id"
FROM "helper_hour_categories" AS "c"
WHERE "c"."code" = "e"."abteilung" AND "e"."kategorie_id" IS NULL;--> statement-breakpoint
DO $$
DECLARE
	"alt_minuten" bigint;
	"neu_minuten" bigint;
	"offene_ausgaben" bigint;
BEGIN
	SELECT COALESCE(SUM(
		"gesamtverein_minuten" + "fussball_minuten" + "korbball_minuten"
		+ "tischtennis_minuten" + "darts_minuten" + "gymnastik_minuten"
		+ "senioren_minuten" + "combo_minuten"
	), 0) INTO "alt_minuten" FROM "helper_hours";
	SELECT COALESCE(SUM("minuten"), 0) INTO "neu_minuten" FROM "helper_hour_allocations";
	IF "alt_minuten" <> "neu_minuten" THEN
		RAISE EXCEPTION 'Helferstunden-Migration: % Minuten in Spalten, aber % Minuten übernommen', "alt_minuten", "neu_minuten";
	END IF;
	SELECT count(*) INTO "offene_ausgaben"
	FROM "helper_hour_expenses"
	WHERE "abteilung" IS NOT NULL AND "kategorie_id" IS NULL;
	IF "offene_ausgaben" > 0 THEN
		RAISE EXCEPTION 'Helferstunden-Migration: % Ausgaben ohne zugeordnete Kategorie', "offene_ausgaben";
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "gesamtverein_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "fussball_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "korbball_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "tischtennis_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "darts_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "gymnastik_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "senioren_minuten";--> statement-breakpoint
ALTER TABLE "helper_hours" DROP COLUMN "combo_minuten";--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD CONSTRAINT "helper_hour_expenses_source_check" CHECK ("helper_hour_expenses"."quelle" IN ('manuell', 'excel'));--> statement-breakpoint
ALTER TABLE "helper_hours" ADD CONSTRAINT "helper_hours_minutes_check" CHECK ("helper_hours"."gemeldete_summe_minuten" > 0);