-- Explicit Admin approval is separate from payment-verification evidence.
CREATE TABLE wpay_auth.admin_bank_approvals (
 bank_id uuid NOT NULL, bank_version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 request_id uuid NOT NULL, reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 300),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(bank_id,bank_version), UNIQUE(actor_id,request_id),
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version)
);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.admin_bank_approvals FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.admin_bank_approvals FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();
ALTER TABLE wpay_auth.admin_bank_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.admin_bank_approvals FROM PUBLIC;
ALTER TABLE wpay_auth.business_assignments ADD COLUMN bank_id uuid REFERENCES wpay_auth.business_bank_accounts(id);
DROP INDEX wpay_auth.business_assignment_active;
CREATE UNIQUE INDEX business_assignment_active ON wpay_auth.business_assignments(merchant_id,user_id) WHERE status='active' AND bank_id IS NULL;
CREATE UNIQUE INDEX business_bank_assignment_active ON wpay_auth.business_assignments(merchant_id,bank_id) WHERE status='active' AND bank_id IS NOT NULL;
CREATE INDEX business_assignment_bank ON wpay_auth.business_assignments(bank_id,status);
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.admin_bank_approvals TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.admin_bank_approvals TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $grants$;
