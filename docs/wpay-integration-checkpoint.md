# WPay integration checkpoint

The Task 9A checkpoint `030fd5dda165dc3235ae25772e854bc074f79981` was pushed to `gamerpax5-ship-it/upi-intent`, branch `wpay/hosted-integration`, and its remote SHA was verified before these changes. GitHub CLI authenticated as `gamerpax5-ship-it` with repository write permission. Main remains at `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541`.

## Independent engines and scoped boundaries

All 197 baseline files remain byte-for-byte protected. WPay does not mount, wrap with new authentication, or change legacy routers, initialization, APK/device configuration, pairing/activation, SMS parsing, OTP storage/ingestion, dashboard handlers, UTR matching, statement matching or checkout generation. The existing engines remain independently usable.

| Existing capability | New WPay boundary | Scope and permitted result |
| --- | --- | --- |
| APK / banking OTP source | `Resources` → `contractFor` → restricted `legacy-reader` → `projection` | Authenticated approved User with completed authenticator MFA; verified, consented, current device ownership; bounded masked event metadata only |
| UTR / payment evidence | Device transaction observation contract | Owned device plus an independently verified, current receiving-account parent from the same source; observations cannot credit or settle |
| Statement results | Statement observation contract | Owned import plus current owned receiving-account parent; no invocation of global legacy matching and no automatic accounting |
| Deeplink / checkout | Merchant order/payment-link observation contract | Merchant's verified resource mapping only; minimal existing-order metadata, no UPI URI, credentials, creation, routing or proxy to legacy admin APIs |
| APK metadata / download | Existing `ApkArtifact` behind WPay session and role checks | Existing hash-bound artifact, not a new APK build; User and authorized Admin access; Merchant/default Employee denied |

These adapters reuse the existing stored results and APK artifact. They do not copy the core algorithms. UTR, statement and checkout observations always return `financiallyAccounted:false`, `settled:false`, `evidenceVerified:false`; `ownershipVerified:true` establishes only the right to view the scoped observation. Live financial promotion remains disconnected until separately authorized trusted evidence and accounting integration exists.

## OTP authority and presentation

Browser input supplies only a WPay resource-link reference and an allowed view/cursor. The server resolves the session's account, permissions, role and the verified mapping; a browser `deviceId`, owner claim, pending request or arbitrary reference cannot authorize a read. Mapping locks remain held through the bounded source read and secret-free audit, so revocation serializes with authorized reads. Expired, revoked or cross-owner mappings deny before source queries. Parent mappings are also locked for payment/statement observations.

User pages distinguish **No linked device** from **OTP source unavailable**. Expired mappings are not presented as readable. Authorized source reads return actual stored event metadata; an empty authorized result is empty, not synthetic data. Raw message and code columns are never selected. The response boundary additionally whitelists fields, rejects nested values, bounds pagination, and forces code masking and nonfinancial status. Merchant, Employee and Admin cannot use this endpoint to obtain banking OTP/SMS. No global Admin OTP proxy or reveal operation exists.

WPay login authenticator TOTP is a separate system. No banking OTP event is used as login MFA, and no real banking OTP was generated for acceptance.

## Optional read-only source configuration

The new WPay development/hosted entry points accept two optional, server-only settings:

- `WPAY_LEGACY_READER_DATABASE_URL`: private connection URL for the existing restricted `wpay_legacy_reader` role.
- `WPAY_LEGACY_READER_TARGET`: exact `host:port/database` confirmation matching that URL.

Absent settings leave the source disconnected. An explicit malformed configuration fails closed. Only loopback or a confirmed Railway private-network host is accepted; Railway also requires the existing `WPAY_HOSTED_NETWORK=railway-private-network` setting. Public endpoints and administrative database roles are rejected. No credentials are put in repository files, browser responses or logs.

The source pool has at most two connections, three-second connection/query limits and read-only transactions. Every operation rechecks that the database role lacks administrative, replication, membership, write, broad sensitive-table and secret-column privileges. Permission drift makes the source unavailable. No role, grant, schema or legacy database object is created or changed by this module. Required restricted source access must already exist and be independently authorized. Source failures do not disable the separate legacy engine or turn its errors into synthetic events.

No source configuration was applied to production, Railway or Supabase. No live ownership mapping was accessed. Existing private development keys were reused unchanged. The extra pool is absent unless explicitly configured; when configured it adds up to two read-only source connections and closes with the new WPay service. Legacy startup mounts, dependency manifests and deployment configuration are untouched.

## Acceptance evidence

- Fresh PostgreSQL migrations and runtime-role validation pass against isolated synthetic targets.
- New PostgreSQL/HTTP adapter suite: 9 tests passed, including cross-User and cross-Merchant reads, Merchant/Admin/Employee OTP denial, unknown/pending mapping and injected device-ID denial, parent ownership checks, expiry/revocation, logout/session expiry, source permission drift, masked responses, APK scope/hash, zero accounting and unchanged synthetic source rows.
- New contract/configuration tests: 3 passed as part of the full suite, covering role/kind boundaries, credential-field exclusion, malformed nested data, bounded responses and restricted connection configuration.
- Existing resource/APK PostgreSQL suite: 8 passed unchanged.
- Full `npm test`: 346 passed, with real disposable PostgreSQL startup and health/POST/GET/checkout smoke checks.
- Existing OTP/Android regressions: 8 passed unchanged; root syntax check: 57 files passed.
- All 197 protected hashes pass before and after work. No existing test was modified, skipped or weakened. No migration was changed or added.
- Real browser password plus MFA login with an existing isolated test User displayed **No linked device** in English, Russian and Simplified Chinese. Screenshots contain no credentials or event secrets; browser warning/error log was empty. Unavailable-source and masked-event paths were verified through real local PostgreSQL/HTTP integration with synthetic source fixtures.

The first new expiry fixture failed the existing fixed 12-hour session constraint. Its timestamps were corrected to represent a valid expired session; the database constraint and production authentication checks were not changed. The corrected final suite uses fresh targets and passes. Prior database fixtures and private keys were preserved.

The existing isolated GitHub workflow now invokes this additional suite using separate disposable CI databases. It creates no hosted infrastructure and performs no deployment. The first published Task 9A commit passed [GitHub Actions run 34993181727](https://github.com/gamerpax5-ship-it/upi-intent/actions/runs/34993181727). The adapter results above are local acceptance results; its separate remote run follows publication.

## Explicit stop point

**Live device-to-dashboard OTP delivery: NOT TESTED.** No authorized real device event was observed end-to-end. Automated fixtures contain synthetic events only and were confined to isolated acceptance databases, not the real authenticated panel.

This checkpoint does not deploy Railway, merge main, start payment links, payouts, withdrawals or parking, or expose legacy matching through new panels. Publication is to the same `wpay/hosted-integration` branch only.
