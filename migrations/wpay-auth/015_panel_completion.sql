-- Additive WPay-only completion. Migrations 001-014 and legacy objects are unchanged.
ALTER TABLE wpay_auth.credentials ADD COLUMN temporary_required boolean NOT NULL DEFAULT false;
ALTER TABLE wpay_auth.credentials ADD COLUMN temporary_expires_at timestamptz;
ALTER TABLE wpay_auth.credentials ADD CONSTRAINT temporary_credential_expiry CHECK (NOT temporary_required OR temporary_expires_at IS NOT NULL);
ALTER TABLE wpay_auth.preferences ADD COLUMN in_app_notifications boolean NOT NULL DEFAULT true;
CREATE TABLE wpay_auth.password_reset_challenges (
 token_digest text PRIMARY KEY CHECK(token_digest ~ '^[0-9a-f]{64}$'),
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), session_epoch integer NOT NULL,
 credential_fingerprint text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE INDEX password_reset_account ON wpay_auth.password_reset_challenges(account_id,expires_at);
CREATE TABLE wpay_auth.panel_audit (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 target_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX panel_audit_target ON wpay_auth.panel_audit(target_id,created_at DESC,id);
CREATE TABLE wpay_auth.support_tickets (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 request_id uuid NOT NULL, subject text NOT NULL CHECK(length(subject) BETWEEN 2 AND 120),
 message text NOT NULL CHECK(length(message) BETWEEN 2 AND 2000),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(owner_id,request_id)
);
CREATE INDEX support_owner ON wpay_auth.support_tickets(owner_id,created_at DESC,id);
CREATE TABLE wpay_auth.support_events (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES wpay_auth.support_tickets(id),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id), request_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('open','resolved')), message text NOT NULL CHECK(length(message) BETWEEN 2 AND 2000),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(actor_id,request_id)
);
CREATE INDEX support_events_ticket ON wpay_auth.support_events(ticket_id,created_at DESC,id);
CREATE TABLE wpay_auth.directory_requests (
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),request_id uuid NOT NULL,
 payload_digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE wpay_auth.api_access_audit (
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),key_id uuid NOT NULL REFERENCES wpay_auth.gateway_keys(id),
 operation text NOT NULL CHECK(operation IN('orders:read','orders:write')),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX api_access_owner ON wpay_auth.api_access_audit(merchant_id,created_at DESC,id);
DO $private$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['password_reset_challenges','panel_audit','support_tickets','support_events','directory_requests','api_access_audit'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab<>'password_reset_challenges' THEN
   EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  END IF;
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(consumed_at) ON wpay_auth.password_reset_challenges TO wpay_runtime;
  GRANT UPDATE(temporary_required,temporary_expires_at) ON wpay_auth.credentials TO wpay_runtime;
  GRANT UPDATE(in_app_notifications) ON wpay_auth.preferences TO wpay_runtime;
 END IF;
END $private$;
-- Existing internally generated employee credentials also require a reset.
-- Password hashes, MFA factors, recovery codes and immutable financial rows are preserved.
UPDATE wpay_auth.credentials c SET temporary_required=true,temporary_expires_at=CURRENT_TIMESTAMP+interval '24 hours'
 FROM wpay_auth.accounts a WHERE a.id=c.account_id AND a.account_type='employee'
 AND EXISTS(SELECT 1 FROM wpay_auth.employee_access_versions v WHERE v.employee_id=a.id);
UPDATE wpay_auth.accounts a SET session_epoch=session_epoch+1 WHERE EXISTS(
 SELECT 1 FROM wpay_auth.credentials c WHERE c.account_id=a.id AND c.temporary_required);
-- Explicit approved completion grants only. Ordinary Admin/Employee grants are not widened.
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT unnest(g.permissions || CASE a.account_type
 WHEN 'user' THEN ARRAY['profile.update','support.create','notifications.view','notifications.update','user.analytics.view','user.activation_codes.view','user.trade.view']
 WHEN 'merchant' THEN ARRAY['support.create','notifications.view','notifications.update','merchant.analytics.view']
 ELSE ARRAY['profile.update','notifications.view','notifications.update','users.commercial.update','users.suspend','merchants.commercial.update','merchants.suspend','reports.view','reports.export','support_admin.view','support_admin.update','api_credentials.view','api_credentials.create','api_credentials.revoke','api_logs.view','devices.view','settings.view','ledger.adjust'] END)),permission_version=g.permission_version+1
 ,admin_scope=CASE WHEN a.account_type='super_admin' THEN g.admin_scope || '{"platform":true}'::jsonb ELSE g.admin_scope END
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND (a.account_type IN('user','merchant') OR
 (a.account_type='super_admin' AND EXISTS(SELECT 1 FROM wpay_auth.bootstrap_state b WHERE b.account_id=a.id)));
UPDATE wpay_auth.accounts a SET permission_version=permission_version+1,session_epoch=session_epoch+1
 WHERE a.account_type IN('user','merchant') OR
 (a.account_type='super_admin' AND EXISTS(SELECT 1 FROM wpay_auth.bootstrap_state b WHERE b.account_id=a.id));
