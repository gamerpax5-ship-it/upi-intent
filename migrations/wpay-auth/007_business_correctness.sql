-- Additive Task 9A closure; legacy schemas and previously checksummed SQL are untouched.
CREATE TABLE wpay_auth.business_bank_identities(
 bank_id uuid NOT NULL,version integer NOT NULL,account_key text NOT NULL,
 PRIMARY KEY(bank_id,version),FOREIGN KEY(bank_id,version) REFERENCES wpay_auth.business_bank_versions(bank_id,version)
);
CREATE INDEX business_bank_identity_group ON wpay_auth.business_bank_identities(account_key,bank_id,version);
INSERT INTO wpay_auth.business_bank_identities SELECT bank_id,version,encode(sha256(convert_to(upper(details->>'ifsc')||':'||(details->>'accountNumber'),'UTF8')),'hex') FROM wpay_auth.business_bank_versions;
CREATE TABLE wpay_auth.business_reconciliation(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),
 reference text NOT NULL,reason text NOT NULL,signed_remaining numeric NOT NULL,deficit_minor numeric NOT NULL CHECK(deficit_minor>=0),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.business_routing_requirements(
 owner_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),device_required boolean NOT NULL DEFAULT false,device_eligible boolean NOT NULL DEFAULT false,reason text NOT NULL DEFAULT ''
);
-- Technical representation uses integral NUMERIC; no business maximum is imposed.
DO $amounts$
DECLARE item text; parts text[];
BEGIN
 FOREACH item IN ARRAY ARRAY['business_bank_versions.limit_minor','business_assignments.min_minor','business_assignments.max_minor','business_entries.amount_minor','business_reservations.amount_minor','business_financial_events.amount_minor','business_holds.amount_minor'] LOOP
  parts:=string_to_array(item,'.');
  EXECUTE format('ALTER TABLE wpay_auth.%I ALTER COLUMN %I TYPE numeric',parts[1],parts[2]);
  EXECUTE format('ALTER TABLE wpay_auth.%I ADD CHECK (%I=trunc(%I))',parts[1],parts[2],parts[2]);
 END LOOP;
END $amounts$;
DO $access$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['business_bank_identities','business_reconciliation','business_routing_requirements'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN GRANT INSERT ON wpay_auth.business_bank_identities,wpay_auth.business_reconciliation TO wpay_runtime; END IF;
END $access$;
