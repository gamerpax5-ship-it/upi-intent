-- Run only against the inspected WPay legacy Supabase database.
-- These tables are accessed through WPay's server, not Supabase client JWTs.
-- Preserve column grants and application ownership checks; never FORCE RLS
-- or grant BYPASSRLS to the operational reader.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='12s';
DO $preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_operational_reader' AND NOT rolsuper AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'Expected restricted reader missing';
 END IF;
 -- Supabase records postgres as role administrator without SET/INHERIT.
 -- Only that already-privileged management role is expected here.
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE r.rolname='wpay_operational_reader' AND NOT(member.rolname='postgres' AND member.rolbypassrls)) THEN
  RAISE EXCEPTION 'Unexpected reader role members';
 END IF;
END $preflight$;
DO $hardening$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['payment_orders','device_pairings','device_transactions','devices','device_diagnostics','payment_links','device_location_history','payment_claims','device_credit_events','device_credit_candidates','device_otp_events','statement_imports','statement_credit_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated, PUBLIC',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['devices','device_pairings','device_otp_events','device_transactions','statement_credit_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='wpay_server_reader_select') THEN
   EXECUTE format('CREATE POLICY wpay_server_reader_select ON public.%I FOR SELECT TO wpay_operational_reader USING (true)',t);
  END IF;
 END LOOP;
END $hardening$;
ALTER FUNCTION public.wpay_capture_location_history() SET search_path=pg_catalog,public,pg_temp;
-- No new table/column privileges, no writes for the reader, no client policies.
COMMIT;
