CREATE TABLE wpay_auth.user_collection_permissions(
 user_id uuid PRIMARY KEY REFERENCES wpay_auth.accounts(id),
 free_setup boolean NOT NULL DEFAULT false,
 unlimited_collection boolean NOT NULL DEFAULT false,
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 reason text NOT NULL,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wpay_auth.upi_daily_limits(
 bank_id uuid PRIMARY KEY REFERENCES wpay_auth.business_bank_accounts(id),
 limit_minor numeric(30,0) NOT NULL CHECK(limit_minor>0),
 actor_id uuid NOT NULL REFERENCES wpay_auth.accounts(id),
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['user_collection_permissions','upi_daily_limits'] LOOP
  EXECUTE format('ALTER TABLE wpay_auth.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON wpay_auth.%I FROM PUBLIC',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON wpay_auth.%I TO wpay_runtime',tab);
   EXECUTE format('CREATE POLICY runtime_access ON wpay_auth.%I TO wpay_runtime USING(true) WITH CHECK(true)',tab);
  END IF;
 END LOOP;
END $$;
