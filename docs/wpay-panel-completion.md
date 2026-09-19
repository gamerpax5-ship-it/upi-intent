# Isolated WPay panel completion

This change extends only the WPay modules. Migration 015 is additive; migrations
001–014 and the 197 protected legacy files remain unchanged. Deployment acceptance
is recorded separately after the exact commit passes CI and staging verification.

## Implemented contracts

| Area | Behavior and boundaries |
| --- | --- |
| Support | User/Merchant create and read their own tickets. Explicitly granted staff read a tenant-scoped queue and append replies/status events. No external email delivery or attachments. |
| Guide and Trade | User Guide explains approval, funding, statement, UPI and Start prerequisites. Trade remains Coming Soon. |
| Directories | Bounded status/name/email filters include pending and post-approval accounts. Existing approval API is reused. Suspension invalidates sessions and routing. Commercial changes append versions and preserve historical accounting snapshots. |
| Employee credentials | Generated password expires in 24 hours. First authentication gives a ten-minute restricted reset challenge, never an application session. A different user-chosen password is required, followed by mandatory MFA. Reset consumes challenges and invalidates existing security/session epochs. |
| Profile | Self name editing only, with explicit permission and recent MFA. Email remains read-only. |
| Notifications | Own security events and in-app preference only. No email-delivery claim. |
| Analytics and reports | Existing immutable journals/entries, owner or tenant scope, at most 100 rows per page and a 31-day window. Totals explicitly describe the current page only. CSV exports escape formula cells and are separately permission gated. |
| API administration | Tenant-scoped metadata and authenticated request audit; no raw request bodies, digests or secrets in reads. SuperAdmin-only explicit platform permission and recent MFA allow creation/revocation for an approved, MFA-enabled Merchant with existing gateway management permission. Creation reuses the gateway primitive and returns the new secret once; both audits identify the actual Admin actor. |
| Webhooks | Tenant-scoped endpoint identifiers and delivery-outbox diagnostics; secrets and endpoint URLs are omitted. |
| Devices | Tenant-scoped WPay pairings, ownership-link metadata and pairing-request expiry. No banking OTP/SMS or device credentials. Activation-code issuance remains in the User-owned flow. |
| Ledger/holds | Canonical UI calls the existing permission-, tenant- and MFA-checked immutable accounting APIs. No new accounting algorithm or balance table. |
| Settings | Read-only reviewed security policy and truthful provider status. No generic policy mutation endpoint. |
| Navigation | Runtime filters destinations without implementations. Canonical transactions use the existing gateway page. Ordinary Admin and Employee grants are not broadened. |

## Migration and security

- Existing internally generated Employee credentials become temporary for 24 hours
  from migration. Existing password hashes, factors and recovery records are retained.
- New grants are explicit for User, Merchant and the recorded bootstrap SuperAdmin. Only that SuperAdmin gets
  explicit platform scope, required by the existing API administration catalog.
  Ordinary Admin/Employee grants and tenant scopes remain unchanged.
  Additional SuperAdmin accounts are not selected by the upgrade.
- Immutable tables deny updates/deletes/truncation. Runtime gains only the table or
  column privileges required by the new endpoints; it remains a non-owner role.
- Version 15 uses a deterministic total ordering for policy fingerprint rows.
  Validation of versions 001–014 retains the historical fingerprint algorithm.
- Sensitive writes require recent MFA. Commercial/security changes invalidate the
  affected account's sessions. Audits omit passwords, factors, codes and API secrets.
- One-time UI credentials clear on dismissal, tab hiding or a bounded timeout.

## Intentionally disabled or requiring a decision

1. Reconciliation approval/rejection needs an authoritative connector binding
   account, bank, bank version, reservation and economic event. The protected global
   matcher is not mounted or modified. Incomplete review actions remain hidden.
2. Merchant USDT settlement needs Merchant-specific FX/rate/rounding policy.
3. Financial parking needs terminal-event, dispute, late-success, capacity-restoration
   and duplicate-prevention rules. No financial parking behavior is introduced.
4. Privileged ordinary Admin provisioning/delegation and editable security policy
   need an approved authority model; these controls remain hidden.
5. Admin issuing a pairing code for someone else's device needs a delegated ownership
   policy. Admin inventory is read-only; the User-owned flow is preserved.
6. Live OTP, verification, blockchain funding and payout providers remain disconnected.
   Live device-to-dashboard OTP delivery is **NOT TESTED**. No synthetic event is
   presented as live data in the authenticated panel.
7. Proof malware scanning remains **unscanned** without a configured scanner.
8. Funding notification delivery and email ownership verification need an approved
   external provider. In-app support and security notifications do not imply delivery.

## Indirect configuration impact

The isolated WPay runtime requires migration 015 before starting this code. The
seven hosted runtime variable names and existing MFA encryption key are unchanged.
No legacy service mount, startup, database object, device configuration or deployment
configuration changes. Only the isolated staging deployment's CI gate and controlled
rollout may change as part of acceptance. No production source is used for tests.

## Test scope

New tests cover reset restriction/expiry/replay/concurrency, real HTTP/CSRF/MFA,
role isolation/logout, directory ownership and pagination, immutable commercial
history, session invalidation and routing suspension, reporting privacy, CSV safety,
API administration and redacted audit, least-privilege runtime, fresh 001→015 and
014→015 preservation. Existing regressions remain required. Screenshots and private
test credentials remain outside Git.

## Approved fixture correction and failure trace

The pre-edit targeted run had 46 passes and exactly three failures:

- `actual adapter, policy and navigation integrate super_admin default grants`
- `same tenant is not ownership; admin scope is explicit`
- `super_admin: mandatory MFA and self Security use the actual policy`

Each called `resolveContext` with `DEFAULT_GRANTS.super_admin`, including
`api_credentials.create/revoke` (catalog scope `platform`), but supplied only tenant
scope. The unchanged principal builder returned `PLATFORM_SCOPE_REQUIRED`, which
`resolveContext` converts to `AUTH_FAILED`. These are positive fixtures; every
negative scenario and assertion is retained. The exact approved changes are:

```diff
--- test/wpay-auth-runtime.test.js
-    admin_scope: type === "super_admin" ? { tenantIds: ["development-a"] } : null,
+    admin_scope: type === "super_admin" ? { tenantIds: ["development-a"], platform: true } : null,
--- test/wpay-auth-security.test.js
-    admin_scope:type === "super_admin" ? { tenantIds:["tenant-a"] } : null,
+    admin_scope:type === "super_admin" ? { tenantIds:["tenant-a"], platform:true } : null,
```

The corrected targeted run passed 49/49. New independent authority tests preserve
the missing-scope, missing-grant, non-SuperAdmin, cross-tenant, revocation and stale
session denials. Database upgrade tests verify that only the bootstrap record gains
platform authority and that existing security, Employee/ordinary-Admin grants,
journals, holds, commercial versions and reservation snapshots remain exact.
