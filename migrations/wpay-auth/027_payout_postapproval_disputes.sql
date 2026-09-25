-- Append-only dispute history; original successful payout and settlement stay immutable.
CREATE TABLE wpay_auth.payout_disputes(
 id uuid PRIMARY KEY,payout_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payout_settlements(payout_id),
 merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reason text NOT NULL,statement_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payout_proofs(id),
 coverage_from timestamptz NOT NULL,coverage_through timestamptz NOT NULL,
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),commission_minor numeric(30,0) NOT NULL CHECK(commission_minor>=0),
 payload_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(coverage_through>=coverage_from)
);
CREATE INDEX payout_dispute_user ON wpay_auth.payout_disputes(user_id,created_at DESC);
CREATE INDEX payout_dispute_merchant ON wpay_auth.payout_disputes(merchant_id,created_at DESC);
CREATE TABLE wpay_auth.payout_dispute_resolutions(
 dispute_id uuid PRIMARY KEY REFERENCES wpay_auth.payout_disputes(id),
 outcome text NOT NULL CHECK(outcome IN('payment_valid','payment_invalid')),
 reason text NOT NULL,actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.payout_dispute_responses(
 id uuid PRIMARY KEY,dispute_id uuid NOT NULL REFERENCES wpay_auth.payout_disputes(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),reason text NOT NULL,
 proof_id uuid REFERENCES wpay_auth.payout_proofs(id),payload_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(dispute_id,payload_digest)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['payout_disputes','payout_dispute_resolutions','payout_dispute_responses'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $$;
