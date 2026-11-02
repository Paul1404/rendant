-- Existing rows retain their accounting fields and their legacy MCP behavior.
-- The production migrator applies this entire migration in one transaction.
SET LOCAL lock_timeout = '10s';
--> statement-breakpoint
LOCK TABLE "app_settings" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TEMP TABLE rendant_mcp_preservation ON COMMIT DROP AS
SELECT count(*) AS row_count,
 md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS fingerprint
FROM public.app_settings t;
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_override" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_access_mode" text DEFAULT 'readonly';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_token_enc" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_token_sha256" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_actor_name" text DEFAULT 'Rendant MCP';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_actor_email" text DEFAULT 'mcp@rendant.local';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "mcp_updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
UPDATE "app_settings" SET "mcp_override" = coalesce("mcp_override", false), "mcp_enabled" = coalesce("mcp_enabled", false), "mcp_access_mode" = coalesce("mcp_access_mode", 'readonly'), "mcp_token_enc" = coalesce("mcp_token_enc", ''), "mcp_token_sha256" = coalesce("mcp_token_sha256", ''), "mcp_actor_name" = coalesce("mcp_actor_name", 'Rendant MCP'), "mcp_actor_email" = coalesce("mcp_actor_email", 'mcp@rendant.local'), "mcp_updated_at" = coalesce("mcp_updated_at", now());
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_override" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_enabled" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_access_mode" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_token_enc" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_token_sha256" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_actor_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_actor_email" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "mcp_updated_at" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "app_settings_mcp_token_sha256_unique" ON "app_settings" USING btree ("mcp_token_sha256") WHERE "app_settings"."mcp_token_sha256" <> '';--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_mcp_mode_check" CHECK ("app_settings"."mcp_access_mode" IN ('readonly', 'admin', 'identity'));--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_mcp_token_hash_check" CHECK ("app_settings"."mcp_token_sha256" = '' OR "app_settings"."mcp_token_sha256" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_mcp_token_pair_check" CHECK (("app_settings"."mcp_token_enc" = '') = ("app_settings"."mcp_token_sha256" = ''));
--> statement-breakpoint
DO $verify_preservation$
DECLARE before_row record; current_count bigint; current_fingerprint text;
BEGIN
 SELECT * INTO before_row FROM rendant_mcp_preservation;
 SELECT count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ARRAY['mcp_override', 'mcp_enabled', 'mcp_access_mode', 'mcp_token_enc', 'mcp_token_sha256', 'mcp_actor_name', 'mcp_actor_email', 'mcp_updated_at'])::text), '' ORDER BY md5((to_jsonb(t) - ARRAY['mcp_override', 'mcp_enabled', 'mcp_access_mode', 'mcp_token_enc', 'mcp_token_sha256', 'mcp_actor_name', 'mcp_actor_email', 'mcp_updated_at'])::text)), ''))
 INTO current_count, current_fingerprint FROM public.app_settings t;
 IF current_count <> before_row.row_count OR current_fingerprint <> before_row.fingerprint THEN
  RAISE EXCEPTION 'Tenant MCP migration changed existing club settings';
 END IF;
 IF EXISTS (SELECT 1 FROM public.app_settings WHERE mcp_override OR mcp_enabled OR mcp_token_enc <> '' OR mcp_token_sha256 <> '') THEN
  RAISE EXCEPTION 'Tenant MCP migration must not provision or replace credentials';
 END IF;
END $verify_preservation$;
