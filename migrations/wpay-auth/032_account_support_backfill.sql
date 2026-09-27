-- Backfill support rows for WPay accounts created before the current panel/runtime completion.
-- Data-only migration: no legacy/public/OTP tables are modified.
INSERT INTO wpay_auth.eligibility(account_id)
SELECT a.id FROM wpay_auth.accounts a
WHERE a.account_type IN ('user','merchant','admin','super_admin','employee')
  AND NOT EXISTS(SELECT 1 FROM wpay_auth.eligibility e WHERE e.account_id=a.id);

INSERT INTO wpay_auth.account_security(account_id)
SELECT a.id FROM wpay_auth.accounts a
WHERE NOT EXISTS(SELECT 1 FROM wpay_auth.account_security s WHERE s.account_id=a.id);

INSERT INTO wpay_auth.preferences(account_id)
SELECT a.id FROM wpay_auth.accounts a
WHERE NOT EXISTS(SELECT 1 FROM wpay_auth.preferences p WHERE p.account_id=a.id);
