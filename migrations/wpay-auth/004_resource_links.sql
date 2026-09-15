-- New WPay ownership registry only. Unverified browser requests never authorize
-- a legacy read. Verification fields are writable only by the migration owner.
CREATE TABLE wpay_auth.resource_links (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 resource_kind text NOT NULL CHECK(resource_kind IN ('device','receiving_account','merchant_assignment','order','statement_import','payment_link')),
 source_id text NOT NULL CHECK(source_id ~ '^[a-z][a-z0-9_-]{0,39}$'),
 resource_id text NOT NULL CHECK(resource_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','revoked')),
 consent_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 verified_at timestamptz,
 verification_digest text CHECK(verification_digest ~ '^[0-9a-f]{64}$'),
 verifier_id uuid REFERENCES wpay_auth.accounts(id),
 valid_from timestamptz,
 valid_until timestamptz,
 parent_id uuid REFERENCES wpay_auth.resource_links(id),
 revoked_at timestamptz,
 CHECK(status<>'verified' OR (verified_at IS NOT NULL AND verification_digest IS NOT NULL AND verifier_id IS NOT NULL AND
   verifier_id<>account_id AND valid_from IS NOT NULL AND valid_until IS NOT NULL AND valid_until>valid_from AND revoked_at IS NULL)),
 CHECK(status<>'revoked' OR revoked_at IS NOT NULL)
);
CREATE UNIQUE INDEX resource_links_one_owner ON wpay_auth.resource_links(source_id,resource_kind,resource_id) WHERE status='verified';
CREATE INDEX resource_links_owner ON wpay_auth.resource_links(account_id,status,id);
CREATE INDEX resource_links_parent ON wpay_auth.resource_links(parent_id);
CREATE TABLE wpay_auth.resource_audit (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 link_id uuid NOT NULL REFERENCES wpay_auth.resource_links(id),
 event text NOT NULL CHECK(event IN ('consent_requested','revoked','read_device','read_otp_metadata','read_transactions','read_statement','read_order')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX resource_audit_owner_time ON wpay_auth.resource_audit(account_id,created_at);
ALTER TABLE wpay_auth.resource_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE wpay_auth.resource_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.resource_links,wpay_auth.resource_audit FROM PUBLIC;
DO $runtime$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT ON wpay_auth.resource_links TO wpay_runtime;
  GRANT INSERT(id,account_id,resource_kind,source_id,resource_id) ON wpay_auth.resource_links TO wpay_runtime;
  GRANT UPDATE(status,revoked_at) ON wpay_auth.resource_links TO wpay_runtime;
  CREATE POLICY backend_read ON wpay_auth.resource_links FOR SELECT TO wpay_runtime USING(true);
  CREATE POLICY backend_request ON wpay_auth.resource_links FOR INSERT TO wpay_runtime WITH CHECK(status='pending' AND verified_at IS NULL AND verification_digest IS NULL);
  CREATE POLICY backend_revoke ON wpay_auth.resource_links FOR UPDATE TO wpay_runtime USING(true) WITH CHECK(status='revoked' AND revoked_at IS NOT NULL);
  GRANT SELECT,INSERT ON wpay_auth.resource_audit TO wpay_runtime;
  CREATE POLICY backend_audit ON wpay_auth.resource_audit TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $runtime$;
-- Non-financial read grants only. Version changes invalidate earlier sessions.
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT permission FROM unnest(permissions || CASE
 WHEN a.account_type='user' THEN ARRAY['user.apk.view','user.source_events.view']
 WHEN a.account_type='merchant' THEN ARRAY['merchant.source_events.view']
 ELSE ARRAY['apk.view'] END) AS permission ORDER BY permission),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN ('user','merchant','admin','super_admin');
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1
 WHERE account_type IN ('user','merchant','admin','super_admin');
