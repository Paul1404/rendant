-- Cluster roles are absent from a database-only pg_dump. Restore this role
-- before policies reference it, in the same transaction as the restored data.
DO $runtime_role$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) THEN
    RAISE EXCEPTION 'Refusing to restore into a non-empty database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Restore requires the privileged application/migration role with SUPERUSER or BYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rendant_tenant') THEN
    CREATE ROLE rendant_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rendant_tenant'
      AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication))
      OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
        WHERE r.rolname = 'rendant_tenant') THEN
    RAISE EXCEPTION 'rendant_tenant must be a restricted non-login role without other role memberships';
  END IF;
  EXECUTE format('GRANT rendant_tenant TO %I', current_user);
END $runtime_role$;
