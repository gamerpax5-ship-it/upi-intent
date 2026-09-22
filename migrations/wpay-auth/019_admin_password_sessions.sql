-- Explicit authentication provenance; existing MFA sessions remain unchanged.
ALTER TABLE wpay_auth.sessions ADD COLUMN auth_method text NOT NULL DEFAULT 'mfa'
 CHECK (auth_method IN ('mfa','password'));
ALTER TABLE wpay_auth.sessions ADD COLUMN password_at timestamptz;
ALTER TABLE wpay_auth.sessions ADD CONSTRAINT sessions_password_assurance CHECK (
 (auth_method='mfa' AND password_at IS NULL) OR
 (auth_method='password' AND password_at IS NOT NULL AND mfa_at IS NULL
  AND password_at >= created_at AND password_at < expires_at));
