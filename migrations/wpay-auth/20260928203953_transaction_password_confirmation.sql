-- Keep login provenance separate from password confirmation for transactions.
ALTER TABLE wpay_auth.sessions ADD COLUMN transaction_password_at timestamptz
 CONSTRAINT sessions_transaction_password_time CHECK (
  transaction_password_at IS NULL OR
  (transaction_password_at >= created_at AND transaction_password_at < expires_at)
 );
