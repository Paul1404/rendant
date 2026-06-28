ALTER TABLE "app_settings" ADD COLUMN "smtp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "smtp_host" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "smtp_port" integer DEFAULT 587 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "smtp_security" text DEFAULT 'starttls' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "smtp_user" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "smtp_password_enc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "smtp_from" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "notify_new_protokoll" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "notify_recipients" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_smtp_security_check" CHECK ("app_settings"."smtp_security" IN ('starttls', 'ssl', 'none'));--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_smtp_port_check" CHECK ("app_settings"."smtp_port" BETWEEN 1 AND 65535);