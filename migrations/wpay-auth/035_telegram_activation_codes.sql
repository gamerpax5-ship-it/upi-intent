-- Telegram /activationcode requests use the existing WPay pairing lifecycle.
-- This table only marks which legacy pairing requests were issued by the bot.
CREATE TABLE wpay_auth.telegram_activation_requests(
 request_id uuid PRIMARY KEY REFERENCES wpay_auth.legacy_pairing_requests(id),
 chat_id bigint NOT NULL CHECK(chat_id<0),
 telegram_user_id bigint NOT NULL CHECK(telegram_user_id>0),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE wpay_auth.telegram_activation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wpay_auth.telegram_activation_requests FROM PUBLIC;
DO $telegram_activation$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
  GRANT SELECT,INSERT ON wpay_auth.telegram_activation_requests TO wpay_runtime;
  CREATE POLICY backend_only ON wpay_auth.telegram_activation_requests
   TO wpay_runtime USING(true) WITH CHECK(true);
 END IF;
END $telegram_activation$;
