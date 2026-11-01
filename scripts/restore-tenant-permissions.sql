-- The portable archive intentionally omits source owners and ACLs. Restore
-- only the application's documented privileges, never all tables or roles.
-- Legacy archives without tenants receive these permissions in migration 0038.
DO $tenant_permissions$
DECLARE
  business_tables text[] := ARRAY[
    'anlass_aliase', 'anlass_katalog', 'app_settings', 'audit_events',
    'ausgaben', 'belegnummer_sequences', 'cash_registers', 'datev_deliveries',
    'helper_hour_aliases', 'helper_hour_allocations', 'helper_hour_categories',
    'helper_hour_events', 'helper_hour_expenses', 'helper_hour_note_rules',
    'helper_hour_persons', 'helper_hours', 'historical_protocol_import_drafts',
    'historical_protocol_import_items', 'historical_protocol_import_review_items',
    'historical_protocol_import_review_phases', 'historical_revenues',
    'historical_source_archives', 'invitations', 'protokoll_sumup_tage',
    'protokoll_umsatz_ust', 'protokolle'
  ];
  control_tables text[] := ARRAY[
    'tenants', 'tenant_memberships', 'user', 'account', 'session',
    'verification', 'login_attempts', 'auth_security_events'
  ];
  tab text;
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO rendant_tenant;
  FOREACH tab IN ARRAY business_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tab AND c.relrowsecurity AND c.relforcerowsecurity)
        OR NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_roles r ON r.oid = ANY(p.polroles)
          WHERE n.nspname = 'public' AND c.relname = tab AND r.rolname = 'rendant_tenant'
            AND p.polname = 'tenant_isolation' AND p.polcmd = '*'
            AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) THEN
      RAISE EXCEPTION 'Missing tenant isolation on public.%', tab;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM rendant_tenant', tab);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO rendant_tenant', tab);
  END LOOP;
  FOREACH tab IN ARRAY control_tables LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM rendant_tenant', tab);
    IF has_table_privilege('rendant_tenant', format('public.%I', tab), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Unexpected inherited or public access to control table public.%', tab;
    END IF;
  END LOOP;
  REVOKE UPDATE, DELETE ON TABLE public.audit_events FROM rendant_tenant;
  GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO rendant_tenant;
END $tenant_permissions$;
