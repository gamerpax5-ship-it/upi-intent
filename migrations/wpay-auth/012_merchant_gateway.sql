-- Separate WPay gateway. No legacy objects, grants or mounts are changed.
CREATE TABLE wpay_auth.gateway_keys(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 prefix text NOT NULL,digest text NOT NULL UNIQUE,label text NOT NULL,
 scopes text[] NOT NULL,security_version integer NOT NULL,factor_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,last_used_at timestamptz,revoked_at timestamptz
);
CREATE INDEX gateway_keys_owner ON wpay_auth.gateway_keys(merchant_id,created_at DESC);
CREATE TABLE wpay_auth.gateway_rate(
 key_id uuid PRIMARY KEY REFERENCES wpay_auth.gateway_keys(id),window_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,hits integer NOT NULL DEFAULT 0
);
CREATE TABLE wpay_auth.gateway_endpoints(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 url text NOT NULL,encrypted_secret jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX gateway_endpoint_owner ON wpay_auth.gateway_endpoints(merchant_id,created_at DESC,id);
CREATE TABLE wpay_auth.gateway_orders(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reservation_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_reservations(id),
 reference text NOT NULL,idempotency_key text NOT NULL,payload_digest text NOT NULL,
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='INR'),
 description text NOT NULL,metadata jsonb NOT NULL,origin text NOT NULL CHECK(origin IN('manual','api')),
 token_digest text NOT NULL UNIQUE,encrypted_token jsonb NOT NULL,
 endpoint_id uuid REFERENCES wpay_auth.gateway_endpoints(id),
 state text NOT NULL CHECK(state IN('pending_payment','verification_pending','successful','failed','expired','cancelled','recovery_review')),
 evidence_state text NOT NULL DEFAULT 'unavailable' CHECK(evidence_state IN('unavailable','claim_submitted','observed','verified','rejected')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at timestamptz NOT NULL,paid_at timestamptz,
 claim_attempts integer NOT NULL DEFAULT 0 CHECK(claim_attempts BETWEEN 0 AND 5),next_verify_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(merchant_id,reference),UNIQUE(merchant_id,idempotency_key)
);
CREATE INDEX gateway_orders_owner ON wpay_auth.gateway_orders(merchant_id,created_at DESC,id);
CREATE INDEX gateway_orders_expiry ON wpay_auth.gateway_orders(expires_at) WHERE state IN('pending_payment','verification_pending');
CREATE TABLE wpay_auth.gateway_claims(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES wpay_auth.gateway_orders(id),
 encrypted_utr jsonb NOT NULL,utr_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(order_id,utr_digest)
);
CREATE INDEX gateway_claim_order ON wpay_auth.gateway_claims(order_id,created_at);
CREATE TABLE wpay_auth.gateway_outbox(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES wpay_auth.gateway_orders(id),merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 endpoint_id uuid REFERENCES wpay_auth.gateway_endpoints(id),event_type text NOT NULL CHECK(event_type IN('payment.success','payment.failed','payment.expired','payment.recovered')),
 body text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','delivered','failed','unconfigured')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_id uuid,lease_until timestamptz,last_code integer,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,delivered_at timestamptz,
 UNIQUE(order_id,event_type)
);
CREATE INDEX gateway_outbox_due ON wpay_auth.gateway_outbox(next_attempt_at) WHERE state IN('pending','leased');
CREATE TABLE wpay_auth.gateway_attempts(
 id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES wpay_auth.gateway_outbox(id),attempt integer NOT NULL,
 code integer NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(event_id,attempt)
);
DO $gateway$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['gateway_keys','gateway_rate','gateway_endpoints','gateway_orders','gateway_claims','gateway_outbox','gateway_attempts'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab IN('gateway_endpoints','gateway_claims','gateway_attempts') THEN
   EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
   EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(last_used_at,revoked_at) ON wpay_auth.gateway_keys TO wpay_runtime;
  GRANT UPDATE ON wpay_auth.gateway_rate TO wpay_runtime;
  GRANT UPDATE(state,evidence_state,paid_at,claim_attempts,next_verify_at) ON wpay_auth.gateway_orders TO wpay_runtime;
  GRANT UPDATE(state,attempts,next_attempt_at,lease_id,lease_until,last_code,delivered_at) ON wpay_auth.gateway_outbox TO wpay_runtime;
  GRANT INSERT ON wpay_auth.upi_order_outcomes TO wpay_runtime;
 END IF;
END $gateway$;
-- New explicit gateway grants; unrelated Merchant financial permissions stay gated.
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT unnest(g.permissions || CASE WHEN a.account_type='merchant' THEN ARRAY['merchant.gateway.view','merchant.gateway.create','merchant.gateway.manage'] ELSE ARRAY['transactions.view','webhooks.view'] END)),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN('merchant','super_admin');
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type IN('merchant','super_admin');
