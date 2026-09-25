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
