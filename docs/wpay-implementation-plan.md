# WPay — phased implementation plan

Status: design only. Baseline `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541`. Task 1 stops after audit/protection delivery. Existing logic and all 197 baseline files remain frozen. No features or migrations below have been applied.

## 1. Approved business rules

| Area | Required future behavior |
| --- | --- |
| User approval | Registration creates Pending Admin Approval. Admin approval form contains pay-in commission, payout commission, fixed USDT rate and assigned deposit address. Require explicit network/token configuration with address. Store approval actor/time and versioned settings. |
| User conversions | That User's configured rate applies to deposit, withdrawal, payout and commission conversion. Store applied rate/fee snapshots on each transaction; later settings must not rewrite past transactions. |
| Merchant approval | Registration creates Pending Admin Approval. Admin approval form contains pay-in fee %, payout fee % and fixed charge per payout. Fixed-charge currency and Merchant USDT rate remain undecided. |
| Bank/UPI | User submits → Admin review → approved → User verification available. No verification before approval. Verification is separate from APK pairing. |
| Activation | Confirmed minimum initial deposit requirement is **2000 USDT**, plus required statement submission and approved/verified UPI. Financial operations remain blocked until the activation prerequisites are satisfied. Login, profile, funding/onboarding and support remain accessible. |
| Capacity | Confirmed deposit adds capacity; successful pay-in consumes capacity. Approved/completed payout and parking restore capacity at the agreed evidence-backed transition. Pending submissions do not count as completed payments. Only assigned eligible Users' capacity is available to Merchant routing. All links share concurrency-safe capacity reservations. |
| Statement recovery | A newly accepted missed incoming credit makes Merchant order successful and consumes matched User capacity, with **zero User pay-in commission**. Both exact statement match and missing-UTR recovery apply. APK/statement/import retries do not double deduct, credit or commission. Existing accounted success is unchanged. |
| Commission | INR/USDT are two displays of one entitlement. Withdrawal in either currency reserves/debits that single entitlement and changes both displays. |
| Merchant balance | Derive collections/fees/payouts/withdrawals/holds/reservations from auditable journals; reserve principal+fees for pending outflows; settle each reservation once. Use exact amounts. |
| Employee | Admin assigns checkbox module/action grants. Both navigation and backend enforce them. Temporary credential and mandatory first-login password reset; no self-escalation; audit sensitive actions. |

These requirements are future acceptance criteria, not capabilities verified in the current repository.

## 2. Onboarding without a circular dependency

Use independent states rather than one overloaded active flag:

| Dimension | Proposed states and transition authority |
| --- | --- |
| Registration/approval | `pending_admin_approval → approved / rejected`; Admin supplies required terms, rate and deposit network/token/address before approved funding instructions are enabled |
| Funding | `awaiting_deposit → confirmation_pending → confirmed`; chain/provider confirmation policy is unresolved and must be trusted; submitted proof is not confirmation |
| Bank/UPI | `draft → submitted → under_review → approved → verification_pending → verified`; rejection/correction returns to submission; Admin approval is a prerequisite for User verification |
| Statement | `not_submitted → submitted → accepted / needs_correction`; whether submitted or accepted satisfies activation depends on approved evidence policy, never legacy auto-match alone |
| Operating access | derived `onboarding / active / restricted / suspended`; activation requires Admin approval, confirmed initial 2000-USDT requirement, required statement and approved/verified UPI |

Funding instructions, deposit observation, statement onboarding and bank verification must be accessible while financial operations are blocked. Do not require a pay-in, payout, withdrawal or an already-active User to complete those prerequisites. If chosen UPI verification requires a payment challenge, explicitly design an onboarding-only verified challenge or an alternative evidence process; do not rely on unrestricted financial APIs. No new banking OTP collection.

Sensitive account changes (account identity/number, IFSC, beneficiary, UPI VPA or ownership evidence) create a new pending version, revoke eligibility for new routing and require Admin re-review then verification. Existing reserved orders retain their assigned immutable account version and require safe completion/reconciliation; do not move them silently to the edited account. Cosmetic labels may remain editable with audit. The exact sensitive field list and dispute path need agreement before implementation.

Later top-ups are distinct from initial activation. Do not require every top-up to be 2000 USDT without a decision. Do not silently reapply the initial funding threshold to every existing active User or decide suspension/withdrawal collateral rules from the initial threshold alone.

## 3. Information architecture and single editing locations

The following parent labels are the approved navigation. Overview contains cards, charts and alerts; settings/approval forms belong to their own detailed sections. Context links may point to one canonical editor; never implement duplicate editable forms. APK-related pages stay in APK & Events.

### User

| Parent | Proposed pages/content |
| --- | --- |
| Overview | Activation checklist, remaining/held capacity, collection/commission summaries and alerts |
| Bank & UPI | Account/UPI submission, review status, approved verification and version history |
| Finance | Deposits/funding instructions, withdrawals, commission entitlement with INR/USDT views, ledger and holds |
| Operations | Assigned transaction history, payout/proof status and reconciliation tasks |
| APK & Events | Approved future device status/pairing access and safe event metadata; any protected changes/access require separate review; no new banking OTP exposure |
| Trade with WPay | Approved trade workflows later; scope still undefined, do not invent tradable products |
| Settings | Profile, login security and preferences; no editable financial terms assigned by Admin |

Statement onboarding/history should have one canonical User page under Operations, linked from the onboarding checklist. It must not invoke the unsafe legacy matcher until B1/B2 are resolved.

### Merchant

| Parent | Proposed pages/content |
| --- | --- |
| Overview | Collections, available/held balance, routing availability and alerts |
| Collections | Payment links/orders, status, collection details and reconciliation history |
| Payouts & Withdrawals | Requests, principal/fee breakdown, reservations, proof/dispute and completion |
| Finance | Ledger, fee history, balances and exports |
| Developer / API | Merchant-scoped keys, integration documentation, request logs/webhook configuration after approved scope |
| Settings | Profile/login security/preferences; approved terms read-only |

### Admin

| Parent | Proposed pages/content |
| --- | --- |
| Overview | Operational cards/charts, blocked approvals, reconciliation and capacity alerts |
| Users | Approval queue and canonical User approval/terms/address form, status and suspension controls |
| Merchants | Approval queue and canonical Merchant fee form |
| Bank & UPI | Review/approval/re-review queue, account versions and verification status |
| Routing | Merchant→User assignments, eligibility/capacity view and routing controls |
| Transactions | Orders, credits, matching/recovery evidence and disputes |
| Finance | Deposits, ledger, commissions, holds, withdrawals/payout approvals and rate audit |
| Parking | Parking requests, approved evidence and capacity-restoration history |
| APK & Events | Device inventory, pairing and safe event/telemetry views; protected sensitive modules gated for separate review |
| Developer / API | API integration configuration, scoped key administration, webhook/outbox logs |
| Employees | Employee creation, first-login status and module/action checkbox grants |
| Reports | Auditable summaries/exports, scoped by permission |
| Support | Onboarding/operation tickets and reconciliation communication |
| Settings | Platform configuration, security and audit policy |

Employee navigation derives from the same permission catalog used by backend routes. It is not a fourth hard-coded copy of every Admin menu. A view checkbox permits read-only actions only; approve, edit, export, manage-keys and manage-employees need separate explicit grants. Sensitive grants are not implied by a visible parent menu.

## 4. Permission and audit design

Proposed action identifiers are stable `module.action` values (for example `users.view`, `users.approve`, `bank_upi.review`, `routing.assign`, `finance.withdrawal_approve`, `employees.manage`). A registry maps each route/action and navigation item to its requirement. Deny unknown modules/actions; default employee permission set is empty. Enforce ownership in addition to permissions.

Only an authorized Admin can create/disable employees or set grants. Do not expose principal/tenant/role/permission fields in a generic profile update endpoint. Block self-granting, employee-created privileged identities and grant changes through alternate APIs. Revoke sessions or bump authorization version on role/grant changes so stale browser menus cannot keep access.

Temporary credentials are one-time, expiring, shown/delivered through an approved channel, hashed at rest, never placed in logs; mandatory first-login reset precedes all business actions. Use separate login security flows, never banking OTP capture. Disable the temporary credential after reset and revoke earlier sessions. This plan does not send any credentials or messages.

Audit actor/principal, tenant, target, action, prior/new nonsecret values, request/correlation ID, reason, time and permission version for approval, terms/address/rate changes, account re-review, routing, grant changes, evidence acceptance, ledger adjustments and financial approvals. Redact account details as appropriate; never log banking credentials, OTPs, wallet secrets or raw session/API keys. Audit access and exports are also permission controlled.

## 5. Delivery phases and acceptance gates

### Phase 0 — completed by Task 1

Add AGENTS protection, baseline manifest, read-only checker, separate regression tests and these three design documents. No application/config/schema change. Preserve baseline and record test limits. Stop here.

### Phase 1 — permission foundation, no runtime wiring

Add a pure permission catalog/decision module and navigation derivation contract with separate tests. Do not connect it to legacy auth or collect credentials. This is the recommended next small task in section 7.

### Phase 2 — new identity and nonfinancial onboarding

After review, add `lib/wpay/auth/`, `lib/wpay/onboarding/`, scoped repositories, new explicit `db/wpay/` migrations and panel shells. Implement pending approvals, configured terms/address network, account review/versioning and onboarding access matrix. Use the existing PostgreSQL database and Express stack.

Schema changes and the exact minimal wrapper patch described in `integration-boundaries.md` require a separate approval. Legacy files remain frozen otherwise. Acceptance: principal isolation, employee reset/grants, pending-user access, Bank/UPI review-before-verification, account edit re-review, audit redaction and no legacy credential exposure. Funding observation can be prototyped synthetically; confirmed funding must wait for the evidence/network policy.

### Phase 3 — ownership/evidence design and authorized legacy correction

Resolve legacy mappings, bank evidence trust and account/device/merchant assignment. Build a migration/reconciliation dry-run report before writing mappings. Request exact protected-schema/matcher changes needed for owner-scoped matching; document all expected contract differences before any baseline change. B1/B2 must be closed, with cross-owner negative tests, before enabling new financial consumers. No blind backfill from status strings or source labels.

### Phase 4 — ledger and capacity engine, initially synthetic

Add `lib/wpay/ledger/`, `capacity/`, `commissions/`, `evidence/`, `deposits/` and new schema in reviewed increments. Use exact arithmetic, immutable transaction rate/fee snapshots, atomic journal/reservation changes, unique economic posting IDs and an outbox. Validate funding networks/token precision and confirmation policy before real deposits.

Acceptance: 2000-USDT initial activation, safe later top-ups per decision, rate changes do not rewrite history, one entitlement across INR/USDT, principal+fee holds once, shared capacity never oversubscribed, successful posting/release conservation, both statement recovery sources get zero first-posting User pay-in commission, APK/statement replay has one financial effect, existing accounted commission unchanged.

### Phase 5 — collections, routing and outflows

Add assigned-User eligibility routing and Merchant collections, then payouts/withdrawals, then parking as separate tasks. Each needs approved failure/expiry/quota/dispute/late-success rules. Never generate links against unreserved capacity. A deposit or pending proof is not a completed outgoing payment. Restore capacity only once at the approved terminal/evidence boundary. Protect routing decisions from concurrent User/account/assignment changes.

### Phase 6 — panels, API and operations

Finish the approved parent navigation, scoped reports/support, API key lifecycle and callbacks. Test menus and backend independently with read/write/export permission combinations. Use summary dashboards with links to canonical configuration screens. Do not add Trade functionality until scope is defined.

### Phase 7 — controlled rollout (separate request)

Approve CI changes to run protection and full contract tests on PRs, including public/parser assets. Reconcile opening ownership/balances with a dry-run audit, validate recovery/replay/rollback and failure handling, run Node 20 CI and nonfinancial device/browser acceptance, and review APK provenance/signing and existing sensitive-data remediation. No deployment/merge is authorized by Task 1.

## 6. Open decisions — do not implement by assumption

The first seven are explicitly required by the request:

1. **Failed/expired links:** when does capacity reservation release; what reliable nonpayment evidence is required; is link-generation quota counted on creation/attempt/success and is quota restored?
2. **Merchant money configuration:** Merchant USDT conversion rate and fixed payout fee currency. Define rounding/precision and fee timing before calculations.
3. **Rejected/disputed payment proof:** who may resolve it; which holds remain if actual payment may have happened; how to establish safe release without blindly freeing funds?
4. **Legacy ownership:** mapping of each legacy User/Merchant/device/account/order/import/economic transaction, ambiguous devices/multiple accounts and prior accounting/opening balances.
5. **Trusted evidence:** acceptable bank/statement/payment evidence, independent validator, account binding and acceptance/retention requirements. Browser rows/hash and device credentials alone are insufficient.
6. **Late success:** payment arrives after reservation release or link expiry; capacity funding/shortfall, Merchant credit timing and reconciliation authority.
7. **Initial vs top-up:** initial requirement is 2000 USDT; is it cumulative confirmed funding or one deposit, and what later top-up minimum applies? Do not treat the initial threshold as an automatic later minimum.

Additional implementation decisions exposed by the audit:

- Supported network(s), exact USDT token/contract identifiers, address validation/assignment, confirmation depth/finality/reorg policy, decimal scale, conversion rounding and custody/withdrawal mechanism. Never collect seed phrases/private keys in the new panels.
- Whether statement submission or accepted trusted statement evidence satisfies activation, and what noncircular UPI verification mechanism is approved.
- Whether and when an active User becomes restricted after withdrawals, capacity depletion or account re-review; define minimum continuing collateral separately from initial activation.
- Exact approved/completed payout and parking event that restores capacity, unit/conversion, who approves it and how duplicate restoration is prevented.
- User payout commission basis/entitlement timing and rounding; recovered User pay-in commission is confirmed zero, but Merchant fee treatment follows separately approved terms and is not silently waived.
- Employee sensitive-action approval/dual-control rules and credential delivery channel; scope of Trade with WPay, support and external API/webhooks.
- Authorized scope/timeline for protected security fixes (OTP/raw SMS, auth, checkout reconstruction, artifact/CI publishing) versus behavior that must remain frozen.

These decisions can be answered incrementally. They do not block the next pure permission-catalog task, but B1/B2 and money-release decisions block live financial wiring.

## 7. Next small implementation task — proposed exact file list

**Task 2 proposal: standalone permission and navigation foundation.** Add only:

- `lib/wpay/permission-catalog.js` — approved parent modules and explicit view/create/edit/review/approve/export/administration action names; no runtime configuration or legacy imports.
- `lib/wpay/authorization-policy.js` — pure deny-by-default decision function over an explicit principal/grants/ownership context; Employee cannot manage own grants. No HTTP router or database calls.
- `lib/wpay/navigation.js` — derive visible sections/pages from catalog and grants, preserving the sidebar grouping above and one canonical editor per feature.
- `test/wpay-authorization-policy.test.js` — unknown action denial, cross-owner denial, explicit-assignment exceptions, Employee self-escalation denial, stale permission-version denial and allowed/denied action cases.
- `test/wpay-navigation.test.js` — no disallowed links, allowed child reveals its parent, no duplicated editor routes, APK pages remain grouped.
- `docs/wpay-permission-matrix.md` — reviewable route/action and role/ownership examples with unresolved sensitive grants left disabled.

Acceptance: standalone module tests, existing `npm run check`/`npm test` and unchanged 197-file protection check pass; no schema, auth credentials, panel runtime, wrapper, package scripts, Android or financial changes. Because the existing check script scans only immediate directory JS, explicitly syntax-check these new nested modules. Do not start Task 2 automatically after this delivery.
