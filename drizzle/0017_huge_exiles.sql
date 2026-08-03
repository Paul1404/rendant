CREATE TABLE "historical_protocol_import_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest" text NOT NULL,
	"folder_name" text NOT NULL,
	"status" text DEFAULT 'editing' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"files" integer NOT NULL,
	"spreadsheet_files" integer NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone,
	"imported_by_user_id" text,
	"imported_by_name" text,
	"result_created" integer,
	"result_skipped" integer,
	CONSTRAINT "historical_protocol_import_drafts_digest_unique" UNIQUE("digest"),
	CONSTRAINT "historical_protocol_import_drafts_status_check" CHECK ("historical_protocol_import_drafts"."status" IN ('editing', 'ready', 'imported')),
	CONSTRAINT "historical_protocol_import_drafts_revision_check" CHECK ("historical_protocol_import_drafts"."revision" >= 1),
	CONSTRAINT "historical_protocol_import_drafts_counts_check" CHECK ("historical_protocol_import_drafts"."files" >= 1 AND "historical_protocol_import_drafts"."spreadsheet_files" >= 0 AND "historical_protocol_import_drafts"."spreadsheet_files" <= "historical_protocol_import_drafts"."files")
);
--> statement-breakpoint
CREATE TABLE "historical_protocol_import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"file_index" integer NOT NULL,
	"path" text NOT NULL,
	"parser_status" text NOT NULL,
	"parser_reason" text NOT NULL,
	"decision" text NOT NULL,
	"effective_date" date,
	"detail" text NOT NULL,
	"umsatzbereich" text,
	"revenue_cent" integer,
	"expenses_cent" integer,
	"classification_key" text NOT NULL,
	"classification_confidence" text NOT NULL,
	"correction_note" text,
	"detected_row" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_by_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_protocol_import_items_parser_status_check" CHECK ("historical_protocol_import_items"."parser_status" IN ('ready', 'review', 'already_imported', 'existing_protocol', 'duplicate_file', 'skipped', 'error')),
	CONSTRAINT "historical_protocol_import_items_decision_check" CHECK ("historical_protocol_import_items"."decision" IN ('include', 'review', 'exclude')),
	CONSTRAINT "historical_protocol_import_items_area_check" CHECK ("historical_protocol_import_items"."umsatzbereich" IS NULL OR "historical_protocol_import_items"."umsatzbereich" IN ('wirtschaftsbetrieb', 'veranstaltungen', 'eintrittsgelder', 'verkauf_spielfeld', 'seniorennachmittag', 'sonstiges')),
	CONSTRAINT "historical_protocol_import_items_amounts_check" CHECK (("historical_protocol_import_items"."revenue_cent" IS NULL OR "historical_protocol_import_items"."revenue_cent" >= 0) AND ("historical_protocol_import_items"."expenses_cent" IS NULL OR "historical_protocol_import_items"."expenses_cent" >= 0)),
	CONSTRAINT "historical_protocol_import_items_detail_check" CHECK (length(trim("historical_protocol_import_items"."detail")) BETWEEN 1 AND 120),
	CONSTRAINT "historical_protocol_import_items_note_check" CHECK ("historical_protocol_import_items"."correction_note" IS NULL OR length("historical_protocol_import_items"."correction_note") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_items" ADD CONSTRAINT "historical_protocol_import_items_draft_id_historical_protocol_import_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."historical_protocol_import_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_historical_protocol_import_drafts_status_updated" ON "historical_protocol_import_drafts" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_items_draft_file_unique" ON "historical_protocol_import_items" USING btree ("draft_id","file_index");--> statement-breakpoint
CREATE INDEX "idx_historical_protocol_import_items_draft_decision" ON "historical_protocol_import_items" USING btree ("draft_id","decision");--> statement-breakpoint
CREATE INDEX "idx_historical_protocol_import_items_draft_parser_status" ON "historical_protocol_import_items" USING btree ("draft_id","parser_status");