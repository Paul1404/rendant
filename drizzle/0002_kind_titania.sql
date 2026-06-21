ALTER TABLE "app_settings" ADD COLUMN "verein_strasse" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "verein_plz" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "verein_ort" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "verein_vorstand" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "verein_registergericht" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "verein_registernummer" text DEFAULT '' NOT NULL;