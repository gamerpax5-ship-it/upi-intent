-- Additive hosted-runtime visibility repair after schema 017.
-- Does not alter financial data or legacy objects.
DO $runtime_visibility$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT USAGE ON SCHEMA wpay_auth TO wpay_runtime;

  GRANT SELECT,INSERT ON
   wpay_auth.merchant_settlement_withdrawals,
   wpay_auth.parking_beneficiaries,
   wpay_auth.parking_beneficiary_confirmations,
   wpay_auth.parking_orders,
   wpay_auth.parking_locks,
   wpay_auth.parking_submissions
  TO wpay_runtime;

  GRANT UPDATE(state,completed_at,completion_digest,encrypted_completion)
   ON wpay_auth.merchant_settlement_withdrawals TO wpay_runtime;
  GRANT UPDATE(revoked_at) ON wpay_auth.parking_beneficiaries TO wpay_runtime;
  GRANT UPDATE(state,closed_at) ON wpay_auth.parking_orders TO wpay_runtime;
  GRANT UPDATE(state,cooldown_until,closed_at) ON wpay_auth.parking_locks TO wpay_runtime;

  GRANT EXECUTE ON FUNCTION wpay_auth.live_workflow_guard() TO wpay_runtime;
 END IF;
END $runtime_visibility$;
