-- Durable WPay funding only; no wallet keys or legacy objects.
-- Trusted device eligibility can change; runtime/browser remains read-only.
DROP TRIGGER immutable_rows ON wpay_auth.business_routing_requirements;
CREATE TABLE wpay_auth.business_routing_requirement_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner_id uuid NOT NULL,observation jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
REVOKE ALL ON wpay_auth.business_routing_requirement_events FROM PUBLIC;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.business_routing_requirement_events FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.business_routing_requirement_events FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE FUNCTION wpay_auth.audit_routing_requirement() RETURNS trigger LANGUAGE plpgsql AS $audit$
BEGIN
 INSERT INTO wpay_auth.business_routing_requirement_events(owner_id,observation) VALUES(NEW.owner_id,to_jsonb(NEW));
 RETURN NEW;
END $audit$;
CREATE TRIGGER audited_change AFTER INSERT OR UPDATE ON wpay_auth.business_routing_requirements FOR EACH ROW EXECUTE FUNCTION wpay_auth.audit_routing_requirement();
CREATE TRIGGER no_delete BEFORE DELETE ON wpay_auth.business_routing_requirements FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE TABLE wpay_auth.funding_requests(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),tenant_id text NOT NULL,
 idempotency_key text NOT NULL,snapshot jsonb NOT NULL,payload_digest text NOT NULL,
 state text NOT NULL CHECK(state IN('requested','detected','confirming','review','confirmed','rejected','reversed')),
 reason text NOT NULL DEFAULT '',source text,credit_minor numeric CHECK(credit_minor>0 AND credit_minor=trunc(credit_minor)),
 transfer_key text,accounting_version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX funding_request_owner ON wpay_auth.funding_requests(owner_id,created_at,id);
CREATE INDEX funding_request_review ON wpay_auth.funding_requests(tenant_id,state,created_at,id);
CREATE TABLE wpay_auth.funding_claims(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES wpay_auth.funding_requests(id),transfer_key text NOT NULL,
 tx_hash text NOT NULL,event_index integer NOT NULL CHECK(event_index BETWEEN 0 AND 100000),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(request_id,transfer_key)
);
CREATE INDEX funding_claim_transfer ON wpay_auth.funding_claims(transfer_key);
CREATE TABLE wpay_auth.funding_transfers(
 transfer_key text PRIMARY KEY,request_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.funding_requests(id),
 network text NOT NULL,token text NOT NULL,tx_hash text NOT NULL,event_index integer NOT NULL,recipient text NOT NULL,amount_minor numeric NOT NULL CHECK(amount_minor>0 AND amount_minor=trunc(amount_minor)),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.funding_events(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES wpay_auth.funding_requests(id),actor_id uuid REFERENCES wpay_auth.accounts(id),kind text NOT NULL,
 reason text NOT NULL,provenance jsonb NOT NULL DEFAULT '{}',journal_id uuid REFERENCES wpay_auth.business_journals(id),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX funding_event_request ON wpay_auth.funding_events(request_id,created_at,id);
CREATE TABLE wpay_auth.funding_jobs(
 id uuid PRIMARY KEY,claim_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.funding_claims(id),attempts integer NOT NULL DEFAULT 0,
 state text NOT NULL CHECK(state IN('queued','running','waiting','done','review')),lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,last_result text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX funding_job_due ON wpay_auth.funding_jobs(state,next_attempt_at);
CREATE TABLE wpay_auth.funding_notifications(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),request_id uuid NOT NULL REFERENCES wpay_auth.funding_requests(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),kind text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $funding$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['funding_requests','funding_claims','funding_transfers','funding_events','funding_jobs','funding_notifications'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab IN('funding_claims','funding_transfers','funding_events','funding_notifications') THEN
   EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
   EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(state,reason,source,credit_minor,transfer_key,accounting_version,updated_at) ON wpay_auth.funding_requests TO wpay_runtime;
  GRANT UPDATE(attempts,state,lease_until,next_attempt_at,last_result,updated_at) ON wpay_auth.funding_jobs TO wpay_runtime;
 END IF;
END $funding$;
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT p FROM unnest(g.permissions||ARRAY['user.deposits.view','user.deposits.submit']) p ORDER BY p),permission_version=g.permission_version+1 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type='user';
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type='user';
