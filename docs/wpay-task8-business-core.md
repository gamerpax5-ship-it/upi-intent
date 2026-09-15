# Task 8: WPay business core acceptance

Task 8 is verified locally on 2026-09-15. This is the business foundation for future payment adapters. It creates no live payment, payment link, bank verification transfer, payout, withdrawal, parking transaction, webhook or blockchain deposit. The existing legacy engines are not invoked by the new accounting contracts.

## Scope and result

Continued branch `wpay/hosted-integration` from Task 7 commit `3e4a4a9b306b1ca5ddb0f7895caa91cceaa9a7c4`. Prior work, databases and private development keys were preserved. No old patch was reapplied to the working repository.

| Area | Before Task 8 | After Task 8 | Verified behavior |
| --- | --- | --- | --- |
| User Bank/UPI | PARTIAL | PASS | Owned records, immutable versions, review lifecycle, soft deactivation, edit requires re-review |
| Capacity | MISSING | PASS | Ledger-derived amounts, funding contracts, holds, atomic reservations |
| Merchant assignment | PARTIAL | PASS | Explicit Admin assignments, tenant boundaries, disable blocks new routes |
| Routing | MISSING | PASS | Pure eligibility and deterministic selection; no Merchant receiving-bank disclosure |
| Ledger | MISSING | PASS | Exact amounts, balanced append-only journals, sealed entries, idempotency and filters |
| Pay-in accounting | MISSING | PASS | Trusted normal/recovered contracts; recovered commission zero; no live adapter |

PASS applies to the requested local foundation, not live payment or hosted acceptance.

## Migration and data model

New migration: `migrations/wpay-auth/006_business_core.sql`.

SHA-256: `70469cae436df26e94fcaf030cbfc4fb48f4314db5e4e2b0fefd2259e8c8c985`.

All 11 new tables are in `wpay_auth`:

| Table | Purpose |
| --- | --- |
| `business_mutex` | Transaction serialization for business mutations |
| `business_bank_accounts` | Owner, current version and lifecycle |
| `business_bank_versions` | Immutable submitted details and bank limits |
| `business_assignments` | Merchant/User assignment, priority, weight, ticket limits, effective/disabled times |
| `business_journals` | Immutable operation, unique idempotency key, reference, actor/source, snapshots and metadata |
| `business_entries` | Exact owner/type/book/direction/currency amounts |
| `business_reservations` | Owner-bound internal route and commercial snapshot, amount, expiry and state |
| `business_reservation_events` | Immutable transition history |
| `business_financial_events` | Unique economic event, bank/UTR digest and reservation bindings |
| `business_holds` | Audited capacity or Merchant holds and release state |
| `business_audit` | Immutable business actions and reasons |

No legacy table, schema initializer or migration changed. Migrations 1–5 retain their exact bytes. Migration 6 also adds append-only guards to WPay commercial history and own-account bank/ledger grants to existing Users/Merchants, incrementing their permission versions and session epochs. They must log in again. Existing Admin/Employee grants are not automatically expanded. Fresh Super Admin defaults include Task 8 review pages; Employee defaults do not.

The migrator owns the objects. Runtime has SELECT/INSERT and narrowly enumerated UPDATE columns; no DELETE, DDL, ownership, balance overwrite or historical snapshot UPDATE. Browser identities have no direct database access. Backend policies scope all reads and mutations to current ownership and Admin tenant grants. Startup schema fingerprints now include trigger definitions, enablement and function definitions/ACLs once migration 6 exists, while retaining compatibility with the prior five fingerprints.

## Ledger and capacity

Amounts cross API boundaries as canonical integer strings. Node uses BigInt and PostgreSQL uses NUMERIC(30,0); money conversion does not use binary floating point. INR/USD have 2 decimal places and USDT has 6. Percentage calculations floor to the currency minor unit, recorded in the applied snapshot.

An entry joins its immutable journal for reference type/id, idempotency key, timestamp, actor/source, commercial version and audit metadata. Each owner metric entry has an opposite system clearing entry in the same book and currency. Books separate capacity, reservations, cash, commission and holds. Direction applies to the named metric; a consumed credit increases the consumed metric and therefore reduces capacity. These are accounting entries, not executed bank transfers.

Deferred PostgreSQL constraint triggers require balanced, nonempty journals at commit. A transaction identifier seals each journal: later transactions cannot append even balanced extra lines. Immutable tables reject UPDATE, DELETE and TRUNCATE. Journal keys bind a canonical payload digest; replay cannot change the economic payload. [PostgreSQL constraint trigger semantics](https://www.postgresql.org/docs/current/sql-createtrigger.html).

`available = allocated - consumed - active unexpired reservations - capacity holds`

Verified example: allocated INR 1,000,000, reserved INR 100,000, consumed INR 300,000, available INR 600,000.

Merchant available is gross minus platform fees, payout fees and holds, plus signed administrative adjustments. No persisted manually editable balance is the source of truth. Ledger types support payout fees and User commission entitlement; executing or automatically charging a payout remains outside this task.

All business mutations acquire the database mutex inside their transaction. Concurrent authenticated reservations cannot oversubscribe a User. Authenticated business operations retry an entire rolled-back serialization/deadlock failure at most twice, resolving session, approval, MFA and grants again each time. This favors correctness over throughput; a single global business lock is a deliberate foundation limitation. Future trusted workers must also retry complete failed transactions, never just an individual SQL statement.

## Banks, assignment and routing

Bank submission accepts only the documented fields: UPI, bank, holder, account number, IFSC, mobile, positive bank limit, personal/business type, provider name and non-secret notes. Unknown fields and credential-bearing note patterns are rejected. Users can read and change only their own bank records. Admin actions require the corresponding explicit permission, tenant scope, reason and recent MFA. Every identity edit appends a version, clears approval/verification and requires review. Freeze survives an edit; soft deactivation retains historical versions and references.

Lifecycle: draft → submitted → Admin review → approved/rejected → verification pending → verified → enabled → running → stopped/frozen. Approval does not verify a bank. The default verification hook is unavailable; no HTTP endpoint accepts a client claim that a bank is verified. Only the integration test injects synthetic independently bound proof.

Admin assignments bind both Merchant and User, preserving immutable ownership and audit history. Selection checks active/approved User, current MFA/session versions and activity, operational and statement prerequisites, confirmed funding, active/effective assignment, current approved/verified bank version, enabled/running state, no freeze/deactivation, ticket range, bank limit and capacity. Bank limits use a rolling 24-hour successful gross total plus active reservations. Selection orders priority ascending, available capacity descending, then stable User/route references. Round-robin and success-rate weighting are extension points only. Weight is stored but not used by the initial strategy.

Merchant output includes only its reservation reference/order/amount/state/expiry and aggregate routing availability. It contains no User identity, UPI, bank details, mobile, APK/device identifier or OTP/SMS data. Aggregate capacity is conservative per User and does not sum competing banks for the same capacity.

Reservations bind Merchant order and idempotency key, validate amount/TTL (30–900 seconds), snapshot User/Merchant terms and bank/assignment version, and reserve atomically. Pending and active events are written together. Terminal release is exactly once. Unexpired active rows determine capacity; expired rows stop reducing availability immediately by database clock. Expiry events/releases are materialized by the bounded `expire` method or the next new reservation (up to 200 per sweep). No background worker or live order creation is enabled.

## Future confirmed accounting contracts

`BusinessCore` defaults to no evidence verifier. Funding, bank verification and confirmed pay-in functions have no public HTTP confirmation routes. A future server adapter must independently verify and return exact owner/bank/version/order/amount/source bindings; submitted UTR or legacy success alone is insufficient.

Confirmed collateral increases capacity. Payout/parking returns require both approved=true and completed status. They record accounting only and never execute transfers. Explicit administrative adjustments require a Super Admin and the existing explicit `ledger.adjust` grant at the API, an idempotency key, reference and reason.

Normal confirmed pay-in consumes an active reservation, increases consumed capacity, credits Merchant gross, posts the snapshotted Merchant fee and User commission. Statement recovery posts the same capacity/gross/fee effects with zero User commission. Released/expired recovery must find available capacity again. Unique economic ID, bank/UTR digest and reservation bindings prevent double credit. Recovery of an already normally accounted transaction returns that original posting and never removes valid commission. The raw UTR is not stored in this ledger.

Reservation snapshots contain immutable commercial version IDs, versions, effective times and settings: User pay-in/payout commission, USDT conversion rate, deposit network/address; Merchant pay-in/payout percentages and fixed fee/currency. Later settings cannot reprice history. Merchant ledger projections include only its own terms, never the User snapshot or internal route.

Holds require owner, reference, amount, reason, actor and timestamp. They reduce the correct available value and release through an opposite ledger event and audit, once. The dispute workflow is deferred.

## Real pages

- Admin: Bank/UPI pending/approved/rejected-frozen filters, details and reason-based review/approve/reject; Merchant User Assignment form/disable and derived capacity; Routing reasons/capacity/reservations; read-only ledger with owner/reference/type filters and pagination; holds.
- User: real Bank/UPI add/list/edit/submit/freeze/stop/deactivate where allowed; dashboard allocated/reserved/consumed/available/held/commission; commission ledger and holds.
- Merchant: own gross/fees/payout fees/held/available, aggregate routing state, own ledger/fee/holds pages. Empty databases display INR 0.00 and no live orders.
- All new Merchant labels have EN/RU/zh-CN parity. Navigation and mutations follow current granular grants. No Employee business permissions are granted by default.

All routes remain under the separate WPay authentication server. No legacy route is mounted through the new auth service.

## Actual acceptance

| Check | Result |
| --- | --- |
| Final unchanged full `npm test` suite | 321 passed, 0 failed/skipped; includes 5 new pure business tests |
| Legacy `npm start` smoke on disposable PostgreSQL | Health, create/read and checkout passed |
| PostgreSQL business/HTTP integration | 20 passed, 0 failed/skipped on `wpay_8_business_004` |
| PostgreSQL auth/MFA + actual otplib/QR decode | 25 passed, 0 failed/skipped on `wpay_8_auth_001` |
| Existing hosted/runtime-role integration with migration 6 | 4 passed on fresh `wpay_7_hosted_008` |
| Existing resource isolation/APK integration with migration 6 | 8 passed on fresh `wpay_7_resources_008` / `wpay_7_legacy_008` |
| OTP/Android regression before and after | 8 passed each run |
| `npm run check` | 53 JavaScript files passed; additional new source files checked individually before commit |
| Protected legacy hashes before and after | 197/197 exact, baseline `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541` |
| Actual migration 5 → 6 upgrade | Existing synthetic account/password preserved; session epoch incremented; repeat idempotent |
| Readiness drift check | Disabled entry-seal trigger rejected; restored guard validates |
| Browser | Real User/Admin/Merchant password + MFA; bank submission/approval/edit re-review, assignment, routing refusal, ledger filters and holds |
| Merchant locales/layout | EN/RU/zh-CN dashboard, RU/zh-CN ledger, persisted Chinese after reload; 1280px/390px no horizontal overflow; no console warnings/errors |

Integration tests use 127.0.0.1:54117 and existing private development role/MFA keys. All funding, bank and pay-in proofs in tests are explicitly synthetic. The browser database `wpay_8_browser_001` contains real local synthetic registrations, MFA, approval, bank and assignment records, but no financial postings or connected verification provider. Browser screenshots contain no password, authenticator seed/QR/code, recovery code, token or private key; bank numbers are masked. Screenshots and sanitized logs are delivered in the local Task 8 evidence folder, not committed as credential-bearing fixtures.

An additional upgrade-check harness initially queried an incorrect password column (42703). The harness was fixed and resumed the same preserved fixture successfully; no product schema or protected source was changed for that failure. Earlier business runs passed 17/19 tests as acceptance cases were added; the final run has 20.

## Indirect impact and release status

Root package manifests/locks, original tests, APK/device configuration, OTP/SMS capture/ingestion/storage/APIs/dashboard, UTR, deeplink, statement and checkout/startup files are byte-for-byte protected. Task 8 adds no dependency. New WPay migration 6 changes only WPay grants/session versions and adds its business objects/guards. The isolated WPay CI helper now creates one additional disposable business database and runs the new integration suite; existing production deployment configuration is unchanged.

Live device → existing dashboard OTP delivery: **NOT TESTED**. Synthetic regression tests do not establish live delivery. Live bank/payment execution: **NOT TESTED** and intentionally disconnected.

GitHub: local branch publication remains pending. The connector can read the owner repository, but its previous Contents-write failure has no confirmed resolution. The fresh CLI identity check still returns `gamersinghji056-lang`, which previously received 403. No blind push or write probe was repeated; no remote Task 8 SHA or remote CI result is claimed.

Railway remains on the user-selected Trial with new WPay hosting/resource creation paused. No new paid resources, upgrade, workspace spending-limit change, production Supabase/Railway mutation, legacy deployment or merge occurred. Existing private development keys were reused and retained. Future hosting/evidence adapters require their separately approved acceptance; this task stops at the verified business foundation.
