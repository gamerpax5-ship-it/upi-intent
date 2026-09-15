# WPay Task 7: isolated application and integration boundaries

## Current authorization and state — 2026-09-15

The owner paused Railway resource creation/deployment and declined a Hobby upgrade. Keep the existing Trial and legacy service unchanged. The earlier $15/month additional budget does **not** authorize spending while this pause remains in force. GitHub push is separately paused until the owner confirms writer access is ready. Local source, tests and commits are authorized.

This source implements hosted transport, isolated migrations, authentication, actual APK delivery, and read-only ownership adapters. It is not a hosted deployment, verified live source connection, financial ledger, or operational collection system. The public application entry points have no legacy reader configured. They report **Device/source not connected**. Synthetic records exist only in explicitly named local acceptance databases and are never shipped as application fixtures.

## Source boundaries

- All 197 baseline files at `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541` remain frozen, including root manifests/lock/start, existing workflows, APK/device configuration, OTP routers/dashboard, statement matcher, UTR and deeplink engines.
- The new HTTP server is independent. It does not mount legacy routes or apply WPay authentication to legacy APIs. Root `npm start` continues to start the legacy server.
- Root dependencies are unchanged. MFA dependencies use the separate genuine lock under `lib/wpay/auth/runtime/dependencies`.
- New WPay schema migrations 003–005 add restricted runtime grants, resource links/audit and a correction for unscoped Admin grants. Original 001/002 and previously applied 003/004 checksums are retained. The correction removes the additive `apk.view` grant from Admins with no tenant scope; it does not invent administrative scope. User APK access and explicitly scoped Admin/Super Admin access remain independently authorized.
- New tests reuse protected initializers only on fresh, empty synthetic databases. They never mount these initializers in the new application or run against a live source.

## Hosted profile (prepared, activation paused)

Use a **new** WPay service. Before attaching source, configure its custom Railway config path as `deploy/wpay/railway.toml` and its source branch as `wpay/hosted-integration`. Confirm effective build/start settings before a first deployment; the repository's root start remains legacy. Configure Node 24 for the new Railpack service. The profile installs both locked trees from the official npm registry, omits development dependencies and starts `node scripts/serve-wpay-hosted.js`. One replica, `/readyz`, 60-second health deadline and three failure restarts are specified. No resource or spending limits have been changed remotely.

Runtime variables, configured privately on the new service only:

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Railway supplied, valid integer port |
| `WPAY_HOSTED_ORIGIN` | Exact canonical HTTPS origin; no path, credentials or custom port |
| `WPAY_HOSTED_DATABASE_URL` | Dedicated `wpay_runtime` identity on the new database's private `*.railway.internal:5432` endpoint |
| `WPAY_HOSTED_TARGET` | Exact `hostname:5432/database` confirmation |
| `WPAY_HOSTED_NETWORK` | `railway-private-network` |
| `WPAY_HOSTED_MFA_KEY` | Persistent 32-byte base64 key generated privately for this new hosted target; never copy local acceptance keys |
| `WPAY_HOSTED_FIXED_FEE_CURRENCY` | Explicit business choice among supported INR/USD/USDT; absent means Merchant approval is unavailable |

No fallback to `DATABASE_URL`, Supabase or development databases exists. Public PostgreSQL endpoints are rejected; `ssl:false` is restricted to confirmed Railway private networking. Runtime rejects a migration connection variable. The runtime verifies its database role, schema fingerprint/migration checksums, dependencies, and decryption of existing enrolled factors before listening. Database failures close readiness. It binds `0.0.0.0`; development still binds loopback.

Cookies use `__Host-wpay_*`, Secure, HttpOnly, SameSite Strict, Path=/ and no Domain. Host and Origin are exact; POST requests also require the existing bound CSRF proof. Forwarding headers are ignored as authorities for scheme, host or client address. Only `GET /readyz` accepts `healthcheck.railway.app`, without Origin; this host cannot access other endpoints. HSTS is set in hosted mode. Shutdown stops new requests, drains connections and closes the pool.

**Capacity limits:** password hashing retains scrypt N=131072, r=8, p=1 and at most two active hashes, with a bounded queue of eight. A Windows Node 24.20.0 measurement with two concurrent hashes and verification peaked at 314 MiB RSS (57 MiB baseline). This is not a Railway/Linux capacity guarantee. A 256 MiB panel cap is insufficient for the measured workload. Recheck total panel/database memory, CPU and cost before authorizing any hosting. Socket-peer throttling is conservative behind a proxy; users sharing a Railway peer may share rate limits. Do not trust arbitrary X-Forwarded-For to avoid that constraint. Confirm a trustworthy proxy/client-IP contract before expanding traffic.

## Isolated database and first administrator

After hosting is separately approved, create a dedicated database and separately managed login roles `wpay_migrator` and `wpay_runtime`. Both must be NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS and NOREPLICATION, with no inherited role memberships. The migrator owns only the new WPay database/schema. Runtime owns no objects and cannot create database/schema objects. Provision passwords through private supported mechanisms, outside source and command history.

Run `node scripts/migrate-wpay-hosted.js` as an operator job on the confirmed private network, with `WPAY_HOSTED_MIGRATION_DATABASE_URL`, target and network confirmation. The runtime role must already exist. Never put the migration URL in the panel service environment. Migration checksums and schema fingerprints are enforced; do not edit an applied migration or reset the database to hide drift.

For a fresh hosted database, `node scripts/bootstrap-wpay-hosted.js` is an operator-only command. It requires production mode, the migration connection, exact `WPAY_HOSTED_BOOTSTRAP_CONFIRM=WPAY_HOSTED_TARGET`, and private `WPAY_HOSTED_BOOTSTRAP_NAME`, `WPAY_HOSTED_BOOTSTRAP_EMAIL`, `WPAY_HOSTED_BOOTSTRAP_PASSWORD`. The database's one-time bootstrap guard prevents a second initial administrator. Remove this temporary operator environment afterwards. No HTTP bootstrap endpoint exists; the administrator must enroll and verify an authenticator and acknowledge recovery codes before panel access. Hosted bootstrap success has not been tested on Railway. Use the existing private key for subsequent starts and recovery.

Backups, restore retention and a restoration drill on the new hosted database must be verified before activation. No hosted backups currently exist because no new hosted database exists. Never roll back by deleting account data, reversing migrations destructively, or replacing the MFA key.

## Ownership and read contracts

The server resolves account identity from the current approved, MFA-authenticated session. `resources/request` records explicit recent-MFA consent; knowledge of a resource reference never proves ownership. New requests remain pending. The runtime cannot set a mapping's verification evidence, verifier or owner. Resource linking requires independent identity/device-holder or business-assignment verification by a separately authorized operator, with a different verifier, evidence digest and valid interval. A production verifier workflow and approved source connection are still required. Do not manually mark live mappings verified solely to unblock the UI.

Before connecting a source, identify its actual database and obtain approval for a separate `wpay_legacy_reader` connection. `createLegacyReader` rejects privileged roles, memberships, broad sensitive-table reads and access to device credentials, OTP/message columns, SMS/raw result or UPI URI. Required column projections are enumerated in `test/wpay-resources.integration.js`; use them as a review contract, not permission to alter production grants. Do not pass owner credentials. Inject the validated reader into `AuthService` only after the live source/mapping process is approved and tested. No environment shortcut activates it today.

Mappings are account/source/kind/reference bound, with one active owner per resource, consent, independent verification and a validity window. Reads hold mapping locks through the bounded source query and audit; revocation serializes with reads. OTP/transaction/statement pages use 50-row numeric cursor pagination. Source SQL includes the exact device/import/order and valid interval before execution. Transaction/statement reads additionally require a verified receiving-account parent and intersect the windows. Device-level transaction observations are **not** proof of which bank account received money on a multi-account device.

| Capability | Implemented and tested locally | Live condition |
| --- | --- | --- |
| User OTP events | Own verified device timestamps/length, fixed mask, last-seen observation, bounded refresh; no raw OTP/message columns read | Disconnected pending authorized reader and independent mapping |
| Merchant OTP/SMS | Denied; no source OTP navigation | Remains denied |
| Admin/Employee raw OTP | Denied; broad role confers no sensitive data access | No reveal feature enabled |
| UTR/statement observations | Exact mapped device/import, receiving-account parent and time window; provenance separate from evidence/accounting | Disconnected; not financial proof |
| Merchant orders | Exact mapped legacy order/claim output, submitted UTR clearly labeled; no receiving UPI/device secrets | Disconnected |
| APK | Actual existing file, dynamic JSON, hash-bound Android manifest/signing attestation, authenticated binary download | Available when the separate app is running; no artifact changes |
| Deeplink/checkout | Existing engine and public link contracts remain intact and regression tested | New creation disabled |
| Matching, collection, accounting | No live mutation mounted | Blocked by legacy global matching and missing pre-match isolation, verified assignment/UPI, atomic capacity reservations, trusted evidence and ledger |

Source `legacy_status`, customer-submitted UTR, match timestamp, ownership verification, trusted evidence, accounting and settlement are separate facts. A legacy success is not promoted into WPay credit or settlement. No bank login, PIN, OTP use or payment initiation occurs. Future statement-recovered pay-in must deduct User capacity once, credit/update Merchant once, award zero User commission and prevent duplicate economic posting.

## CI, activation and rollback

`.github/workflows/wpay-isolated.yml` runs on the dedicated branch or manual dispatch with read-only repository permissions. It installs both locks and runs protection, syntax, the unchanged full suite, real scoped package execution, migrations, HTTP/MFA and source-isolation tests against disposable PostgreSQL. No production secrets are used. It has not run on a remote SHA because push is paused. Inspect PR environment automation before opening a PR.

Before activation, verify pushed SHA/tree, successful CI for that SHA, new-service effective config, hosted database identity/migrations/backup, private secret persistence and isolated bootstrap. Then verify the actual deployment SHA, HTTPS readiness and real browser approval/MFA/logout/locales/APK. Live source reading needs its own consent and redacted owner-performed evidence. Do not claim device delivery or payment acceptance from synthetic tests.

On a regression, stop only the new WPay service or disable the affected reader. Keep legacy service configuration, endpoints and database unchanged. Preserve WPay data and keys. Deploy a previously verified compatible commit only if it recognizes the current migration history; otherwise use a forward fix. Cross-owner leakage, MFA/session failures, financial status promotion, artifact mismatch, failed readiness or any protected-file drift blocks rollout.
