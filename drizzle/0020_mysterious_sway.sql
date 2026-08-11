CREATE TABLE "historical_source_archives" (
	"sha256" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_by_user_id" text NOT NULL,
	"archived_by_name" text NOT NULL,
	CONSTRAINT "historical_source_archives_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "historical_source_archives_sha256_check" CHECK ("historical_source_archives"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "historical_source_archives_size_check" CHECK ("historical_source_archives"."size_bytes" > 0 AND "historical_source_archives"."size_bytes" <= 41943040),
	CONSTRAINT "historical_source_archives_filename_check" CHECK (length(trim("historical_source_archives"."original_filename")) BETWEEN 1 AND 255)
);
--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD COLUMN "korrigiert_von_id" uuid;--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_korrigiert_von_id_historical_revenues_id_fk" FOREIGN KEY ("korrigiert_von_id") REFERENCES "public"."historical_revenues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "historical_revenues_korrigiert_von_unique" ON "historical_revenues" USING btree ("korrigiert_von_id") WHERE "historical_revenues"."korrigiert_von_id" IS NOT NULL;