-- WPay-only live User/Merchant workflow completion. Additive to schema 016.
-- Existing legacy objects, protected APK/OTP/UTR/checkout sources and migrations 001-016 are unchanged.

ALTER TABLE wpay_auth.business_entries DROP CONSTRAINT business_entries_ledger_type_check;
ALTER TABLE wpay_auth.business_entries ADD CONSTRAINT business_entries_ledger_type_check CHECK(ledger_type IN(
 'capacity_allocated','capacity_consumed','capacity_reserved','capacity_hold','user_commission',
 'merchant_gross','merchant_platform_fee','merchant_payout_fee','merchant_adjustment','merchant_hold','clearing',
 'merchant_payout_reserved','merchant_payout_principal','merchant_settlement_reserved','merchant_settlement_principal',
 'user_payout_commission','user_commission_adjustment','user_commission_hold','user_commission_reserved','user_commission_withdrawn'));

ALTER TABLE wpay_auth.payout_claims ADD COLUMN cooldown_until timestamptz;

ALTER TABLE wpay_auth.payout_economic_references DROP CONSTRAINT payout_economic_references_kind_check;
ALTER TABLE wpay_auth.payout_economic_references ADD CONSTRAINT payout_economic_references_kind_check
 CHECK(kind IN('payout','withdrawal','merchant_settlement'));

CREATE TABLE wpay_auth.merchant_settlement_withdrawals(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 idempotency_key text NOT NULL,payload_digest text NOT NULL,
 inr_minor numeric(30,0) NOT NULL CHECK(inr_minor>0),usdt_minor numeric(30,0) NOT NULL CHECK(usdt_minor>0),
 snapshot jsonb NOT NULL,encrypted_destination jsonb NOT NULL,
 state text NOT NULL DEFAULT 'requested' CHECK(state IN('requested','review','approved','processing','completed','rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at timestamptz,
 completion_digest text,encrypted_completion jsonb,UNIQUE(merchant_id,idempotency_key)
);
CREATE INDEX merchant_settlement_owner ON wpay_auth.merchant_settlement_withdrawals(merchant_id,created_at DESC,id);

CREATE TABLE wpay_auth.parking_beneficiaries(
 id uuid PRIMARY KEY,tenant_id text NOT NULL,
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 encrypted_details jsonb NOT NULL,details_digest text NOT NULL CHECK(details_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at timestamptz
);
CREATE INDEX parking_beneficiary_tenant ON wpay_auth.parking_beneficiaries(tenant_id,created_at DESC,id);

CREATE TABLE wpay_auth.parking_beneficiary_confirmations(
 beneficiary_id uuid NOT NULL REFERENCES wpay_auth.parking_beneficiaries(id),
 user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(beneficiary_id,user_id)
);
CREATE INDEX parking_confirmation_user ON wpay_auth.parking_beneficiary_confirmations(user_id,created_at DESC);

CREATE TABLE wpay_auth.parking_orders(
 id uuid PRIMARY KEY,tenant_id text NOT NULL,beneficiary_id uuid NOT NULL REFERENCES wpay_auth.parking_beneficiaries(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),reference text NOT NULL,
 total_minor numeric(30,0) NOT NULL CHECK(total_minor>0),min_minor numeric(30,0) NOT NULL CHECK(min_minor>0 AND min_minor<=total_minor),
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','closed','cancelled')),
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,closed_at timestamptz,
 UNIQUE(tenant_id,reference)
);
CREATE INDEX parking_order_tenant ON wpay_auth.parking_orders(tenant_id,created_at DESC,id);

CREATE TABLE wpay_auth.parking_locks(
 id uuid PRIMARY KEY REFERENCES wpay_auth.parking_requests(id),
 order_id uuid NOT NULL REFERENCES wpay_auth.parking_orders(id),user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 state text NOT NULL CHECK(state IN('active','cooldown','submitted','review','completed','released','expired','disputed','not_paid')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at timestamptz NOT NULL,cooldown_until timestamptz,closed_at timestamptz,
 CHECK(expires_at>created_at)
);
CREATE INDEX parking_lock_order ON wpay_auth.parking_locks(order_id,created_at,id);
CREATE INDEX parking_lock_user ON wpay_auth.parking_locks(user_id,created_at DESC,id);

CREATE TABLE wpay_auth.parking_submissions(
 parking_id uuid PRIMARY KEY REFERENCES wpay_auth.parking_requests(id),
 proof_digest text NOT NULL CHECK(proof_digest ~ '^[0-9a-f]{64}$'),
 extension text NOT NULL CHECK(extension IN('pdf','png','jpg')),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 scan_state text NOT NULL CHECK(scan_state IN('unscanned','clean')),
 encrypted_proof jsonb NOT NULL,encrypted_evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION wpay_auth.payout_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE mutable text[];
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'immutable payout records'; END IF;
 mutable=CASE TG_TABLE_NAME
 WHEN 'payout_orders' THEN ARRAY['state','completed_at']
 WHEN 'payout_claims' THEN ARRAY['state','closed_at','cooldown_until']
 WHEN 'commission_withdrawals' THEN ARRAY['state','completed_at','completion_digest','encrypted_completion']
 WHEN 'payout_capabilities' THEN ARRAY['revoked_at']
 WHEN 'commission_holds' THEN ARRAY['released_at'] END;
 IF (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN RAISE EXCEPTION 'immutable payout binding'; END IF;
 IF TG_TABLE_NAME IN('payout_orders','payout_claims','commission_withdrawals') THEN
  IF OLD.state IN('successful','cancelled','not_paid','consumed','released','expired','completed','rejected') THEN RAISE EXCEPTION 'terminal payout record'; END IF;
 END IF;
 IF TG_TABLE_NAME='payout_capabilities' AND OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'terminal hold record'; END IF;
 IF TG_TABLE_NAME='commission_holds' AND OLD.released_at IS NOT NULL THEN RAISE EXCEPTION 'terminal hold record'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION wpay_auth.live_workflow_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE mutable text[];
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'immutable workflow record'; END IF;
 mutable=CASE TG_TABLE_NAME
 WHEN 'merchant_settlement_withdrawals' THEN ARRAY['state','completed_at','completion_digest','encrypted_completion']
 WHEN 'parking_beneficiaries' THEN ARRAY['revoked_at']
 WHEN 'parking_orders' THEN ARRAY['state','closed_at']
 WHEN 'parking_locks' THEN ARRAY['state','cooldown_until','closed_at'] END;
 IF (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN RAISE EXCEPTION 'immutable workflow binding'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION wpay_auth.live_workflow_guard() FROM PUBLIC;

DO $live$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['merchant_settlement_withdrawals','parking_beneficiaries','parking_beneficiary_confirmations','parking_orders','parking_locks','parking_submissions'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab IN('merchant_settlement_withdrawals','parking_beneficiaries','parking_orders','parking_locks') THEN
   EXECUTE format('CREATE TRIGGER immutable_binding BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.live_workflow_guard()',tab);
  ELSE
   EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  END IF;
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(state,completed_at,completion_digest,encrypted_completion) ON wpay_auth.merchant_settlement_withdrawals TO wpay_runtime;
  GRANT UPDATE(revoked_at) ON wpay_auth.parking_beneficiaries TO wpay_runtime;
  GRANT UPDATE(state,closed_at) ON wpay_auth.parking_orders TO wpay_runtime;
  GRANT UPDATE(state,cooldown_until,closed_at) ON wpay_auth.parking_locks TO wpay_runtime;
  GRANT UPDATE(state,closed_at,cooldown_until) ON wpay_auth.payout_claims TO wpay_runtime;
 END IF;
END $live$;

-- Existing Users gain only their own operational Parking capabilities.
UPDATE wpay_auth.grants g SET permissions=ARRAY(
 SELECT DISTINCT unnest(g.permissions || ARRAY[
  'user.parking_beneficiaries.view','user.parking_beneficiaries.confirm',
  'user.parking_payments.view','user.parking_payments.create'
 ])
),permission_version=g.permission_version+1
FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type='user';
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type='user';

-- Bootstrap Super Admin receives the new operational Parking actions. Ordinary Admin/Employee defaults stay unchanged.
UPDATE wpay_auth.grants g SET permissions=ARRAY(
 SELECT DISTINCT unnest(g.permissions || ARRAY['parking.view','parking.create','parking.review','parking.approve','parking.reject'])
),permission_version=g.permission_version+1
FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type='super_admin'
AND EXISTS(SELECT 1 FROM wpay_auth.bootstrap_state b WHERE b.account_id=a.id);
UPDATE wpay_auth.accounts a SET permission_version=permission_version+1,session_epoch=session_epoch+1
WHERE a.account_type='super_admin' AND EXISTS(SELECT 1 FROM wpay_auth.bootstrap_state b WHERE b.account_id=a.id);
