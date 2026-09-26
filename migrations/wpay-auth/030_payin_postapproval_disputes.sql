-- Post-success pay-in disputes. Additive WPay-only schema; legacy/OTP objects are untouched.
CREATE TABLE wpay_auth.payin_dispute_proofs(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES wpay_auth.gateway_orders(id),
 owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 extension text NOT NULL CHECK(extension IN('pdf','png','jpg')),
 size integer NOT NULL CHECK(size>0 AND size<=1048576),
 digest text NOT NULL CHECK(digest~'^[0-9a-f]{64}$'),
 encrypted_bytes jsonb NOT NULL,scan_state text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(order_id,owner_id,digest)
);
CREATE TABLE wpay_auth.payin_disputes(
 id uuid PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.gateway_orders(id),
 merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reason text NOT NULL,statement_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payin_dispute_proofs(id),
 coverage_from timestamptz NOT NULL,coverage_through timestamptz NOT NULL,
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 commission_minor numeric(30,0) NOT NULL CHECK(commission_minor>=0),
 merchant_net_minor numeric(30,0) NOT NULL CHECK(merchant_net_minor>=0),
 original_journal_id uuid NOT NULL REFERENCES wpay_auth.business_journals(id),
 payload_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(coverage_through>=coverage_from)
);
CREATE INDEX payin_dispute_user ON wpay_auth.payin_disputes(user_id,created_at DESC);
CREATE INDEX payin_dispute_merchant ON wpay_auth.payin_disputes(merchant_id,created_at DESC);
CREATE TABLE wpay_auth.payin_dispute_responses(
 id uuid PRIMARY KEY,dispute_id uuid NOT NULL REFERENCES wpay_auth.payin_disputes(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),reason text NOT NULL,
 proof_id uuid REFERENCES wpay_auth.payin_dispute_proofs(id),payload_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(dispute_id,payload_digest)
);
CREATE TABLE wpay_auth.payin_dispute_resolutions(
 dispute_id uuid PRIMARY KEY REFERENCES wpay_auth.payin_disputes(id),
 outcome text NOT NULL CHECK(outcome IN('payment_valid','payment_invalid')),
 reason text NOT NULL,actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['payin_dispute_proofs','payin_disputes','payin_dispute_responses','payin_dispute_resolutions'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $$;

-- Existing accounts receive only their own role's dispute grants. Scoped Admin/Employee
-- permissions remain explicit/delegated; Super Admin receives operational view/resolve/proof.
UPDATE wpay_auth.grants g SET permissions=ARRAY(
 SELECT DISTINCT p FROM unnest(g.permissions || CASE
  WHEN a.account_type='merchant' THEN ARRAY['merchant.payin_dispute.view','merchant.payin_dispute.open']
  WHEN a.account_type='user' THEN ARRAY['user.payin_dispute.view','user.payin_dispute.respond']
  WHEN a.account_type='super_admin' THEN ARRAY['payin_dispute.view','payin_dispute.resolve','payin_dispute.proof']
  ELSE ARRAY[]::text[] END) p ORDER BY p),
 permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN('merchant','user','super_admin');
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1
 WHERE account_type IN('merchant','user','super_admin');
