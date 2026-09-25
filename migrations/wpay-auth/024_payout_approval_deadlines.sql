-- New payout requests require one administrative decision per batch or single order.
ALTER TABLE wpay_auth.payout_orders ADD COLUMN deadline_at timestamptz;
ALTER TABLE wpay_auth.payout_orders ADD COLUMN transfer_mode text NOT NULL DEFAULT 'bank' CHECK(transfer_mode IN('bank','upi'));
ALTER TABLE wpay_auth.payout_orders DROP CONSTRAINT payout_orders_state_check;
ALTER TABLE wpay_auth.payout_orders ADD CONSTRAINT payout_orders_state_check CHECK(state IN('pending_admin','open','claimed','submitted','merchant_rejected_review','successful','cancelled','not_paid','failed','rejected'));
ALTER TABLE wpay_auth.payout_orders ALTER COLUMN state SET DEFAULT 'pending_admin';
CREATE INDEX payout_deadline_pending ON wpay_auth.payout_orders(deadline_at) WHERE state IN('pending_admin','open');
-- Separate terminal guard preserves the existing immutable binding trigger.
CREATE FUNCTION wpay_auth.payout_deadline_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.state IN('failed','rejected') THEN RAISE EXCEPTION 'terminal payout record'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION wpay_auth.payout_deadline_guard() FROM PUBLIC;
CREATE TRIGGER terminal_deadline BEFORE UPDATE ON wpay_auth.payout_orders FOR EACH ROW EXECUTE FUNCTION wpay_auth.payout_deadline_guard();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT EXECUTE ON FUNCTION wpay_auth.payout_deadline_guard() TO wpay_runtime;
 END IF;
END $$;

-- PostgreSQL resolves record fields before boolean short-circuiting. The previous
-- shared trigger referenced revoked_at/released_at on payout rows lacking them.
-- Keep every immutability rule and access table-specific fields only in branches.
CREATE OR REPLACE FUNCTION wpay_auth.payout_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE mutable text[];
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'immutable payout records'; END IF;
 mutable=CASE TG_TABLE_NAME
 WHEN 'payout_orders' THEN ARRAY['state','completed_at']
 WHEN 'payout_claims' THEN ARRAY['state','closed_at','cooldown_until']
 WHEN 'commission_withdrawals' THEN ARRAY['state','completed_at','completion_digest','encrypted_completion']
 WHEN 'payout_capabilities' THEN ARRAY['revoked_at']
 WHEN 'commission_holds' THEN ARRAY['released_at'] END;
 IF mutable IS NULL OR (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN RAISE EXCEPTION 'immutable payout binding'; END IF;
 IF TG_TABLE_NAME IN('payout_orders','payout_claims','commission_withdrawals') THEN
  IF OLD.state IN('successful','cancelled','not_paid','consumed','released','expired','completed','rejected','failed') THEN RAISE EXCEPTION 'terminal payout record'; END IF;
 END IF;
 IF TG_TABLE_NAME='payout_capabilities' THEN
  IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'terminal hold record'; END IF;
 END IF;
 IF TG_TABLE_NAME='commission_holds' THEN
  IF OLD.released_at IS NOT NULL THEN RAISE EXCEPTION 'terminal hold record'; END IF;
 END IF;
 RETURN NEW;
END $$;
