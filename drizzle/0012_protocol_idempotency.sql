ALTER TABLE "protokolle" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "protokolle" ADD COLUMN "idempotency_payload_sha256" text;--> statement-breakpoint
ALTER TABLE "protokolle" ADD CONSTRAINT "protokolle_idempotency_key_unique" UNIQUE("idempotency_key");