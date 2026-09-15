-- Optional backend-only role, provisioned separately on the isolated hosted DB.
-- Development schema owners keep their existing behavior. No role creation,
-- password change, legacy grant, legacy schema or legacy data mutation occurs.
DO $runtime$
DECLARE item record; privileges text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime'
             AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
   RAISE EXCEPTION 'WPAY_RUNTIME_ROLE_UNSAFE';
  END IF;
  GRANT USAGE ON SCHEMA wpay_auth TO wpay_runtime;
  FOR item IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='wpay_auth' LOOP
   privileges := CASE
    WHEN item.tablename IN ('schema_migrations','bootstrap_state') THEN 'SELECT'
    WHEN item.tablename IN ('audit_events','security_audit','commercial_versions') THEN 'SELECT, INSERT'
    WHEN item.tablename='csrf_challenges' THEN 'SELECT, INSERT, UPDATE, DELETE'
    ELSE 'SELECT, INSERT, UPDATE' END;
   EXECUTE pg_catalog.format('GRANT %s ON TABLE wpay_auth.%I TO wpay_runtime',privileges,item.tablename);
   -- Backend role only. Browser/public roles still have neither ACL nor policy.
   EXECUTE pg_catalog.format('CREATE POLICY wpay_backend ON wpay_auth.%I TO wpay_runtime USING (true) WITH CHECK (true)',item.tablename);
  END LOOP;
 END IF;
END $runtime$;
