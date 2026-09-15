-- Extends only Task 5 WPay objects. Migration 001 remains immutable.
ALTER TABLE wpay_auth.schema_migrations DROP CONSTRAINT schema_migrations_version_check;
ALTER TABLE wpay_auth.schema_migrations ADD CONSTRAINT schema_migrations_version_check CHECK (version > 0);
ALTER TABLE wpay_auth.accounts DROP CONSTRAINT accounts_account_type_check;
ALTER TABLE wpay_auth.accounts ADD CONSTRAINT accounts_account_type_check CHECK (account_type IN ('user','merchant','admin','super_admin','employee'));
ALTER TABLE wpay_auth.accounts DROP CONSTRAINT accounts_check;
ALTER TABLE wpay_auth.accounts ADD CONSTRAINT accounts_check CHECK (
 (account_type='user' AND user_id IS NOT NULL AND merchant_id IS NULL) OR
 (account_type='merchant' AND merchant_id IS NOT NULL AND user_id IS NULL) OR
 (account_type IN ('admin','super_admin','employee') AND user_id IS NULL AND merchant_id IS NULL));
ALTER TABLE wpay_auth.sessions ADD COLUMN mfa_at timestamptz;
ALTER TABLE wpay_auth.sessions ADD COLUMN security_version integer;
ALTER TABLE wpay_auth.sessions ADD COLUMN factor_version integer;
CREATE TABLE wpay_auth.account_security (
 account_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),
 security_version integer NOT NULL DEFAULT 1 CHECK (security_version > 0),
 factor_version integer NOT NULL DEFAULT 0 CHECK (factor_version >= 0),
 enabled boolean NOT NULL DEFAULT false,
 encrypted_secret jsonb,
 last_used_step integer,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 attempt_window timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((enabled AND encrypted_secret IS NOT NULL AND factor_version > 0) OR NOT enabled)
);
INSERT INTO wpay_auth.account_security(account_id) SELECT id FROM wpay_auth.accounts;
CREATE TABLE wpay_auth.mfa_challenges (
 token_digest text PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 purpose text NOT NULL CHECK (purpose IN ('enroll','login','replace','recovery','complete')),
 session_epoch integer NOT NULL,
 permission_version integer NOT NULL,
 security_version integer NOT NULL,
 factor_version integer NOT NULL,
 candidate jsonb,
 recovery_hashes text[],
 last_step integer,
 verified_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE INDEX mfa_challenges_account ON wpay_auth.mfa_challenges(account_id);
CREATE TABLE wpay_auth.recovery_codes (
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 code_digest text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
 factor_version integer NOT NULL,
 consumed_at timestamptz,
 PRIMARY KEY(account_id,code_digest)
);
CREATE TABLE wpay_auth.preferences (
 account_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),
 locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ru','zh-CN'))
);
INSERT INTO wpay_auth.preferences(account_id) SELECT id FROM wpay_auth.accounts;
CREATE TABLE wpay_auth.commercial_versions (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 version integer NOT NULL CHECK (version > 0),
 settings jsonb NOT NULL,
 effective_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 UNIQUE(account_id,version)
);
CREATE TABLE wpay_auth.approval_requests (
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 request_id uuid NOT NULL,
 payload_digest text NOT NULL,
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 result jsonb NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE wpay_auth.security_audit (
 id uuid PRIMARY KEY,
 actor_id uuid REFERENCES wpay_auth.accounts(id),
 account_id uuid REFERENCES wpay_auth.accounts(id),
 event text NOT NULL,
 reason text,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX security_audit_account_time ON wpay_auth.security_audit(account_id,created_at);
CREATE INDEX security_audit_actor_time ON wpay_auth.security_audit(actor_id,created_at);
-- Explicit self-service grants only. Administrator action grants are assigned by
-- the bootstrap/service defaults, not inferred for arbitrary existing roles.
UPDATE wpay_auth.grants SET permissions=permissions || ARRAY['account_security.view','account_security.update'], permission_version=permission_version+1;
UPDATE wpay_auth.grants g SET permissions=permissions || ARRAY['users.approve','users.reject','merchants.approve','merchants.reject']
 FROM wpay_auth.bootstrap_state b WHERE g.account_id=b.account_id;
UPDATE wpay_auth.grants g SET permissions=permissions || ARRAY['profile.update']
 FROM wpay_auth.accounts a WHERE g.account_id=a.id AND a.account_type='merchant' AND NOT ('profile.update'=ANY(g.permissions));
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1;
DO $private$
DECLARE item record; client_role text;
BEGIN
 FOR item IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='wpay_auth' LOOP
  EXECUTE pg_catalog.format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',item.tablename);
  EXECUTE pg_catalog.format('REVOKE ALL ON TABLE wpay_auth.%I FROM PUBLIC',item.tablename);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=client_role) THEN
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE wpay_auth.%I FROM %I',item.tablename,client_role);
   END IF;
  END LOOP;
 END LOOP;
END $private$;
