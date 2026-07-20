ALTER TABLE "protokolle" ADD COLUMN "erstellt_von_user_id" text;--> statement-breakpoint
ALTER TABLE "protokolle" ADD COLUMN "erstellt_von_name" text;--> statement-breakpoint
ALTER TABLE "protokolle" ADD COLUMN "storniert_von_user_id" text;--> statement-breakpoint
ALTER TABLE "protokolle" ADD COLUMN "storniert_von_name" text;--> statement-breakpoint
CREATE INDEX "idx_protokolle_erstellt_von_user_id" ON "protokolle" USING btree ("erstellt_von_user_id");--> statement-breakpoint
CREATE INDEX "idx_protokolle_storniert_von_user_id" ON "protokolle" USING btree ("storniert_von_user_id");