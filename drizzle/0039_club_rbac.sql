-- Only the authorization control plane changes. Existing memberships,
-- invitations, signed accounting records and object references stay intact.
-- The production migrator executes all statements in a single transaction.
SET LOCAL lock_timeout = '10s';
--> statement-breakpoint
LOCK TABLE "tenants", "tenant_memberships", "invitations" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TEMP TABLE rendant_rbac_preservation (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  fingerprint text NOT NULL
) ON COMMIT DROP;
--> statement-breakpoint
DO $preserve$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['tenants', 'tenant_memberships', 'invitations'] LOOP
    EXECUTE format(
      'INSERT INTO rendant_rbac_preservation SELECT %L, count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ''role_permissions'' - ''role_permissions_version'')::text), '''' ORDER BY md5((to_jsonb(t) - ''role_permissions'' - ''role_permissions_version'')::text)), '''')) FROM public.%I t', tab, tab);
  END LOOP;
END $preserve$;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "role_permissions" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "role_permissions_version" integer DEFAULT 1;
--> statement-breakpoint
UPDATE "tenants" SET "role_permissions" = coalesce("role_permissions", '{}'::jsonb),
  "role_permissions_version" = coalesce("role_permissions_version", 1);
--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "role_permissions" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "role_permissions_version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenant_memberships" DROP CONSTRAINT "tenant_memberships_role_check";
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_role_check" CHECK ("tenant_memberships"."role" IN ('user', 'admin', 'board'));
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_check" CHECK ("invitations"."role" IN ('user', 'admin', 'board'));
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_role_permissions_check" CHECK (jsonb_typeof("tenants"."role_permissions") = 'object');
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_role_permissions_version_check" CHECK ("tenants"."role_permissions_version" >= 1);
--> statement-breakpoint
DO $verify_preservation$
DECLARE saved record; current_count bigint; current_fingerprint text;
BEGIN
  FOR saved IN SELECT * FROM rendant_rbac_preservation LOOP
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(md5((to_jsonb(t) - ''role_permissions'' - ''role_permissions_version'')::text), '''' ORDER BY md5((to_jsonb(t) - ''role_permissions'' - ''role_permissions_version'')::text)), '''')) FROM public.%I t', saved.table_name)
      INTO current_count, current_fingerprint;
    IF current_count <> saved.row_count OR current_fingerprint IS DISTINCT FROM saved.fingerprint THEN
      RAISE EXCEPTION 'Role migration preservation check failed for %', saved.table_name;
    END IF;
  END LOOP;
  IF has_table_privilege('rendant_tenant', 'public.tenants', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'Authorization settings must remain outside the business role';
  END IF;
END $verify_preservation$;
