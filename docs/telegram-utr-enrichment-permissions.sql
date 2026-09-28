-- Explicitly approved by the owner on 2026-09-29 for masked Telegram UTR messages.
-- Applied to the existing source database, NOT the hosted WPay auth database.
-- No table-level SELECT, writes, OTP grants, or membership changes.
GRANT SELECT (sender, sms_body) ON public.device_transactions TO wpay_operational_reader;

-- Rollback if the enrichment feature is removed:
-- REVOKE SELECT (sender, sms_body) ON public.device_transactions FROM wpay_operational_reader;
