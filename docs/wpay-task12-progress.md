# WPay Task 12 — integration checkpoint

All available isolated acceptance suites pass. This checkpoint adds the supplied public site, role entrypoints, operational access, normalized UTR views, targeted statement parsing, a trusted statement-evidence boundary, and the unchanged legacy checkout experience. The user supplied the remaining requirements; no requirements are treated as missing.

**Remaining software integration blocker:** the shared protected statement matcher has no account/bank/version scope. Its global mutating matching functions are deliberately not mounted against shared legacy data. The new server-only statementEvidenceVerifier boundary needs an authoritative source connector that establishes that scope independently and binds a protected matcher result to the uploaded file digest and exact original WPay reservation. No such production connector is configured. The full recovery/accounting/outbox chain is **SYNTHETIC VERIFIED** using the unchanged matcher in a disposable, single-bank source. A user upload, matched flag, UTR claim or APK observation alone never credits an account. This limitation is separate from unavailable live OTP and does not invalidate the completed isolated tests.

## Changes and boundaries

- Public root: fourteen supplied files remain byte-identical to the ZIP; allowlisted assets and pinned hashes, original marketing layout, no account internals added. Role entrypoints are /admin, /merchant, /user and /employee. Existing authentication, mandatory MFA, sessions and server-resolved roles enforce every operation.
- APK/OTP: the existing artifact and pairing APIs are reused. New ownership tables and read-only source adapters enforce User device ownership, tenant-scoped Admin access, explicit Employee OTP permission and immediate revocation. Merchant is denied. Masked by default; recent MFA for permitted reveals; audits contain IDs/actions rather than OTP or message content. New authenticator TOTP remains separate.
- UTR: Admin sees scoped gateway claims and verified observations, amount/order/Merchant/User/bank version, evidence/accounting/callback/recovery states. Independently verified legacy device/statement resource links expose normalized, explicitly unbound observations through the existing read-only reader. Parent ownership, tenant scope and revocation are checked before source access; pagination is bounded. User UTRs appear only in own routed Pay-in Transactions. Generic User source pages strip UTR fields.
- Statements: User uploads remain bound to own current bank version; Admin uploads require a selected User/current bank version, tenant permission, recent MFA and immutable audit. Both invoke the protected parser through the existing bounded worker. Upload acceptance is onboarding metadata, never financial proof.
- Trusted recovery: server-only evidence must bind owner, bank/version, reservation/order, Merchant, amount/currency/window, file/result digest, protected matcher provenance and an economic event. It reuses Task 9A confirmedPayin and Task 10 outbox atomically: gross, fee and capacity post once; recovered User pay-in commission is zero. Verified UTR is retained encrypted even without a checkout claim. Duplicate receipt, claim and retry cannot post twice. Pending normal evidence can yield to verified statement evidence.
- Checkout: /wpay-pay strong token exchanges into an HttpOnly cookie scoped to the original /api/payments/WPxxxxxxxx path. The short ID alone is not authority. The new WPay process serves the exact protected pay.html, checkout.js and upi.js bytes. No legacy startup or API handler changes. Its pinned QR CDN remains as in the protected HTML. Original PhonePe/Paytm experience, QR, expiry and claim/status UI work through the adapter. Merchant gets order/ref/amount/expiry/link/QR/Copy/Open controls and no User bank/device/OTP/capacity fields.
- Migration 14 only: private manual accounts, encrypted factors, recovery material, password records and existing master key preserved. No migration checksum changed after application. Only the three approved old-test assertions differ: marketing root and gateway/payout schema 13 to 14.

## Acceptance on final code

| Suite | Passed | Failed / skipped |
| --- | ---: | --- |
| Full npm tests | 365 | 0 / 0 |
| Auth/HTTP/MFA plus real otplib/QR vectors | 25 | 0 / 0 |
| Business core | 20 | 0 / 0 |
| Task 9A correctness | 6 | 0 / 0 |
| Funding | 15 | 0 / 0 |
| Bank/UPI onboarding | 11 | 0 / 0 |
| Gateway/webhook | 9 | 0 / 0 |
| Payout/withdrawal | 25 | 0 / 0 |
| Existing adapter boundaries | 9 | 0 / 0 |
| Task 12 OTP/roles/Employee | 12 | 0 / 0 |
| Task 12 UTR/statements/checkout/APK/recovery | 7 | 0 / 0 |
| Targeted OTP/Android rerun (also included in npm suite) | 8 | 0 / 0 |

Syntax passes. The npm start smoke exercised the untouched legacy health/create/read/checkout contracts on real disposable PostgreSQL. Fresh migrations and restricted-runtime checks pass. Exact published Task 11 schema 13 upgraded to 14 idempotently, preserving password/encrypted MFA/recovery/ledger/master key while invalidating stale sessions. All **197 protected hashes** remain exact at baseline 8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541.

Fresh root and scoped npm ci installs used only official-registry lockfile URLs; original and copied manifest/lock hashes remained identical. Real TOTP verify and QR PNG executed from the new scoped installation. npm withheld the native PostgreSQL symlink postinstall by default; its reviewed manifest was empty, the script executed successfully, and the newly installed PostgreSQL binary reports 18.4. No dependency version or production configuration changed.

An interrupted local process run was excluded. The retained PostgreSQL cluster completed crash recovery; the interrupted auth run was repeated on a fresh database and passed. No reset/reinitialization/replacement keys were used.

## Browser and APK evidence

28 secret-free screenshots are retained outside Git in outputs/WPay-Task12/screenshots. They include supplied site/reference desktop/mobile, four mandatory-MFA roles, User/Admin APK, OTP empty state, Employee permission/revocation, Merchant English/Russian/Simplified Chinese, scoped UTR/statement/transaction views, recovered callback history, and the exact protected checkout desktop/390px. Checkout and scoped panels have no horizontal overflow at 390px. Synthetic checkout claim stays pending. Merchant Copy Link copied the exact generated capability URL; QR rendered. Screenshot payment/UTR/bank examples are explicitly synthetic; no real customer data, passwords, MFA setup QR, recovery codes, session tokens or banking OTPs are included.

Authenticated HTTP downloads from both role-prefixed User and Admin routes returned the complete protected APK and matched its hash. The browser download link was exercised; the browser automation download-event wait timed out, so a browser-saved file is not claimed separately.

- Artifact: public/downloads/WPAY-Agent.apk
- Bytes: 2,360,736
- Version: 0.10.5 / build 16; org.wtron.wpayagent
- SHA-256: 0cf08af217b8fdc84e74f0512b93ffbd2d6cac60974fd63f2034c723d152a502
- Existing Android debug signature and pairing compatibility retained; OTP/Android regression passed.
- Private manual account artifact: outputs/WPay-Task12/private-manual-001/manual-test-accounts.json (outside repository). Four preserved accounts use real mandatory authenticator MFA. The separate funded browser acceptance database is synthetic and does not alter those manual accounts.

## Live matrix and limitations

| Capability | Status |
| --- | --- |
| Real legacy source configured in manual WPay instance | NO |
| Real authorized device paired for this acceptance | NO |
| Legitimate incoming banking OTP observed | NO |
| User received live OTP in WPay | NO |
| Admin received same live OTP | NO |
| Authorized Employee received same live OTP | NO |
| Live device-to-dashboard delivery | **NOT TESTED** |
| Real payment provider | NOT CONNECTED |
| Real payment | NOT TESTED |
| Statement recovery/accounting/callback | SYNTHETIC VERIFIED |
| Shared-source scoped statement connector | NOT CONNECTED; blocker described above |
| Existing checkout integration | VERIFIED on isolated synthetic orders |
| Real payout provider | NOT CONNECTED / NOT TESTED |
| Live blockchain send | NOT TESTED |

Proof malware scanning remains a hook only / Unscanned. Merchant USDT settlement stays disabled until authoritative Merchant FX. No post-settlement reversal invented. No real banking OTP or payment was generated for testing.

Indirect configuration impact is limited to the new WPay process's public/role/checkout routes, WPay-only migration 14, explicit optional read-only operational-source/pairing settings, new path-scoped checkout cookie and isolated local test resources. Legacy production startup mounts, OTP/SMS/API/database/device/APK, UTR, statement and deeplink engines remain byte-for-byte unchanged and independently usable. No Supabase/Railway/production change, deployment, paid resource, main push or merge.

## Publication

Branch: wpay/hosted-integration. Parent checkpoint: 83416f0b49b52bf00e793b14cfffbcec302c2643. GitHub authenticated identity gamerpax5-ship-it and repository ADMIN permission were verified before publication. The exact new commit, matching remote SHA and exact-commit Actions result are recorded in the external publication receipt after push.
