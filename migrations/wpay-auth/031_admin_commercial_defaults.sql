-- Tenant-scoped Admin defaults for new WPay Merchant commercial terms.
-- Additive WPay-only schema; legacy/OTP objects are untouched.
CREATE TABLE wpay_auth.admin_commercial_defaults(
 tenant_id text PRIMARY KEY,
 merchant_inr_per_usdt text NOT NULL DEFAULT '107'
  CHECK(merchant_inr_per_usdt ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
 merchant_fixed_payout_fee text NOT NULL DEFAULT '6'
  CHECK(merchant_fixed_payout_fee ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
 merchant_payin_fee text NOT NULL DEFAULT '1.2'
  CHECK(merchant_payin_fee ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
 merchant_payout_fee text NOT NULL DEFAULT '0.8'
  CHECK(merchant_payout_fee ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
 merchant_payment_link_ttl_seconds integer NOT NULL DEFAULT 300
  CHECK(merchant_payment_link_ttl_seconds BETWEEN 30 AND 900),
 actor_id uuid REFERENCES wpay_auth.accounts(id),
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE wpay_auth.admin_commercial_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.admin_commercial_defaults FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON wpay_auth.admin_commercial_defaults TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.admin_commercial_defaults TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $$;
