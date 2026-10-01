CREATE TABLE wpay_auth.statement_bot_groups(
 chat_id bigint PRIMARY KEY CHECK(chat_id<0),chat_type text NOT NULL CHECK(chat_type IN('group','supergroup')),
 user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),bound_by bigint NOT NULL CHECK(bound_by>0),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.statement_bot_updates(
 update_id bigint PRIMARY KEY CHECK(update_id>=0),payload jsonb NOT NULL,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),processed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.statement_bot_imports(
 id uuid PRIMARY KEY,chat_id bigint NOT NULL REFERENCES wpay_auth.statement_bot_groups(chat_id),user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 uploader_telegram_id bigint NOT NULL CHECK(uploader_telegram_id>0),telegram_file_id text NOT NULL,telegram_file_unique_id text NOT NULL,
 file_name text NOT NULL,mime_type text,file_size integer NOT NULL CHECK(file_size BETWEEN 1 AND 10485760),
 state text NOT NULL CHECK(state IN('queued_probe','probing','waiting_upi','queued_parse','processing','completed','duplicate','rejected','failed')),
 detected_format text CHECK(detected_format IS NULL OR detected_format IN('pdf','csv','xls','xlsx')),file_digest text CHECK(file_digest IS NULL OR file_digest~'^[0-9a-f]{64}$'),duplicate_of uuid REFERENCES wpay_auth.statement_bot_imports(id),
 selected_bank_id uuid REFERENCES wpay_auth.business_bank_accounts(id),selected_bank_version integer,selected_upi text,
 rows_scanned integer,credit_count integer,debit_count integer,total_credit_minor numeric(30,0),total_debit_minor numeric(30,0),credit_utr_count integer,new_utr_count integer,duplicate_utr_count integer,
 callback_delivered_count integer,callback_already_delivered_count integer,callback_queued_count integer,callback_pending_count integer,callback_exhausted_count integer,
 normalized_digest text CHECK(normalized_digest IS NULL OR normalized_digest~'^[0-9a-f]{64}$'),normalized_bytes integer CHECK(normalized_bytes IS NULL OR normalized_bytes>0),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),last_error text,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at timestamptz
);
CREATE INDEX statement_bot_import_queue ON wpay_auth.statement_bot_imports(state,created_at,id);
CREATE INDEX statement_bot_import_user_digest ON wpay_auth.statement_bot_imports(user_id,file_digest) WHERE file_digest IS NOT NULL;
CREATE TABLE wpay_auth.statement_bot_choices(
 token text PRIMARY KEY CHECK(token~'^[A-Za-z0-9_-]{16}$'),import_id uuid NOT NULL REFERENCES wpay_auth.statement_bot_imports(id) ON DELETE CASCADE,
 bank_id uuid NOT NULL REFERENCES wpay_auth.business_bank_accounts(id),bank_version integer NOT NULL,upi_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,consumed_at timestamptz
);
CREATE INDEX statement_bot_choice_import ON wpay_auth.statement_bot_choices(import_id);
CREATE TABLE wpay_auth.statement_bot_credits(
 id uuid PRIMARY KEY,import_id uuid NOT NULL REFERENCES wpay_auth.statement_bot_imports(id),user_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 bank_id uuid NOT NULL REFERENCES wpay_auth.business_bank_accounts(id),bank_version integer NOT NULL,upi_id text NOT NULL,txn_date text NOT NULL,
 utr text NOT NULL UNIQUE CHECK(utr~'^[0-9]{12}$'),amount_minor numeric(30,0) NOT NULL CHECK(amount_minor>0),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX statement_bot_credit_recent ON wpay_auth.statement_bot_credits(created_at DESC,id);
CREATE INDEX statement_bot_credit_user ON wpay_auth.statement_bot_credits(user_id,created_at DESC,id);
DO $statement_bot$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['statement_bot_groups','statement_bot_updates','statement_bot_imports','statement_bot_choices','statement_bot_credits'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY runtime_only ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $statement_bot$;