CREATE SCHEMA wpay_auth;
REVOKE ALL ON SCHEMA wpay_auth FROM PUBLIC;

CREATE TABLE wpay_auth.schema_migrations (
  version integer PRIMARY KEY CHECK (version = 1),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  schema_fingerprint text NOT NULL CHECK (schema_fingerprint ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.accounts (
  id uuid PRIMARY KEY,
  subject_id uuid NOT NULL UNIQUE,
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
  account_type text NOT NULL CHECK (account_type IN ('user', 'merchant', 'super_admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  user_id uuid UNIQUE,
  merchant_id uuid UNIQUE,
  permission_version integer NOT NULL DEFAULT 1 CHECK (permission_version >= 0),
  session_epoch integer NOT NULL DEFAULT 0 CHECK (session_epoch >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((account_type = 'user' AND user_id IS NOT NULL AND merchant_id IS NULL)
    OR (account_type = 'merchant' AND merchant_id IS NOT NULL AND user_id IS NULL)
    OR (account_type = 'super_admin' AND user_id IS NULL AND merchant_id IS NULL))
);
CREATE TABLE wpay_auth.credentials (
  account_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),
  password_record jsonb NOT NULL CHECK (
    jsonb_typeof(password_record) = 'object' AND
    password_record ?& ARRAY['algorithm','version','N','r','p','salt','hash'] AND
    password_record->>'algorithm' = 'scrypt' AND password_record->>'version' = '1' AND
    password_record->>'N' = '131072' AND password_record->>'r' = '8' AND password_record->>'p' = '1' AND
    password_record->>'salt' ~ '^[0-9a-f]{32}$' AND password_record->>'hash' ~ '^[0-9a-f]{64}$')
);
CREATE TABLE wpay_auth.grants (
  account_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),
  permission_version integer NOT NULL CHECK (permission_version >= 0),
  permissions text[] NOT NULL,
  admin_scope jsonb
);
CREATE TABLE wpay_auth.eligibility (
  account_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  initial_deposit_satisfied boolean NOT NULL DEFAULT false,
  statement_satisfied boolean NOT NULL DEFAULT false,
  upi_approved boolean NOT NULL DEFAULT false,
  upi_verified boolean NOT NULL DEFAULT false,
  operations_enabled boolean NOT NULL DEFAULT false,
  approved_bank_account_available boolean NOT NULL DEFAULT false
);
CREATE TABLE wpay_auth.sessions (
  token_digest text PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
  permission_version integer NOT NULL CHECK (permission_version >= 0),
  session_epoch integer NOT NULL CHECK (session_epoch >= 0),
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at = created_at + interval '12 hours'),
  CHECK (last_seen_at >= created_at)
);
CREATE INDEX sessions_account_id ON wpay_auth.sessions(account_id);
CREATE TABLE wpay_auth.csrf_challenges (
  cookie_digest text PRIMARY KEY CHECK (cookie_digest ~ '^[0-9a-f]{64}$'),
  token_digest text NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  session_digest text,
  expires_at timestamptz NOT NULL
);
CREATE TABLE wpay_auth.throttles (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
CREATE TABLE wpay_auth.audit_events (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES wpay_auth.accounts(id),
  event text NOT NULL CHECK (event IN ('registered','bootstrap','login_failed','login','logout','logout_all')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_account_time ON wpay_auth.audit_events(account_id, created_at);
CREATE INDEX accounts_pending_directory ON wpay_auth.accounts(tenant_id, account_type, created_at, id);
CREATE TABLE wpay_auth.bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  account_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.accounts(id)
);

-- Private backend-only tables. RLS has no browser policies; the schema owner
-- performs development queries. No grants to Supabase client roles.
DO $private$
DECLARE item record; client_role text;
BEGIN
  FOR item IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'wpay_auth' LOOP
    EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY', item.tablename);
    EXECUTE format('REVOKE ALL ON TABLE wpay_auth.%I FROM PUBLIC', item.tablename);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE wpay_auth.%I FROM %I', item.tablename, client_role);
      END IF;
    END LOOP;
  END LOOP;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA wpay_auth FROM %I', client_role);
    END IF;
  END LOOP;
END $private$;
