-- New WPay state only. No legacy table, parser, matcher or router changes.
CREATE TABLE wpay_auth.bank_onboarding_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 statement_required boolean NOT NULL DEFAULT true,
 challenge_min_minor integer NOT NULL DEFAULT 100 CHECK(challenge_min_minor>=100),
 challenge_max_minor integer NOT NULL DEFAULT 999 CHECK(challenge_max_minor BETWEEN challenge_min_minor AND 999),
 challenge_ttl_seconds integer NOT NULL DEFAULT 300 CHECK(challenge_ttl_seconds BETWEEN 60 AND 600)
);
INSERT INTO wpay_auth.bank_onboarding_policy(singleton) VALUES(true);
CREATE TABLE wpay_auth.upi_verification_challenges(
 id uuid PRIMARY KEY,request_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 bank_id uuid NOT NULL,bank_version integer NOT NULL,
 expected_upi text NOT NULL,account_digest text NOT NULL CHECK(account_digest~'^[0-9a-f]{64}$'),
 amount_minor integer NOT NULL CHECK(amount_minor BETWEEN 100 AND 999),currency text NOT NULL CHECK(currency='INR'),
 status text NOT NULL CHECK(status IN('waiting','verified','cancelled','expired','invalidated')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 60),last_attempt_at timestamptz,
 evidence_digest text UNIQUE CHECK(evidence_digest~'^[0-9a-f]{64}$'),evidence_source text,
 synthetic boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at timestamptz NOT NULL,completed_at timestamptz,
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version),
 UNIQUE(owner_id,request_id),CHECK(expires_at>created_at),
 CHECK(status<>'verified' OR (evidence_digest IS NOT NULL AND evidence_source IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX upi_one_active_challenge ON wpay_auth.upi_verification_challenges(bank_id) WHERE status='waiting';
CREATE INDEX upi_challenge_owner ON wpay_auth.upi_verification_challenges(owner_id,bank_id,created_at);
CREATE TABLE wpay_auth.upi_consumed_evidence(
 payment_digest text PRIMARY KEY CHECK(payment_digest~'^[0-9a-f]{64}$'),
 challenge_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.upi_verification_challenges(id),
 source text NOT NULL,received_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.bank_statement_imports(
 id uuid PRIMARY KEY,request_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 bank_id uuid NOT NULL,bank_version integer NOT NULL,file_digest text NOT NULL CHECK(file_digest~'^[0-9a-f]{64}$'),
 format text NOT NULL CHECK(format IN('csv','xls','xlsx')),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 1048576),
 status text NOT NULL CHECK(status IN('accepted','rejected')),reason text NOT NULL,
 rows_scanned integer NOT NULL DEFAULT 0,credit_count integer NOT NULL DEFAULT 0,
 parser_digest text NOT NULL CHECK(parser_digest~'^[0-9a-f]{64}$'),result_digest text,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version),
 UNIQUE(owner_id,request_id),CHECK(status<>'accepted' OR (credit_count>0 AND result_digest IS NOT NULL))
);
CREATE INDEX bank_statement_owner_version ON wpay_auth.bank_statement_imports(owner_id,bank_id,bank_version,created_at DESC);
-- Failure observations have no browser/Admin write endpoint. Future trusted
-- order integrations may supply these; a later confirmed receipt wins analytics.
CREATE TABLE wpay_auth.upi_order_outcomes(
 reservation_id uuid PRIMARY KEY REFERENCES wpay_auth.business_reservations(id),
 outcome text NOT NULL CHECK(outcome='failed'),evidence_digest text NOT NULL UNIQUE CHECK(evidence_digest~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $onboarding$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['bank_onboarding_policy','upi_verification_challenges','upi_consumed_evidence','bank_statement_imports','upi_order_outcomes'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab IN('upi_consumed_evidence','bank_statement_imports','upi_order_outcomes') THEN
   EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
   EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
   IF tab IN('upi_verification_challenges','upi_consumed_evidence','bank_statement_imports') THEN EXECUTE format('GRANT INSERT ON wpay_auth.%I TO wpay_runtime',tab); END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(status,attempts,last_attempt_at,evidence_digest,evidence_source,synthetic,completed_at) ON wpay_auth.upi_verification_challenges TO wpay_runtime;
 END IF;
END $onboarding$;
-- Older verification did not bind a Task 9B challenge. Preserve version/history,
-- but require the stronger verification and per-version statement before Start.
INSERT INTO wpay_auth.business_audit(id,owner_id,entity_id,event,reason,metadata)
 SELECT gen_random_uuid(),owner_id,id,'onboarding_upgrade','Challenge-bound verification and initial statement required',jsonb_build_object('previousStatus',status,'version',version)
 FROM wpay_auth.business_bank_accounts WHERE verified_version IS NOT NULL;
UPDATE wpay_auth.business_bank_accounts SET verified_version=NULL,status=CASE WHEN frozen THEN 'frozen' WHEN approved_version=version THEN 'approved' ELSE status END
 WHERE verified_version IS NOT NULL;
UPDATE wpay_auth.eligibility SET statement_satisfied=false,upi_verified=false,operations_enabled=false;
UPDATE wpay_auth.accounts SET session_epoch=session_epoch+1;
