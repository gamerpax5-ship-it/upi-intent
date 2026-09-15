-- Task 8 adds WPay objects only. No legacy schemas, tables or routers are used.
CREATE TABLE wpay_auth.business_mutex(singleton boolean PRIMARY KEY CHECK(singleton), revision bigint NOT NULL DEFAULT 0);
INSERT INTO wpay_auth.business_mutex(singleton) VALUES(true);
CREATE TABLE wpay_auth.business_bank_accounts(
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 version integer NOT NULL CHECK(version>0), status text NOT NULL CHECK(status IN
 ('draft','submitted','review','approved','rejected','verification_pending','verified','enabled','running','stopped','frozen')),
 approved_version integer, verified_version integer, frozen boolean NOT NULL DEFAULT false,
 deactivated boolean NOT NULL DEFAULT false, reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX business_bank_owner ON wpay_auth.business_bank_accounts(owner_id,created_at,id);
CREATE TABLE wpay_auth.business_bank_versions(
 bank_id uuid NOT NULL REFERENCES wpay_auth.business_bank_accounts(id), version integer NOT NULL,
 details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'), limit_minor numeric(30,0) NOT NULL CHECK(limit_minor>0),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(bank_id,version)
);
CREATE TABLE wpay_auth.business_assignments(
 id uuid PRIMARY KEY, merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 status text NOT NULL CHECK(status IN('active','disabled')),priority integer NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 100000),
 weight integer NOT NULL DEFAULT 1 CHECK(weight BETWEEN 1 AND 10000), min_minor numeric(30,0) NOT NULL CHECK(min_minor>0),
 max_minor numeric(30,0) NOT NULL CHECK(max_minor>=min_minor), effective_from timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 disabled_at timestamptz, created_by uuid NOT NULL REFERENCES wpay_auth.accounts(id),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(merchant_id<>user_id),CHECK((status='disabled')=(disabled_at IS NOT NULL))
);
CREATE UNIQUE INDEX business_assignment_active ON wpay_auth.business_assignments(merchant_id,user_id) WHERE status='active';
CREATE INDEX business_assignment_user ON wpay_auth.business_assignments(user_id,status);
CREATE TABLE wpay_auth.business_journals(
 id uuid PRIMARY KEY,idempotency_key text NOT NULL UNIQUE CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 payload_digest text NOT NULL CHECK(payload_digest~'^[0-9a-f]{64}$'),reference_type text NOT NULL,reference_id text NOT NULL,
 actor_id uuid REFERENCES wpay_auth.accounts(id),actor_source text NOT NULL,
 snapshot jsonb NOT NULL,metadata jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_transaction xid8 NOT NULL DEFAULT pg_catalog.pg_current_xact_id()
);
CREATE TABLE wpay_auth.business_entries(
 id uuid PRIMARY KEY,journal_id uuid NOT NULL REFERENCES wpay_auth.business_journals(id),
 owner_id uuid REFERENCES wpay_auth.accounts(id),owner_key text NOT NULL,
 book text NOT NULL CHECK(book IN('capacity','cash','commission','holds','reservations')),
 ledger_type text NOT NULL CHECK(ledger_type IN('capacity_allocated','capacity_consumed','capacity_reserved','capacity_hold',
 'user_commission','merchant_gross','merchant_platform_fee','merchant_payout_fee','merchant_adjustment','merchant_hold','clearing')),
 direction text NOT NULL CHECK(direction IN('credit','debit')),amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL CHECK(currency IN('INR','USD','USDT')),
 CHECK((owner_id IS NOT NULL AND owner_key=owner_id::text AND ledger_type<>'clearing') OR
       (owner_id IS NULL AND owner_key='system:wpay' AND ledger_type='clearing'))
);
CREATE INDEX business_entries_owner ON wpay_auth.business_entries(owner_id,currency,ledger_type,journal_id);
CREATE INDEX business_entries_journal ON wpay_auth.business_entries(journal_id);
CREATE INDEX business_journal_reference ON wpay_auth.business_journals(reference_type,reference_id,created_at,id);
CREATE TABLE wpay_auth.business_reservations(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 bank_id uuid NOT NULL,bank_version integer NOT NULL,assignment_id uuid NOT NULL REFERENCES wpay_auth.business_assignments(id),
 order_reference text NOT NULL,idempotency_key text NOT NULL,payload_digest text NOT NULL,
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='INR'),
 state text NOT NULL CHECK(state IN('pending','active','consumed','released','expired','cancelled')),
 snapshot jsonb NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version),
 UNIQUE(merchant_id,idempotency_key),UNIQUE(merchant_id,order_reference),CHECK(expires_at>created_at)
);
CREATE INDEX business_reservation_capacity ON wpay_auth.business_reservations(user_id,state,expires_at);
CREATE INDEX business_reservation_merchant ON wpay_auth.business_reservations(merchant_id,created_at,id);
CREATE TABLE wpay_auth.business_reservation_events(
 id uuid PRIMARY KEY,reservation_id uuid NOT NULL REFERENCES wpay_auth.business_reservations(id),
 state text NOT NULL,actor_id uuid REFERENCES wpay_auth.accounts(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.business_financial_events(
 economic_id text PRIMARY KEY,bank_id uuid NOT NULL,utr_digest text NOT NULL,
 reservation_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_reservations(id),journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),
 source text NOT NULL CHECK(source IN('normal','statement_recovered')),amount_minor numeric(30,0) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(bank_id,utr_digest)
);
CREATE TABLE wpay_auth.business_holds(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),domain text NOT NULL CHECK(domain IN('capacity','merchant')),
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='INR'),
 state text NOT NULL CHECK(state IN('active','released')),reason text NOT NULL,reference text NOT NULL,
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,released_at timestamptz,
 CHECK((state='released')=(released_at IS NOT NULL))
);
CREATE INDEX business_holds_owner ON wpay_auth.business_holds(owner_id,state);
CREATE TABLE wpay_auth.business_audit(
 id uuid PRIMARY KEY,actor_id uuid REFERENCES wpay_auth.accounts(id),owner_id uuid REFERENCES wpay_auth.accounts(id),
 entity_id uuid,event text NOT NULL,reason text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX business_audit_owner ON wpay_auth.business_audit(owner_id,created_at,id);
CREATE FUNCTION wpay_auth.business_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'WPAY_APPEND_ONLY' USING ERRCODE='42501'; END $$;
CREATE FUNCTION wpay_auth.business_balanced() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE journal uuid;
BEGIN
 IF TG_TABLE_NAME='business_journals' THEN journal:=NEW.id; ELSE journal:=NEW.journal_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM wpay_auth.business_entries WHERE journal_id=journal) OR EXISTS(
 SELECT 1 FROM wpay_auth.business_entries WHERE journal_id=journal GROUP BY book,currency
 HAVING SUM(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END)<>0 OR count(*)<2)
 THEN RAISE EXCEPTION 'WPAY_UNBALANCED_JOURNAL' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION wpay_auth.business_sealed() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM wpay_auth.business_journals WHERE id=NEW.journal_id AND created_transaction=pg_catalog.pg_current_xact_id())
 THEN RAISE EXCEPTION 'WPAY_SEALED_JOURNAL' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION wpay_auth.business_immutable(),wpay_auth.business_balanced(),wpay_auth.business_sealed() FROM PUBLIC;
CREATE TRIGGER business_entry_seal BEFORE INSERT ON wpay_auth.business_entries FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_sealed();
CREATE TRIGGER commercial_history_immutable BEFORE UPDATE OR DELETE ON wpay_auth.commercial_versions FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();
CREATE CONSTRAINT TRIGGER business_journal_balance AFTER INSERT ON wpay_auth.business_journals
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_balanced();
CREATE CONSTRAINT TRIGGER business_entry_balance AFTER INSERT ON wpay_auth.business_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_balanced();
DO $business$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['business_bank_versions','business_journals','business_entries','business_reservation_events','business_financial_events','business_audit'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',table_name);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['business_mutex','business_bank_accounts','business_bank_versions','business_assignments','business_journals','business_entries','business_reservations','business_reservation_events','business_financial_events','business_holds','business_audit'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',table_name);
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',table_name);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',table_name);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime') THEN
  REVOKE INSERT ON wpay_auth.business_mutex FROM wpay_runtime;
  GRANT UPDATE(revision) ON wpay_auth.business_mutex TO wpay_runtime;
  GRANT UPDATE(version,status,approved_version,verified_version,frozen,deactivated,reason,updated_at) ON wpay_auth.business_bank_accounts TO wpay_runtime;
  GRANT UPDATE(status,priority,weight,min_minor,max_minor,disabled_at) ON wpay_auth.business_assignments TO wpay_runtime;
  GRANT UPDATE(state) ON wpay_auth.business_reservations TO wpay_runtime;
  GRANT UPDATE(state,released_at) ON wpay_auth.business_holds TO wpay_runtime;
  GRANT EXECUTE ON FUNCTION wpay_auth.business_immutable(),wpay_auth.business_balanced(),wpay_auth.business_sealed() TO wpay_runtime;
 END IF;
END $business$;
-- Only own-account non-executing views/submissions are added automatically.
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT p FROM unnest(g.permissions || CASE
 WHEN a.account_type='user' THEN ARRAY['user.bank_upi.view','user.bank_upi.submit','user.bank_upi.update','user.holds.view','user.payin_commission.view']
 ELSE ARRAY['merchant.ledger.view','merchant.fees.view','merchant.holds.view'] END) p ORDER BY p),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN('user','merchant');
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type IN('user','merchant');
