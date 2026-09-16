-- WPay ownership and operational authorization only. No public/legacy mutations.
CREATE TABLE wpay_auth.legacy_pairing_requests(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),source_id text NOT NULL CHECK(source_id='legacy-primary'),
 pairing_id text NOT NULL,token_digest text NOT NULL,encrypted_code jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at timestamptz NOT NULL,
 UNIQUE(source_id,pairing_id),CHECK(expires_at>created_at)
);
CREATE TABLE wpay_auth.paired_devices(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),source_id text NOT NULL CHECK(source_id='legacy-primary'),
 device_ref text NOT NULL,pairing_id text NOT NULL,request_id uuid NOT NULL UNIQUE REFERENCES wpay_auth.legacy_pairing_requests(id),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(valid_until>valid_from)
);
CREATE UNIQUE INDEX paired_device_owner ON wpay_auth.paired_devices(source_id,device_ref) WHERE revoked_at IS NULL;
CREATE INDEX paired_device_account ON wpay_auth.paired_devices(owner_id,created_at DESC,id);
CREATE TABLE wpay_auth.operations_audit(
 id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),owner_id uuid REFERENCES wpay_auth.accounts(id),
 resource_id text NOT NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operations_audit_resource ON wpay_auth.operations_audit(resource_id,created_at DESC,id);
CREATE TABLE wpay_auth.employee_access_versions(
 id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 version integer NOT NULL,permissions text[] NOT NULL,tenant_ids text[] NOT NULL,status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(employee_id,version)
);
CREATE FUNCTION wpay_auth.paired_device_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'UPDATE' OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'immutable device ownership'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION wpay_auth.paired_device_guard() FROM PUBLIC;
CREATE TRIGGER immutable_binding BEFORE UPDATE OR DELETE ON wpay_auth.paired_devices FOR EACH ROW EXECUTE FUNCTION wpay_auth.paired_device_guard();
DO $access$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['legacy_pairing_requests','paired_devices','operations_audit','employee_access_versions'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF tab<>'paired_devices' THEN EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON wpay_auth.%I FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable()',tab);END IF;
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON wpay_auth.%I FOR EACH STATEMENT EXECUTE FUNCTION wpay_auth.business_immutable()',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN GRANT UPDATE(revoked_at) ON wpay_auth.paired_devices TO wpay_runtime;END IF;
END $access$;
UPDATE wpay_auth.grants g SET permissions=ARRAY(SELECT DISTINCT unnest(g.permissions || CASE a.account_type
 WHEN 'user' THEN ARRAY['user.live_otp.view','user.device_pairing.view','user.device_pairing.create','user.device_pairing.revoke','user.transaction_history.view']
 ELSE ARRAY['apk.view','apk_otp_events.view_all','employee_management.view','employee_management.create','employee_management.update','utr_center.view','statement_reconciliation.view','statement_reconciliation.upload'] END)),permission_version=g.permission_version+1,
 admin_scope=CASE WHEN a.account_type IN('admin','super_admin') THEN COALESCE(g.admin_scope,jsonb_build_object('tenantIds',ARRAY[a.tenant_id])) ELSE g.admin_scope END
 FROM wpay_auth.accounts a WHERE a.id=g.account_id AND a.account_type IN('user','admin','super_admin');
UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE account_type IN('user','admin','super_admin');
