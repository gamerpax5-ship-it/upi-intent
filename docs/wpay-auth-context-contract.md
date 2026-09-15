# WPay Task 3 — principal-context adapter

## Scope and inspected contract

Standalone CommonJS adapter; no authentication, database, HTTP routes, credentials, panel UI, financial integration, dependency, configuration or legacy change. The adapter imports only the existing permission catalog and authorization policy. It reads no environment, filesystem, network, clock or random source and retains no per-user state.

Preflight branch: `audit/wpay-legacy-protection`. HEAD: `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541`. Starting state: exactly fifteen untracked Task 1/2 additions, no tracked changes. All fifteen matched their original delivery SHA-256 values; the baseline checker passed for all 197 files. The delivery includes the full preflight status and fifteen hashes. No earlier patch was reapplied.

Read before design: root AGENTS.md, repository audit, integration boundaries, implementation plan, permission matrix, catalog, authorization policy, navigation and both Task 2 test files. Task 2 explicitly refines the older plan: User statements are under Bank & UPI; Employee creation/delegation is Super Admin-only. Those refinements remain in force. No blocking contradiction was found in the current contract.

Only these three files are added:

1. `lib/wpay/auth/principal-context.js`
2. `test/wpay-principal-context.test.js`
3. `docs/wpay-auth-context-contract.md`

## Public API

The sole export is `buildPrincipalContext(input)`. The CommonJS export object is frozen.

- Success: `{ ok: true, context }`, deeply frozen and detached from all inputs.
- Failure: `{ ok: false, reason: 'STABLE_CODE' }`, frozen. No partial principal, input echo, exception details or logging.
- **`ok` means context construction succeeded. It does not mean authenticated, active, eligible, or authorized.** The caller must check `ok` before accessing `context` and must then use the actual policy for each operation.

Input is an explicit bundle of server-resolved JSON-like data records, not an HTTP request, session token, decoded token payload or database connection. Use own data properties, ordinary arrays and primitive values. Proxies, executable accessors, class behavior and hostile JavaScript objects are outside the input contract. Own data-property reads ignore inherited fields and do not execute property getters. This is not a JavaScript sandbox and does not protect against malicious Proxy traps or array accessors.

```js
{
  identity: { subjectId, accountId, tenantId, permissionVersion },
  account: {
    subjectId, id, tenantId, type, status, currentPermissionVersion,
    userId,     // required only for type 'user'
    merchantId  // required only for type 'merchant'
  },
  grantRecord: {
    subjectId, accountId, tenantId, permissionVersion,
    grants: ['exact.permission.id'],
    adminScope: { tenantIds: ['tenant-a'], platform: true } // optional, rules below
  },
  eligibilityRecord: { // optional; omit when unavailable, do not pass null
    subjectId, accountId, tenantId,
    facts: {
      approvalStatus: 'approved',
      initialDepositSatisfied: true,
      statementSatisfied: true,
      upiApproved: true,
      upiVerified: true,
      operationsEnabled: true,
      approvedBankAccountAvailable: true
    }
  }
}
```

These record envelopes are the adapter API, not new database schemas or authentication providers. The fields inside the returned context exactly match Task 2. Account here means a WPay principal account: `account.id` becomes `principal.id`. An Employee's canonical principal ID must also be the target ID used by Task 2's self-escalation checks. `subjectId` is the authenticated identity subject reference, which may differ from that account ID. User/Merchant IDs are separate business membership IDs. A bank account ID belongs to a later resource authorization context; it is not this account ID.

## Field-by-field authority and output allowlist

All providers below are **required future caller responsibilities**, not services implemented by this task.

| Input field | Required source of authority | Output / validation |
| --- | --- | --- |
| `identity.subjectId`, `accountId`, `tenantId` | Independently authenticated server identity reference and verified account membership | Each must be valid and exactly match resolved account subject, ID and tenant; not returned separately |
| `identity.permissionVersion` | Authorization epoch recorded by the verified identity/session mechanism | `principal.permissionVersion`; never inferred from freshly loaded grants |
| `account.subjectId`, `id`, `tenantId` | Trusted account/membership resolver keyed from verified identity | Binding check; `id` and `tenantId` become principal fields |
| `account.type` | Current persisted account role | `principal.type`; exact catalog type only |
| `account.status` | Current persisted account restriction state | `principal.status`, unchanged; only Task 2's exact `active` permits protected capabilities |
| `account.userId` / `merchantId` | Verified business membership in account tenant | Only the role-relevant principal owner field is copied; required for every User/Merchant snapshot |
| `account.currentPermissionVersion` | Independently loaded current authorization epoch | `currentPermissionVersion`; compared against identity and grant versions |
| `grantRecord.subjectId`, `accountId`, `tenantId` | Trusted grant resolver, including canonical Employee account binding | Exact match to resolved account; these envelope fields are not returned |
| `grantRecord.permissionVersion` | Version of the loaded grants/scope snapshot | Must equal current account epoch; not copied into a competing output field |
| `grantRecord.grants` | Current explicit grants for that account/version | `grants`, validated by existing `validateGrants`, preserving order with no inferred grants |
| `grantRecord.adminScope.tenantIds` | Current persisted administrative tenant assignments in that bound grant record | Detached `adminScope.tenantIds`; no tenant inferred from account or identity |
| `grantRecord.adminScope.platform` | Explicit persisted Super Admin platform assignment | Copied only when supplied and valid; no role-based default |
| `eligibilityRecord.subjectId`, `accountId`, `tenantId` | Trusted eligibility resolver's subject binding | Exact match to resolved account; not returned |
| `eligibilityRecord.facts.approvalStatus` | Authoritative approval state | `eligibility.approvalStatus`, unchanged when present |
| `initialDepositSatisfied` | Authoritative confirmed initial-deposit decision | Same-named eligibility boolean; never calculated from submitted proof or amount |
| `statementSatisfied` | Authoritative statement prerequisite decision under an approved evidence policy | Same-named eligibility boolean; not inferred from a legacy match |
| `upiApproved`, `upiVerified` | Authoritative Bank/UPI review and verification decisions | Same-named eligibility booleans, separately preserved |
| `operationsEnabled` | Authoritative operating restriction decision | Same-named eligibility boolean |
| `approvedBankAccountAvailable` | Authoritative approved-bank availability decision | Same-named eligibility boolean; individual account approval is still checked by `authorize` |

The only context keys are `principal`, `grants`, `currentPermissionVersion`, optional `adminScope`, optional `eligibility`. The only principal keys are `id`, `type`, `status`, `tenantId`, `permissionVersion`, and role-relevant `userId` or `merchantId`. No subject envelope, raw row, resource context, requested action, metadata or credentials are copied. Missing eligibility stays missing; an empty facts record becomes an empty eligibility object.

Extras on transport objects, identity, account, grant and eligibility rows cannot override these sources. In particular, top-level `principal`, `grants`, `adminScope`, `eligibility`, body, headers, query, localStorage, unsigned-token claims and `trusted:true` are not used. Account-row grant arrays and identity-row roles are not authority. The allowlist excludes password/session/API/bank login/OTP/raw SMS/private-key and unrelated personal-information extras without even traversing them. Callers must still keep secrets out of the allowed ID/status fields themselves; structural validation cannot infer the meaning of arbitrary strings.

## Validation rules

1. IDs use Task 2's exact grammar: `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/`. No trimming, numeric conversion, case folding or aliasing. Missing/null IDs never establish equality. Every identity, account, grant and supplied eligibility binding includes a valid tenant.
2. Exact types come from `PRINCIPAL_TYPES`: `user`, `merchant`, `admin`, `super_admin`, `employee`. User and Merchant require their own resolved business ID even with empty grants. Administrative accounts receive no business-owner aliases.
3. Task 2 has no exported account-status enumeration: it only recognizes exact `active` for access. The adapter accepts bounded identifier-shaped status strings and preserves them, including `pending`, `pending_admin_approval`, `suspended`, `disabled`, `restricted`, and unknown future identifiers. Those snapshots construct successfully but Task 2 denies their capabilities. Missing/non-string/malformed status is rejected. Approval status is independent of account status; an active login account can have pending business approval and retain onboarding access.
4. All three versions are required nonnegative safe integers. Identity version becomes principal version; account supplies independently loaded current version; grant snapshot must have that current version. Mismatches reject construction. There is no resetting an old identity epoch to a new grant epoch. Read consistency/retry and session invalidation remain the caller's responsibility.
5. Existing `validateGrants` handles shape, unknown/wildcard/duplicate/inapplicable/non-delegable permissions and dependencies. Empty selections stay empty. View grants never add approve/update/export. Super Admin still needs exact grants. Dependency rejection does not repair the selection.
6. If supplied, administrative scope must have a unique array of valid tenant IDs. It is only accepted for Admin/Super Admin/Employee. `platform` may be absent or a boolean for Super Admin; any supplied platform value for another type is rejected. Every `admin_tenants` grant requires nonempty tenant scope; every `platform` grant requires explicit `platform:true`. Requirements are read from existing catalog descriptors. Empty grants may omit scope. A grant's tenant list may include tenants other than the principal's home tenant: this is the existing explicit administrative assignment model, not a mismatch. Its enclosing grant record must still belong to the exact principal account/subject/home tenant. This adapter cannot prove the listed assignments were legitimately issued.
7. A supplied eligibility record must be bound to the same account and have an object `facts`. Missing optional fields are omitted. Supplied flags must be booleans; string `"true"`, numeric truthiness and null are rejected. Approval status uses the same bounded identifier grammar without translating `pending` or other values into `approved`. Unknown approval status stays restrictive under Task 2. No deposit/rate/balance/capacity or evidence computation occurs.
8. All returned nested objects and arrays are newly constructed and frozen. Inputs are neither modified nor frozen. Later input changes cannot modify an earlier result. No cache or session persistence is implemented.

## Stable construction failure codes

First failure in implementation order wins. Check `ok`, not the code alone. Reused validator reasons are forwarded without sensitive details.

| Code | Meaning |
| --- | --- |
| `INVALID_INPUT` | Top-level bundle is not a record |
| `INVALID_IDENTITY` | Missing/malformed identity or subject/account/tenant IDs |
| `INVALID_ACCOUNT` | Missing/malformed account or subject/ID/tenant |
| `IDENTITY_ACCOUNT_MISMATCH` | Valid identity binding differs from resolved account |
| `UNKNOWN_PRINCIPAL_TYPE` | Account role is not an exact catalog type |
| `INVALID_ACCOUNT_STATUS` | Missing/malformed account status |
| `OWNER_IDENTITY_REQUIRED` | User/Merchant business owner ID missing or malformed |
| `INVALID_GRANT_RECORD` | Grant envelope missing/malformed |
| `GRANT_ACCOUNT_MISMATCH` | Grant subject/account/tenant invalid, absent or mismatched |
| `PERMISSION_VERSION_REQUIRED` | Any required version absent or not a nonnegative safe integer |
| `GRANT_VERSION_MISMATCH` | Loaded grant version differs from current account version |
| `STALE_PERMISSION_VERSION` | Verified identity epoch differs from current account epoch |
| `INVALID_GRANTS`, `WILDCARD_GRANT`, `UNKNOWN_PERMISSION`, `DUPLICATE_GRANT`, `NON_DELEGABLE_PERMISSION`, `PRINCIPAL_TYPE_NOT_ALLOWED`, `MISSING_DEPENDENCY` | Existing `validateGrants` denial, unchanged |
| `INVALID_ADMIN_SCOPE` | Wrong role, malformed tenant IDs, duplicates, or invalid platform field |
| `ADMIN_SCOPE_REQUIRED` | Administrative tenant grants lack nonempty tenant scope |
| `PLATFORM_SCOPE_REQUIRED` | Platform grants lack explicit platform authority |
| `INVALID_ELIGIBILITY_RECORD` | Supplied eligibility envelope is not a record |
| `ELIGIBILITY_ACCOUNT_MISMATCH` | Eligibility subject/account/tenant invalid, absent or mismatched |
| `INVALID_ELIGIBILITY_FACTS` | Facts missing/malformed or supplied known facts have invalid types |

An inactive but structurally valid account is not a construction failure. `PRINCIPAL_INACTIVE`, `APPROVAL_REQUIRED`, `MISSING_PERMISSION`, `OWNERSHIP_MISMATCH`, `DESCRIPTOR_ONLY` and other action decisions remain the existing policy's responsibility.

## Synthetic integration example

```js
const { buildPrincipalContext } = require('./lib/wpay/auth/principal-context');
const { canUsePermission, authorize } = require('./lib/wpay/authorization-policy');
const { deriveNavigation } = require('./lib/wpay/navigation');

// Synthetic data only. A future server must independently resolve these sources.
const result = buildPrincipalContext({
  identity: { subjectId:'subject-a', accountId:'principal-a', tenantId:'tenant-a', permissionVersion:7 },
  account: { subjectId:'subject-a', id:'principal-a', tenantId:'tenant-a',
    type:'user', status:'active', userId:'user-a', currentPermissionVersion:7 },
  grantRecord: { subjectId:'subject-a', accountId:'principal-a', tenantId:'tenant-a',
    permissionVersion:7, grants:['user.deposits.view','user.transactions.view'] },
  eligibilityRecord: { subjectId:'subject-a', accountId:'principal-a', tenantId:'tenant-a',
    facts:{ approvalStatus:'pending', initialDepositSatisfied:false } }
});
if (result.ok) {
  const capability = canUsePermission({ ...result.context, permissionId:'user.deposits.view' });
  // allowed:true, requiresResourceAuthorization:true
  const list = authorize({ ...result.context, permissionId:'user.deposits.view', context:{ kind:'list' } });
  // constraints.where = { tenantId:'tenant-a', ownerType:'user', ownerId:'user-a' }
  // requiresBackendEnforcement:true -- no query is executed here.
  const operation = canUsePermission({ ...result.context, permissionId:'user.transactions.view' });
  // allowed:false, reason:'APPROVAL_REQUIRED'
  const navigation = deriveNavigation(result.context);
  // Finance -> USDT Deposit; planned route only. Transaction History is absent.
}
```

Use fixed server-selected permission IDs and separately resolved resource ownership when calling `authorize`. Never merge a raw request over the built context. The backend must apply returned filters before pagination/count/search/export and honor limited projections. Resource IDs are selectors, not ownership evidence. Bank account and assignment contexts still need independently verified binding; this adapter supplies none of that evidence.

Administrative example: a bound Employee grant record with `grants:['users.view','reports.view']` and `adminScope:{tenantIds:['tenant-a']}` shows User Directory and Reports. It does not grant approval, commercial editing or export; its User lists remain restricted to tenant-a. Common `profile.view` is valid policy authority for every role, but Task 2 defines a profile navigation destination only for User/Merchant; a permission does not manufacture a menu page.

OTP Events may remain visible as a granted descriptor; `authorize` always returns `DESCRIPTOR_ONLY`. Statement entries retain `tenant_account_isolation` and `trusted_evidence` blocker metadata. Task 2 may return a constrained policy decision for a planned financial/statement action; that does not clear its integration blockers, execute it or mount an endpoint. This adapter does not change those decisions or add a second execution policy.

## Provenance, revocation and caller responsibilities

**A pure function cannot independently prove where an object originated.** A forged bundle whose fields consistently agree can pass structural checks. Naming it `identity`, adding `trusted:true`, freezing/tagging/branding it, or decoding an unsigned token is not authentication. Only a future trusted calling layer can authenticate identity and obtain account, role, grants, scope and eligibility from authoritative storage. Never use client-controlled request fields as those records, including when they have been copied or frozen.

The context is a validated snapshot, not permanent authority. Future integration must load current account/grant/eligibility state for each relevant operation or implement an explicitly reviewed revocation/version mechanism. It must revoke or invalidate affected sessions on role/grant/membership changes and refresh an identity epoch only through that authenticated mechanism. Mixed-version reads fail here; a consistent read strategy and safe retry are still needed. Eligibility and suspension changes also require fresh authoritative reads; a grant version alone is not a complete revocation design.

Freezing an old active snapshot does **not** automatically enforce a later account suspension. Tests explicitly demonstrate that the old snapshot remains active while a newly constructed suspended snapshot is denied. Do not keep a process-global authorization-context cache or treat browser/local/session storage as current authority. No session creation, storage, caching, logout or revocation service is implemented in this task.

Future callers also own credential verification, session expiry, Employee first-login reset, account membership mapping, safe secret handling, operation/resource selection, real query filtering, transactional consistency, and workflow/evidence checks. Legacy shared dashboard authentication cannot stand in for those services.

## Validation and remaining blockers

- Combined command: `node --test test/wpay-authorization-policy.test.js test/wpay-navigation.test.js test/wpay-principal-context.test.js` — **193 passed, 0 failed, 0 skipped**: 112 unchanged Task 2 tests and 81 new adapter tests.
- `npm run check` — **PASS**, 32 immediate-directory JavaScript files.
- `node --check lib/wpay/auth/principal-context.js` — **PASS**; explicit because the legacy syntax checker is not recursive.
- `node scripts/check-protected-legacy.js` — **PASS**, all 197 exact baseline file hashes.
- Full `npm test` — **not rerun for Task 3**. Retained Task 2 environment blocker: embedded PostgreSQL initialization calls `os.userInfo()` and fails with `SystemError ERR_SYSTEM_ERROR / uv_os_get_passwd ENOMEM` under the sandbox identity, before tests start. No authorized alternate runner is available under current sandbox permissions. No current full-suite pass is claimed; historical Task 1 success is not a Task 3 result. No test-runner edits, OS identity changes, shims, skipped assertions, unknown database, production/provider configuration or external payment operations were used.
- Synthetic tests exercise the actual policy/navigation modules, identity/version/scope mismatch, restricted status/eligibility, onboarding versus operations, cross-owner and account constraints, assignment projection, explicit grants, secret extras, input detachment, deep immutability and descriptor restrictions. A VM loader forbids runtime/environment/network/timer/clock/random access and non-standalone dependencies during import and calls.
- These tests do not prove real authentication, provenance, bank evidence, database isolation, financial eligibility correctness, concurrency guarantees or runtime security. All existing routes remain unwired to this adapter and Task 2 policy.
- Legacy tenant/account matching isolation (B1), trusted statement/payment evidence (B2), OTP/raw SMS exposure (B3), legacy identity limitations (B4), ownership/prior-accounting mapping and unresolved financial/network/release decisions remain unchanged. Do not enable live financial consumers while those boundaries remain unresolved.

## Next task proposal — not implemented

Task 4: document the future server resolver and revocation design before implementing credentials or runtime wiring. Exact additive scope: **one new file, `docs/wpay-server-resolver-design.md`**. Specify identity/session epoch lifecycle, canonical Employee account IDs, consistent account/grant/eligibility reads, suspension/revocation handling, caller ownership checks, and acceptance criteria. No code, schema, route, legacy auth, financial, package, CI or deployment changes. Stop after Task 3 delivery; this proposal is not executed automatically.
