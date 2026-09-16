-- WPay-only payout and shared commission accounting. No legacy object changes.
ALTER TABLE wpay_auth.business_entries DROP CONSTRAINT business_entries_ledger_type_check;
ALTER TABLE wpay_auth.business_entries ADD CONSTRAINT business_entries_ledger_type_check CHECK(ledger_type IN(
 'capacity_allocated','capacity_consumed','capacity_reserved','capacity_hold','user_commission',
 'merchant_gross','merchant_platform_fee','merchant_payout_fee','merchant_adjustment','merchant_hold','clearing',
 'merchant_payout_reserved','merchant_payout_principal','user_payout_commission','user_commission_adjustment',
 'user_commission_hold','user_commission_reserved','user_commission_withdrawn'));

CREATE TABLE wpay_auth.payout_capabilities(
 id uuid PRIMARY KEY,bank_id uuid NOT NULL REFERENCES wpay_auth.business_bank_accounts(id),bank_version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at timestamptz,
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version)
);
CREATE UNIQUE INDEX payout_capability_active ON wpay_auth.payout_capabilities(bank_id,bank_version) WHERE revoked_at IS NULL;
CREATE TABLE wpay_auth.payout_batches(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),idempotency_key text NOT NULL,
 payload_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(merchant_id,idempotency_key)
);
CREATE TABLE wpay_auth.payout_orders(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),reference text NOT NULL,idempotency_key text NOT NULL,
 payload_digest text NOT NULL,encrypted_beneficiary jsonb NOT NULL,amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 percentage_fee_minor numeric(30,0) NOT NULL CHECK(percentage_fee_minor>=0),fixed_fee_minor numeric(30,0) NOT NULL CHECK(fixed_fee_minor>=0),
 reserve_minor numeric(30,0) NOT NULL CHECK(reserve_minor=amount_minor+percentage_fee_minor+fixed_fee_minor),currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 snapshot jsonb NOT NULL,endpoint_id uuid REFERENCES wpay_auth.gateway_endpoints(id),batch_id uuid REFERENCES wpay_auth.payout_batches(id),
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','claimed','submitted','merchant_rejected_review','successful','cancelled','not_paid')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at timestamptz,
 UNIQUE(merchant_id,reference),UNIQUE(merchant_id,idempotency_key)
);
CREATE INDEX payout_merchant_history ON wpay_auth.payout_orders(merchant_id,created_at DESC,id);
CREATE INDEX payout_queue ON wpay_auth.payout_orders(created_at,id) WHERE state='open';
CREATE TABLE wpay_auth.payout_claims(
 id uuid PRIMARY KEY,payout_id uuid NOT NULL REFERENCES wpay_auth.payout_orders(id),user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 bank_id uuid NOT NULL,bank_version integer NOT NULL,account_key text NOT NULL,
 state text NOT NULL CHECK(state IN('active','submitted','consumed','released','expired','not_paid')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at timestamptz NOT NULL,closed_at timestamptz,
 FOREIGN KEY(bank_id,bank_version) REFERENCES wpay_auth.business_bank_versions(bank_id,version),CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX payout_one_claim ON wpay_auth.payout_claims(payout_id) WHERE state IN('active','submitted');
CREATE INDEX payout_claim_owner ON wpay_auth.payout_claims(user_id,created_at DESC,id);
CREATE INDEX payout_claim_bank ON wpay_auth.payout_claims(account_key,created_at);
CREATE TABLE wpay_auth.payout_proofs(
 id uuid PRIMARY KEY,payout_id uuid NOT NULL REFERENCES wpay_auth.payout_orders(id),owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 extension text NOT NULL CHECK(extension IN('pdf','png','jpg')),size integer NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 digest text NOT NULL,encrypted_bytes jsonb NOT NULL,scan_state text NOT NULL CHECK(scan_state IN('unscanned','clean')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.payout_economic_references(
 digest text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('payout','withdrawal')),resource_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.payout_submissions(
 id uuid PRIMARY KEY,payout_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payout_orders(id),claim_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payout_claims(id),
 proof_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payout_proofs(id),utr_digest text NOT NULL UNIQUE REFERENCES wpay_auth.payout_economic_references(digest),
 encrypted_evidence jsonb NOT NULL,payload_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.payout_settlements(
 payout_id uuid PRIMARY KEY REFERENCES wpay_auth.payout_orders(id),claim_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.payout_claims(id),
 journal_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.business_journals(id),actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 user_snapshot jsonb NOT NULL,commission_minor numeric(30,0) NOT NULL CHECK(commission_minor>=0),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.commission_withdrawals(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),idempotency_key text NOT NULL,payload_digest text NOT NULL,
 currency text NOT NULL CHECK(currency IN('INR','USDT')),amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 entitlement_minor numeric(30,0) NOT NULL CHECK(entitlement_minor>0),snapshot jsonb NOT NULL,encrypted_destination jsonb NOT NULL,
 state text NOT NULL DEFAULT 'requested' CHECK(state IN('requested','review','approved','processing','completed','rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at timestamptz,
 completion_digest text,encrypted_completion jsonb,UNIQUE(user_id,idempotency_key)
);
CREATE INDEX commission_withdrawal_history ON wpay_auth.commission_withdrawals(user_id,created_at DESC,id);
CREATE TABLE wpay_auth.commission_holds(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 reference text NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,released_at timestamptz
);
CREATE INDEX commission_hold_owner ON wpay_auth.commission_holds(user_id,created_at DESC,id);
CREATE TABLE wpay_auth.payout_events(
 id uuid PRIMARY KEY,resource_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 actor_id uuid REFERENCES wpay_auth.accounts(id),kind text NOT NULL,state text NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payout_event_resource ON wpay_auth.payout_events(resource_id,created_at,id);

-- One durable signer/dispatcher for both order families.
ALTER TABLE wpay_auth.gateway_outbox ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE wpay_auth.gateway_outbox ADD COLUMN payout_id uuid REFERENCES wpay_auth.payout_orders(id);
ALTER TABLE wpay_auth.gateway_outbox ADD COLUMN event_key text;
ALTER TABLE wpay_auth.gateway_outbox DROP CONSTRAINT gateway_outbox_event_type_check;
ALTER TABLE wpay_auth.gateway_outbox ADD CONSTRAINT gateway_outbox_event_type_check CHECK(
 (order_id IS NOT NULL AND payout_id IS NULL AND event_type IN('payment.success','payment.failed','payment.expired','payment.recovered')) OR
 (order_id IS NULL AND payout_id IS NOT NULL AND event_key IS NOT NULL AND event_type IN('payout.created','payout.claimed','payout.success','payout.rejected_review','payout.cancelled')));
CREATE UNIQUE INDEX gateway_payout_event ON wpay_auth.gateway_outbox(payout_id,event_type,event_key);

CREATE FUNCTION wpay_auth.payout_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE mutable text[];
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'immutable payout records'; END IF;
 mutable=CASE TG_TABLE_NAME
 WHEN 'payout_orders' THEN ARRAY['state','completed_at']
 WHEN 'payout_claims' THEN ARRAY['state','closed_at']
 WHEN 'commission_withdrawals' THEN ARRAY['state','completed_at','completion_digest','encrypted_completion']
 WHEN 'payout_capabilities' THEN ARRAY['revoked_at']
 WHEN 'commission_holds' THEN ARRAY['released_at'] END;
 IF (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN RAISE EXCEPTION 'immutable payout binding'; END IF;
 IF TG_TABLE_NAME IN('payout_orders','payout_claims','commission_withdrawals') THEN
  IF OLD.state IN('successful','cancelled','not_paid','consumed','released','expired','completed','rejected') THEN RAISE EXCEPTION 'terminal payout record'; END IF;
 END IF;
 IF TG_TABLE_NAME='payout_capabilities' THEN
  IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'terminal hold record'; END IF;
 END IF;
 IF TG_TABLE_NAME='commission_holds' THEN
  IF OLD.released_at IS NOT NULL THEN RAISE EXCEPTION 'terminal hold record'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION wpay_auth.payout_binding_guard() FROM PUBLIC;
DO $payout$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['payout_capabilities','payout_batches','payout_orders','payout_claims','payout_proofs','payout_economic_references','payout_submissions','payout_settlements','commission_withdrawals','commission_holds','payout_events'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab IN('payout_capabilities','payout_orders','payout_claims','commission_withdrawals','commission_holds') THEN
   EXECUTE format('CREATE TRIGGER immutable_binding BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.payout_binding_guard()',tab);
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
  GRANT UPDATE(state,completed_at) ON wpay_auth.payout_orders TO wpay_runtime;
  GRANT UPDATE(state,closed_at) ON wpay_auth.payout_claims TO wpay_runtime;
  GRANT UPDATE(state,completed_at,completion_digest,encrypted_completion) ON wpay_auth.commission_withdrawals TO wpay_runtime;
  GRANT UPDATE(revoked_at) ON wpay_auth.payout_capabilities TO wpay_runtime;
  GRANT UPDATE(released_at) ON wpay_auth.commission_holds TO wpay_runtime;
 END IF;
END $payout$;
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT unnest(g.permissions || CASE a.account_type
 WHEN 'merchant' THEN ARRAY['merchant.payout.view','merchant.payout.create','merchant.payout.review','merchant.settlement.view','merchant.settlement.create']
 WHEN 'user' THEN ARRAY['user.payout.view','user.payout.claim','user.payout.submit','user.commission.view','user.commission_withdrawal.view','user.commission_withdrawal.create','user.commission_withdrawal.cancel']
 ELSE ARRAY['payout_operations.view','payout_operations.resolve','payout_operations.proof','payout_operations.capability','commission_withdrawal.view','commission_withdrawal.approve','commission_hold.view','commission_hold.manage'] END)),permission_version=g.permission_version+1
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN('user','merchant','super_admin');
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type IN('user','merchant','super_admin');
