CREATE TABLE "datev_deliveries" (
	"protokoll_id" uuid NOT NULL,
	"document" text NOT NULL,
	"state" text NOT NULL,
	"attempt_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"pdf_key" text NOT NULL,
	"pdf_bytes_sha256" text NOT NULL,
	"recipient" text NOT NULL,
	"sender" text NOT NULL,
	"requested_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"message_id" text,
	CONSTRAINT "datev_deliveries_protokoll_id_document_pk" PRIMARY KEY("protokoll_id","document"),
	CONSTRAINT "datev_document_check" CHECK ("datev_deliveries"."document" IN ('original', 'storno')),
	CONSTRAINT "datev_state_check" CHECK ("datev_deliveries"."state" IN ('ready', 'sending', 'sent', 'uncertain')),
	CONSTRAINT "datev_pdf_hash_check" CHECK ("datev_deliveries"."pdf_bytes_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "datev_sent_at_check" CHECK (("datev_deliveries"."state" = 'sent') = ("datev_deliveries"."sent_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "datev_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "datev_recipient" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "datev_sender" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "datev_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "datev_deliveries" ADD CONSTRAINT "datev_deliveries_protokoll_id_protokolle_id_fk" FOREIGN KEY ("protokoll_id") REFERENCES "public"."protokolle"("id") ON DELETE restrict ON UPDATE no action;