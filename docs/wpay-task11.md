# Task 11 — payout operations and shared commission withdrawals

## Scope and provenance

Continues published Task 10 commit `0d9b97973d9e250e51c40b6710dbd7b06da29461` on `wpay/hosted-integration`. Before implementation, local HEAD and remote branch matched, the working tree was clean, all 197 protected hashes matched, and the OTP/Android checks passed.

All acceptance used isolated local PostgreSQL and synthetic records. No production database, Railway service, bank, blockchain sender or real payment provider was used. No dependency manifests, legacy startup mounts or applied migrations 001–012 changed. Existing private development keys were retained.

## Migration and permissions

Migration `013_payout_operations.sql` adds WPay payout capabilities, batches, orders, exclusive claims, encrypted proofs, economic references, submissions, settlements, commission withdrawals, commission holds and immutable event history. It extends the WPay ledger types and existing gateway outbox. It does not change legacy database objects.

Fresh migration and published 12→13 upgrade were exercised against real PostgreSQL. Upgrade preserved old journals/entries/balances, account identity, password record, encrypted factor and private master key. Reapplication was idempotent. Restricted runtime checks denied DDL and deletes; immutable bindings, terminal records and financial journals remain protected.

Explicit Merchant/User permissions and Super Admin permissions are added. Admin and Employee receive no new default grants. Existing User/Merchant/Super Admin permission versions and session epochs advance during migration, requiring a fresh login. Employee access requires explicit permission plus tenant scope; resolving a payout requires access to its Merchant and all claiming Users. Proof download is a separate Admin permission with recent MFA.

## Merchant payout state machine

`open → claimed → submitted → successful`

- Creating a single payout or valid batch reserves principal + percentage fee + fixed fee atomically, using the Merchant commercial version effective at creation.
- Only INR fixed fees are accepted for INR payouts. No currency conversion is invented. Percentage fees use the existing integer floor formula.
- Open payouts may be cancelled and their reserve released once.
- An unsubmitted claim may be released by its owner or expire, returning the payout to open.
- Merchant rejection after submission enters `merchant_rejected_review`. The entire Merchant reserve remains protected; there is no User capacity restoration, commission or reassignment.
- An authorized Admin with recent MFA resolves the dispute as paid through the same settlement function, or not paid through a release journal. The not-paid path credits neither capacity nor commission.

Merchant availability is ledger-derived: gross + adjustments − platform fees − payout fees − balance holds − payout reserves − settled payout principal. Creation and settlement share the existing business transaction lock, preventing concurrent overspend. There are no direct balance writes.

## Claims, capacity and settlement

Claims use the business advisory transaction lock, a payout row lock and a unique partial database index allowing one active/submitted claimant. Leases last 15 minutes by the database clock. A five-second WPay timer and queue/claim reads expire only unsubmitted active claims. Submitted claims never silently expire or reassign. Logging out blocks subsequent authenticated access while preserving an accepted economic claim.

Claim initiation requires active approved User status, valid MFA, funding/operational eligibility, current approved and verified running bank, accepted statement, required device state, account limits and explicit version-specific payout capability. Incoming UPI verification alone does not authorize outgoing payouts.

Conservative implementation assumption: a claim may reserve only consumed capacity not already promised to another active/submitted payout. This prevents successful payouts restoring capacity above allocation; it is not represented as a separately approved business-policy change. Shared bank-identity daily limits count incoming reservations/payments and outgoing claims/successful payouts, preventing bypass across versions or directions.

Exact amount, valid UTR, ownership, lease and state checks precede submission. A reference/proof is only a claim, with no financial credit. A unique economic digest prevents UTR reuse across payout submissions and manual INR withdrawal completion.

Settlement releases Merchant reserve, posts principal and fees, **debits User consumed capacity** by principal, and credits User payout commission exactly once. Merchant terms remain those captured at creation; User payout commission uses the version effective at completion. Unique settlement and journal bindings make repeated approval idempotent. No post-settlement reversal endpoint is enabled; a future authorized reversal must post compensating journals without altering history.

## Shared commission entitlement and withdrawals

One INR entitlement contains pay-in commission + payout commission + adjustments. Available withdrawal value subtracts commission holds, pending reservations and completed withdrawals. INR/USDT are two representations of this same entitlement, under the same transaction lock.

Withdrawal states: `requested → review/approved → processing → completed`. Rejection is allowed before processing; User cancellation is allowed while requested/review. Those paths release the reservation. Processing cannot be cancelled or rejected automatically because an external payment may already have happened.

INR destinations must be current, verified, approved, owned and not frozen/deactivated. Approval and processing recheck the captured bank version. USDT requires the User's configured network/address rules and fixed INR-per-USDT commercial rate. Conversion uses integers, rejects fractional paise and snapshots the rate/version. The display equivalent floors to six decimals; later rates affect future requests only.

Admin approval and manual completion require recent MFA. Completion records a unique reference/hash, network for USDT, completion timestamp and audited actor. It consumes the reserved entitlement once. Responses explicitly identify a manual record and `blockchainConfirmed: false`; no chain confirmation or send is simulated.

Merchant USDT remains disabled at API/UI boundaries with **“USDT settlement rate not configured”**. Permissions and the prospective state model are present, but no User exchange rate is reused and no executable Merchant USDT accounting is enabled.

Capacity holds, commission holds and Merchant balance holds remain separate ledger concepts. Commission holds have immutable placement/release journals and filtered, paginated history.

## Privacy, uploads and webhooks

- The open User queue exposes job ID, amount and time only. Beneficiary details require the authenticated claimant's scope; another User cannot read them.
- Merchant responses/webhooks contain no User bank/UPI/phone/device/OTP, funding balance or commission rate. Merchant review receives UTR and proof metadata only; raw proof and User note are withheld because they could disclose User banking information.
- Proofs are encrypted, bounded to 1 MiB, signature-checked PDF/PNG/JPEG, stored under randomized IDs and downloaded through authenticated, scoped calls as octet-stream attachments. Admin raw access needs separate permission, recent MFA and an audit event without file contents.
- Bulk files accept CSV/XLS/XLSX, exact headers and at most 100 rows/1 MiB. Account numbers must be text. Invalid rows retain real sheet row numbers and reject the whole batch. Existing-row/idempotency collisions roll back the whole batch. The existing SheetJS library is reused read-only; the statement engine is untouched.
- Bulk parsing runs in a bounded worker with timeout and concurrency limits. Formulas, links, macros, hidden/multiple sheets and invalid templates are rejected. A scanner hook exists; without an installed scanner, proof status truthfully remains **unscanned**. Signature checks are not a malware scan.
- `payout.created`, `payout.claimed`, `payout.success`, `payout.rejected_review` and `payout.cancelled` reuse Task 10's durable outbox, signer, delivery leases and retries. Claim IDs distinguish successive leases. Tests exercised actual local signed HTTP delivery, 503/retry, stable payload/event identity and privacy.

Payout/withdrawal/commission histories provide filters and pagination. Audit detail is bounded to the most recent 100 events; queue/capability selection is bounded to 100 candidates. There is no generic legacy Admin proxy or new OTP permission.

## Acceptance evidence

| Check | Result |
| --- | --- |
| `npm test` | 358 passed, 0 failed/skipped; real disposable PostgreSQL startup smoke passed |
| Auth/MFA PostgreSQL/HTTP + actual TOTP/QR | 25 passed |
| Task 8 business | 20 passed |
| Task 9A correctness | 6 passed |
| Funding | 15 passed |
| Task 9B onboarding/statement | 11 passed |
| Task 10 gateway/webhooks | 9 passed |
| Adapter isolation | 9 passed |
| Task 11 payout/withdrawal PostgreSQL/HTTP | 25 passed |
| OTP/Android targeted regression | 8 passed (also covered by general suite) |
| Syntax and protected hashes | PASS; all 197 exact before and after |
| Migration | Fresh 1–13 and published 12→13 upgrade PASS |

The separate integration runs total 120 passing tests; this excludes the general 358 and repeated targeted checks. New pure upload/validation tests are included in the general suite. The only changed pre-existing test assertion is the explicitly authorized gateway schema version 12→13; all accounting, security and protected assertions remain intact.

Real local browser acceptance used synthetic data with actual password/TOTP sessions: Merchant single creation, bulk row rejection, approval and disputed rejection; User claim/beneficiary reveal, UTR/proof upload, shared commission, INR/USDT withdrawal; Admin dispute resolution, withdrawal approval/manual record and commission hold. Merchant English/Russian/Simplified Chinese and a 390px viewport passed without horizontal overflow. Final browser console had no captured warnings/errors. Screenshots remain outside the repository and contain no authentication secrets.

Browser journals independently reconciled two payouts totalling ₹300, ₹3.10 Merchant fees, ₹300 capacity restoration and ₹1.50 payout commission. The User view showed ₹501.50 earned − ₹10 hold − ₹100 pending INR − ₹85.75 manual USDT withdrawal = ₹305.75 available. All amounts are synthetic.

## Indirect impact and release boundary

New WPay grants invalidate affected WPay sessions on migration. WPay balance summaries, shared bank limits, HTTP routes/assets, lease cleanup timer, outbox and isolated CI suite now include payouts. These are the indirect configuration/behavior changes. Existing legacy engines, startup, device configuration, database objects, APK, OTP APIs/dashboard handlers and all 197 protected files remain unchanged.

Task 11 publishes only to `wpay/hosted-integration`; the delivery report records the exact remote SHA and exact-commit GitHub Actions result. No main push/merge or Railway deployment is authorized here.

- Real payout provider: **NOT CONNECTED / NOT TESTED**.
- Live blockchain send: **NOT TESTED**.
- Live device-to-dashboard OTP delivery: **NOT TESTED**.

Task 11 ends at this checkpoint.
