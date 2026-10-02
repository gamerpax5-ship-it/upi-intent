CREATE TABLE wpay_auth.notification_bot_account_reviews(
 id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES wpay_auth.notification_bot_events(id),chat_id bigint NOT NULL REFERENCES wpay_auth.notification_bot_groups(chat_id),
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),token_digest text NOT NULL UNIQUE CHECK(token_digest~'^[0-9a-f]{64}$'),
 notification_message_id bigint,prompt_message_id bigint,state text NOT NULL CHECK(state IN('pending','editing_approve','editing_reject','confirm_approve','confirm_reject','approved','rejected','cancelled')),
 telegram_actor_id bigint,draft jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(draft)='object'),expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at timestamptz,
 UNIQUE(event_id,chat_id)
);
CREATE INDEX notification_bot_account_reviews_chat ON wpay_auth.notification_bot_account_reviews(chat_id,state,expires_at);
CREATE TABLE wpay_auth.notification_bot_account_review_audit(
 id uuid PRIMARY KEY,review_id uuid NOT NULL REFERENCES wpay_auth.notification_bot_account_reviews(id),chat_id bigint NOT NULL,
 telegram_actor_id bigint NOT NULL CHECK(telegram_actor_id>0),wpay_admin_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(details)='object'),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_bot_account_review_audit_review ON wpay_auth.notification_bot_account_review_audit(review_id,created_at,id);
DO $review_acl$
DECLARE tab text; role_name text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['notification_bot_account_reviews','notification_bot_account_review_audit'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM %I',tab,role_name); END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT UPDATE(token_digest,notification_message_id,prompt_message_id,state,telegram_actor_id,draft,expires_at,updated_at,completed_at) ON wpay_auth.notification_bot_account_reviews TO wpay_runtime;
 END IF;
END $review_acl$;
CREATE TRIGGER notification_bot_account_review_audit_immutable BEFORE UPDATE OR DELETE ON wpay_auth.notification_bot_account_review_audit
 FOR EACH ROW EXECUTE FUNCTION wpay_auth.business_immutable();