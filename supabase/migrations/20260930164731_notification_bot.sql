-- Isolated Notification Bot state. Does not reuse old Telegram tables.
CREATE TABLE wpay_auth.notification_bot_groups (
 chat_id bigint PRIMARY KEY CHECK(chat_id<0),
 chat_type text NOT NULL CHECK(chat_type IN('group','supergroup')),
 tenant_ids text[] NOT NULL CHECK(cardinality(tenant_ids)>0),
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.notification_bot_audit (
 id uuid PRIMARY KEY, chat_id bigint NOT NULL, actor_id bigint NOT NULL CHECK(actor_id>0),
 operation text NOT NULL, revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_bot_audit_chat ON wpay_auth.notification_bot_audit(chat_id,created_at,id);
CREATE TABLE wpay_auth.notification_bot_updates (
 update_id bigint PRIMARY KEY CHECK(update_id>=0), payload jsonb NOT NULL,
 processed boolean NOT NULL DEFAULT false, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_bot_updates_due ON wpay_auth.notification_bot_updates(update_id) WHERE NOT processed AND attempts<5;
-- No browser or anonymous role may read group mappings, callback actors or
-- Telegram payloads. Use the existing dedicated backend role, not service_role.
DO $notification_bot$
DECLARE tab text; role_name text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['notification_bot_groups','notification_bot_audit','notification_bot_updates'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
    EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM %I',tab,role_name);
   END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(state,revision,updated_at) ON wpay_auth.notification_bot_groups TO wpay_runtime;
  GRANT UPDATE(processed,attempts) ON wpay_auth.notification_bot_updates TO wpay_runtime;
 END IF;
END $notification_bot$;
CREATE TRIGGER notification_bot_audit_immutable BEFORE UPDATE OR DELETE ON wpay_auth.notification_bot_audit
 FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();

-- Explicitly approved integration: distinguish User confirmation from bank
-- evidence and Admin approval; retain every existing source/state.
ALTER TABLE wpay_auth.gateway_orders DROP CONSTRAINT gateway_orders_evidence_state_check;
ALTER TABLE wpay_auth.gateway_orders ADD CONSTRAINT gateway_orders_evidence_state_check
 CHECK(evidence_state IN('unavailable','claim_submitted','observed','verified','rejected','admin_approved','user_confirmed'));
ALTER TABLE wpay_auth.business_financial_events DROP CONSTRAINT business_financial_events_source_check;
ALTER TABLE wpay_auth.business_financial_events ADD CONSTRAINT business_financial_events_source_check
 CHECK(source IN('normal','statement_recovered','admin_manual','user_manual'));
CREATE TABLE wpay_auth.notification_bot_receipts (
 token_digest text PRIMARY KEY CHECK(token_digest ~ '^[0-9a-f]{64}$'),
 chat_id bigint NOT NULL REFERENCES wpay_auth.notification_bot_groups(chat_id),
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 claim_id uuid NOT NULL REFERENCES wpay_auth.gateway_claims(id),
 mapping_ids uuid[] NOT NULL CHECK(cardinality(mapping_ids)>0),
 amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),
 message_id bigint, expires_at timestamptz NOT NULL,
 confirmed_at timestamptz, telegram_actor_id bigint,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((confirmed_at IS NULL)=(telegram_actor_id IS NULL))
);
CREATE INDEX notification_bot_receipts_claim ON wpay_auth.notification_bot_receipts(claim_id,chat_id,expires_at);
ALTER TABLE wpay_auth.notification_bot_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.notification_bot_receipts FROM PUBLIC;
DO $receipt_acl$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON wpay_auth.notification_bot_receipts FROM %I',role_name);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.notification_bot_receipts TO wpay_runtime;
  GRANT UPDATE(message_id,confirmed_at,telegram_actor_id) ON wpay_auth.notification_bot_receipts TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.notification_bot_receipts TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $receipt_acl$;

CREATE TABLE wpay_auth.notification_bot_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text UNIQUE NOT NULL,
 kind text NOT NULL, account_id uuid REFERENCES wpay_auth.accounts(id), entity_id uuid,
 tenant_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
 processed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_bot_events_pending ON wpay_auth.notification_bot_events(created_at,id) WHERE NOT processed;
CREATE TABLE wpay_auth.notification_bot_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES wpay_auth.notification_bot_events(id),
 chat_id bigint NOT NULL REFERENCES wpay_auth.notification_bot_groups(chat_id), group_revision bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 message_id bigint, UNIQUE(event_id,chat_id)
);
CREATE INDEX notification_bot_deliveries_pending ON wpay_auth.notification_bot_deliveries(next_attempt_at,id) WHERE state='pending';
CREATE TABLE wpay_auth.notification_bot_watches (
 bank_id uuid PRIMARY KEY REFERENCES wpay_auth.business_bank_accounts(id),
 next_check_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, auto_stop jsonb,
 last_offline_at timestamptz, last_pending_at timestamptz
);
CREATE INDEX notification_bot_watches_due ON wpay_auth.notification_bot_watches(next_check_at,bank_id);
CREATE INDEX notification_bot_reservations_bank ON wpay_auth.business_reservations(bank_id,created_at,id);
CREATE INDEX notification_bot_groups_mapping ON wpay_auth.notification_bot_groups USING gin(state jsonb_path_ops);
DO $worker_acl$
DECLARE tab text; role_name text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['notification_bot_events','notification_bot_deliveries','notification_bot_watches'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM %I',tab,role_name); END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $worker_acl$;

-- Atomic event outbox, not a second approval/payment engine. Payloads contain
-- identifiers only; the worker re-reads authorized projections before sending.
CREATE FUNCTION wpay_auth.notification_bot_event() RETURNS trigger LANGUAGE plpgsql
 SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE owner_id uuid; tenant text; event_kind text; entity uuid; event_identity text;
BEGIN
 IF TG_TABLE_NAME='accounts' THEN
  IF NEW.account_type NOT IN('user','merchant') THEN RETURN NEW; END IF;
  owner_id:=NEW.id; tenant:=NEW.tenant_id; event_kind:=NEW.account_type||'_registered'; entity:=NEW.id; event_identity:=NEW.id::text;
 ELSIF TG_TABLE_NAME='business_bank_versions' THEN
  SELECT b.owner_id,a.tenant_id INTO owner_id,tenant FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id WHERE b.id=NEW.bank_id;
  event_kind:='bank_submitted'; entity:=NEW.bank_id; event_identity:=NEW.bank_id::text||':'||NEW.version::text;
  INSERT INTO wpay_auth.notification_bot_watches(bank_id) VALUES(NEW.bank_id) ON CONFLICT DO NOTHING;
 ELSIF TG_TABLE_NAME='gateway_claims' THEN
  SELECT r.user_id,a.tenant_id INTO owner_id,tenant FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id JOIN wpay_auth.accounts a ON a.id=r.user_id WHERE o.id=NEW.order_id;
  event_kind:='claim_pending'; entity:=NEW.id; event_identity:=NEW.id::text;
 ELSIF TG_TABLE_NAME='gateway_outbox' THEN
  IF NEW.state NOT IN('delivered','failed') OR NEW.state=OLD.state OR NEW.event_type NOT IN('payment.success','payment.recovered') OR NOT EXISTS(SELECT 1 FROM wpay_auth.notification_bot_receipts receipt JOIN wpay_auth.gateway_claims claim ON claim.id=receipt.claim_id WHERE claim.order_id=NEW.order_id AND receipt.message_id IS NOT NULL) THEN RETURN NEW; END IF;
  SELECT r.user_id,a.tenant_id INTO owner_id,tenant FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id JOIN wpay_auth.accounts a ON a.id=r.user_id WHERE o.id=NEW.order_id;
  event_kind:=CASE WHEN NEW.state='delivered' THEN 'callback_delivered' ELSE 'callback_failed' END;
  entity:=NEW.order_id; event_identity:=NEW.id::text||':'||NEW.state;
 ELSIF TG_TABLE_NAME='business_audit' THEN
  IF NEW.event NOT IN('bank_approve','bank_run','admin_bank_start','upi_route_active','assignment_active') THEN RETURN NEW; END IF;
  IF NEW.event IN('bank_run','admin_bank_start') AND NOT EXISTS(SELECT 1 FROM wpay_auth.accounts WHERE id=NEW.actor_id AND account_type IN('admin','super_admin','employee') AND status='active') THEN RETURN NEW; END IF;
  owner_id:=NEW.owner_id; entity:=NEW.entity_id; event_identity:=NEW.id::text;
  -- User-approved rule: an explicit Admin start overrides this bot incident.
  -- Set this atomically with the existing Admin audit, not by guessing clocks.
  IF NEW.event IN('bank_run','admin_bank_start') AND EXISTS(SELECT 1 FROM wpay_auth.accounts WHERE id=NEW.actor_id AND account_type IN('admin','super_admin') AND status='active') THEN
   UPDATE wpay_auth.notification_bot_watches w SET auto_stop=w.auto_stop||jsonb_build_object('adminOverride',true,'adminEventId',NEW.id)
    FROM wpay_auth.business_bank_accounts b WHERE w.bank_id=NEW.entity_id AND b.id=w.bank_id AND b.status='running' AND w.auto_stop IS NOT NULL;
  END IF;
  IF NEW.event IN('upi_route_active','assignment_active') THEN
   IF COALESCE(NEW.metadata->>'merchantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;
   owner_id:=(NEW.metadata->>'merchantId')::uuid;
  END IF;
  SELECT tenant_id INTO tenant FROM wpay_auth.accounts WHERE id=owner_id;
  event_kind:=CASE WHEN NEW.event='bank_approve' THEN 'bank_approved' WHEN NEW.event IN('upi_route_active','assignment_active') THEN 'merchant_assigned' ELSE 'upi_started' END;
 END IF;
 IF owner_id IS NOT NULL AND tenant IS NOT NULL THEN
  INSERT INTO wpay_auth.notification_bot_events(event_key,kind,account_id,entity_id,tenant_id)
   VALUES(TG_TABLE_NAME||':'||event_identity,event_kind,owner_id,entity,tenant) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION wpay_auth.notification_bot_event() FROM PUBLIC;
DO $function_acl$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN GRANT EXECUTE ON FUNCTION wpay_auth.notification_bot_event() TO wpay_runtime; END IF;
END $function_acl$;
CREATE TRIGGER notification_bot_account_event AFTER INSERT ON wpay_auth.accounts FOR EACH ROW EXECUTE FUNCTION wpay_auth.notification_bot_event();
CREATE TRIGGER notification_bot_bank_event AFTER INSERT ON wpay_auth.business_bank_versions FOR EACH ROW EXECUTE FUNCTION wpay_auth.notification_bot_event();
CREATE TRIGGER notification_bot_claim_event AFTER INSERT ON wpay_auth.gateway_claims FOR EACH ROW EXECUTE FUNCTION wpay_auth.notification_bot_event();
CREATE TRIGGER notification_bot_callback_event AFTER UPDATE OF state ON wpay_auth.gateway_outbox FOR EACH ROW EXECUTE FUNCTION wpay_auth.notification_bot_event();
CREATE TRIGGER notification_bot_audit_event AFTER INSERT ON wpay_auth.business_audit FOR EACH ROW EXECUTE FUNCTION wpay_auth.notification_bot_event();
