-- Manual approval is explicit administrative attestation, never fabricated bank evidence.
ALTER TABLE wpay_auth.gateway_orders DROP CONSTRAINT gateway_orders_evidence_state_check;
ALTER TABLE wpay_auth.gateway_orders ADD CHECK(evidence_state IN('unavailable','claim_submitted','observed','verified','rejected','admin_approved'));
ALTER TABLE wpay_auth.business_financial_events ALTER COLUMN utr_digest DROP NOT NULL;
ALTER TABLE wpay_auth.business_financial_events DROP CONSTRAINT business_financial_events_source_check;
ALTER TABLE wpay_auth.business_financial_events ADD CHECK(source IN('normal','statement_recovered','admin_manual'));
ALTER TABLE wpay_auth.business_financial_events ADD CHECK((source='admin_manual' AND utr_digest IS NULL) OR (source<>'admin_manual' AND utr_digest IS NOT NULL));
CREATE TABLE wpay_auth.admin_payment_actions(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES wpay_auth.gateway_orders(id),actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('approve','callback')),reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 300),
 payload_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(actor_id,request_id)
);
CREATE UNIQUE INDEX admin_payment_approval_once ON wpay_auth.admin_payment_actions(order_id) WHERE kind='approve';
CREATE INDEX admin_payment_action_history ON wpay_auth.admin_payment_actions(order_id,created_at);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.admin_payment_actions FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.admin_payment_actions FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();
ALTER TABLE wpay_auth.admin_payment_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.admin_payment_actions FROM PUBLIC;
-- Keep original event IDs, payloads and every delivery attempt on manual retries.
ALTER TABLE wpay_auth.gateway_outbox ADD COLUMN delivery_budget integer NOT NULL DEFAULT 8 CHECK(delivery_budget>=8);
ALTER TABLE wpay_auth.gateway_outbox DROP CONSTRAINT gateway_outbox_attempts_check;
ALTER TABLE wpay_auth.gateway_outbox ADD CHECK(attempts>=0 AND attempts<=delivery_budget);
DO $grants$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.admin_payment_actions TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.admin_payment_actions TO wpay_runtime USING(true) WITH CHECK(true);
  GRANT UPDATE(delivery_budget,endpoint_id) ON wpay_auth.gateway_outbox TO wpay_runtime;
 END IF;
END $grants$;
WITH changed AS (
 UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT unnest(g.permissions||ARRAY['payment_admin.approve','payment_admin.callback','webhooks.view'])),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type='super_admin' AND 'transactions.view'=ANY(g.permissions)
 RETURNING g.account_id,g.permission_version
) UPDATE wpay_auth.accounts a SET permission_version=c.permission_version,session_epoch=a.session_epoch+1 FROM changed c WHERE a.id=c.account_id;
