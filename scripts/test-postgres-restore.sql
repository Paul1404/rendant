DO $assert_restore$
DECLARE tab text;
BEGIN
  IF (SELECT count(*) FROM "user" WHERE email = 'restore@example.invalid') <> 1
      OR (SELECT next_sequence FROM belegnummer_sequences WHERE year = 2026) <> 17
      OR (SELECT count(*) FROM drizzle.__drizzle_migrations) < 39 THEN
    RAISE EXCEPTION 'Rows, counter or already-applied migration journal changed';
  END IF;
  IF NOT pg_has_role(current_user, 'rendant_tenant', 'MEMBER')
      OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rendant_tenant'
        AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)) THEN
    RAISE EXCEPTION 'Restored role is not safely usable';
  END IF;
  FOREACH tab IN ARRAY ARRAY['tenants', 'tenant_memberships', 'user', 'account',
      'session', 'verification', 'login_attempts', 'auth_security_events'] LOOP
    IF has_table_privilege('rendant_tenant', format('public.%I', tab), 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Control table exposed: %', tab;
    END IF;
  END LOOP;
  IF has_table_privilege('rendant_tenant', 'public.audit_events', 'UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Audit history can be rewritten';
  END IF;
END $assert_restore$;
BEGIN;
SET LOCAL ROLE rendant_tenant;
SELECT set_config('app.tenant_id', '00000000-0000-4000-8000-000000000001', true);
DO $assert_scope$
BEGIN
  IF (SELECT count(*) FROM app_settings) <> 1
      OR EXISTS(SELECT 1 FROM app_settings WHERE tenant_id <> '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Foreign tenant settings visible';
  END IF;
  UPDATE belegnummer_sequences SET next_sequence = next_sequence + 1 WHERE year = 2026;
  IF (SELECT next_sequence FROM belegnummer_sequences WHERE year = 2026) <> 18 THEN
    RAISE EXCEPTION 'Counter cannot advance';
  END IF;
  PERFORM nextval('audit_events_id_seq');
  BEGIN
    PERFORM id FROM "user";
    RAISE EXCEPTION 'Restricted role read auth data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $assert_scope$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE rendant_tenant;
DO $assert_fail_closed$
BEGIN
  IF EXISTS(SELECT 1 FROM app_settings) THEN
    RAISE EXCEPTION 'Missing tenant context exposed rows';
  END IF;
END $assert_fail_closed$;
ROLLBACK;
