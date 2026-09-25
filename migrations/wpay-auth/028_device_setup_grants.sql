-- Metadata/pairing permissions are independent of sensitive OTP permissions.
-- Only the platform Super Admin receives the new permissions automatically;
-- Admin and Employee grants remain explicitly delegated and tenant-scoped.
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT unnest(g.permissions||ARRAY['devices.view','devices.pairing.create','devices.revoke'])),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type='super_admin';
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type='super_admin';
