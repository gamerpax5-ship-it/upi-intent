-- Bot configuration is separate from account sessions and financial records.
CREATE TABLE wpay_auth.telegram_groups(
 chat_id bigint PRIMARY KEY CHECK(chat_id<0),chat_type text NOT NULL CHECK(chat_type IN('group','supergroup')),
 settings jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.telegram_updates(
 update_id bigint PRIMARY KEY CHECK(update_id>=0),message jsonb NOT NULL,
 processed boolean NOT NULL DEFAULT false,attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.telegram_deliveries(
 chat_id bigint NOT NULL,kind text NOT NULL CHECK(kind IN('otp','history','utr')),event_id text NOT NULL,
 delivered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(chat_id,kind,event_id)
);
DO $telegram$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['telegram_groups','telegram_updates','telegram_deliveries'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY backend_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $telegram$;
