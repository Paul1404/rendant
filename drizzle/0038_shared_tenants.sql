-- Existing SVU rows are assigned ownership in place. No accounting value,
-- document path, credential or historical audit row is rewritten or deleted.
-- The migrator wraps this migration in a single transaction. Locking prevents
-- the previous app revision from changing rows while preservation is checked.
SET LOCAL lock_timeout = '10s';
--> statement-breakpoint
LOCK TABLE "account", "anlass_aliase", "anlass_katalog", "app_settings", "audit_events", "ausgaben", "belegnummer_sequences", "cash_registers", "datev_deliveries", "helper_hour_aliases", "helper_hour_allocations", "helper_hour_categories", "helper_hour_events", "helper_hour_expenses", "helper_hour_note_rules", "helper_hour_persons", "helper_hours", "historical_protocol_import_drafts", "historical_protocol_import_items", "historical_protocol_import_review_items", "historical_protocol_import_review_phases", "historical_revenues", "historical_source_archives", "invitations", "login_attempts", "protokoll_sumup_tage", "protokoll_umsatz_ust", "protokolle", "session", "user", "verification" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TEMP TABLE rendant_tenant_preservation (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  fingerprint text NOT NULL
) ON COMMIT DROP;
--> statement-breakpoint
DO $preserve$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['account', 'anlass_aliase', 'anlass_katalog', 'app_settings', 'audit_events', 'ausgaben', 'belegnummer_sequences', 'cash_registers', 'datev_deliveries', 'helper_hour_aliases', 'helper_hour_allocations', 'helper_hour_categories', 'helper_hour_events', 'helper_hour_expenses', 'helper_hour_note_rules', 'helper_hour_persons', 'helper_hours', 'historical_protocol_import_drafts', 'historical_protocol_import_items', 'historical_protocol_import_review_items', 'historical_protocol_import_review_phases', 'historical_revenues', 'historical_source_archives', 'invitations', 'login_attempts', 'protokoll_sumup_tage', 'protokoll_umsatz_ust', 'protokolle', 'session', 'user', 'verification'] LOOP
    EXECUTE format(
      'INSERT INTO rendant_tenant_preservation SELECT %L, count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ''tenant_id'')::text), '''' ORDER BY md5((to_jsonb(t) - ''tenant_id'')::text)), '''')) FROM public.%I t', tab, tab);
  END LOOP;
END $preserve$;
--> statement-breakpoint
CREATE TABLE "auth_security_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text DEFAULT 'auth' NOT NULL,
	"action" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"actor_name" text,
	"actor_role" text,
	"subject_type" text,
	"subject_id" text,
	"subject_label" text,
	"request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"notify_protokoll" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "tenant_memberships_role_check" CHECK ("tenant_memberships"."role" IN ('user', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_check" CHECK ("tenants"."slug" ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
	CONSTRAINT "tenants_name_check" CHECK (length(trim("tenants"."name")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
INSERT INTO "tenants" ("id", "slug", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'svu',
  coalesce((SELECT nullif(trim("vereinsname"), '') FROM "app_settings" WHERE "id" = 1), 'SVU'));
--> statement-breakpoint
INSERT INTO "tenant_memberships" ("tenant_id", "user_id", "role", "banned", "notify_protokoll", "created_at", "updated_at")
SELECT '00000000-0000-4000-8000-000000000001', "id",
  CASE WHEN "role" = 'admin' THEN 'admin' ELSE 'user' END,
  coalesce("banned", false), "notify_protokoll", "created_at", "updated_at"
FROM "user";
--> statement-breakpoint
-- A required column is added nullable, populated, then constrained. A
-- context-free write must fail instead of silently becoming an SVU booking.
ALTER TABLE "audit_events" DISABLE TRIGGER audit_events_reject_update_delete;
--> statement-breakpoint
DO $backfill$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['anlass_aliase', 'anlass_katalog', 'app_settings', 'audit_events', 'ausgaben', 'belegnummer_sequences', 'cash_registers', 'datev_deliveries', 'helper_hour_aliases', 'helper_hour_allocations', 'helper_hour_categories', 'helper_hour_events', 'helper_hour_expenses', 'helper_hour_note_rules', 'helper_hour_persons', 'helper_hours', 'historical_protocol_import_drafts', 'historical_protocol_import_items', 'historical_protocol_import_review_items', 'historical_protocol_import_review_phases', 'historical_revenues', 'historical_source_archives', 'invitations', 'protokoll_sumup_tage', 'protokoll_umsatz_ust', 'protokolle'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid', tab);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L::uuid', tab, '00000000-0000-4000-8000-000000000001');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tab);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT nullif(current_setting(''app.tenant_id'', true), '''')::uuid', tab);
  END LOOP;
END $backfill$;
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE TRIGGER audit_events_reject_update_delete;
--> statement-breakpoint
ALTER TABLE "anlass_aliase" DROP CONSTRAINT "anlass_aliase_alias_norm_unique";
--> statement-breakpoint
ALTER TABLE "anlass_katalog" DROP CONSTRAINT "anlass_katalog_name_unique";
--> statement-breakpoint
ALTER TABLE "cash_registers" DROP CONSTRAINT "cash_registers_kassennummer_unique";
--> statement-breakpoint
ALTER TABLE "helper_hour_categories" DROP CONSTRAINT "helper_hour_categories_code_unique";
--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" DROP CONSTRAINT "helper_hour_expenses_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "helper_hours" DROP CONSTRAINT "helper_hours_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" DROP CONSTRAINT "historical_protocol_import_drafts_digest_unique";
--> statement-breakpoint
ALTER TABLE "historical_revenues" DROP CONSTRAINT "historical_revenues_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "protokolle" DROP CONSTRAINT "protokolle_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "protokolle" DROP CONSTRAINT "protokolle_belegnummer_unique";
--> statement-breakpoint
DROP INDEX "helper_hour_aliases_unique";
--> statement-breakpoint
DROP INDEX "helper_hour_categories_label_unique";
--> statement-breakpoint
DROP INDEX "helper_hour_events_name_unique";
--> statement-breakpoint
DROP INDEX "helper_hour_expenses_source_row_unique";
--> statement-breakpoint
DROP INDEX "helper_hour_note_rules_vermerk_unique";
--> statement-breakpoint
DROP INDEX "helper_hour_persons_name_unique";
--> statement-breakpoint
DROP INDEX "helper_hours_source_row_unique";
--> statement-breakpoint
DROP INDEX "historical_protocol_import_items_draft_file_unique";
--> statement-breakpoint
DROP INDEX "historical_protocol_import_review_items_unique";
--> statement-breakpoint
DROP INDEX "historical_protocol_import_review_phases_name_unique";
--> statement-breakpoint
DROP INDEX "historical_revenues_quelle_sha256_unique";
--> statement-breakpoint
DROP INDEX "historical_revenues_korrigiert_von_unique";
--> statement-breakpoint
DROP INDEX "protokoll_sumup_tage_datum_aktiv_idx";
--> statement-breakpoint
-- These keys previously identified the one deployment-wide singleton,
-- sequence year or source hash. Their values remain unchanged within SVU.
DO $keys$
DECLARE tab text; constraint_name text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['app_settings', 'belegnummer_sequences', 'historical_source_archives'] LOOP
    SELECT conname INTO STRICT constraint_name FROM pg_constraint
      WHERE conrelid = format('public.%I', tab)::regclass AND contype = 'p';
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tab, constraint_name);
  END LOOP;
END $keys$;
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenant_id_id_pk" PRIMARY KEY("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "belegnummer_sequences" ADD CONSTRAINT "belegnummer_sequences_tenant_id_year_pk" PRIMARY KEY("tenant_id","year");
--> statement-breakpoint
ALTER TABLE "historical_source_archives" ADD CONSTRAINT "historical_source_archives_tenant_id_sha256_pk" PRIMARY KEY("tenant_id","sha256");
--> statement-breakpoint
CREATE INDEX "auth_security_events_event_at_idx" ON "auth_security_events" USING btree ("event_at");
--> statement-breakpoint
CREATE INDEX "tenant_memberships_user_idx" ON "tenant_memberships" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "anlass_aliase_alias_norm_unique" ON "anlass_aliase" USING btree ("tenant_id","alias_norm");
--> statement-breakpoint
CREATE INDEX "anlass_aliase_tenant_idx" ON "anlass_aliase" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "anlass_aliase_tenant_id_unique" ON "anlass_aliase" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "anlass_katalog_name_unique" ON "anlass_katalog" USING btree ("tenant_id","name");
--> statement-breakpoint
CREATE INDEX "anlass_katalog_tenant_idx" ON "anlass_katalog" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "anlass_katalog_tenant_id_unique" ON "anlass_katalog" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "audit_events_tenant_idx" ON "audit_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_tenant_id_unique" ON "audit_events" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "ausgaben_tenant_idx" ON "ausgaben" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ausgaben_tenant_id_unique" ON "ausgaben" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "cash_registers_kassennummer_unique" ON "cash_registers" USING btree ("tenant_id","kassennummer");
--> statement-breakpoint
CREATE INDEX "cash_registers_tenant_idx" ON "cash_registers" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "cash_registers_tenant_id_unique" ON "cash_registers" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "datev_deliveries_tenant_idx" ON "datev_deliveries" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "helper_hour_aliases_tenant_idx" ON "helper_hour_aliases" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_aliases_tenant_id_unique" ON "helper_hour_aliases" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "helper_hour_allocations_tenant_idx" ON "helper_hour_allocations" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_categories_code_unique" ON "helper_hour_categories" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX "helper_hour_categories_tenant_idx" ON "helper_hour_categories" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_categories_tenant_id_unique" ON "helper_hour_categories" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "helper_hour_events_tenant_idx" ON "helper_hour_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_events_tenant_id_unique" ON "helper_hour_events" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_expenses_idempotency_key_unique" ON "helper_hour_expenses" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "helper_hour_expenses_tenant_idx" ON "helper_hour_expenses" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_expenses_tenant_id_unique" ON "helper_hour_expenses" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "helper_hour_note_rules_tenant_idx" ON "helper_hour_note_rules" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_note_rules_tenant_id_unique" ON "helper_hour_note_rules" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "helper_hour_persons_tenant_idx" ON "helper_hour_persons" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_persons_tenant_id_unique" ON "helper_hour_persons" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hours_idempotency_key_unique" ON "helper_hours" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "helper_hours_tenant_idx" ON "helper_hours" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hours_tenant_id_unique" ON "helper_hours" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_drafts_digest_unique" ON "historical_protocol_import_drafts" USING btree ("tenant_id","digest");
--> statement-breakpoint
CREATE INDEX "historical_protocol_import_drafts_tenant_idx" ON "historical_protocol_import_drafts" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_drafts_tenant_id_unique" ON "historical_protocol_import_drafts" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "historical_protocol_import_items_tenant_idx" ON "historical_protocol_import_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_items_tenant_id_unique" ON "historical_protocol_import_items" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "historical_protocol_import_review_items_tenant_idx" ON "historical_protocol_import_review_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_review_items_tenant_id_unique" ON "historical_protocol_import_review_items" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "historical_protocol_import_review_phases_tenant_idx" ON "historical_protocol_import_review_phases" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_review_phases_tenant_id_unique" ON "historical_protocol_import_review_phases" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_revenues_idempotency_key_unique" ON "historical_revenues" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "historical_revenues_tenant_idx" ON "historical_revenues" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_revenues_tenant_id_unique" ON "historical_revenues" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_tenant_id_unique" ON "invitations" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "protokoll_sumup_tage_tenant_idx" ON "protokoll_sumup_tage" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "protokoll_sumup_tage_tenant_id_unique" ON "protokoll_sumup_tage" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "protokoll_umsatz_ust_tenant_idx" ON "protokoll_umsatz_ust" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "protokoll_umsatz_ust_tenant_id_unique" ON "protokoll_umsatz_ust" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "protokolle_idempotency_key_unique" ON "protokolle" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "protokolle_belegnummer_unique" ON "protokolle" USING btree ("tenant_id","belegnummer");
--> statement-breakpoint
CREATE INDEX "protokolle_tenant_idx" ON "protokolle" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "protokolle_tenant_id_unique" ON "protokolle" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_aliases_unique" ON "helper_hour_aliases" USING btree ("tenant_id","art",lower(trim("schreibweise")));
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_categories_label_unique" ON "helper_hour_categories" USING btree ("tenant_id",lower(trim("label")));
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_events_name_unique" ON "helper_hour_events" USING btree ("tenant_id",lower(trim("name")));
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_expenses_source_row_unique" ON "helper_hour_expenses" USING btree ("tenant_id","quelle_sha256","quelle_blatt","quelle_zeile");
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_note_rules_vermerk_unique" ON "helper_hour_note_rules" USING btree ("tenant_id",lower(trim("vermerk")));
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hour_persons_name_unique" ON "helper_hour_persons" USING btree ("tenant_id",lower(trim("nachname")),lower(trim("vorname")));
--> statement-breakpoint
CREATE UNIQUE INDEX "helper_hours_source_row_unique" ON "helper_hours" USING btree ("tenant_id","quelle_sha256","quelle_blatt","quelle_zeile");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_items_draft_file_unique" ON "historical_protocol_import_items" USING btree ("tenant_id","draft_id","file_index");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_review_items_unique" ON "historical_protocol_import_review_items" USING btree ("tenant_id","phase_id","item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_protocol_import_review_phases_name_unique" ON "historical_protocol_import_review_phases" USING btree ("tenant_id","draft_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_revenues_quelle_sha256_unique" ON "historical_revenues" USING btree ("tenant_id","quelle_sha256") WHERE "historical_revenues"."quelle_sha256" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_revenues_korrigiert_von_unique" ON "historical_revenues" USING btree ("tenant_id","korrigiert_von_id") WHERE "historical_revenues"."korrigiert_von_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "protokoll_sumup_tage_datum_aktiv_idx" ON "protokoll_sumup_tage" USING btree ("tenant_id","datum") WHERE "protokoll_sumup_tage"."freigegeben_am" IS NULL;
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "anlass_aliase" ADD CONSTRAINT "anlass_aliase_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "anlass_aliase" ADD CONSTRAINT "anlass_aliase_anlass_katalog_id_tenant_fk" FOREIGN KEY ("tenant_id","anlass_katalog_id") REFERENCES "public"."anlass_katalog"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "anlass_katalog" ADD CONSTRAINT "anlass_katalog_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_protokoll_id_tenant_fk" FOREIGN KEY ("tenant_id","protokoll_id") REFERENCES "public"."protokolle"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "belegnummer_sequences" ADD CONSTRAINT "belegnummer_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "datev_deliveries" ADD CONSTRAINT "datev_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "datev_deliveries" ADD CONSTRAINT "datev_deliveries_protokoll_id_tenant_fk" FOREIGN KEY ("tenant_id","protokoll_id") REFERENCES "public"."protokolle"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_aliases" ADD CONSTRAINT "helper_hour_aliases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_aliases" ADD CONSTRAINT "helper_hour_aliases_person_id_tenant_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."helper_hour_persons"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_aliases" ADD CONSTRAINT "helper_hour_aliases_veranstaltung_id_tenant_fk" FOREIGN KEY ("tenant_id","veranstaltung_id") REFERENCES "public"."helper_hour_events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" ADD CONSTRAINT "helper_hour_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" ADD CONSTRAINT "helper_hour_allocations_helper_hour_id_tenant_fk" FOREIGN KEY ("tenant_id","helper_hour_id") REFERENCES "public"."helper_hours"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" ADD CONSTRAINT "helper_hour_allocations_kategorie_id_tenant_fk" FOREIGN KEY ("tenant_id","kategorie_id") REFERENCES "public"."helper_hour_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_categories" ADD CONSTRAINT "helper_hour_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_events" ADD CONSTRAINT "helper_hour_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD CONSTRAINT "helper_hour_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ADD CONSTRAINT "helper_hour_expenses_kategorie_id_tenant_fk" FOREIGN KEY ("tenant_id","kategorie_id") REFERENCES "public"."helper_hour_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_note_rules" ADD CONSTRAINT "helper_hour_note_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_note_rules" ADD CONSTRAINT "helper_hour_note_rules_kategorie_id_tenant_fk" FOREIGN KEY ("tenant_id","kategorie_id") REFERENCES "public"."helper_hour_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hour_persons" ADD CONSTRAINT "helper_hour_persons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hours" ADD CONSTRAINT "helper_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hours" ADD CONSTRAINT "helper_hours_person_id_tenant_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."helper_hour_persons"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helper_hours" ADD CONSTRAINT "helper_hours_veranstaltung_id_tenant_fk" FOREIGN KEY ("tenant_id","veranstaltung_id") REFERENCES "public"."helper_hour_events"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" ADD CONSTRAINT "historical_protocol_import_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_items" ADD CONSTRAINT "historical_protocol_import_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_items" ADD CONSTRAINT "historical_protocol_import_items_draft_id_tenant_fk" FOREIGN KEY ("tenant_id","draft_id") REFERENCES "public"."historical_protocol_import_drafts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" ADD CONSTRAINT "historical_protocol_import_review_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" ADD CONSTRAINT "historical_protocol_import_review_items_phase_id_tenant_fk" FOREIGN KEY ("tenant_id","phase_id") REFERENCES "public"."historical_protocol_import_review_phases"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" ADD CONSTRAINT "historical_protocol_import_review_items_item_id_tenant_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."historical_protocol_import_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_phases" ADD CONSTRAINT "historical_protocol_import_review_phases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_phases" ADD CONSTRAINT "historical_protocol_import_review_phases_draft_id_tenant_fk" FOREIGN KEY ("tenant_id","draft_id") REFERENCES "public"."historical_protocol_import_drafts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_anlass_katalog_id_tenant_fk" FOREIGN KEY ("tenant_id","anlass_katalog_id") REFERENCES "public"."anlass_katalog"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_revenues" ADD CONSTRAINT "historical_revenues_korrigiert_von_id_tenant_fk" FOREIGN KEY ("tenant_id","korrigiert_von_id") REFERENCES "public"."historical_revenues"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_source_archives" ADD CONSTRAINT "historical_source_archives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protokoll_sumup_tage" ADD CONSTRAINT "protokoll_sumup_tage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protokoll_sumup_tage" ADD CONSTRAINT "protokoll_sumup_tage_protokoll_id_tenant_fk" FOREIGN KEY ("tenant_id","protokoll_id") REFERENCES "public"."protokolle"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protokoll_umsatz_ust" ADD CONSTRAINT "protokoll_umsatz_ust_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protokoll_umsatz_ust" ADD CONSTRAINT "protokoll_umsatz_ust_protokoll_id_tenant_fk" FOREIGN KEY ("tenant_id","protokoll_id") REFERENCES "public"."protokolle"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protokolle" ADD CONSTRAINT "protokolle_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "protokolle" ADD CONSTRAINT "protokolle_anlass_katalog_id_tenant_fk" FOREIGN KEY ("tenant_id","anlass_katalog_id") REFERENCES "public"."anlass_katalog"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- The runtime explicitly SET LOCAL ROLEs to this restricted role even
-- when the managed database connection itself is owned by a superuser.
DO $runtime_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rendant_tenant') THEN
    CREATE ROLE rendant_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rendant_tenant'
      AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolinherit)) THEN
    RAISE EXCEPTION 'rendant_tenant must remain a restricted non-login role';
  END IF;
  EXECUTE format('GRANT rendant_tenant TO %I', current_user);
END $runtime_role$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rendant_tenant;
--> statement-breakpoint
REVOKE ALL ON TABLE "tenants", "tenant_memberships", "user", "account", "session", "verification", "login_attempts", "auth_security_events" FROM rendant_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "anlass_aliase", "anlass_katalog", "app_settings", "audit_events", "ausgaben", "belegnummer_sequences", "cash_registers", "datev_deliveries", "helper_hour_aliases", "helper_hour_allocations", "helper_hour_categories", "helper_hour_events", "helper_hour_expenses", "helper_hour_note_rules", "helper_hour_persons", "helper_hours", "historical_protocol_import_drafts", "historical_protocol_import_items", "historical_protocol_import_review_items", "historical_protocol_import_review_phases", "historical_revenues", "historical_source_archives", "invitations", "protokoll_sumup_tage", "protokoll_umsatz_ust", "protokolle" TO rendant_tenant;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE "audit_events" FROM rendant_tenant;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "audit_events_id_seq" TO rendant_tenant;
--> statement-breakpoint
ALTER TABLE "anlass_aliase" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anlass_aliase" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anlass_katalog" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anlass_katalog" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ausgaben" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ausgaben" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "belegnummer_sequences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "belegnummer_sequences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cash_registers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cash_registers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "datev_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "datev_deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_aliases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_aliases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_allocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_expenses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_note_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_note_rules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_persons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hour_persons" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hours" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "helper_hours" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_phases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_protocol_import_review_phases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_revenues" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_revenues" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_source_archives" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "historical_source_archives" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protokoll_sumup_tage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protokoll_sumup_tage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protokoll_umsatz_ust" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protokoll_umsatz_ust" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protokolle" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "protokolle" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "anlass_aliase" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "anlass_katalog" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app_settings" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_events" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ausgaben" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "belegnummer_sequences" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cash_registers" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "datev_deliveries" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_aliases" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_allocations" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_categories" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_events" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_expenses" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_note_rules" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hour_persons" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "helper_hours" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "historical_protocol_import_drafts" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "historical_protocol_import_items" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "historical_protocol_import_review_items" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "historical_protocol_import_review_phases" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "historical_revenues" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "historical_source_archives" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invitations" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "protokoll_sumup_tage" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "protokoll_umsatz_ust" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "protokolle" AS PERMISSIVE FOR ALL TO "rendant_tenant" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
-- Abort the whole migration if any pre-existing value was changed, lost
-- or assigned to another tenant. The fingerprints never leave PostgreSQL.
DO $verify_preservation$
DECLARE saved record; tab text; actual_count bigint; actual_fingerprint text; misplaced bigint;
BEGIN
  FOR saved IN SELECT * FROM rendant_tenant_preservation LOOP
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ''tenant_id'')::text), '''' ORDER BY md5((to_jsonb(t) - ''tenant_id'')::text)), '''')) FROM public.%I t', saved.table_name)
      INTO actual_count, actual_fingerprint;
    IF actual_count <> saved.row_count OR actual_fingerprint <> saved.fingerprint THEN
      RAISE EXCEPTION 'SVU preservation check failed for %', saved.table_name;
    END IF;
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['anlass_aliase', 'anlass_katalog', 'app_settings', 'audit_events', 'ausgaben', 'belegnummer_sequences', 'cash_registers', 'datev_deliveries', 'helper_hour_aliases', 'helper_hour_allocations', 'helper_hour_categories', 'helper_hour_events', 'helper_hour_expenses', 'helper_hour_note_rules', 'helper_hour_persons', 'helper_hours', 'historical_protocol_import_drafts', 'historical_protocol_import_items', 'historical_protocol_import_review_items', 'historical_protocol_import_review_phases', 'historical_revenues', 'historical_source_archives', 'invitations', 'protokoll_sumup_tage', 'protokoll_umsatz_ust', 'protokolle'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id <> %L::uuid', tab, '00000000-0000-4000-8000-000000000001') INTO misplaced;
    IF misplaced <> 0 THEN RAISE EXCEPTION 'SVU ownership check failed for %', tab; END IF;
  END LOOP;
  IF (SELECT count(*) FROM "tenant_memberships" WHERE "tenant_id" = '00000000-0000-4000-8000-000000000001') <> (SELECT count(*) FROM "user") THEN
    RAISE EXCEPTION 'SVU membership backfill failed';
  END IF;
END $verify_preservation$;
