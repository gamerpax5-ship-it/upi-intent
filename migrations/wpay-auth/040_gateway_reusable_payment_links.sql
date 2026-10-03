-- Reusable open-amount Merchant payment links.
-- Each public submission creates a fresh gateway order; the parent link itself never represents a payment.
CREATE TABLE wpay_auth.gateway_payment_links(
 id uuid PRIMARY KEY,
 merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reference text NOT NULL,
 description text NOT NULL,
 token_digest text NOT NULL UNIQUE,
 encrypted_token jsonb NOT NULL,
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(merchant_id,reference)
);
CREATE INDEX gateway_payment_links_owner ON wpay_auth.gateway_payment_links(merchant_id,created_at DESC,id);

CREATE TABLE wpay_auth.gateway_payment_link_rate(
 link_id uuid PRIMARY KEY REFERENCES wpay_auth.gateway_payment_links(id),
 window_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 hits integer NOT NULL DEFAULT 0 CHECK(hits>=0)
);

ALTER TABLE wpay_auth.gateway_orders
 ADD COLUMN payment_link_id uuid REFERENCES wpay_auth.gateway_payment_links(id);
CREATE INDEX gateway_orders_payment_link ON wpay_auth.gateway_orders(payment_link_id,created_at DESC)
 WHERE payment_link_id IS NOT NULL;

ALTER TABLE wpay_auth.gateway_orders DROP CONSTRAINT gateway_orders_origin_check;
ALTER TABLE wpay_auth.gateway_orders
 ADD CONSTRAINT gateway_orders_origin_check CHECK(origin IN('manual','api','link'));

ALTER TABLE wpay_auth.gateway_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE wpay_auth.gateway_payment_link_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.gateway_payment_links FROM PUBLIC;
REVOKE ALL ON wpay_auth.gateway_payment_link_rate FROM PUBLIC;

DO $gateway_links$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.gateway_payment_links TO wpay_runtime;
  GRANT SELECT,INSERT,UPDATE ON wpay_auth.gateway_payment_link_rate TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.gateway_payment_links TO wpay_runtime USING(true) WITH CHECK(true);
  CREATE POLICY backend_only ON wpay_auth.gateway_payment_link_rate TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $gateway_links$;
