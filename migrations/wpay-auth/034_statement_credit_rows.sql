-- Persist parsed statement credit rows for Admin reconciliation display.
-- This does not make statement rows authoritative payment evidence by itself.
CREATE TABLE wpay_auth.bank_statement_credits(
 id uuid PRIMARY KEY,
 import_id uuid NOT NULL REFERENCES wpay_auth.bank_statement_imports(id),
 owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 bank_id uuid NOT NULL,
 bank_version integer NOT NULL,
 txn_date text NOT NULL,
 utr text NOT NULL CHECK(utr~'^[0-9]{12}$'),
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 mode text NOT NULL CHECK(mode='UPI'),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version),
 UNIQUE(import_id,utr,amount_minor,txn_date)
);
CREATE INDEX bank_statement_credits_owner_time ON wpay_auth.bank_statement_credits(owner_id,created_at DESC,id);
CREATE INDEX bank_statement_credits_utr ON wpay_auth.bank_statement_credits(utr);
ALTER TABLE wpay_auth.bank_statement_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.bank_statement_credits FROM PUBLIC;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.bank_statement_credits FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.bank_statement_credits FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();
DO $credits$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.bank_statement_credits TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.bank_statement_credits TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $credits$;
