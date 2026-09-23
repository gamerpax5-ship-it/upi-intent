-- Requested transition: existing customer factors become optional/off once.
-- Administrators, employees and device SMS/OTP tables are not changed.
INSERT INTO wpay_auth.security_audit(id,account_id,event,reason)
 SELECT gen_random_uuid(),a.id,'optional_authenticator_policy_enabled','Customer authenticator moved to opt-in account settings'
 FROM wpay_auth.accounts a WHERE a.account_type IN ('user','merchant');
UPDATE wpay_auth.account_security z SET enabled=false,security_version=security_version+1
 FROM wpay_auth.accounts a WHERE a.id=z.account_id AND a.account_type IN ('user','merchant');
-- Keep currently valid API keys usable across this one-time login-policy change.
-- Revoked keys, stale security versions and stale factors remain unusable.
UPDATE wpay_auth.gateway_keys k SET security_version=z.security_version
 FROM wpay_auth.account_security z JOIN wpay_auth.accounts a ON a.id=z.account_id
 WHERE a.account_type='merchant' AND k.merchant_id=a.id AND k.revoked_at IS NULL
 AND k.security_version=z.security_version-1 AND k.factor_version=z.factor_version;
UPDATE wpay_auth.accounts SET session_epoch=session_epoch+1 WHERE account_type IN ('user','merchant');
UPDATE wpay_auth.mfa_challenges c SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP)
 FROM wpay_auth.accounts a WHERE a.id=c.account_id AND a.account_type IN ('user','merchant');
UPDATE wpay_auth.recovery_codes c SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP)
 FROM wpay_auth.accounts a WHERE a.id=c.account_id AND a.account_type IN ('user','merchant');
