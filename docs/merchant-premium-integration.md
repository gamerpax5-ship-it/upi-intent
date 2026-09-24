# Merchant reference UI integration

Source: supplied `WPay-Merchant-FINAL-VERIFIED(1).html`.

The supplied CSS, embedded Earth artwork, logo, login layout, dashboard geometry and 20 section layouts are preserved. Prototype execution and fictional account/financial data are removed. `/merchant`, `/merchant/` and both existing HTML asset URLs serve the new shell. The shared `app.js` entry dispatches to the Merchant presentation controller; other roles retain their existing implementation. The shared dashboard money formatter is reused.

## Live contracts

- Cookie-bound Merchant sign-in, registration, temporary-password reset, optional MFA enrollment/challenge/recovery and sensitive-action reauthentication.
- Fixed-INR links, exact paise, stable retry keys, canonical gateway QR/checkout URL, manual/API history, evidence and webhook state.
- Single and server-validated atomic bulk payouts, reservation-inclusive balances, review/cancel, scoped beneficiary and evidence metadata.
- Admin fee versions, real ledger and holds; Admin-set USDT quotes, reservations, cancellation and owner-scoped destination/history reads.
- Scoped API credentials and webhook secrets shown once, eligible webhook retries, real access logs, date-filtered reports.
- Support tickets/responses, account/security event notifications, profile/preferences, optional MFA and session logout.
- Read-only, owner-scoped SQL analytics; no browser-supplied owner ID. Indian time labels and integer monetary arithmetic.

No schema migration. No OTP capture, APK, UTR matching, payment posting, protected checkout/deeplink or Railway configuration changes. All 197 protected legacy hashes remain unchanged. Pending manual financial-approval PR changes are excluded.

## Deliberate contract differences from the demo

The existing gateway accepts fixed amounts only, so customer-entered amounts are unavailable. Payment verification uses the existing canonical checkout, never the demo's synthetic UTR success. Session management exposes logout-all, including the current session; no fictitious per-device revoke. Notification read markers are browser-local and account-scoped; notification data comes from the server. Support shows actual Admin responses, without fabricated Merchant thread replies. Account language preference is saved; this supplied Merchant workspace uses English copy. USDT request state is not represented as blockchain confirmation.

## Verification

`test/wpay-merchant-premium.test.js` covers served entry/assets, actual HTTP dispatch for MFA payloads, scope/window validation, cross-Merchant USDT denial, and real PostgreSQL analytics isolation. Existing reference UI, public role, transport/performance, optional authenticator, routing and accounting tests are retained. `scripts/test-merchant-ui.js` uses an isolated LinkeDOM installation and mocked API responses to exercise all 20 sections, escaping, exact amounts, timeout retry identity, checkout URLs, payout/withdrawal requests and secret/account cleanup. These are DOM/contract checks, not real payments or authenticated visual proof.

The local full test runner cannot initialize embedded PostgreSQL as root. Database tests run in the dedicated GitHub Actions job against disposable PostgreSQL. Production data is not used for tests.
