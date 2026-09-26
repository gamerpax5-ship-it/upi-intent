-- Late proof is a review request, never an automatic financial credit.
CREATE TABLE wpay_auth.late_payment_reviews(
 id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('payout','parking')),
 resource_id uuid NOT NULL,claim_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 tenant_id text NOT NULL,amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 held_minor numeric(30,0) NOT NULL CHECK(held_minor>=0),reserve_mode text NOT NULL CHECK(reserve_mode IN('existing','extra','none')),
 reason text NOT NULL,conflict text NOT NULL,payload_digest text NOT NULL,
 encrypted_evidence jsonb NOT NULL,encrypted_proof jsonb NOT NULL,
 extension text NOT NULL CHECK(extension IN('png','jpg','pdf')),size integer NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 scan_state text NOT NULL CHECK(scan_state IN('unscanned','clean')),proof_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(kind,claim_id)
);
CREATE INDEX late_payment_pending_scope ON wpay_auth.late_payment_reviews(tenant_id,kind,created_at);
CREATE TABLE wpay_auth.late_payment_resolutions(
 review_id uuid PRIMARY KEY REFERENCES wpay_auth.late_payment_reviews(id),
 outcome text NOT NULL CHECK(outcome IN('approved','rejected')),actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['late_payment_reviews','late_payment_resolutions'] LOOP
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
