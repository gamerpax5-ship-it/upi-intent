# WPay Task 6A — verified local acceptance

Verified on 2026-09-15 in the existing workspace, branch `audit/wpay-legacy-protection`, HEAD `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541`. Task 6A local acceptance is complete. This is not a production deployment or financial-system acceptance. The earlier blocked Task 6/6A deliveries remain preserved as historical evidence.

## Eight independent results

| Area | Executed result |
| --- | --- |
| Dependencies | Official npm install succeeded; genuine scoped lock, 38 installed packages. Fresh isolated `npm ci` succeeded using the official-registry cache. Manifest/lock hashes match; both installed trees execute. |
| TOTP / QR | 2 installed-package tests passed: all six RFC 6238 SHA-1 vectors, wrapper six-digit/replay/expiry checks, and independent ZXing decoding of the actual generated PNG. |
| PostgreSQL / migrations | PostgreSQL 18.4, verified private cluster on 127.0.0.1:54117. Separate `wpay_6a_dev`, `wpay_6a_accept_001`, `wpay_6a_accept_002`. Actual migrations 001/002 applied and checksums/fingerprints validated in all three; zero public application tables. |
| Real PostgreSQL / HTTP | 23 tests passed, 0 failed/skipped, both before and after the QR fix on distinct fresh acceptance targets. Real repositories, HTTP, maintained libraries and DB clocks. |
| Browser | Actual registration/pending denial, Admin MFA/approval, User/Merchant enrollment, recovery acknowledgement, subsequent Merchant TOTP login, logout/logout-all, Security, en/ru/zh-CN, saved ru/zh-CN after re-login, and mobile 390×844 navigation/forms. No browser warnings/errors. Real safe screenshots supplied. |
| Standalone / syntax | Complete documented standalone set: 273 passed, 0 failed, 1 DB-dependent verification-source contract skipped. That contract ran in the full suite. `npm run check`: 42 files; all 41 added JavaScript files also passed `node --check`. |
| Legacy full suite | Unchanged `npm test` passed 309 tests, 0 failed/skipped, plus real disposable-PostgreSQL `npm start` health/create/read/checkout smoke. Previous ENOMEM blocker resolved in the approved runner; no runner patch. |
| Existing OTP | All 197 protected hashes match before/after. Existing OTP contracts 5/5 and Android source/export regressions 3/3 passed before/after. Live device-to-dashboard delivery: **NOT TESTED**. |

Counts overlap: standalone and OTP tests also occur in the full suite. They must not be added together as unique coverage.

## Prerequisites and isolation

The earlier cache probe succeeded while registry HTTPS failed EACCES before any HTTP response. With supported narrow approvals, the exact official-registry scoped install succeeded; no mirror, TLS bypass, global setting or root dependency change was needed. Pinned packages remain otplib 13.5.0 and qrcode 1.5.4. Node 24.20.0 / npm 11.19.0 executed them successfully.

Existing reviewed PostgreSQL binaries were initialized and started through approved commands in `work/task6a-local-private/cluster`. No binary download, system service, OS identity change or container/cloud resource was created. The server-reported data directory and numeric loopback endpoint were checked before target creation. A used acceptance database was never reset: the second full auth run used newly created accept_002.

Previously created development/acceptance MFA encryption keys and PostgreSQL password were reused from the restricted private directory outside the repository. They now protect actual factors. No encryption key was replaced. Synthetic browser credentials/factors/recovery material remain only in that private directory; they are excluded from source snapshots, patches, logs and delivery. No hosted Supabase/Railway target was retried or touched.

Migration SQL 001 and 002 remains byte-for-byte unchanged. Their recorded SHA-256 values are respectively `d0cd08bd546ebe3b1d4116e76cddd1e4e89ac899fb8cae0259649cfa461bd4cb` and `54198614b2a8c1eaae620d41b1acc1ae53ce6a50fb833e4b799dbdee5c3d5ecb`.

## Repairs found by acceptance

1. The forced 240-pixel QR raster failed independent ZXing decoding for the reference enrollment URI. Integer four-pixel modules with a four-module quiet border decoded correctly. The generator now uses scale 4/margin 4, and the browser no longer forces the image to 240 pixels. Existing responsive maximum-width styling remains. The PNG is decoded in memory; no enrollment QR is exported.
2. The bootstrap CLI's success message still claimed read-only grants although the Task 6 bootstrap grants permit application approval after MFA. The message now describes the actual behavior. Privileged provisioning behavior and grants did not change.
3. A new explicit package integration test executes real packages against independent reference expectations. Its PNG scanline reader uses Node zlib; QR recognition uses ZXing bundled inside the already declared root html5-qrcode dependency. No new root dependency or homemade TOTP/QR algorithm was introduced.

otplib omits standard URI defaults. The decoder checks effective SHA-1, six-digit, 30-second configuration, issuer, account label and secret, using the documented URI defaults. References: [RFC 6238 Appendix B](https://www.rfc-editor.org/rfc/rfc6238#appendix-B), [Key URI Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format), [otplib 13.5.0](https://github.com/yeojz/otplib/releases/tag/v13.5.0), [qrcode 1.5.4](https://github.com/soldair/node-qrcode/tree/v1.5.4).

## Database / HTTP scenario coverage

- User/Merchant registration stays pending and unauthenticated; duplicate/concurrent registration and rollback are checked.
- Pending, rejected, inactive, password-only, wrong/unknown credentials and invalid/stale challenges cannot enter panels or enroll improperly.
- Admin must complete real MFA and recovery acknowledgement before approval. Commercial approval atomically saves settings/status/audit; invalid currency/values, scope, concurrency and idempotent retries are tested.
- Enrollment, wrong/expired/replayed TOTP, concurrent single-use TOTP/recovery, recovery acknowledgement, replacement/regeneration, security versions and revocation are exercised against real storage.
- User, Merchant, Super Admin, Admin and Employee all require MFA. Privileged identities are explicitly provisioned only inside the isolated fixture boundary; no public provisioning endpoint was added.
- Logout, logout-all, idle/absolute expiry, suspension, permission/version changes, pre-MFA sessions, tenant/owner boundaries, CSRF/origin checks, persistent throttles, schema drift and DB outage fail closed.
- Unfunded approved accounts still cannot perform financial operations. Locale persistence preserves grants/navigation machine identifiers and commercial decimal amounts.

The suite's in-process server/pool restart was supplemented with actual OS process replacement. Browser Admin session survived process 30692 → 27972, and Merchant session survived 27972 → 13828, using the same persisted key and DB. Separate actual server processes with missing and wrong keys exited 1 with WPAY_AUTH_UNAVAILABLE before listening. No stored key/factor was altered for those failure tests.

## Browser evidence and limits

The browser used only `http://127.0.0.1:4174/wpay-auth/` and the separate development DB. The synthetic bootstrap administrator was created through the existing internal service bootstrap; interactive CLI password entry was not exercised. All registration, pending denials, approvals, enrollment and subsequent login actions described as browser checks used the real UI, not Task 4 demo personas.

Enrollment/recovery values were held privately by automation and never emitted or screenshotted. Safe screenshots show only empty credential fields or authenticated synthetic account states. Russian mobile navigation, Security and registration/login forms were inspected at 390×844; Chinese and English account states were also inspected. Full-page captures are supplementary; viewport captures avoid browser stitching artifacts.

The browser console warning/error log is empty. A passive, work-directory-only request observer recorded method/path/status during the final restart/locale/login/logout checks: all observed requests remain under /wpay-auth/, with no legacy API call. It did not capture bodies, query values, headers, cookies or responses. Earlier browser steps were verified through UI state and console; the network observer was not active for those steps. Static CSP restricts connections to the same origin, and the development server exposes no legacy routes. This is not a packet capture of unrelated applications.

Human translation review and a physical authenticator-camera scan were not performed. Independent PNG decoding and maintained-library TOTP were performed. Recovery replacement/concurrency and Admin/Employee MFA beyond the bootstrap administrator were verified by real HTTP integration tests, not claimed as separate browser exercises.

## Existing OTP: four separate conclusions

**A. Protected files:** all 197 baseline hashes match. APK/device pairing and activation, SMS/banking OTP capture/parsing, ingestion/storage/APIs, dashboard handlers, legacy auth/config, deeplink, UTR, statement and checkout files remain byte-for-byte untouched. The baseline was not regenerated.

**B. Executed regressions:** five existing device OTP module/contract checks and three Android source/export checks passed both before and after. The legacy full PostgreSQL suite also passed. These are not Android instrumentation or physical device delivery tests.

**C. Indirect configuration impact:** scoped node_modules/lock and task-local cache were added; a separate private loopback PG cluster and WPay-only databases were created; only dedicated child-process WPAY_AUTH_DEV variables and cookies/path /wpay-auth/ were used. No legacy startup mount, environment setting, port setting, cookie, root package/lock, deployment setting, device config or existing OTP DB object changed. The legacy smoke used only its own new disposable target. New principals received no OTP/SMS access. No device OTP API is routed through WPay MFA.

**D. Live device-to-dashboard delivery: NOT TESTED.** No real banking authentication, SMS, device token or live OTP was accessed or manufactured. Hashes and regressions are not live-delivery proof.

## Exact source scope

Relative to the preserved 58-file pre-resume state, six existing additions changed and two files were added (60 final additions; 52 prior files unchanged):

| Path | Reason |
| --- | --- |
| lib/wpay/auth/runtime/dependencies/package-lock.json | Added genuine npm-generated scoped lock. |
| test/wpay-mfa-packages.integration.js | Added actual reference-vector/PNG decoding acceptance. |
| lib/wpay/auth/runtime/mfa.js | Integer QR module scaling and complete quiet border. |
| dev/wpay-auth/web/app.js | Display natural QR dimensions. |
| scripts/bootstrap-wpay-auth-admin.js | Correct stale success message only. |
| docs/wpay-auth-development.md | Current verified status and reproduction instructions. |
| docs/wpay-task6.md | Mark prior blocked status as historical and superseded. |
| docs/wpay-task6a.md | This final acceptance report. |

No tracked files, migrations, permission contracts or unrelated Task 1–4 additions changed. No patch was applied to this workspace, and there was no reset, clean, staging, commit, push, merge or deployment. All source before/after hashes and reasons accompany the delivery.

## Reproduction

Run from the repository after privately configuring the dedicated target/key. Never paste credentials into a command, report or chat. Do not reuse either populated acceptance target for a fresh run.

```sh
# Exact successful initial scoped install (now use the reviewed lock for reinstall):
npm install --prefix lib/wpay/auth/runtime/dependencies --cache ../task6a-npm-cache --registry https://registry.npmjs.org/ --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000
# After copying only scoped package.json/package-lock.json into a NEW empty folder:
npm ci --prefix ../task6a-clean-mfa-package --cache ../task6a-npm-cache --registry https://registry.npmjs.org/ --ignore-scripts --no-audit --no-fund --offline
node --test test/wpay-mfa-packages.integration.js
node scripts/migrate-wpay-auth-dev.js
node --test test/wpay-auth-db.integration.js
node scripts/serve-wpay-auth-dev.js --port 4174
node scripts/check-protected-legacy.js
node --test test/device-otp-router.test.js test/android-background-regression.test.js
npm run check
# Clear inherited database/provider/dashboard variables first; approved runner:
npm test
```

The retained private work launcher injects existing settings without printing them: from workspace root, `node work/task6a-run.cjs migrate dev` or `node work/task6a-run.cjs serve dev` after the private cluster is running. The acceptance launcher must target a newly created, explicitly verified empty database; do not rerun against used accept/accept002 configs.

Cluster commands used the existing `node_modules/@embedded-postgres/windows-x64/native/bin` binaries: initdb with the private cluster path, user wpay_local, scram-sha-256, UTF8, locale C and existing private password file; pg_ctl start with -h 127.0.0.1 -p 54117 -c io_method=sync. Initializing an existing cluster is prohibited. Restart only the retained cluster with the retained keys.

At delivery both task listeners (4174 and 54117) are stopped/connection-refused; all database files and private settings remain preserved. The HTTP service was stopped deliberately after verification. PostgreSQL had already exited after the turn interruption (pg_ctl reported no such process); it was not reset or replaced.
