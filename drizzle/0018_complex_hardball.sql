CREATE TABLE "historical_protocol_import_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_by_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_protocol_import_review_items_status_check" CHECK ("historical_protocol_import_review_items"."status" IN ('pending', 'accepted', 'issue', 'not_applicable')),
	CONSTRAINT "historical_protocol_import_review_items_note_check" CHECK ("historical_protocol_import_review_items"."note" IS NULL OR length(trim("historical_protocol_import_review_items"."note")) BETWEEN 3 AND 1000),
	CONSTRAINT "historical_protocol_import_review_items_revision_check" CHECK ("historical_protocol_import_review_items"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "historical_protocol_import_review_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"filters" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by_user_id" text,
	"completed_by_name" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "historical_protocol_import_review_phases_kind_check" CHECK ("historical_protocol_import_review_phases"."kind" IN ('source', 'date', 'amount', 'assignment', 'tax', 'denomination', 'final')),
	CONSTRAINT "historical_protocol_import_review_phases_status_check" CHECK ("historical_protocol_import_review_phases"."status" IN ('active', 'completed')),
	CONSTRAINT "historical_protocol_import_review_phases_name_check" CHECK (length(trim("historical_protocol_import_review_phases"."name")) BETWEEN 3 AND 120),
	CONSTRAINT "historical_protocol_import_review_phases_revision_check" CHECK ("historical_protocol_import_review_phases"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" ADD CONSTRAINT "historical_protocol_import_review_items_phase_id_historical_protocol_import_review_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."historical_protocol_import_review_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" ADD CONSTRAINT "historical_protocol_import_review_items_item_id_historical_protocol_import_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."historical_protocol_import_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_phases" ADD CONSTRAINT "historical_protocol_import_review_phases_draft_id_historical_protocol_import_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."historical_protocol_import_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_review_items_unique" ON "historical_protocol_import_review_items" USING btree ("phase_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_historical_protocol_import_review_items_phase_status" ON "historical_protocol_import_review_items" USING btree ("phase_id","status");--> statement-breakpoint
CREATE INDEX "idx_historical_protocol_import_review_items_item" ON "historical_protocol_import_review_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_review_phases_name_unique" ON "historical_protocol_import_review_phases" USING btree ("draft_id","name");--> statement-breakpoint
CREATE INDEX "idx_historical_protocol_import_review_phases_draft_status" ON "historical_protocol_import_review_phases" USING btree ("draft_id","status");