# Pending UTR manual approval

The pending page now offers Approve and Reject and always queries undecided claims. The server retains its scoped history queries for other callers. Approved, automatically matched and rejected orders leave this page. The page refreshes every ten seconds while mounted, and pauses while a decision dialog is open.

Manual approval requires an authenticated admin or super-admin, recent authentication, both user and merchant tenant scope, the existing scoped reconciliation write permission and the new restricted `utr_center.approve` permission. Employees cannot receive this permission. Migration 023 grants it only to existing admin roles already holding UTR view and reconciliation upload rights; changed accounts must sign in again.

Approval settles the existing reservation amount and commercial snapshot atomically. It records `admin_manual` / `admin_approved`, actor, claim, reason and journal; it does not create a bank verification proof. The ledger mutex and existing unique reservation and bank/UTR constraints prevent duplicate postings and conflicting receipt reuse. Existing recovery rules apply to expired reservations. Callback and checkout status distinguish admin approval from bank verification. No OTP, APK, parser, deeplink or protected source was modified.

## Automatic matching limitation

The existing gateway worker automatically settles matching trusted evidence, including statement recovery. New database regression tests cover that behavior alongside manual approval and concurrent automatic receipts. However, `scripts/serve-wpay-hosted.js` currently supplies neither `paymentEvidenceVerifier` nor `authoritativeStatementSource`. The legacy reader exposes observations with `financialEvidence: false`; its source data and the protected global matcher do not establish the required independent account/bank/version receipt binding. This change does not present those observations as financial proof or claim that production auto-approval has been connected. The existing integration blocker is documented in `wpay-task12-progress.md`.

## Verification

Local legacy hash protection, JavaScript syntax, existing checkout/table DOM regressions and the new approval DOM regression pass. Local `npm test` cannot start embedded PostgreSQL under root. `.github/workflows/wpay-utr-approval.yml` runs the new financial approval regression and existing gateway, review, expiry, routing and accounting tests against disposable PostgreSQL, plus DOM regressions. Check the corresponding CI run before deploying.
