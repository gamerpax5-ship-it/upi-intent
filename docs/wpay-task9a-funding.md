# WPay Task 9A — correctness closure and USDT funding

Local acceptance only. Parent: `a989bd724eeaf83e27d2bcfdf83b687404da4bd4`, branch `wpay/hosted-integration`. This document supersedes Task 8's late-capacity and receiving-browser-session rules. It does not authorize deployment, real transfers or changes to protected code.

## Findings from actual source and reproduction

| Finding | Evidence and disposition |
| --- | --- |
| Released recovery could lose a verified historical receipt when capacity was reused | **Confirmed.** Pre-fix PostgreSQL reproduction returned `INSUFFICIENT_CAPACITY` with INR 10,000 available against a verified INR 50,000 receipt. `BusinessCore.confirmedPayin`, `lib/wpay/business/core.js:129`, now retains the economic event, original bindings and once-only entries even after release/expiry/cancellation. |
| Late normal-source receipts were rejected | **Confirmed.** Pre-fix reproduction returned `CONFLICT`. The corrected method applies commission according to evidence source, not discovery time. A prior normal posting remains unchanged when recovery repeats it. |
| Receiving User logout stopped background routing | **Confirmed.** Task 8 queried active browser sessions. `core.js:63` now reads current account/approval, factor, device requirement, operations/statement, funding, bank version and assignment facts. Caller session/MFA/grants still pass through `auth/runtime/service.js:100`. |
| A second UPI on the same bank had its own volume allowance | **Confirmed.** Before-fix reproduction found the new UPI's full limit despite existing bank consumption. `core.js:76` groups historical versions by hashed IFSC/account number. All UPIs for that account share applicable volume. |
| Every identity edit resets volume | **Rejected as an overgeneralization.** Existing Task 8 rows retained consumption by bank ID; the defect was bypass through another UPI record. The new identity map also preserves consumption across versions and separate UPI rows. Changing to a genuinely different account keeps prior reservations attached to the old identity. |
| Shared User capacity was counted per UPI | **Not reproduced.** The existing per-User ledger and conservative Merchant aggregation already prevent this; retained and regression-tested. |
| Legacy OTP needed a new auth mount | **Rejected.** No legacy mount or credential is needed for either checkpoint. All 197 baseline hashes remain exact. |

Pre-fix evidence is in `before-reproduction.json` in the delivery folder. The reproduction transaction rolled back; existing Task 8 data was preserved.

## Checkpoint A behavior

`signed remaining = allocated − consumed − active unexpired reservations − holds`.

`available = max(signed remaining, 0)`; `deficit = max(−signed remaining, 0)` (`business/ledger.js:36`). Independently verified, exactly bound historical receipts post once despite insufficient current capacity. Deficits prevent new reservations. Normal receipts retain the original User commission; first-time statement recovery awards zero. Merchant gross/fee use original commercial snapshots. No public pay-in success endpoint was added.

User summary and Admin routing return explicit signed amounts, deficits and reconciliation reasons (`business/api.js:24`, `:71`). The browser acceptance fixture demonstrates INR 10,000 signed availability before a late INR 50,000 receipt, followed by −40,000 signed / zero available / 40,000 deficit. This fixture uses synthetic independent evidence, not a real bank payment.

Background receiving eligibility requires a current enabled MFA factor; logout alone does not suspend an account. Suspension, disabled/revoked factor, disabled operations, unmet statement/funding facts, bank freeze/stop/re-review and inactive assignment still block selection. `business_routing_requirements` is a WPay-only trusted-operator observation: when `device_required=true`, `device_eligible` must also be true. Changes are audited. Runtime/browser cannot write that table. No live device-eligibility adapter or legacy device configuration is connected by this task.

### Three separate limits

| Control | Current rule |
| --- | --- |
| Collateral capacity | One User ledger shared by all competing UPIs/assignments; atomic global mutex remains. |
| Bank volume | Rolling 24-hour accounted successful gross, plus active unexpired reservations, shared by IFSC/account identity across UPI records and historical versions. The strictest current non-deactivated limit for that account applies. Late receipts count when recorded; this is conservative accounting-time volume, not a bank's settlement-day report. |
| Link-generation quota | **Unresolved / not implemented.** No permanent failed-link quota rule is invented. |

Future payment-link adapters must reserve first, bind one order/idempotency key and immutable bank/assignment/terms versions, and use the reservation's database expiry (currently 30–900 seconds). They must not issue or silently renew a payable link beyond its reserved TTL. Expiry releases a reservation; it is not proof that no bank transfer happened. Independently verified late receipts must enter reconciliation through the same once-only accounting contract. No live links, checkout or webhook integration was added.

## Checkpoint B policy and accounting

The user explicitly resolved the policy: **one confirmed deposit of at least 2,000 USDT initially; each later top-up also at least 2,000 USDT; no business maximum; no aggregation of smaller transfers**. Below-minimum requests and observed transfers remain recorded with evidence/review reasons. They do not set funding eligibility or credit capacity. Existing requirements about ongoing collateral depletion, withdrawal policy and link quotas remain separate decisions.

`funding/workflow.js:9` snapshots owner, tenant, assigned network/address, exact pinned token, requested micro-USDT, fixed rate, commercial version/ID/effective time and finality policy. Later commercial changes cannot reprice or reattribute the request. PostgreSQL guards reject snapshot/ownership/history rewrites, including privileged accidental edits.

Amounts use BigInt and integral PostgreSQL NUMERIC. USDT uses six decimals, INR two. `funding/networks.js:12` computes `microUSDT × rateScaledToSixDecimals / 10^10`; a nonzero remainder goes to review, never truncation. There is no amount ceiling introduced by this workflow; HTTP body size and PostgreSQL's representation remain technical limits. A 2,000 USDT deposit at 85.75 INR/USDT credits exactly INR 171,500.

A qualifying confirmation commits transfer identity, request state, balanced collateral journal, relevant funding eligibility, immutable evidence/audit and notification outbox together (`workflow.js:25`). It creates no deposit commission, Merchant collection balance, statement/UPI fact or operations activation. Other prerequisites remain independently enforced. The Task 8 low-level collateral test hook remains disconnected from HTTP; new USDT funding uses this separate workflow.

Reversal debits the original credit with a new compensating journal; it never edits history or releases the globally claimed transfer identity (`workflow.js:36`). Eligibility derives from remaining single qualifying confirmed requests. A resulting shortfall is explicit and blocks routing. A later verified observation cannot automatically restore a reversed request: independent manual restoration is required. Manual restoration remains labelled manually reviewed.

## Verification capability matrix

| Capability | Implemented behavior | Actual evidence level |
| --- | --- | --- |
| Ethereum ERC-20 | Mainnet chain ID `0x1`; USDT contract `0xdac17f958d2ee523a2206206994597c13d831ec7`; successful receipt, exact Transfer log/recipient/amount, receipt/log/block binding; canonical block and at least 12 confirmations measured against finalized height | Real verifier with synthetic JSON-RPC response fixtures; PostgreSQL worker/accounting exercised |
| TRON TRC-20 | Mainnet chain ID `0x2b6653dc`; USDT `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`; successful solidity receipt, exact Transfer log and transaction inclusion in the solidified block; solidified head reaches receipt height | Real verifier with synthetic documented HTTP/JSON-RPC response fixtures |
| Transfer identity | Network + pinned token + transaction hash + event index; Ethereum uses `logIndex`, TRON uses transaction receipt log position | Distinct events and global duplicate checks tested |
| Attribution | Exact owner/request bindings; historical shared address ownership or competing equal-amount requests cause review | PostgreSQL cross-User/shared-address tests |
| Manual Admin confirmation | Explicit view/approval grant, current tenant, recent MFA (five minutes), reason, evidence and ownership references, exact token/network/address/amount review and global uniqueness | Real PostgreSQL/HTTP and real browser form |
| Manual provenance | `manually_reviewed`, explicitly not blockchain confirmation; known pending/failed/mismatched evidence blocks confirmation | Real tests and browser screenshot |
| Unconfigured source | “Verification source not configured”; no fabricated confirmation; manual independent-review path remains available | Real worker and browser |
| Durable retries | Persisted claims/jobs, bounded attempts, expiring lease, safe restart, explicit requeue; no mutex/DB transaction during provider calls | PostgreSQL worker test acquires the business mutex during provider fixture calls |
| Reorg / reversal | Canonical changed block on recheck causes compensating reversal; unavailable responses do not invent a reorg | Real verifier fixtures and PostgreSQL reversal/restoration tests |
| Notifications | Durable immutable outbox event per accounting journal | Atomicity/uniqueness tested; delivery consumer is not connected |
| Live provider read / real transfer | **NOT TESTED** | No mainnet provider traffic, wallet credentials or real deposits used |
| Address-wide scanning | Not connected; verification starts from a recorded transaction/event claim | No claim of unsolicited on-chain transfer discovery |

Token identities follow [Tether supported protocols](https://tether.to/en/supported-protocols/). Ethereum receipt/block methods follow [Ethereum JSON-RPC documentation](https://ethereum.org/developers/docs/apis/json-rpc/). TRON solidity/finality and event evidence follow [confirmation semantics](https://developers.tron.network/docs/confirmation-semantics), [transaction information](https://developers.tron.network/reference/gettransactioninfobyid), and [event documentation](https://developers.tron.network/docs/event). Provider-fixture success is not live end-to-end blockchain acceptance.

### Bounded operator configuration

Optional server-only variables: `WPAY_FUNDING_ETHEREUM_RPC_URL`, `WPAY_FUNDING_ETHEREUM_API_KEY`, `WPAY_FUNDING_TRON_ORIGIN`, `WPAY_FUNDING_TRON_API_KEY`. Ethereum requires an operator-configured HTTPS URL without userinfo/query/hash; TRON origin is restricted to `https://api.trongrid.io/`. Keys are read from private environment configuration; no endpoint or URL comes from a browser. Redirects are rejected. Requests time out after five seconds, response bodies cap at 1 MiB, receipt logs cap at 10,000.

`node scripts/verify-wpay-funding.js --once` accepts only an explicitly confirmed isolated local database using existing `WPAY_AUTH_DEV_DATABASE_URL` / `WPAY_AUTH_DEV_ISOLATED_CONFIRM` configuration. It processes at most ten jobs. Each job allows at most five attempts, with one-minute retry spacing and a 90-second lease. Interrupted final attempts become reviewable. UI recheck queues another bounded attempt budget; it does not pretend to execute a provider check immediately. No scheduler, endless polling or continuous reorg monitoring is installed. Confirmed transfers need an explicit subsequent recheck to obtain new chain evidence. No provider credentials were configured in acceptance.

## Migrations, permissions and real paths

Applied/checksummed migrations 001–006 retain exact Task 8 bytes. New migrations were never rewritten after application:

- **007**: historical bank identity grouping/backfill, reconciliation, routing requirements and integral amount representation.
- **008**: funding requests/claims/transfers/events/jobs/outbox; audited trusted device eligibility changes; own User funding grants and session-version invalidation.
- **009**: additive fix for runtime schema-fingerprint visibility of the routing audit table; funding grants for existing Super Admins with session invalidation. Ordinary Admin/Employee grants are unchanged.
- **010**: immutable funding snapshot/owner/request binding and deletion/truncate guards.

Runtime receives only SELECT/INSERT and specified mutable columns, not DDL, arbitrary snapshot writes or deletion. All HTTP calls pass existing full account approval/MFA/session resolution. POST requests retain exact Origin and CSRF checks. User actions require own funding permissions; Admin/Employee review access requires explicitly assigned tenant scope and grants. Merchant has no funding-history access. Existing Super Admin scope still applies; this does not create unscoped global access.

| API under `/wpay-auth/` | Purpose |
| --- | --- |
| GET `funding/config` | Own approved terms, policy, provider configuration status and ledger capacity |
| POST `funding/create` | Snapshot a request, idempotent per owner/key/amount |
| POST `funding/claim` | Persist transaction/event reference and verification job |
| POST `funding/list` | Own/tenant-scoped state filter; 25 rows/page, bounded event history |
| POST `funding/review` | Exact manual confirmation, rejection, compensating reversal or restoration |
| POST `funding/recheck` | Queue bounded provider retry |
| GET `business/summary`, `business/routing` | Own/Admin deficit and reconciliation display |

User navigation: **Finance → USDT Deposit**. Admin navigation: **Finance → USDT Deposit Review**. Forms live in `dev/wpay-auth/web/funding.js`; translated labels in `funding-locales.js`. Existing User dashboard/Admin routing display deficit details; shared labels and Merchant EN/RU/zh-CN views retain parity. Approval-before-login and mandatory User/Merchant/Admin/Employee MFA remain enforced. Only the explicitly authorized obsolete deposit-navigation assertion in the existing WPay auth test changed; other existing tests are unchanged.

## Actual acceptance

| Check | Result |
| --- | --- |
| Full `npm test`, including real disposable PostgreSQL startup smoke | 343 passed, no failures/skips; health/create/read/checkout smoke passed |
| Task 9A correctness PostgreSQL | 6 passed on `wpay_9a_correctness_003`; real expiry, competing reservation/recovery, normal/recovery race, logout/suspension/factor/device distinction, shared bank/version volume |
| Task 9A funding PostgreSQL/HTTP | 15 passed on `wpay_9a_funding_006`; migrations through 010, request/ownership/MFA/CSRF, exact snapshot conversion, minimum/no maximum, ambiguity/duplicates, manual/automatic race, rollback/outbox, worker/reorg/retry/restore, stale lease rejection and snapshot guards |
| Real provider logic fixtures | 22 checks included in full suite; ERC-20/TRC-20 success, wrong chain/token/recipient, failed/pending/finality, event identity and reorg |
| Original business PostgreSQL/HTTP | 20 passed on `wpay_8_business_005` |
| Auth/MFA + real installed TOTP/QR decoding | 25 passed on `wpay_9a_auth_003` after the one user-approved assertion correction |
| Runtime role/hosted transport integration | 4 passed on `wpay_7_hosted_011` (local only) |
| Original APK/resource/legacy-adapter isolation integration | 8 passed on `wpay_7_resources_011` / `wpay_7_legacy_011`, synthetic schemas/data only |
| Task 8 → Task 9A upgrade | Real 6→10 migration; existing identity/password preserved, bank identity backfill matched expected digest, User session epoch invalidated, repeat idempotent, disabled guard rejected by readiness |
| `npm run check` and nested WPay syntax | Passed; source-review manifest records individually checked files |
| Protected baseline / OTP Android regressions | 197/197 exact before/after; 8/8 regression checks before/after |
| Actual browser | Real User/Admin/Merchant password+MFA; request/copy/claim, uncredited state, manual confirmation, filters, retained below-minimum/rejected request, User/Admin deficit, Merchant EN/RU/zh-CN, Chinese persisted after reload |

All integration targets are on existing isolated `127.0.0.1:54117`, with preserved private development role/MFA keys. No replacement development keys or existing database deletion occurred. Browser database `wpay_9a_browser_001` contains explicit synthetic accounting evidence: 2,000 USDT manually reviewed at 85.75, INR 161,500 held and INR 50,000 late recovery. Merchant gross/fee/net are INR 50,000 / 600 / 49,400; User commission is zero. Screenshots show no passwords, MFA secrets/QRs/codes, recovery codes, session tokens or private keys. Browser warnings/errors: none in the final inspection.

Early acceptance found and fixed User claim access-mode selection, runtime fingerprint visibility, a duplicate startup import, manual fallback when unconfigured, interrupted last-attempt leases and automatic restoration of reversed entries. The old navigation test failed until the user explicitly authorized its narrow correction. Final results above supersede those runs. GitHub CI wiring now includes fresh isolated correctness/funding databases; remote CI was not run.

## Updated original-requirement matrix

PASS means the stated local scope was implemented and tested; PARTIAL means important production or workflow portions remain.

| Original requirement | Status | Current limit |
| --- | --- | --- |
| Legacy protection / new MFA separation | PASS | 197 exact files; no OTP route/database/config/startup changes |
| User/Merchant registration → Admin approval and versioned commercial terms | PASS | Local PostgreSQL/HTTP; email ownership verification remains separate |
| Mandatory MFA, recovery, session revocation, ownership and tenant grants | PASS | All four account types tested; hosted release remains paused |
| Merchant EN/RU/zh-CN | PASS | Real browser and saved locale; stable financial values |
| Bank/UPI own submission, Admin review, edit re-review/history | PASS | Local foundation; live bank verification is not connected |
| Live UPI verification / statement onboarding acceptance | MISSING | Trusted adapters and approved operational policies still required |
| USDT deposit request, 2,000 minimum, fixed conversion snapshot | PASS | One transfer initially and per top-up; no aggregation or maximum |
| Manual deposit review, exact ledger funding, durable audit/outbox | PASS | Evidence-reviewed local workflow; no real transfer or notification delivery |
| Automatic blockchain funding | PARTIAL | Real bounded verifier/worker on fixtures; live provider acceptance and address scanning unavailable |
| Capacity, holds, assignments, shared-bank limits and reservations | PASS | Global mutex retained; live link adapter not connected |
| Late normal/recovered accounting and explicit deficit | PASS | Independent synthetic proof; recovered commission zero, previous normal commission preserved |
| Merchant live checkout, API credentials and webhooks | MISSING | Not enabled by deposit or approval; future task |
| User commission single entitlement / INR-USDT withdrawal views | PARTIAL | INR entitlement ledger exists; dual display and withdrawal settlement not implemented |
| Merchant fees/balance ledger | PARTIAL | Gross/platform fee/hold foundation tested; outgoing settlement/execution absent |
| Payout/parking capacity restoration | PARTIAL | Existing evidence-backed internal accounting hooks only; no execution |
| INR/USDT withdrawals, payouts and parking execution | MISSING | Not started or exposed |
| Employee granular policy and mandatory MFA | PARTIAL | Enforcement/MFA exist; Admin checkbox provisioning and temporary first-login password reset UI incomplete |
| Reports/exports, support workflows, analytics and Trade | MISSING | Most remain navigation descriptors; no invented trade product |
| Operational BDT backend | MISSING | Marketing copy does not establish backend support |
| GitHub branch publication / paid Railway hosting | PARTIAL | Local commit/artifacts only; publication awaits restored write access, paid hosting paused |
| Live device → existing OTP dashboard delivery | NOT TESTED | Synthetic regression does not establish live delivery |

## Preservation, indirect impact and release boundary

No dependency was added. Root and scoped package manifests/locks, APK/device settings, legacy OTP capture/SMS parsing/pairing/activation/ingestion/storage/APIs/dashboard, UTR/deeplink/statement logic and legacy startup/deployment remain unchanged. WPay uses optional new provider configuration only in its separate entry points. No legacy API is routed through WPay authentication; no new legacy OTP/SMS access is granted. Local CPU/DB usage from acceptance is the only shared-machine activity.

Migrations affect only `wpay_auth`: new funding/core objects, User funding grants and Super Admin funding grants/session epochs. Existing WPay Users/Super Admins must log in again after upgrade; this does not affect legacy sessions or OTP delivery. Existing development keys and all earlier Task 1–8 work/databases remain intact. Public marketing-site files are absent from the change set.

**Live device-to-existing-dashboard OTP delivery: NOT TESTED.** No production Supabase/Railway access, new paid resource, plan upgrade, workspace budget change, deploy, push, merge, real transfer, live payment, payout, withdrawal or parking execution occurred. GitHub write access has no confirmed restoration; the known denied operation was not retried. Task 9A ends with local checkpoints and review artifacts.
