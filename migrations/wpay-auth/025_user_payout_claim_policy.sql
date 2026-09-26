-- Source-bank registration is optional for payout work: an approved User may
-- earn initial collection capacity by paying a merchant beneficiary first.
ALTER TABLE wpay_auth.payout_claims ALTER COLUMN bank_id DROP NOT NULL;
ALTER TABLE wpay_auth.payout_claims ALTER COLUMN bank_version DROP NOT NULL;
ALTER TABLE wpay_auth.payout_claims ALTER COLUMN account_key DROP NOT NULL;
ALTER TABLE wpay_auth.payout_claims ADD CONSTRAINT payout_claim_optional_bank
 CHECK ((bank_id IS NULL AND bank_version IS NULL AND account_key IS NULL)
 OR (bank_id IS NOT NULL AND bank_version IS NOT NULL AND account_key IS NOT NULL));

-- Timeout approval has no human actor. Its journal explicitly records the
-- merchant-review timeout; never impersonate a merchant or employee.
ALTER TABLE wpay_auth.payout_settlements ALTER COLUMN actor_id DROP NOT NULL;
CREATE INDEX payout_submitted_review_time ON wpay_auth.payout_submissions(created_at,payout_id);
