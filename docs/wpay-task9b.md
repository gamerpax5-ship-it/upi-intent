# Task 9B: UPI verification and statement onboarding

## Scope and lifecycle

New WPay adapters live in `lib/wpay/onboarding/`. No protected engine is modified, mounted differently or proxied through an administrative endpoint. All 197 legacy hashes remain pinned to the original baseline.

An authenticated approved User may create a challenge only for their own current, approved, unfrozen, active bank version. The amount is a cryptographically random integer number of paisa from 100 through 999 (INR 1.00–9.99, including the requested 9.30 example). A challenge lasts five minutes; only one waiting challenge per bank exists. Repeated requests return the active challenge. Twenty creations/imports per User per hour and sixty evidence checks per challenge bound work. Evidence checks are spaced at least three seconds apart and verifier calls time out after two seconds.

The unchanged protected `public/upi.js` builds the URI; the existing scoped QR dependency renders a real PNG. Closing the dialog keeps the challenge available until expiry; Cancel terminates it. Verify resumes the current challenge or creates a fresh challenge after cancellation/expiry. The browser checks progress every five seconds. A successful check closes the popup and offers Enable. Enable does not Start.

Start requires current approval, an enabled authenticator with a valid factor, confirmed initial funding, positive allocated capacity without a deficit, an accepted statement for this bank version, current verified/enabled UPI, and any configured device eligibility. Only Running banks qualify for new routing. Stop removes routing eligibility; restart rechecks prerequisites. Freeze overrides all operations. Unfreeze retains the conservative existing requirement for renewed approval and verification. Sensitive bank edits invalidate outstanding challenges, clear verification and require acceptance of a statement for the new version.

## Trust boundary

`AuthService` accepts an optional **server-owned** `verifyUpiPayment` implementation. There is no browser confirmation endpoint, Admin success override, provider secret in the UI or automatic production provider configuration. Default behavior is **Waiting for verified payment evidence**.

A trusted observation must independently establish all of:

- Credited, final INR receipt with a canonical stable payment identity.
- Challenge, User, bank and exact bank version.
- Exact receiving UPI, bank account identity digest and amount in paisa.
- Receipt time within the challenge window and an approved source.

`bank-provider` and `bank-attestation` name trusted server integrations, not user-supplied source labels. A legacy UTR/status observation is only a candidate; amount-only matching, client UTRs, client success flags and legacy success text are insufficient. A future provider must verify its own authenticity, recipient and credited status before returning the contract. No such real provider was connected in this task.

The optional `syntheticUpiEvidence` constructor flag is used only by explicit isolated test harnesses. No environment flag or HTTP route enables it. Production defaults deny synthetic sources. The browser marks synthetic evidence clearly.

One consumed payment digest is globally unique. Consumption, exact-version verification, audit and eligibility updates commit together. Authentication retries only fully rolled-back serialization/deadlock failures and resolves session, approval, permission and factor state again. Verification itself does not credit money, enable a bank or start routing.

## Statements and financial truth

The User chooses an owned, approved bank/version and uploads CSV, XLS or XLSX up to 1 MiB. The adapter validates canonical transport, confines the unchanged statement parser to a bounded worker, and invokes only `parseStatement`. It does not call the legacy UI or its global matching handler. Worker limits: five seconds, 96 MiB old-generation heap, at most two workers, 20,000 scanned rows and 10,000 extracted credits. PDF is not enabled by this adapter.

An accepted import means the parser extracted supported credit rows. It does **not** independently prove that a statement belongs to the bank, authenticate its contents, verify a payment or create a financial credit. Immutable metadata binds the submission to the authenticated owner and selected current bank version. Only format, size, counts, status, timestamps, digests and parser provenance persist; no raw file, filename, UTR or transaction list is stored by this adapter. Invalid supported statements remain recorded as rejected. Malformed/oversized input is rejected before parsing.

Statements are mandatory by default in the backend-owned `bank_onboarding_policy`. No User/Admin HTTP endpoint changes this policy. A later explicitly authorized policy change must be applied by the migration/configuration owner, not inferred from a browser field.

The existing Task 9A confirmed-pay-in/recovery path remains separate: one Merchant credit, one capacity consumption, one applicable platform fee, zero User commission for statement-recovered receipts, and deficit preservation. Uploaded statements never call that path. Its synthetic accounting fixtures now supply an accepted version-bound statement and explicitly Start after their existing trusted funding setup; accounting/security assertions are retained.

## Analytics and administration

Analytics uses actual owned WPay order reservations and their immutable financial events. Success wins if a later confirmed receipt exists. A trusted failed outcome counts as failed; pending, expired and cancelled/released reservations are separately shown and excluded from the denominator. Success rate is successful / (successful + failed); with no eligible completed orders it is unavailable. Volume sums successful financial events once. Live payment-order creation remains disconnected.

Admin bank review exposes current approval, verification, statement acceptance, lifecycle, limit, latest import and evidence provenance within existing tenant permissions. Stop uses the existing freeze permission. No manual verification override exists. Merchant and Employee cannot call the new User onboarding API. The new pages use the existing owned Bank/UPI view/update permissions; the pure descriptor-only global statement permission is not converted into a legacy matching proxy.

## Schema and configuration impact

Migration 011 adds only WPay policy, challenge, consumed-evidence, statement-import and outcome objects with RLS, restricted runtime grants and immutable evidence/import records. It preserves bank versions and credentials, invalidates weaker pre-9B verification, resets statement/operational prerequisites and increments session epochs. A real isolated 10 → 11 upgrade and idempotent repeat were tested. Existing development encryption keys were preserved.

Indirect effects are confined to WPay: startup requires migration 011 and reads the protected UPI/parser assets, new same-origin routes/assets are served, and only the statement-upload route permits a larger bounded JSON body. No root dependency/lockfile, legacy startup mount, OTP database object, APK configuration, global spending limit, production service or deployment configuration changes. CI adds the new disposable database suite through the existing WPay runner.

## Acceptance

- Full `npm test`: 349 tests and the existing real-PostgreSQL startup smoke.
- Auth/MFA: 25; business/accounting: 20; Task 9A correctness: 6; funding: 15; adapter isolation: 9.
- Task 9B PostgreSQL/HTTP: 11; QR/parser/evidence contracts: 3 (included in the full suite).
- Actual migrations, rollback, concurrent challenges, replay, wrong recipient/amount/version, expiry, disabled MFA, logout/session expiry, statement ownership, immutable imports, lifecycle gates and derived analytics exercised with synthetic data.
- Browser: real MFA, QR waiting popup, synthetic successful verification, Enable, rejected Start before statement, actual CSV upload, accepted statement, explicit Start, mobile Stop/restart and Admin status/provenance.
- `npm run check`, OTP/Android regressions and all 197 protected hashes pass. Private browser evidence, fixtures, databases and keys are outside the repository.

Live device-to-dashboard banking OTP delivery: **NOT TESTED**.

Real payment verification: **NOT TESTED**; trusted synthetic verification is tested. No real banking OTP/payment, Supabase/Railway change, deployment or main merge was performed.
