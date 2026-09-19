-- Additive internal policy persistence only. No legacy object, existing row,
-- account grant, credential, factor, balance or commercial snapshot is changed.
CREATE TABLE wpay_auth.parking_requests (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), request_id uuid NOT NULL,
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0), currency text NOT NULL CHECK(currency='INR'),
 snapshot jsonb NOT NULL, payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(owner_id,request_id)
);
CREATE INDEX parking_owner ON wpay_auth.parking_requests(owner_id,created_at DESC,id);
CREATE TABLE wpay_auth.parking_transitions (
 id uuid PRIMARY KEY, parking_id uuid NOT NULL REFERENCES wpay_auth.parking_requests(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), request_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), state text NOT NULL CHECK(state IN('requested','submitted','approved','completed','failed','expired','cancelled','disputed','review')),
 previous_state text, reason text NOT NULL, evidence_digest text, payload_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(parking_id,version),UNIQUE(actor_id,request_id)
);
CREATE TABLE wpay_auth.parking_postings (
 parking_id uuid PRIMARY KEY REFERENCES wpay_auth.parking_requests(id),
 economic_digest text NOT NULL UNIQUE CHECK(economic_digest ~ '^[0-9a-f]{64}$'),
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
 journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), provenance jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.email_verification_requests (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),request_id uuid NOT NULL,
 token_digest text NOT NULL UNIQUE CHECK(token_digest ~ '^[0-9a-f]{64}$'),
 email_digest text NOT NULL CHECK(email_digest ~ '^[0-9a-f]{64}$'),session_epoch integer NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(account_id,request_id),CHECK(expires_at>created_at)
);
CREATE INDEX email_verification_owner ON wpay_auth.email_verification_requests(account_id,created_at DESC);
CREATE TABLE wpay_auth.email_verifications (
 request_id uuid PRIMARY KEY REFERENCES wpay_auth.email_verification_requests(id),
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),email_digest text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX email_verifications_owner ON wpay_auth.email_verifications(account_id,verified_at DESC);
CREATE TABLE wpay_auth.notification_deliveries (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 kind text NOT NULL CHECK(kind IN('email_verification','funding_status')),source_id uuid NOT NULL,
 encrypted_payload jsonb NOT NULL,email_digest text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','accepted','delivered','failed','unavailable','expired')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,lease_until timestamptz,
 delivered_at timestamptz,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(kind,source_id),CHECK((state='delivered')=(delivered_at IS NOT NULL))
);
CREATE INDEX notification_delivery_due ON wpay_auth.notification_deliveries(next_attempt_at,id) WHERE state IN('pending','sending');
CREATE INDEX notification_delivery_owner ON wpay_auth.notification_deliveries(account_id,created_at DESC);
DO $internal$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['parking_requests','parking_transitions','parking_postings','email_verification_requests','email_verifications','notification_deliveries'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab<>'notification_deliveries' THEN
   EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  END IF;
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(state,attempts,next_attempt_at,lease_until,delivered_at) ON wpay_auth.notification_deliveries TO wpay_runtime;
 END IF;
END $internal$;
