-- Preserve checksummed 008. The runtime fingerprint requires visibility of all
-- WPay columns, while device eligibility writes remain operator-only.
ALTER TABLE wpay_auth.business_routing_requirement_events ENABLE ROW LEVEL SECURITY;
DO $access$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT ON wpay_auth.business_routing_requirement_events TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.business_routing_requirement_events TO wpay_runtime USING(true);
 END IF;
END $access$;
-- Existing super administrators receive the same funding grants as new ones.
-- Ordinary Admin/Employee grants are unchanged and still require explicit scope.
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT p FROM unnest(g.permissions||ARRAY['deposits.view','deposits.review','deposits.approve','deposits.reject']) p ORDER BY p),permission_version=g.permission_version+1 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type='super_admin';
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type='super_admin';
