# WPay — Task 1 repository audit

Audit date: 2026-09-15. Repository: `gamerpax5-ship-it/upi-intent`.

## 1. Scope and inspected state

Task 1 adds protection, documentation and separate tests only. No panels or financial services were implemented. No existing runtime, dependency, lockfile, database schema, startup, deployment, test or vendor file was edited. No push, merge, deployment, production database connection or real payment occurred.

| Item | Evidence |
| --- | --- |
| Downloaded branch | `main` |
| Inspected HEAD / protection baseline | `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541` |
| Initial working tree | `git status --short`: empty, fresh isolated checkout |
| Local working branch | `audit/wpay-legacy-protection`, same HEAD, additive uncommitted deliverables |
| Checkout | Task workspace `work/upi-intent`; clone used `core.autocrlf=false` for exact bytes |
| Existing instructions | No ancestor/root AGENTS.md found. `vendor/smart-upi-parser/AGENTS.md:1` prohibits rewriting published history and warns that pushes sync to Lovable. It is unchanged and protected. |
| Coverage | All 197 baseline tracked files enumerated and hashed from Git blobs; checkout bytes independently compared to those blobs. Source tracing concentrated on runtime, Android event flow, browser scripts, SQL, tests and workflows. This is not an exhaustive review of every vendored UI component or third-party minified implementation. |

A fresh checkout cannot establish the status of unrelated user checkouts; none was overwritten or reset. The recorded state applies to this audit checkout only.

## 2. Actual stack, startup and initialization

- Root `package.json:1`: CommonJS Node (engine >=20), Express 5, `pg`, `html5-qrcode`; `embedded-postgres` is a dev dependency. Browser UI is static HTML/CSS/plain JS. There is no root React/Vite build step.
- `npm start` is `node server-wrapper.js`. `server-wrapper.js:13` creates the PostgreSQL pool from `DATABASE_URL`; missing DB is fatal. `.env` is not auto-loaded. `server.js:19` requires a real pool.
- Initialization order in `server-wrapper.js:16`: core tables → device tables → location history function/trigger → payment verification → credit candidates → OTP → statements. Initialization executes DDL, including replacement of the location function and dropping/recreating its trigger. Therefore even a startup check must use a disposable database.
- Wrapper installs 2 MB JSON parsing, login/logout, selected dashboard gates, pairing validation, device/statement/verification routers, then the core app. Core installs 64 KB JSON parsing, static assets, payment/order routes and errors (`server.js:59`). Because the wrapper parsed JSON already, its 2 MB limit is the effective first limit for wrapper requests; do not assume the nested 64 KB parser limits all requests.
- `server.js:271` and `server-runtime.js:6` are alternative entrypoints, not the package start path. `server-runtime.js` lacks wrapper dashboard gates, statement/OTP/location composition. Do not deploy either as an equivalent replacement.
- Kotlin Android: AGP 8.7.3, Kotlin 2.0.21, Java 17, compile/target SDK 35, min SDK 26, WorkManager 2.9.1 (`android-app/build.gradle.kts`, `android-app/app/build.gradle.kts`). Android SQLite stores queued events; SharedPreferences stores pairing/local status. This local device storage is separate from backend PostgreSQL.
- `vendor/smart-upi-parser` is a separate TanStack/React/Vite source snapshot. Root startup neither builds nor mounts that app. Runtime statement parsing is the implementation in `public/statement-parser.js`, loading committed XLSX/PDF.js runtime files. Source snapshot lineage is not proof of exact runtime/source equivalence.
- Railway is referenced by the APK API base URL, `.env.example` and README. No tracked Railway/Docker/Procfile deployment manifest was found. Actual hosting settings and live environment were not queried or verified.

### Database inventory (existing only)

| Tables/function | Initializer and meaning |
| --- | --- |
| `payment_links`, `payment_orders` | `server.js:19`: short-link URI/status/24h expiry; separate PhonePe provider-order lifecycle |
| `device_pairings`, `devices` | `lib/device-pairing.js:6`: hashed short-lived pairing codes and device credentials/SIM fingerprints; supplied phone and metadata |
| `device_diagnostics`, `device_transactions` | Same initializer: telemetry, raw JSON, SMS bodies and transaction-result observations |
| `device_location_history`, `wpay_capture_location_history`, diagnostics insert trigger | `lib/device-location-history.js:53`: permission/location transitions, movement >=75m and 10-minute checkpoints; SQL trigger is the actual persistence mechanism |
| `payment_claims`, `device_credit_events` | `lib/payment-verification.js:16`: claim per payment; globally unique normalized UTR; device credit unique on `(device_id, utr_normalized)` |
| `device_credit_candidates` | `lib/device-credit-router.js:5`: ambiguous reference review queue with raw SMS |
| `device_otp_events` | `lib/device-otp-router.js:8`: hash-deduped event, full code/raw message despite masked column names |
| `statement_imports`, `statement_credit_events` | `lib/statement-match-router.js:36`: globally unique file hash; event unique within import/date/UTR/amount |

None of these initializers creates User, Merchant, bank-account ownership, tenant membership, employee permission, financial ledger, commission, reservation, funding or merchant-assignment tables. Numeric SQL columns do not prevent current JavaScript `Number`/`toFixed` rounding.

## 3. Dependency and contract map

Authentication abbreviations below describe **the package wrapper**, not standalone routers:

- **Dashboard**: signed `wpay_dashboard_session` cookie. If no password and NODE_ENV is not production, the gate permits access. In production, missing password returns 503. Unauthorized API is 401; page redirects to `/login`.
- **Device**: `x-device-id`, `Authorization: Bearer <token>`, active device, SHA-256 credential comparison; the listed device ingestion routes also compare `body.simFingerprint` to the stored hash. These authenticate a device, not an account owner or bank-issued evidence.
- **Public**: no session gate in wrapper. Possession of a valid link/order identifier is effectively access to these endpoints.

Dashboard authentication endpoints: `GET /login` serves `public/login.html`; `POST /api/dashboard/login` accepts username/password and returns `{ok:true}` plus the signed 12-hour cookie (401 invalid credentials, 503 no configured password); `POST /api/dashboard/logout` clears that cookie and returns `{ok:true}`. These do not write a session table. Credentials come from DASHBOARD_USERNAME (default admin), DASHBOARD_PASSWORD or DASHBOARD_DEVICE_KEY; the signing secret falls back to the password. See `lib/dashboard-auth.js:12`, `:63`, `:78` and `server-wrapper.js:29`. The inline login handler is at `public/login.html:24`. `GET /health` is public, reads `select 1` and returns database/service/provider-configuration status (503 missing/unavailable DB), without proving provider connectivity (`server.js:73`).

### Pairing, APK, OTP and telemetry

| Actual endpoint | Auth, inputs | Outputs and side effects | Source |
| --- | --- | --- | --- |
| `POST /api/devices/admin/pairing-token` | Dashboard; empty body | 201 `{pairingCode, expiresInSeconds:600}`; inserts hashed pending code | `lib/device-pairing.js:23` |
| `POST /api/devices/pairing-token/validate` | Public; `pairingCode` | `{ok,status:'pending',expiresInSeconds}`; 400 malformed, 410 invalid/expired; reads pairing | `server-wrapper.js:44` |
| `POST /api/devices/pair` | Public code exchange; code, deviceId, SIM fingerprint, phone/carrier/subscription/device/app metadata | 201 `{deviceId,deviceToken,simBound,phoneVerified,reusedExistingDevice}`; locks/claims pairing, reuses active matching SIM where found, rotates credential, upserts device. 409 conflicting SIM, 410 invalid/expired code | `lib/device-pairing.js:26` |
| `POST /api/devices/heartbeat` | Device; SIM | `{ok,serverTime}`; updates last_seen | `lib/device-pairing.js:27` |
| `POST /api/devices/diagnostics` | Device; SIM, battery/charging/network/carrier/location and other JSON | 201 `{ok}`; stores raw diagnostics and updates last_seen; DB trigger may add location-history row | `lib/device-pairing.js:28`, `lib/device-location-history.js:76` |
| `POST /api/devices/transaction-result` | Device; SIM, optional paymentId/UTR/status/app/amount/sender/smsBody/rawResult | 201 `{ok,utrStored}`; logs observation only; does **not** independently verify payment | `lib/device-pairing.js:29` |
| `GET /api/devices/admin/list` | Dashboard | `{devices}` latest telemetry/payment observation, max 100; global list | `lib/device-pairing.js:24` |
| `GET /api/devices/admin/device/:deviceId` | Dashboard; ID | `{device,events}`; latest 100 transaction observations including raw fields; 404 missing | `lib/device-pairing.js:25` |
| `POST /api/devices/otp-event` | Device; SIM, sender, otpCode (4–8 digits) or otpLength, messageMasked, receivedAt, source | 201 `{ok,status:'received',duplicate}`; full code/raw text persisted, hash upsert, last_seen updated; 400 bad code, 422 missing length | `lib/device-otp-router.js:60` |
| `GET /api/devices/admin/device/:deviceId/otp-events` | Dashboard | device metadata and latest 200 events; full `otp_code` and `message_masked` | `lib/device-otp-router.js:105` |
| `GET /api/devices/admin/device/:deviceId/location-history?limit=` | Dashboard | `{deviceId,events}`; limit clamped 20–500, default 300 | `lib/device-location-history.js:177` |

Android flow: manifest → `WpayApplication`/`SplashActivity`/`MainActivity` → `DeviceIdentity` and `ApiClient` pairing → `AgentStore`; `SmsReceiver` and `SmsInboxScanner` → `SmsProcessor` → `CreditSmsParser`/`OtpDetector` → `SmsEventStore` SQLite → `CreditRetryWorker`/WorkManager → `ApiClient` endpoints above and below. `BootReceiver` and `BackgroundMonitorService` resume heartbeat, diagnostics, inbox reconciliation and retries. `MonitorActivity` presents local event/status information. Layouts/resources, build settings, tests and manifest are all protected.

`public/device-dashboard.js` consumes admin list/detail, pairing, OTP/location history and APK metadata; dedupes devices in the UI by phone/SIM metadata and merges aliases. This is display logic, **not ownership authorization**. `public/index.html:66` loads it and contains inline tab handlers. Preserve these handlers and scripts together.

### UPI, checkout, credits and verification

| Actual endpoint/API | Auth, inputs | Outputs and side effects | Source |
| --- | --- | --- | --- |
| `Upi.parse/build/manual/targets` | Local JS; URI, amount/profile/ref/note/app | Exact mode preserves bytes; other modes append/fill/change defined fields; signed changes rejected; `scan` aliases `amount_only`. Manual mode includes `mode=04`. No bank verification | `public/upi.js:11`, `:83`, `:173`; `lib/providers.js` |
| `POST /api/payments` | Dashboard; upiUri, amount, profile, source, provider | 201 `{id,url,expiresIn:'24h',profile,provider}`; creates `payment_links` with original/final URI and requested amount. `WP`+8-character random ID; 400 invalid/unknown provider, Paytm adapter 503 | `server.js:200` |
| `GET /api/payments/:id` | Public | stored URI/profile/source/amount/status/expiry/provider; `statusVerified:false` even for a successful row; 404 missing, 410 expired | `server.js:249` |
| `GET /pay/:id`, `GET /pay`, static `/pay.html` | Public; ID or legacy query envelope | Checkout HTML; ID route loads unexpired payment; legacy page decodes URI. Generic HTML still served by static middleware | `server.js:260`; `public/checkout.js:340` |
| `GET /api/payments/:id/diagnostics` | Development + UPI_DIAGNOSTICS=1 + socket loopback | URI hashes/differences/targets, otherwise 404; no writes | `server.js:254`; `lib/diagnostics.js` |
| `POST /api/devices/credit-sms` | Device; SIM, exact 12-digit UTR, amount, sender, accountSuffix, receivedAt, smsBody | 201 `{ok,matched,paymentId,status}`; upserts credit evidence, matches pending claim, may update claim/link success; appends transaction log and last_seen | `lib/device-credit-router.js:10`; `lib/payment-verification.js:106` |
| `POST /api/devices/credit-sms-candidate` | Device; SIM, 10–14 digits excluding 12, amount and SMS metadata | 202 `needs_review`, matched false; candidate + transaction log; no auto-verification | `lib/device-credit-router.js:11` |
| `POST /api/devices/credit-sms-no-reference` | Device; SIM, amount and SMS metadata | 202 `credit_received_no_ref`, matched false; observation log only | `lib/device-credit-router.js:12` |
| `POST /api/payments/:id/utr` | Public; utr; amount taken from stored link/requested_amount | 202 pending or 200 verified; creates/upserts globally unique UTR claim, looks for exact SMS amount/time or statement fallback. 409 reused UTR, 410 expiry. Existing successful link returns success immediately | `lib/payment-verification.js:136` |
| `GET /api/payments/:id/verification-status` | Public | status/verified/masked UTR/verifiedAt/source/expiry; verified requires both link and claim success; does not reject solely because expired | `lib/payment-verification.js:210` |

Credit match dependencies: `recordCreditSms` → `matchCreditEvent` → transaction/row locks in `markMatched`. Matching uses exact UTR/amount and SMS inside creation-minus-10-minutes through expiry; account suffix is stored but not matched. UTR submission checks newest matching credit globally, then invokes `verifyClaimFromStatement`.

Checkout behavior differs from the generic UPI library: `public/checkout.js:61` builds PhonePe native base64 JSON, `:87` builds Paytm cash_wallet URI and `:101` builds a new QR URI from selected parsed fields. These paths drop original unknown/signature/other fields and use numeric amounts. Root README's broad raw-launch preservation claim does not describe this checkout. This is a protected compatibility/security risk to report, not fix in Task 1. `public/pay.html:82` uses an external QRCode CDN script; it is outside the checksum manifest's ability to pin remote response bytes.

Checkout needs an amount, launches only the selected PhonePe/Paytm button, checks expiry, accepts a 12-digit UTR, polls verification and shows success only after backend verification. Returning from an app or merely typing a UTR does not prove payment. `public/generator.js` sends decoded QR text unchanged to the create API, handles manual VPA mode, and never implements account approval.

### Provider-order path (separate from short links)

| Endpoint | Contract |
| --- | --- |
| `POST /api/orders` | Dashboard; amount INR 1–10,000,000, optional deviceOS. Calls PhonePe server OAuth/payment API, then inserts `payment_orders`. 201 id/provider/status/intentUrl/expiresAt/statusVerified:false. External creation precedes local insert, leaving an orphan/retry risk on DB failure. |
| `GET /api/orders/:id` | Public; stored order/transaction IDs, amount/currency/status/errors/timestamps. `statusVerified` means verified_at exists. |
| `GET /api/orders/:id/status` | Public; calls PhonePe status API and writes status/provider_response/IDs/verified_at. `COMPLETED`, `FAILED`, **and** `EXPIRED` set statusVerified true; only COMPLETED can be a candidate financial success. |

Sources: `server.js:89`, `:126`, `:156`; `lib/phonepe-pg.js:16`, `:107`. OAuth token stays server-side. Runtime defaults to sandbox but supports production configuration. No webhook receiver was found. No live provider call was made; code presence does not prove configured or working credentials. Paytm (`lib/providers.js:29`) remains deliberately unavailable even with configuration; a Paytm app link is not a Paytm gateway integration.

### Statement upload, parsing and matching

`public/index.html:51` → `public/statement-parser.js:180` → real committed XLSX or PDF.js assets → extracted rows → `POST /api/statements/match` → statement tables → exact match or missing-UTR recovery → claims/links. Server never receives the original file bytes in this path.

| Endpoint/function | Inputs | Outputs/side effects and auth |
| --- | --- | --- |
| Browser `WPAYStatementParser.parseStatement(file)` | PDF text layer, CSV, XLS, XLSX | `{transactions:[{date,utr,amount,mode}],rowsScanned,fileName}`; only UPI credits with exact 12-digit references, deduped. Password PDF, unreadable/no-text PDF and unsupported types have error paths. No OCR. |
| `POST /api/statements/match` | fileName, fileHash, rowsScanned, transactions date DD/MM/YYYY, UTR, positive amount <1e8; 1–5000 raw rows | Dashboard wrapper gate. Normalizes date/amount/UTR; dedupes rows; inserts/reuses import by client-supplied hash; inserts events; matches and writes claim/link success and event links. Returns ok/importId/fileName/rowsScanned/creditsFound/matched/recovered/ambiguous/unmatched/results. 400 invalid, 413 too many rows; wrapper body cap also applies. |
| `GET /api/statements/imports` | none | Dashboard; latest 25 global imports with counts; no owner/account filter. |
| `verifyClaimFromStatement` | paymentId, UTR, amount, createdAt | Exact UTR/amount and Kolkata creation date ±1 day; locks claim/link, marks success, sets `bank_statement_upload`, links event. Does not filter owner/account or require unclaimed event in its initial lookup. |
| `recoverMissingUtrFromStatement` | importId, normalized txnDate, UTR, amount | Rejects already-claimed UTR; finds pending links by amount and date inside link lifetime. Requires exactly one candidate and no existing claim. Creates successful claim with `bank_statement_missing_utr_recovery`; updates link/event transactionally. Candidate query includes pending links that have claims, so those can also cause ambiguity. No owner/account predicate. |

Sources: `public/statement-parser.js:142`, `:161`, `:173`, `:193`; `lib/statement-match-router.js:67`, `:131`, `:219`, `:283`, `:351`.

## 4. Findings and release blockers

| ID | Finding, evidence and impact | Required boundary |
| --- | --- | --- |
| B1 — BLOCKER | Global SMS matching (`lib/payment-verification.js:85`, `:174`), statement exact lookup (`lib/statement-match-router.js:73`) and missing-UTR candidate lookup (`:157`) do not know user/merchant/account ownership. A matching device or imported row is not bound to the assigned receiving account. Statement exact candidates include successful claims. | Multi-tenant financial integration cannot safely use these matching paths unchanged. Requires separately approved ownership-aware changes and backfill/evidence design. No proxy/SQL rewrite/auth-bypass workaround. |
| B2 — BLOCKER | Statement endpoint accepts browser-produced rows and hash without original-file authentication, issuer/account binding or independent confirmation; `normalizeHash` accepts valid-looking arbitrary hashes. Device authentication proves possession of credentials, not bank authenticity. | Trusted evidence requirements and assigned account/device checks must be resolved before ledger consumption. Unknown or insufficient evidence is quarantined, never posted. |
| B3 — security | Full codes and raw SMS are stored/returned under misleading masked field names (`lib/device-otp-router.js:75`, `:115`); Android sends and stores them (`CreditRetryWorker.kt:82`, `SmsProcessor.kt:85`, `SmsEventStore.kt:98`). Credit observations/raw diagnostics can also contain sensitive data. | No new propagation or collection of banking secrets; separate approval for legacy remediation, retention/access review and sanitization. No new OTP/APK capabilities in this task. |
| B4 — security/integration | `lib/device-pairing.js:20` local requireDashboard is a no-op; statement/OTP/location admin routers rely on wrapper. `lib/dashboard-auth.js:50` bypasses missing-password gate outside production. Shared time-only signed session has no principal/permissions and logout only expires browser cookie. No login rate limiter found. | Retain wrapper startup; new principal sessions and permissions must be independent. Never expose legacy credentials/API to User/Merchant or treat this session as their identity. Existing fixes need approval. |
| B5 — compatibility | Checkout reconstructs app/QR payloads instead of using byte-preserving UPI targets; README differs. JS amount conversion is floating point. | Preserve current behavior in this task; characterize each route separately. Future exact-money ledger must not inherit JS Number balances. |
| B6 — evidence/replay | Credit upsert can replace amount/time; device transaction logs append on retries. Statement import/hash reuse can add different rows to an existing import, and import/match loop is not one atomic transaction. File-hash dedupe is not cross-source financial idempotency. | Immutable future evidence snapshot, economic-payment-level unique posting key and atomic ledger transaction; never drive posting from response `matched` count. |
| B7 — identity | Pair response `phoneVerified:Boolean(phone)` only tests supplied string; stored `phone_verified` remains default false. Active same-SIM reuse is not bank ownership proof. | Do not equate device pairing/phone text with approved and verified UPI/account ownership. |
| B8 — coverage/artifacts | Existing CI is push/main or manual, not pull_request; backend workflow omits public/** in path filters. APK/vendor workflows can commit directly to main. APK debug signing and external QR script are current dependencies. | Do not trigger these publication workflows in Task 1. Separately approve PR-time protection/contract enforcement and artifact provenance policy before production use. |

No User/Merchant approval, activation, 2000-USDT funding rule, USDT confirmation service, fees, commission entitlement, capacity reservation, parking, merchant ledger, tenant isolation or employee RBAC exists in inspected runtime. These are future work.

### Verification-source facts that affect accounting

| Stored source | When written | Financial interpretation for future design |
| --- | --- | --- |
| `paired_device_credit_sms` | `payment-verification.js:70` | Candidate APK evidence only; owner/account/evidence validation still required. |
| `bank_statement_upload` | `statement-match-router.js:112` | First success through exact statement UTR/amount match can be missed incoming recovery even though response recoveredUtr is false. Such first-time recovery gets zero User pay-in commission. |
| `bank_statement_missing_utr_recovery` | `statement-match-router.js:184` | First success via unique missing-UTR path; zero User pay-in commission after trusted validation. |

An already-successful claim/link returns early from statement verification (`:99`) and retains prior source/time. Re-import may return `matched`/`exact_utr_amount` with recoveredUtr false for a previous missing-UTR recovery or APK success. Therefore inspect durable prior economic posting and verified evidence, not the latest response label. Do not deduct capacity/credit merchant twice or silently reverse an earlier commission. Existing legacy successes require an explicit imported opening-accounting status before enabling new accounting.

## 5. Protection deliverables and assurance

`docs/protected-legacy-files.json` includes exact SHA-256 and byte count for every baseline file, including all listed paths, all Android resources/tests, checkout/index `.bak` files, parser source/runtime/samples, APK/metadata, providers/diagnostics/auth, wrapper/alternative entrypoints, package/lockfiles, tests/check scripts, workflow/deployment references and old docs. Hashes came from the exact baseline Git blobs, and working copies were compared before any additions.

`scripts/check-protected-legacy.js` uses Node built-ins only. It checks a pinned manifest digest and baseline commit, validates paths and hash/size metadata, rejects missing/moved/case-renamed paths and symlink/junction substitutions, compares raw bytes, and exits nonzero on failure. It has no regeneration/repair option. The CLI accepts only an optional checkout root, never an alternate manifest. Fixtures use the exported verifier against generated temporary data; real protected files are only read.

This is an accidental/regression change guard, not protection against an actor who can modify both checker and manifest. Review must protect those files and root instructions. It does not detect the runtime effect of arbitrary new code, new routes or database changes, nor remote CDN changes. Additional modules require review and contract tests even when hashes pass. No production startup/CI configuration was modified to enforce the check; new tests are discovered by the existing test runner.

## 6. Validation and coverage

See the final validation section below for exact totals. The environment was Windows x64, Node `v24.20.0`, npm `11.19.0`, embedded PostgreSQL `18.4` compiled by MSVC. CI uses Node 20; a Node 20 matrix run was not performed locally.

Preparation: `npm ci --ignore-scripts --no-audit --no-fund --cache ../npm-cache` installed 86 locked packages. Database/provider/dashboard/PG environment variables and PUBLIC_BASE_URL were removed in the command process before tests, without printing their values. Existing scripts generated random local ports/credentials and cleaned up their own cluster; no external provider calls or production resources were used.

Baseline:

- `npm run check`: PASS, 25 JavaScript files.
- First sandbox `npm test`: failed before DB initialization because `os.userInfo()` raised `uv_os_get_passwd ENOMEM` under the restricted execution identity.
- Same unchanged `npm test` outside that restriction: PASS, 32 tests, 0 failures, 0 skips; literal `npm start` smoke PASS (health, create/read link, checkout route), local disposable PostgreSQL only.

New tests:

- `test/protected-legacy.test.js`: real read-only tree check; temporary binary mutation, deletion, move/case rename, directory substitution, line endings, malformed/escaping/duplicate paths, changed manifest and unsupported update option.
- `test/statement-parser-contract.test.js`: actual browser parser entry point and committed XLSX reader on synthetic CSV/XLS/XLSX; credit-only filtering, non-UPI/debit/ambiguous-reference exclusion, amount formatting, dedupe and unsupported type. No source rewriting or mocked parser algorithm.
- `test/verification-source-contract.test.js`: separate temporary PostgreSQL schema; exact statement replay, missing-UTR replay across imports, and APK→statement→APK replay retain source/verification timestamp. These characterize legacy behavior; they do not prove new ledger idempotency or tenant isolation.

APK: local `aapt dump badging` confirmed package `org.wtron.wpayagent`, versionCode 16, versionName 0.10.5, min 26/target 35. `apksigner verify --print-certs` succeeded with `CN=Android Debug`; metadata points to source commit `f488effdf3fb2f758dcdec14ba745bc6898da72d` and build time `2026-09-14T12:16:44Z`. Metadata alone is not reproducible-build proof. APK was hashed, not rebuilt or installed. Java 17/Android SDK are present but `gradle` is not on PATH and repository has no Gradle wrapper; Kotlin unit/build checks were not run.

Existing tests cover UPI URI library, VM-based checkout/generator handlers, isolated core API persistence, basic statement recovery/exact match, static Android/OTP source checks and JS location classification. They do not provide full HTTP wrapper auth coverage, real device/payment acceptance, comprehensive parser/PDF parity, SQL location-trigger equivalence, race testing, provider network integration, or multi-tenant/ledger guarantees.

### Final validation results

| Command/check | Result |
| --- | --- |
| `node scripts/check-protected-legacy.js` | PASS: all 197 exact baseline hashes |
| `node --test test/protected-legacy.test.js test/statement-parser-contract.test.js` | PASS: 15 tests, 0 skipped |
| `npm run check` after all added JS | PASS: 29 files (the unchanged checker does not include server-wrapper.js/server-runtime.js or recurse into directories) |
| `node --check server-wrapper.js` and `node --check server-runtime.js` | PASS: supplemental syntax checks for both unchanged alternative composition files |
| `npm test` after all added JS | PASS: 51 tests, 0 failed, 0 skipped; includes the original 32 and 19 additional test/subtest results |
| Literal `npm start` smoke inside `npm test` | PASS: disposable local PostgreSQL health, create/read payment, checkout route |
| `git diff --exit-code 8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541 --` | PASS: no baseline tracked file changes; all deliverables are additions |

Full baseline/final check and test logs are included in the delivery bundle. Android Gradle unit/build tests, real browser/app launches, PhonePe/Paytm external APIs, full PDF parser corpus and Node 20 CI remain **not run**; no result here implies those passed.

### Added files

1. `AGENTS.md`
2. `docs/repository-audit.md`
3. `docs/protected-legacy-files.json`
4. `docs/integration-boundaries.md`
5. `docs/wpay-implementation-plan.md`
6. `scripts/check-protected-legacy.js`
7. `test/protected-legacy.test.js`
8. `test/statement-parser-contract.test.js`
9. `test/verification-source-contract.test.js`

No existing tracked file changed. The supplied additive patch/bundle targets the recorded baseline; applying it is not a deployment or an approval to change legacy files.

## 7. Regression plan before any later wiring

| Boundary | Required regression evidence |
| --- | --- |
| Wrapper/auth | Literal startup against disposable DB; full URL/method auth matrix, production-missing-password 503, cookie login/logout/expiry/tamper, public checkout unchanged, no new bypass to legacy admin; disjoint new routes and principals |
| Pairing/device | One-use/expired code, concurrent claim, same/different SIM behavior, credential rotation/invalid/revoked device, ingestion validation/status bodies; synthetic non-banking data only |
| URI/generator | Golden bytes for every profile, signed/empty/duplicate/encoded/unknown fields, manual input, QR-to-POST exactness, legacy decoding; test generic library and actual checkout launches separately |
| Checkout | Full DOM/browser app selection, expected native payloads/QR content, expiry timing, 202 pending vs verified success, retries/network errors, clipboard/download and inline HTML handlers; no real money |
| Verification | HTTP UTR/credit contracts, SMS-before/after-claim, time/amount mismatch, repeated and concurrent evidence, successful-vs-terminal-failed provider status; account-isolation negative tests must fail closed in future authorized integration |
| Statement parsing | Synthetic/golden CSV/XLS/XLSX/PDF text-layer corpus, multi-sheet/header drift/wrapped rows/negative/debit/noise/12-digit references/date validity, duplicate rows, encrypted/corrupt/image-only PDF, runtime worker load and backend request shape |
| Statement matching | Exact and missing-UTR first success/replays, ambiguous candidates, existing claimed UTR, Kolkata boundary dates, expiry/late arrival, partial-import retry and cross-file duplicate evidence; do not call these tenant-safe yet |
| Future finances | Parallel links against shared capacity; atomic holds and releases; crash/retry at commit; one economic posting across APK/statement; zero recovery commission on both source paths; previous postings and commissions unchanged; INR/USDT double-withdrawal prevention |

The remaining business decisions and exact next additive implementation proposal are in `wpay-implementation-plan.md`; ownership and the blocked legacy bridge are in `integration-boundaries.md`.
