-- Tenant-scoped Admin defaults for new WPay commercial terms.
-- Additive WPay-only schema; legacy/OTP objects are untouched.
CREATE TABLE wpay_auth.admin_commercial_defaults(
 tenant_id text PRIMARY KEY,
 merchant_inr_per_usdt text NOT NULL DEFAULT '107.00'
  CHECK(merchant_inr_per_usdt ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
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
