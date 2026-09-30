-- Local draft: Ledger Balance Bot stores only Telegram group bindings and durable command metadata.
CREATE TABLE wpay_auth.telegram_balance_groups(
 chat_id bigint PRIMARY KEY CHECK(chat_id<0),
 chat_type text NOT NULL CHECK(chat_type IN('group','supergroup')),
 account_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 account_type text NOT NULL CHECK(account_type IN('user','merchant','admin','super_admin')),
 bound_by bigint NOT NULL CHECK(bound_by>0),
 bound_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.telegram_balance_updates(
 update_id bigint PRIMARY KEY CHECK(update_id>=0),
 message jsonb NOT NULL,
 processed boolean NOT NULL DEFAULT false,
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $balance_bot$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['telegram_balance_groups','telegram_balance_updates'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $balance_bot$;