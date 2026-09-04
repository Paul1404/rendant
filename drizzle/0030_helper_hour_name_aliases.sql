CREATE TABLE "helper_hour_name_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"von_nachname" text NOT NULL,
	"von_vorname" text NOT NULL,
	"nach_nachname" text NOT NULL,
	"nach_vorname" text NOT NULL,
	"bemerkung" text DEFAULT '' NOT NULL,
	"erstellt_von_user_id" text NOT NULL,
	"erstellt_von_name" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helper_hour_name_aliases_source_check" CHECK (length(trim("helper_hour_name_aliases"."von_nachname" || "helper_hour_name_aliases"."von_vorname")) > 0),
	CONSTRAINT "helper_hour_name_aliases_target_check" CHECK (length(trim("helper_hour_name_aliases"."nach_nachname")) > 0 AND length(trim("helper_hour_name_aliases"."nach_vorname")) > 0),
	CONSTRAINT "helper_hour_name_aliases_distinct_check" CHECK (lower(trim("helper_hour_name_aliases"."von_nachname")) <> lower(trim("helper_hour_name_aliases"."nach_nachname")) OR lower(trim("helper_hour_name_aliases"."von_vorname")) <> lower(trim("helper_hour_name_aliases"."nach_vorname")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_name_aliases_source_unique" ON "helper_hour_name_aliases" USING btree (lower(trim("von_nachname")),lower(trim("von_vorname")));