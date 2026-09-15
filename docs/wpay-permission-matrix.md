# WPay Task 2 — standalone authorization and navigation foundation

## Status and scope

This is a standalone policy/navigation foundation. **Existing runtime routes are not protected by it yet.** Existing authentication is unchanged. No visible panel UI, Express router, database schema, session/credential implementation, financial wiring, payment execution or deployment was added. Every route in the navigation catalog is a **planned route**, not an existing endpoint.

Baseline: `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541`. Branch: `audit/wpay-legacy-protection`. Starting `git status --short` contained exactly the nine untracked Task 1 additions listed in the preflight checksum section below; no tracked changes. Those files were verified against the Task 1 delivery hashes and preserved. No Task 1 patch was reapplied. The 197-file legacy checker passed before implementation.

Only the implementation plan's six proposed files are added:

1. `lib/wpay/permission-catalog.js`
2. `lib/wpay/authorization-policy.js`
3. `lib/wpay/navigation.js`
4. `test/wpay-authorization-policy.test.js`
5. `test/wpay-navigation.test.js`
6. `docs/wpay-permission-matrix.md`

Task 2 refines two older plan examples explicitly: User Upload Statement is under **Bank & UPI**, as required by the newer request; employee creation/assignment is **Super Admin-only**, not ordinary Admin-controlled. Action IDs use the request's granular `withdrawals.approve`, `employees.permissions.update`, etc. The earlier illustrative `finance.withdrawal_approve` / `employees.manage` strings are not accepted aliases. Task 1 documents remain unchanged.

## Trusted input boundary

The future trusted server layer must authenticate the principal, load current grants/version/administrative scope, resolve resource ownership and account bindings, and determine eligibility from its authoritative records. **Never pass browser role, localStorage, request-body owner/user/tenant IDs, `approved=true` or deposit claims into this policy as authority.** Resolving an ID from a request is not establishing its ownership. There is no way for a pure function to authenticate the provenance of a supplied object; this implementation validates shape and relationships, not identity evidence.

The policy does not read `process.env`, cookies, network, database, clocks or randomness. It has no import-time runtime effects. Inputs are JSON-like data snapshots without getters/proxies; methods neither mutate nor freeze caller-owned inputs. Exported catalog/definition objects and returned decisions/navigation/checkbox groups are deeply frozen. `module.exports` is frozen. No password, cookie, key, OTP or financial value is generated, returned or stored.

### Principal types and grants

| Exact type | Meaning | Grant/role boundary |
| --- | --- | --- |
| `user` | User business principal | User-prefixed and common personal permissions only; own User/tenant records |
| `merchant` | Merchant business principal | Merchant-prefixed and common personal permissions only; own Merchant/tenant records; narrow assigned-capacity exception described below |
| `admin` | Administrative operator | Explicit ordinary administrative and common personal permissions; no restricted Super Admin actions |
| `super_admin` | Explicit highest administrative principal | Still needs each exact grant and applicable scope; no wildcard or implicit all-access behavior |
| `employee` | Delegated administrative operator | Only explicitly selected employee-delegable grants, their explicit dependencies and granted administrative tenants; never employee creation or permission delegation |

Unknown/case-variant role names (`root`, `Admin`, `superadmin`, etc.) are not aliases. Every protected action requires a nonempty principal ID/tenant ID, exact type, `status:'active'`, and current permission version. Suspended/disabled/unknown statuses deny protected actions. Unauthenticated login itself belongs to the future authentication task; this module intentionally denies every protected permission without a principal. Common personal profile/support grants are also explicit, not automatically granted to an Employee.

Every action is separate: view does not imply edit, approve, reject, export, freeze or release. Permission dependencies are prerequisites, not automatic grants. An invalid/duplicate/unknown/wildcard/inapplicable grant invalidates the supplied grant snapshot; a dependent action without its view dependency is rejected. The policy never repairs or expands a grant list.

## Exports and contracts

### `permission-catalog.js`

| Export | Contract |
| --- | --- |
| `PRINCIPAL_TYPES` | Frozen array of the five exact type strings |
| `PERMISSION_GROUPS` | Frozen ordered `{id,label}` groups used for grouped checkbox data |
| `PERMISSION_CATALOG` | Frozen array of permission descriptors; complete matrix below |
| `getPermission(id)` | Frozen descriptor for an exact ID, or `null`; Map-backed lookup accepts no wildcard/prototype aliases |
| `getEmployeePermissionGroups()` | Frozen ordered nonempty groups of descriptors with `selectable`; restricted actions are visible as disabled metadata, never silently selectable |

Each descriptor contains `id`, `label`, `module`, `group`, `action`, `principalTypes`, `scope`, `employeeDelegable`, `restricted`, `highRisk`, `dependencies`, `accessModes`, `eligibility`, `accountRequired`, `descriptorOnly`, `blockers`, and `implementation:'planned'`.

Administrative employee-grant changes, API credential administration, ledger adjustments and security configuration have explicit high-risk metadata. Those administrative actions are non-delegable and Super Admin-only. Merchant-owned API credential actions are separate Merchant permissions, never platform administration. All credential entries are future policy metadata only; no credentials are handled here.

### `authorization-policy.js`

| Export | Contract |
| --- | --- |
| `validateGrants(grants, principalType)` | Validate exact known/applicable grants, no duplicates/wildcards, employee delegability and dependency completeness. Returns `{allowed,reason,permissions}` on success, preserving selection order; denial has only `{allowed:false,reason}`. Empty selection is valid but authorizes nothing. |
| `canUsePermission(input)` | Capability/navigation precheck for identity, active state, version, grants/type, base scope and eligibility. Success includes `requiresResourceAuthorization:true`. This is **not** record/list authorization. |
| `authorize(input)` | Runs the precheck, then verifies explicit access mode, record identity, ownership/administrative/assignment/account context. Success includes `accessMode`, `constraints` and `requiresBackendEnforcement:true`. Never queries records or generates SQL. |
| `validateEmployeeSelection(input)` | Super Admin-only validation of a create/update checkbox proposal, target, grants, dependencies and delegated tenant scope. Returns the unchanged selected permissions and copied scope on success. Never creates an Employee or assigns persisted grants. |

Authorization input shape (only synthetic examples):

```js
{
  principal: {
    id: 'principal-a', type: 'user', status: 'active', tenantId: 'tenant-a',
    userId: 'user-a', permissionVersion: 7
    // merchantId is required for Merchant-owned or assigned-capacity scopes.
  },
  grants: ['user.transactions.view'],
  currentPermissionVersion: 7, // independently loaded current server version
  permissionId: 'user.transactions.view',
  eligibility: {
    approvalStatus: 'approved', initialDepositSatisfied: true,
    statementSatisfied: true, upiApproved: true, upiVerified: true,
    operationsEnabled: true
  },
  context: {
    kind: 'record', id: 'transaction-a', tenantId: 'tenant-a',
    ownerType: 'user', ownerId: 'user-a', accountId: 'account-a',
    accountOwnerId: 'user-a', accountTenantId: 'tenant-a'
  }
}
```

This returns an allowed **policy** decision constrained to those exact IDs. The future backend must both apply those constraints and perform workflow/evidence validation; the result is not proof a payment occurred. Changing the owner to `user-b` denies with `OWNERSHIP_MISMATCH`. Missing account identity on this record denies with `ACCOUNT_CONTEXT_REQUIRED`. Two null/missing identities never establish equality/ownership. IDs must be nonempty bounded alphanumeric-leading strings containing only letters, digits, `_ . : -`; permission versions must be nonnegative safe integers, equal to the freshly supplied current version.

### Resource/list/create scope

| Scope | Record/create requirement | List requirement / mandatory filter descriptor |
| --- | --- | --- |
| `self` | context tenant equals principal tenant; `ownerType:'principal'`, ownerId equals principal ID | Derives `{tenantId,ownerType:'principal',ownerId}` from principal; supplied conflicting owner/tenant denied |
| `own_user` | principal userId required; exact context tenant, `ownerType:'user'`, ownerId required | Derives the principal's User/tenant constraint; no unrestricted User query |
| `own_merchant` | principal merchantId required; exact context tenant, `ownerType:'merchant'`, ownerId required | Derives the principal's Merchant/tenant constraint |
| `admin_tenants` | explicit nonempty `adminScope.tenantIds`, context tenant within it; record ID required; account-sensitive permissions also require owner and account binding | Returns only granted `tenantIds`, or one explicitly narrowed tenant; optional owner narrowing needs valid owner type/ID and a single authorized tenant |
| `platform` | Super Admin, `adminScope.platform === true`, and `context.platform === true`; a record still needs ID; Employee permission changes also need equal record/target Employee IDs and prohibit self-target | Only permitted if the catalog explicitly offers list mode; no catalog platform action currently does |
| `assigned_users` | Merchant, specific active assignment mapping its Merchant/tenant to the target User/tenant, `subjectEligible === true` | Required assignment filter for current Merchant/tenant, active assignments and eligible Users; restricted projection only |

Access modes are exact `list`, `record`, or `create`, as specified by each permission. Record mode requires `context.id`. Create mode binds the new object's ownership (without pretending an existing record ID is necessary). View generally supports list/record; export supports list; submit/create supports create; update/approve/reject/freeze/release supports record. The matrix gives every mode explicitly.

For `accountRequired:true`, record/create mode additionally needs valid `accountId`, `accountOwnerId`, `accountTenantId` matching the resolved owner/tenant. A list across the principal's owned accounts is allowed only with its mandatory owner/tenant constraint; providing a specific account adds the same binding checks. Ordinary bank submission is the intentional create exception: there is no existing approved account yet. Verification and viewing/updating specific Bank/UPI records and statement records require account context. Ledger adjustment is Super Admin-only **and** tenant/account scoped.

Example: `context:{kind:'list'}` for `user.transactions.view` produces `constraints.where = {tenantId:'tenant-a',ownerType:'user',ownerId:'user-a'}`. This is permission to request **that filtered list**, not `SELECT *` and not permission to fetch a specific row without record authorization. The backend must apply the filter before pagination/count/search/export, not remove unauthorized rows afterward. No filter-to-SQL implementation is included.

The only cross-owner exception is `merchant.routing_capacity.view`. Record context requires `{ownerType:'user',ownerId,tenantId,subjectEligible:true,assignment:{id,active:true,merchantId,merchantTenantId,userId,userTenantId}}` matching the authenticated Merchant and target User. Both list and record decisions restrict the projection to `['userId','eligibleCapacity']`. They never authorize full User, bank, device, statement or OTP records. Assignment validity/eligibility must be resolved by a future trusted service, not browser flags. No legacy query is rewritten or proxied.

### Eligibility — no deposit or ledger calculations

| Requirement | Required authoritative state |
| --- | --- |
| `none` | Active principal + permission/scope/version; onboarding/profile/support/funding observation access can remain available during approval/funding |
| `approved` | `eligibility.approvalStatus === 'approved'`; used for certain read-only financial/account status pages |
| `approved_bank` | Approved User plus `approvedBankAccountAvailable === true` for navigation; actual verification also requires the specific `context.accountApproved === true` and matching account ownership; no deposit dependency |
| `user_operational` | Approved User and all of `initialDepositSatisfied`, `statementSatisfied`, `upiApproved`, `upiVerified`, `operationsEnabled` exactly true |
| `merchant_operational` | Approved Merchant and `operationsEnabled === true`; no User deposit threshold is silently imposed on Merchants |

Missing/false/string-valued requirements deny operations. Pending approval cannot operate. An approved but unfunded User can still see funding/onboarding, profile and support. A funding observation or submitted proof does not set a confirmed-deposit flag. The confirmed 2000-USDT initial requirement is evaluated by a future authoritative service; this module accepts its boolean result and never computes balances, deposit minimums, conversion, reservations or fees. Login, password reset and sessions are outside scope.

### Employee checkbox proposal

```js
validateEmployeeSelection({
  principal: { id:'super-a', type:'super_admin', status:'active', tenantId:'platform-tenant', permissionVersion:7 },
  currentPermissionVersion:7,
  grants:['employees.view','employees.create','employees.permissions.update','users.view','users.approve'],
  adminScope:{platform:true,tenantIds:['tenant-a']},
  operation:'update', targetEmployeeId:'employee-a',
  selectedPermissions:['users.view','users.approve'],
  delegatedScope:{tenantIds:['tenant-a']}
})
```

This validates exactly the two selected grants. `['users.approve']` fails `MISSING_DEPENDENCY`; the function never silently adds `users.view`. Selection `[]` is valid with empty scope and grants nothing. Nonempty selections need a nonempty tenant scope. Delegated scope must remain inside the actor's explicit tenant scope, cannot carry a platform grant, and the actor must hold every selected action. Unknown/wildcard/non-delegable selections fail. Admin/Employee actors cannot delegate, even to another Employee; self-targeting is denied. All creation, identity checks, temporary credentials, delivery, reset and grant persistence remain a separate task.

### Stable denial codes

Denials contain only `allowed:false` and a stable reason; no errors/logs include submitted IDs or sensitive values. Codes distinguish missing/invalid identity, inactive principal, version required/stale, unknown/inapplicable/missing permission, invalid/duplicate/wildcard grants, missing dependency, non-delegable permission, invalid access mode, missing record/owner/account context, owner/account mismatch, missing/outside administrative scope, platform scope/context, missing/mismatched Employee target, self-escalation, approval/account/operational eligibility, required assignment, descriptor-only action, Super Admin requirement, invalid delegation operation/scope, and selected grant not held by actor. Tests assert concrete codes for representative boundary failures. The first failing validation determines the code; a code is not a substitute for checking `allowed`.

### `navigation.js`

- `NAVIGATION_DEFINITION`: one deeply frozen ordered parent/child definition. Stable IDs distinguish groups, pages and destinations; planned path and destination IDs are globally unique.
- `deriveNavigation(input)`: derives only the appropriate audience's permitted pages using `canUsePermission`; removes empty parents; preserves definition order regardless of grant selection order. Employee uses the administrative definition, not a cloned sidebar. All returned pages state `routeStatus:'planned'` and `requiresResourceAuthorization:true`.
- A view grant can show a canonical directory/detail page, but never enables approve/update/export buttons. User/Merchant approval and commercial controls belong to their single canonical directory/detail destination. Bank/UPI uses one canonical review destination. Future per-action buttons must call the policy separately; no duplicate editable approval/terms screens are defined.
- Admin Statement Import Management is under **Bank & UPI** (one import/upload/history destination). Its future submit action requires `statements.submit`. Reconciliation Review is under **Transactions**, owns evidence decisions and does not duplicate the upload editor. User Upload Statement is under Bank & UPI. APK/device/activation/OTP descriptors exist only under APK & Events.
- Example Employee grants `['users.view','reports.view']` show only Users → User Directory and Reports → Reports. `reports.export` needs a separate checked grant (and reports.view); it is not implied by the report menu.
- User/Merchant full hierarchy follows the Task 2 request exactly. Admin parents remain Overview, Users, Merchants, Bank & UPI, Routing, Transactions, Finance, Parking, APK & Events, Developer / API, Employees, Reports, Support, Settings.
- OTP Events is a sensitive legacy navigation descriptor only. `canUsePermission` may display the descriptor when granted, but `authorize` **always denies** `descriptorOnly` permissions with `DESCRIPTOR_ONLY`. No raw OTP/SMS retrieval or new endpoint is implemented. Coming Soon is also descriptor-only. Metadata `blockers` on statements is explanatory; it does not claim their blocker has been cleared.

## Verification results and remaining limits

- Preflight: protected baseline PASS, all 197 exact hashes; Task 1 additions PASS against the nine original delivery checksums.
- `node --test test/wpay-authorization-policy.test.js test/wpay-navigation.test.js`: **112 passed, 0 failed, 0 skipped**.
- `npm run check`: **PASS**, 31 immediate-directory JavaScript files. The root checker does not recurse; explicit `node --check` checks for all three new nested modules also **PASS**.
- `npm test`: **FAILED before tests started**, at `os.userInfo()` inside embedded PostgreSQL initialization: `SystemError ERR_SYSTEM_ERROR / uv_os_get_passwd ENOMEM`. Database/provider/dashboard/PG variables and PUBLIC_BASE_URL were cleared without printing their values, matching Task 1's isolation method. Current sandbox approval policy prevents the outside-sandbox retry that worked during Task 1. This run is **not counted as passing**; Task 1's historical 51-test pass is not a Task 2 full-suite result.
- No existing tests were edited, skipped or weakened. No PostgreSQL shim, OS monkey-patch, live database, unknown npm start, provider call or production data was used to work around the environment failure.
- The new tests are deterministic/table-driven synthetic fixtures. They cover identity/type/grant/version denial, User/Merchant/Employee boundaries, own/list/account/assigned scope, eligibility, Super Admin delegation, dependencies, immutable outputs/catalog, hierarchy/order/uniqueness/grouping and no runtime side effects. A VM loader forbids environment/network/timers/clock/random access and rejects non-standalone imports while loading/exercising all three modules.
- The catalog and menus are descriptors, not working routes. Pure unit tests do not prove authentication, schema/RLS, transaction locking, legacy tenant safety, real bank evidence, financial eligibility correctness or live UI security.
- Final scope check: **PASS**. All 197 protected baseline files and all nine Task 1 additions are byte-for-byte unchanged. `git diff --exit-code` against the baseline is clean for tracked files; full untracked status contains exactly the original nine additions plus these six Task 2 files. No unexpected working-tree changes. The permission matrix covers all 133 catalog IDs.

**Unresolved blockers:** legacy tenant/account isolation, legacy ownership/prior-accounting mapping, trusted statement/payment evidence, and raw banking OTP/SMS exposure remain exactly as reported in Task 1. Financial release/quota, Merchant conversion/fixed fee, proof disputes, late payments, initial-vs-top-up and network/finality decisions are unchanged. No new permission grant makes legacy matching safe or turns evidence into a financial posting.

## Next small task proposal (not started)

Task 3 proposal: define a standalone trusted-principal-context adapter over explicit authenticated server inputs, with synthetic contract tests, before any session/router implementation. Add only:

1. `lib/wpay/auth/principal-context.js` — validate/map a server-resolved identity and independently loaded current grant/version/scope snapshot into the Task 2 input contract; never accept browser role/ownership claims or legacy admin aliases.
2. `test/wpay-principal-context.test.js` — missing/stale/revoked/mismatched authoritative snapshots, cross-tenant context and attacker-controlled request fields.
3. `docs/wpay-auth-context-contract.md` — identify the authoritative providers future authentication/resource layers must implement; document revocation and required ownership/evidence boundaries.

No Task 3 work, runtime wiring, schema, credentials or financial execution is authorized by this proposal. Actual authentication/storage and integration require their own scoped task; protected changes still require separate explicit approval.

## Complete canonical permission matrix

`Delegable` refers to Employee checkbox selection. Preconditions include the capability's eligibility plus explicit grant dependencies; account context is required for record/create where indicated. Every row also requires active authenticated identity, valid/current version, an exact granted permission and its scope. All permissions are future capabilities; their metadata does not implement a route or financial action.

| Permission ID | Principal | Module / group | Action | Scope / modes | Delegable | Preconditions / risk |
| --- | --- | --- | --- | --- | --- | --- |
| `profile.view` | user, merchant, admin, super_admin, employee | profile / settings | view | self; list, record | Yes | none; No grant dependencies |
| `profile.update` | user, merchant, admin, super_admin, employee | profile / settings | update | self; record | Yes | none; Requires: profile.view |
| `notifications.view` | user, merchant, admin, super_admin, employee | notifications / settings | view | self; list, record | Yes | none; No grant dependencies |
| `notifications.update` | user, merchant, admin, super_admin, employee | notifications / settings | update | self; record | Yes | none; Requires: notifications.view |
| `support.view` | user, merchant, admin, super_admin, employee | support / support | view | self; list, record | Yes | none; No grant dependencies |
| `support.create` | user, merchant, admin, super_admin, employee | support / support | create | self; create | Yes | none; Requires: support.view |
| `guide.view` | user, merchant, admin, super_admin, employee | guide / settings | view | self; list, record | Yes | none; No grant dependencies |
| `user.overview.view` | user | user.overview / overview | view | own_user; list, record | No | none; No grant dependencies |
| `user.analytics.view` | user | user.analytics / overview | view | own_user; list, record | No | user_operational; No grant dependencies |
| `user.bank_upi.view` | user | user.bank_upi / bank_upi | view | own_user; list, record; record/create account required | No | none; No grant dependencies |
| `user.bank_upi.submit` | user | user.bank_upi / bank_upi | submit | own_user; create | No | none; Requires: user.bank_upi.view |
| `user.bank_upi.update` | user | user.bank_upi / bank_upi | update | own_user; record; record/create account required | No | none; Requires: user.bank_upi.view |
| `user.bank_upi.verify` | user | user.bank_upi / bank_upi | verify | own_user; record; record/create account required | No | approved_bank; Requires: user.bank_upi.view |
| `user.bank_upi.analytics` | user | user.bank_upi / bank_upi | analytics | own_user; list, record; record/create account required | No | user_operational; Requires: user.bank_upi.view |
| `user.statements.view` | user | user.statements / bank_upi | view | own_user; list, record; record/create account required | No | none; No grant dependencies; tenant_account_isolation, trusted_evidence |
| `user.statements.submit` | user | user.statements / bank_upi | submit | own_user; create; record/create account required | No | none; Requires: user.statements.view; tenant_account_isolation, trusted_evidence |
| `user.payin_commission.view` | user | user.payin_commission / finance | view | own_user; list, record | No | approved; No grant dependencies |
| `user.payout_commission.view` | user | user.payout_commission / finance | view | own_user; list, record | No | approved; No grant dependencies |
| `user.withdrawals.view` | user | user.withdrawals / finance | view | own_user; list, record | No | approved; No grant dependencies |
| `user.withdrawals.inr.create` | user | user.withdrawals / finance | inr.create | own_user; create | No | user_operational; Requires: user.withdrawals.view |
| `user.withdrawals.usdt.create` | user | user.withdrawals / finance | usdt.create | own_user; create | No | user_operational; Requires: user.withdrawals.view |
| `user.deposits.view` | user | user.deposits / finance | view | own_user; list, record | No | none; No grant dependencies |
| `user.deposits.submit` | user | user.deposits / finance | submit | own_user; create | No | none; Requires: user.deposits.view |
| `user.holds.view` | user | user.holds / finance | view | own_user; list, record | No | approved; No grant dependencies |
| `user.payins.view` | user | user.payins / operations | view | own_user; list, record; record/create account required | No | user_operational; No grant dependencies |
| `user.payouts.view` | user | user.payouts / operations | view | own_user; list, record | No | user_operational; No grant dependencies |
| `user.payouts.inr.create` | user | user.payouts / operations | inr.create | own_user; create | No | user_operational; Requires: user.payouts.view |
| `user.payouts.usdt.create` | user | user.payouts / operations | usdt.create | own_user; create | No | user_operational; Requires: user.payouts.view |
| `user.parking_beneficiaries.view` | user | user.parking_beneficiaries / parking | view | own_user; list, record | No | user_operational; No grant dependencies |
| `user.parking_beneficiaries.create` | user | user.parking_beneficiaries / parking | create | own_user; create | No | user_operational; Requires: user.parking_beneficiaries.view |
| `user.parking_beneficiaries.update` | user | user.parking_beneficiaries / parking | update | own_user; record | No | user_operational; Requires: user.parking_beneficiaries.view |
| `user.parking_payments.view` | user | user.parking_payments / parking | view | own_user; list, record | No | user_operational; No grant dependencies |
| `user.parking_payments.create` | user | user.parking_payments / parking | create | own_user; create | No | user_operational; Requires: user.parking_payments.view |
| `user.transactions.view` | user | user.transactions / transactions | view | own_user; list, record; record/create account required | No | user_operational; No grant dependencies |
| `user.apk.view` | user | user.apk / apk_events | view | own_user; list, record | No | none; No grant dependencies |
| `user.activation_codes.view` | user | user.activation_codes / apk_events | view | own_user; list, record | No | approved; No grant dependencies |
| `user.devices.view` | user | user.devices / apk_events | view | own_user; list, record; record/create account required | No | approved; No grant dependencies |
| `user.otp_events.view` | user | user.otp_events / apk_events | view | own_user; list, record | No | approved; No grant dependencies; Descriptor only; legacy_sensitive_data |
| `user.trade.view` | user | user.trade / trade | view | own_user; list, record | No | none; No grant dependencies; Descriptor only |
| `merchant.overview.view` | merchant | merchant.overview / overview | view | own_merchant; list, record | No | none; No grant dependencies |
| `merchant.analytics.view` | merchant | merchant.analytics / overview | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.collections.view` | merchant | merchant.collections / collections | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.collections.create` | merchant | merchant.collections / collections | create | own_merchant; create | No | merchant_operational; Requires: merchant.collections.view |
| `merchant.transactions.view` | merchant | merchant.transactions / collections | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.routing_capacity.view` | merchant | merchant.routing_capacity / routing | view | assigned_users; list, record | No | merchant_operational; No grant dependencies |
| `merchant.payouts.view` | merchant | merchant.payouts / finance | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.payouts.inr.create` | merchant | merchant.payouts / finance | inr.create | own_merchant; create | No | merchant_operational; Requires: merchant.payouts.view |
| `merchant.payouts.usdt.create` | merchant | merchant.payouts / finance | usdt.create | own_merchant; create | No | merchant_operational; Requires: merchant.payouts.view |
| `merchant.withdrawals.view` | merchant | merchant.withdrawals / finance | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.withdrawals.usdt.create` | merchant | merchant.withdrawals / finance | usdt.create | own_merchant; create | No | merchant_operational; Requires: merchant.withdrawals.view |
| `merchant.ledger.view` | merchant | merchant.ledger / finance | view | own_merchant; list, record | No | approved; No grant dependencies |
| `merchant.fees.view` | merchant | merchant.fees / finance | view | own_merchant; list, record | No | approved; No grant dependencies |
| `merchant.holds.view` | merchant | merchant.holds / finance | view | own_merchant; list, record | No | approved; No grant dependencies |
| `merchant.api_credentials.view` | merchant | merchant.api_credentials / developer_api | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.api_credentials.create` | merchant | merchant.api_credentials / developer_api | create | own_merchant; create | No | merchant_operational; Requires: merchant.api_credentials.view; High risk: api_credentials |
| `merchant.api_credentials.revoke` | merchant | merchant.api_credentials / developer_api | revoke | own_merchant; record | No | merchant_operational; Requires: merchant.api_credentials.view; High risk: api_credentials |
| `merchant.api_docs.view` | merchant | merchant.api_docs / developer_api | view | own_merchant; list, record | No | none; No grant dependencies |
| `merchant.webhooks.view` | merchant | merchant.webhooks / developer_api | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.webhooks.update` | merchant | merchant.webhooks / developer_api | update | own_merchant; record | No | merchant_operational; Requires: merchant.webhooks.view |
| `merchant.api_logs.view` | merchant | merchant.api_logs / developer_api | view | own_merchant; list, record | No | merchant_operational; No grant dependencies |
| `merchant.security.view` | merchant | merchant.security / settings | view | self; list, record | No | none; No grant dependencies |
| `merchant.security.update` | merchant | merchant.security / settings | update | self; record | No | none; Requires: merchant.security.view |
| `overview.view` | admin, super_admin, employee | overview / overview | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `users.view` | admin, super_admin, employee | users / users | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `users.approve` | admin, super_admin, employee | users / users | approve | admin_tenants; record | Yes | none; Requires: users.view |
| `users.reject` | admin, super_admin, employee | users / users | reject | admin_tenants; record | Yes | none; Requires: users.view |
| `users.commercial.update` | admin, super_admin, employee | users / users | commercial.update | admin_tenants; record | Yes | none; Requires: users.view |
| `users.suspend` | admin, super_admin, employee | users / users | suspend | admin_tenants; record | Yes | none; Requires: users.view |
| `merchants.view` | admin, super_admin, employee | merchants / merchants | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `merchants.approve` | admin, super_admin, employee | merchants / merchants | approve | admin_tenants; record | Yes | none; Requires: merchants.view |
| `merchants.reject` | admin, super_admin, employee | merchants / merchants | reject | admin_tenants; record | Yes | none; Requires: merchants.view |
| `merchants.commercial.update` | admin, super_admin, employee | merchants / merchants | commercial.update | admin_tenants; record | Yes | none; Requires: merchants.view |
| `merchants.suspend` | admin, super_admin, employee | merchants / merchants | suspend | admin_tenants; record | Yes | none; Requires: merchants.view |
| `bank_upi.view` | admin, super_admin, employee | bank_upi / bank_upi | view | admin_tenants; list, record; record/create account required | Yes | none; No grant dependencies |
| `bank_upi.review` | admin, super_admin, employee | bank_upi / bank_upi | review | admin_tenants; record; record/create account required | Yes | none; Requires: bank_upi.view |
| `bank_upi.approve` | admin, super_admin, employee | bank_upi / bank_upi | approve | admin_tenants; record; record/create account required | Yes | none; Requires: bank_upi.view |
| `bank_upi.reject` | admin, super_admin, employee | bank_upi / bank_upi | reject | admin_tenants; record; record/create account required | Yes | none; Requires: bank_upi.view |
| `bank_upi.freeze` | admin, super_admin, employee | bank_upi / bank_upi | freeze | admin_tenants; record; record/create account required | Yes | none; Requires: bank_upi.view |
| `bank_upi.release` | admin, super_admin, employee | bank_upi / bank_upi | release | admin_tenants; record; record/create account required | Yes | none; Requires: bank_upi.view |
| `statements.view` | admin, super_admin, employee | statements / bank_upi | view | admin_tenants; list, record | Yes | none; No grant dependencies; tenant_account_isolation, trusted_evidence |
| `statements.submit` | admin, super_admin, employee | statements / bank_upi | submit | admin_tenants; create; record/create account required | Yes | none; Requires: statements.view; tenant_account_isolation, trusted_evidence |
| `routing.view` | admin, super_admin, employee | routing / routing | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `routing.assign` | admin, super_admin, employee | routing / routing | assign | admin_tenants; record | Yes | none; Requires: routing.view |
| `routing.release` | admin, super_admin, employee | routing / routing | release | admin_tenants; record | Yes | none; Requires: routing.view |
| `transactions.view` | admin, super_admin, employee | transactions / transactions | view | admin_tenants; list, record; record/create account required | Yes | none; No grant dependencies |
| `transactions.export` | admin, super_admin, employee | transactions / transactions | export | admin_tenants; list; record/create account required | Yes | none; Requires: transactions.view |
| `reconciliation.view` | admin, super_admin, employee | reconciliation / transactions | view | admin_tenants; list, record; record/create account required | Yes | none; No grant dependencies; tenant_account_isolation, trusted_evidence |
| `reconciliation.review` | admin, super_admin, employee | reconciliation / transactions | review | admin_tenants; record; record/create account required | Yes | none; Requires: reconciliation.view; tenant_account_isolation, trusted_evidence |
| `reconciliation.approve` | admin, super_admin, employee | reconciliation / transactions | approve | admin_tenants; record; record/create account required | Yes | none; Requires: reconciliation.view; tenant_account_isolation, trusted_evidence |
| `reconciliation.reject` | admin, super_admin, employee | reconciliation / transactions | reject | admin_tenants; record; record/create account required | Yes | none; Requires: reconciliation.view; tenant_account_isolation, trusted_evidence |
| `deposits.view` | admin, super_admin, employee | deposits / finance | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `deposits.review` | admin, super_admin, employee | deposits / finance | review | admin_tenants; record | Yes | none; Requires: deposits.view |
| `deposits.approve` | admin, super_admin, employee | deposits / finance | approve | admin_tenants; record | Yes | none; Requires: deposits.view |
| `deposits.reject` | admin, super_admin, employee | deposits / finance | reject | admin_tenants; record | Yes | none; Requires: deposits.view |
| `withdrawals.view` | admin, super_admin, employee | withdrawals / finance | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `withdrawals.review` | admin, super_admin, employee | withdrawals / finance | review | admin_tenants; record | Yes | none; Requires: withdrawals.view |
| `withdrawals.approve` | admin, super_admin, employee | withdrawals / finance | approve | admin_tenants; record | Yes | none; Requires: withdrawals.view |
| `withdrawals.reject` | admin, super_admin, employee | withdrawals / finance | reject | admin_tenants; record | Yes | none; Requires: withdrawals.view |
| `payouts.view` | admin, super_admin, employee | payouts / finance | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `payouts.review` | admin, super_admin, employee | payouts / finance | review | admin_tenants; record | Yes | none; Requires: payouts.view |
| `payouts.approve` | admin, super_admin, employee | payouts / finance | approve | admin_tenants; record | Yes | none; Requires: payouts.view |
| `payouts.reject` | admin, super_admin, employee | payouts / finance | reject | admin_tenants; record | Yes | none; Requires: payouts.view |
| `ledger.view` | admin, super_admin, employee | ledger / finance | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `ledger.export` | admin, super_admin, employee | ledger / finance | export | admin_tenants; list | Yes | none; Requires: ledger.view |
| `ledger.adjust` | super_admin | ledger / finance | adjust | admin_tenants; record; record/create account required | No | none; Requires: ledger.view; High risk: ledger_adjustment |
| `commissions.view` | admin, super_admin, employee | commissions / finance | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `holds.view` | admin, super_admin, employee | holds / finance | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `holds.freeze` | admin, super_admin, employee | holds / finance | freeze | admin_tenants; record | Yes | none; Requires: holds.view |
| `holds.release` | admin, super_admin, employee | holds / finance | release | admin_tenants; record | Yes | none; Requires: holds.view |
| `parking.view` | admin, super_admin, employee | parking / parking | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `parking.review` | admin, super_admin, employee | parking / parking | review | admin_tenants; record | Yes | none; Requires: parking.view |
| `parking.approve` | admin, super_admin, employee | parking / parking | approve | admin_tenants; record | Yes | none; Requires: parking.view |
| `parking.reject` | admin, super_admin, employee | parking / parking | reject | admin_tenants; record | Yes | none; Requires: parking.view |
| `devices.view` | admin, super_admin, employee | devices / apk_events | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `devices.pairing.create` | admin, super_admin, employee | devices / apk_events | pairing.create | admin_tenants; create | Yes | none; Requires: devices.view |
| `apk.view` | admin, super_admin, employee | apk / apk_events | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `otp_events.view` | admin, super_admin, employee | otp_events / apk_events | view | admin_tenants; list, record | Yes | none; No grant dependencies; Descriptor only; legacy_sensitive_data |
| `api_credentials.view` | admin, super_admin, employee | api_credentials / developer_api | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `api_credentials.create` | super_admin | api_credentials / developer_api | create | platform; create | No | none; Requires: api_credentials.view; High risk: api_credentials |
| `api_credentials.revoke` | super_admin | api_credentials / developer_api | revoke | platform; record | No | none; Requires: api_credentials.view; High risk: api_credentials |
| `api_docs.view` | admin, super_admin, employee | api_docs / developer_api | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `webhooks.view` | admin, super_admin, employee | webhooks / developer_api | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `webhooks.update` | admin, super_admin, employee | webhooks / developer_api | update | admin_tenants; record | Yes | none; Requires: webhooks.view |
| `api_logs.view` | admin, super_admin, employee | api_logs / developer_api | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `employees.view` | admin, super_admin, employee | employees / employees | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `employees.create` | super_admin | employees / employees | create | platform; create | No | none; Requires: employees.view; High risk: employee_permissions |
| `employees.permissions.update` | super_admin | employees / employees | permissions.update | platform; record | No | none; Requires: employees.view; High risk: employee_permissions |
| `reports.view` | admin, super_admin, employee | reports / reports | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `reports.export` | admin, super_admin, employee | reports / reports | export | admin_tenants; list | Yes | none; Requires: reports.view |
| `support_admin.view` | admin, super_admin, employee | support_admin / support | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `support_admin.update` | admin, super_admin, employee | support_admin / support | update | admin_tenants; record | Yes | none; Requires: support_admin.view |
| `settings.view` | admin, super_admin, employee | settings / settings | view | admin_tenants; list, record | Yes | none; No grant dependencies |
| `security.configure` | super_admin | security / settings | configure | platform; record | No | none; Requires: settings.view; High risk: security_configuration |

## Task 6: narrowly scoped self-service Security addition

Task 6 explicitly authorizes these catalog/navigation additions. The policy and principal adapter are unchanged.

| Permission | Principal types | Scope / access | Dependency |
| --- | --- | --- | --- |
| `account_security.view` | user, merchant, admin, super_admin, employee | self; list/record | none |
| `account_security.update` | user, merchant, admin, super_admin, employee | self; record only | account_security.view |

Each audience's Settings group gains **Security / Two-Factor Authentication**. Existing page order is preserved, with this page appended. The two exact User/Merchant hierarchy assertions include that single new label. The shared descriptor remains planned for later legacy integration; Task 6's separate development runtime handles it locally.

These capabilities authorize only the current principal's own security record. They do not grant administration, another account's MFA access, raw OTP visibility, or financial operation rights. Employee delegation remains subject to the unchanged selection policy. The development runtime requires current approval/MFA assurance before showing Security, and fresh password plus an unused authenticator code for sensitive changes. OTP `DESCRIPTOR_ONLY` restrictions are unchanged.

## Task 1 preflight checksums (preserved)

| Task 1 path (untracked at start) | Bytes | SHA-256 |
| --- | --- | --- |
| AGENTS.md | 3533 | `9c760c12c95ce24d77786bf1e2a588670e2cc85cd208bdf4f18e41ea4ec2133b` |
| docs/repository-audit.md | 31790 | `d73c0d7b229c4fd4d29464a973b9edc48b939759b5e3c91e51f354f4dff80cfd` |
| docs/protected-legacy-files.json | 35900 | `29361f8cb429df9d1ba0661ccb29bc26bb209dc1fd1356eee4ed6ef48a21ae9a` |
| docs/integration-boundaries.md | 17934 | `cab1bc62c1eac5e45695253be3883a1dbb528d3bb22c7dd7182f00a69c8a30df` |
| docs/wpay-implementation-plan.md | 19244 | `ab3cbd373aa4a08ba70ca8b87da14bb2ebe7518d4031c4eb6768524c9b7b86e3` |
| scripts/check-protected-legacy.js | 3892 | `6e42519c4559f9ec92a6d88ad68f3ecd8ce4d42f9c868288bb2595b14519dc87` |
| test/protected-legacy.test.js | 4242 | `7d4d1a4a8161bb1e3cee685d80c48e6480120c01ead4a949bec020f0f381f0da` |
| test/statement-parser-contract.test.js | 2116 | `16c9420c8531605bcf0a1c647dc09db2bf7717c940633f77be5b1799be21ee00` |
| test/verification-source-contract.test.js | 5208 | `a50f8e3a14dc9eb462b5885b0208921c3ae9b8074d3fe7eefc072953d557fffc` |
