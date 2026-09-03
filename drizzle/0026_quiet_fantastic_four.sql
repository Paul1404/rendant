ALTER TABLE "app_settings" ADD COLUMN "belegnummer_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "umsatz_ust_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "helferstunde_wert_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "verein_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "email_updated_at" timestamp with time zone DEFAULT now() NOT NULL;