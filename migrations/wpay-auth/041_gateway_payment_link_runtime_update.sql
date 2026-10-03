-- Allow the hosted runtime to pause and re-enable Merchant-owned reusable payment links.
-- Ownership and authorization remain enforced by the gateway service and RLS policy.
DO $gateway_link_update$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE ON wpay_auth.gateway_payment_links TO wpay_runtime;
 END IF;
END $gateway_link_update$;
