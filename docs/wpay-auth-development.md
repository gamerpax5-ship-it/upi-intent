# WPay development authentication — current Task 6 contract

**Task 6A verified update:** see [the completed local acceptance report](wpay-task6a.md). Official scoped install/clean npm ci, maintained TOTP/QR, real migrations and PostgreSQL/HTTP/browser verification passed using isolated local targets and preserved private keys.

Task 6 supersedes Task 5's pending-login behavior. Pending User/Merchant accounts cannot log in, enroll MFA, read current-account/navigation, or enter panels. Registration returns unauthenticated confirmation. Approved accounts and all internally provisioned Admin/Super Admin/Employee accounts must complete authenticator verification before receiving an application session. See [the Task 6 design, implementation limits and discovery evidence](wpay-task6.md).

**Status: Task 6A local acceptance verified; development only.** No production deployment or financial integration is authorized. Runtime/package/browser findings and remaining coverage limits are recorded in the Task 6A report.

## Safe isolated configuration

Use only a verified isolated development database. Acceptance needs a separate empty target, without manually used accounts or public application tables. The config acknowledgement is not evidence of isolation. The selected Supabase project `nzbuvltvqxgtbmicjxag` remains inaccessible to this connector; the other visible project is populated and Railway exposes production only. Do not run migrations/tests there.

Configure secrets privately in the process environment using an authorized secret manager. Do not put connection URIs, passwords or encryption keys in chat, commands, source, shell history, screenshots or the browser. `.env` is not automatically loaded; no `DATABASE_URL`, `PG*`, legacy/dashboard or provider fallback exists.

| Environment variable | Required meaning |
| --- | --- |
| `WPAY_AUTH_DEV_DATABASE_URL` | Dedicated private PostgreSQL URI with percent-encoded credentials; no query/fragment |
| `WPAY_AUTH_DEV_ISOLATED_CONFIRM` | After proving isolation: `supabase:<reference>` or `<numeric-loopback-host>:<port>/<database>` |
| `WPAY_AUTH_DEV_SUPABASE_PROJECT` | Matching Supabase reference for a Supabase connection |
| `WPAY_AUTH_DEV_CA_FILE` | Optional trusted project PostgreSQL CA certificate path; TLS verification remains enabled |
| `WPAY_AUTH_DEV_MFA_KEY` | Persistent externally stored 32-byte random encryption key, canonical base64; never regenerate on restart |
| `WPAY_AUTH_DEV_FIXED_FEE_CURRENCY` | Explicit INR, USD or USDT configuration before Merchant approval; no inferred default |
| `WPAY_AUTH_DEV_INTEGRATION_CONFIRM` | Acceptance only: `allow-new-synthetic-records` on the separate empty target |

Supabase connections require matching `db.<reference>.supabase.co:5432` or a session pooler `aws-<number>-<region>.pooler.supabase.com:5432` with user `postgres.<reference>`. Copy the actual host from the authorized project's Connect panel. The service verifies TLS/hostname and rejects transaction port 6543, weakening URI options, unknown hosts and mismatched references. Local targets require numeric loopback. Pool/statement/connection/lock limits remain bounded. [Supabase PostgreSQL connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS verification](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Scoped dependencies

Node 24 is the inspected runtime. Direct packages are pinned in `lib/wpay/auth/runtime/dependencies/package.json`. Root manifests/lock/start remain frozen. The genuine npm-generated lock is now present and verified. Reinstall only within this boundary using the reviewed lock and official registry:

```sh
npm ci --prefix lib/wpay/auth/runtime/dependencies --registry https://registry.npmjs.org/ --ignore-scripts
```

The official scoped install and a clean npm ci in a fresh isolated copy passed with Node 24.20.0. The loader refuses a root/transitive fallback. Run `node --test test/wpay-mfa-packages.integration.js` for real RFC vectors and independent PNG decoding; it requires the installed scoped packages and the declared root html5-qrcode decoder.

## Development commands

After isolation verification, dependency installation and private connection/key setup, run from the repository:

```sh
node scripts/migrate-wpay-auth-dev.js
node scripts/bootstrap-wpay-auth-admin.js
node scripts/serve-wpay-auth-dev.js --port 4174
```

The separate development URL is `http://127.0.0.1:4174/wpay-auth/`. Task 6A verified this listener and then stopped it; private database files and keys are retained. Exact numeric Host/Origin is required; `localhost` fails. Do not use legacy `npm start` for this service. Task 4's preview remains separate.

Bootstrap accepts no arguments, requires an interactive terminal and reads the password twice without echo. It creates a single Super Admin atomically, guarded by an advisory lock/singleton/email uniqueness; it never resets existing accounts or promotes the first registrant. That Super Admin must enroll MFA through the real login flow. There is no HTTP bootstrap, public elevated registration or default password. Internal Admin/Employee provisioning remains a separate trusted operator concern; this task adds no public provisioning endpoint.

## HTTP contract

All routes are under `/wpay-auth/`; every protected request re-resolves current account, grants, approval, session epoch, MFA factor/security versions and encrypted factor. It uses the unchanged principal adapter and policy inside the database transaction. There is no cached/legacy/demo identity fallback.

| Route | Gate and behavior |
| --- | --- |
| POST `csrf` | Exact Origin, empty JSON, persistent throttle; digest binding to both current session and restricted challenge |
| POST `register` | CSRF, strict User/Merchant fields, persistent throttle; pending application transaction, no session |
| POST `login` | CSRF, password and current approval/status; restricted five-minute MFA challenge only |
| POST `mfa/setup`, `mfa/verify`, `mfa/recover`, `mfa/complete` | CSRF, opaque persisted purpose/version-bound challenge; real proof before atomic promotion |
| GET `me`, `navigation` | Current full session, `profile.view`; policy owner/tenant SQL and actual navigation |
| GET `pending-users`, `pending-merchants` | Current full session, respective explicit view grant and server-resolved admin scope |
| GET `approval-options` | Current full session and applicable directory view grant; configured currency/networks only |
| POST `approval` | Current full session, recent MFA, exact approval/rejection grant/tenant/record, strict commercial payload/idempotency |
| GET `security` | Current full session, `account_security.view`, current principal's sessions only |
| POST `security/replace`, `security/regenerate`, `security/stepup` | Owner-record `account_security.update`, fresh password plus unused TOTP |
| POST `locale` | Merchant owner-record `profile.update`; exactly one allowlisted locale field |
| POST `refresh`, `logout`, `logout-all` | CSRF and current session ownership; idle update / persisted revocation / epoch increment |
| GET fixed HTML/CSS/JS/favicon | Exact Host, static allowlist, restrictive CSP/no-store |

Only pending lists accept `offset`, 0–999999, pages of at most 100. Other client-selected account IDs/query fields are rejected. Approval identifies its target through the explicit audited workflow; it is not a generic permission executor. No financial or raw OTP endpoint exists.

Passwords retain async scrypt N=131072/r=8/p=1, fresh salt, bounded memory/work queue and safe comparison. Session/challenge/CSRF tokens have 32 random bytes; PostgreSQL stores their digests. Sessions last 12 hours absolute/30 minutes idle. GET does not extend idle expiry; protected POST refresh runs only for a visible browser with recent activity. Logout-all advances the account epoch, invalidating old sessions and challenges.

The three dedicated cookies are HttpOnly, SameSite=Strict, path `/wpay-auth/`, no Domain. Secure is absent only for numeric-loopback HTTP development; this is not production HTTPS configuration. Other local applications remain within the development trust boundary. Every POST has exact Host/Origin, bounded UTF-8 JSON and session/challenge-bound CSRF. Authentication tokens appear only in Set-Cookie; only the non-sensitive locale is in localStorage. Setup/recovery secrets appear transiently only in their authorized owner flow and must never be captured in screenshots or logs.

## Migration and verification commands

Migrations 001 and 002 were applied during Task 6A and both are now immutable; migration 002 extends only the new private `wpay_auth` schema and preserves legacy files/tables. The runner validates recorded SQL checksums and schema fingerprints; startup validates without applying migrations. Related approval/security mutations are transactional and fail closed on lock/serialization/outage errors. Private tables use RLS and revoke public/browser/API-role privileges.

Independent checks:

```sh
node scripts/check-protected-legacy.js
node --test test/protected-legacy.test.js test/statement-parser-contract.test.js test/verification-source-contract.test.js test/wpay-authorization-policy.test.js test/wpay-navigation.test.js test/wpay-principal-context.test.js test/wpay-preview.test.js test/wpay-auth-runtime.test.js test/wpay-auth-security.test.js
npm run check
```

Explicit actual PostgreSQL/HTTP acceptance, only against its confirmed empty target:

```sh
node --test test/wpay-auth-db.integration.js
```

This delegates to `test/wpay-auth-security.integration.js`; do not invoke both together against the same target. It fails preflight instead of silently skipping when target/key/dependencies are missing. It never removes account records to make a run pass. Subsequent reruns need a new empty authorized acceptance target. Test key and synthetic factor values must remain private; console output records statuses only.

Run the legacy full `npm test` only in the authorized runner with inherited database/provider/dashboard configuration cleared. Task 6A passed 309 tests and the startup smoke with approved execution; the previous ENOMEM blocker is resolved in that runner. Do not modify or bypass the protected runner.

Task 6A executed real browser acceptance covering: registration/pending denial, Admin approval, real enrollment/challenge/login/logout, owner Security, every Merchant locale and narrow Russian/mobile layouts. Capture only secret-free states after clearing setup keys/QR/recovery codes. No fixture screenshot is acceptance evidence. Existing deployed legacy routes are outside this auth boundary until a separate integration task.
