ALTER TABLE "historical_protocol_import_drafts" DROP CONSTRAINT "historical_protocol_import_drafts_status_check";--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" ADD COLUMN "archived_by_name" text;--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" ADD CONSTRAINT "historical_protocol_import_drafts_status_check" CHECK ("historical_protocol_import_drafts"."status" IN ('editing', 'ready', 'imported', 'archived'));