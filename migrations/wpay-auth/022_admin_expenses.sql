CREATE TABLE wpay_auth.admin_expenses(
 id uuid PRIMARY KEY,tenant_id text NOT NULL,actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),request_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN('salary','server','maintenance','other')),
 payee text NOT NULL CHECK(length(payee) BETWEEN 2 AND 120),
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 occurred_at timestamptz NOT NULL,description text NOT NULL CHECK(length(description) BETWEEN 2 AND 500),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(actor_id,request_id)
);
CREATE TABLE wpay_auth.admin_expense_voids(
 expense_id uuid PRIMARY KEY REFERENCES wpay_auth.admin_expenses(id),actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admin_expenses_period ON wpay_auth.admin_expenses(tenant_id,occurred_at,id);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.admin_expenses FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.admin_expense_voids FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.admin_expenses FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.admin_expense_voids FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();
ALTER TABLE wpay_auth.admin_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wpay_auth.admin_expense_voids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.admin_expenses,wpay_auth.admin_expense_voids FROM PUBLIC;
DO $grants$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.admin_expenses,wpay_auth.admin_expense_voids TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.admin_expenses TO wpay_runtime USING(true) WITH CHECK(true);
  CREATE POLICY backend_only ON wpay_auth.admin_expense_voids TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $grants$;
