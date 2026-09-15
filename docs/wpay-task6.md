# WPay Task 6 — approval, mandatory MFA and Merchant languages

> **Task 6A supersedes the blocked status below:** [verified local acceptance](wpay-task6a.md). The following discovery and Task 6 status describe the earlier run; they are retained as history. No production deployment is authorized.

## Status and boundary

**Implementation and acceptance are unfinished.** Independent unit/transport checks can run, but actual PostgreSQL migrations, maintained-library TOTP execution and database-backed browser acceptance are blocked. The scoped package manifest exists; dependency installation and generation of its genuine lockfile are blocked by the npm registry EACCES error. Do not deploy or treat the code as verified authentication. Exact executed checks and hashes are in the separate Task 6 delivery report.

The selected Supabase reference is `nzbuvltvqxgtbmicjxag`. Fresh `get_project` and branch discovery returned “You do not have permission to perform this action,” including a retry after the user repeated the URL. The accessible project `nfjghrhrxwxvbqpmsnuo` has populated public application tables; its default branch is not an isolated acceptance target. Railway exposes only `mellow-vibrancy` / `production` / `upi-intent`. GitHub access works for the intended repository. No target was connected through PostgreSQL, no migrations were executed, and no cloud resource, secret, deployment, customer record or permission was changed.

The local Supabase CLI cannot write its telemetry file under the sandbox; Railway cannot resolve its home directory; gh's local token is invalid. No usable local PostgreSQL installation/service or running Docker daemon was available. These restrictions were not bypassed. No connection URI or key has been placed in source, chat, reports, screenshots or browser storage.

## Intentional Task 5 changes

- User/Merchant registration persists an unauthenticated **pending** application.
- Correct pending credentials return `APPROVAL_PENDING`; wrong/unknown credentials return the same generic `AUTH_FAILED`. Rejected/inactive accounts receive no challenge or session.
- Approved password verification issues only a restricted, opaque MFA challenge. All five actual role names require MFA, including operator-bootstrapped Super Admin.
- Old Task 5 sessions have no MFA assurance and cannot authenticate. Migration 002 also increments account permission/session versions.
- Pending-login acceptance assertions are intentionally replaced. The old explicit integration command delegates to the Task 6 real PostgreSQL/HTTP suite; unrelated registration uniqueness, rollback, CSRF, origin, ownership, version, expiry, bootstrap, drift, throttle and outage assertions remain represented.
- Self Security and Merchant locale updates use the existing policy's **record** authorization; GET list permission is insufficient for mutation.

## Approval workflow

An authenticated actor needs the exact `users.approve`, `users.reject`, `merchants.approve` or `merchants.reject` grant, an explicit applicable tenant scope, and MFA verified within five minutes. The server resolves the target's type/tenant/state; the client cannot supply actor identity, scope, grants, approval flags or funding facts. The popup lists actual pending rows filtered with the policy's tenant constraints.

User approval requires `payinCommission`, `payoutCommission`, `inrPerUsdt`, `depositNetwork`, and `depositAddress`. Rates are explicitly INR per USDT. Merchant approval requires `payinFee`, `payoutFee`, `fixedPayoutFee`, and `fixedFeeCurrency`; the last must match explicit server configuration. Supported configured currencies are INR, USD and USDT; no default is inferred.

Amounts are nonnegative canonical decimal strings, at most nine integer and six fractional digits. Percentages are 0–100 inclusive; INR/USDT rate is strictly positive. Commas, exponents, signs, locale digits and floating-point inputs are rejected. Validation uses integer arithmetic. TRON-TRC20 addresses require Base58Check/version validation; ETHEREUM-ERC20 requires a nonzero lowercase 20-byte hex address. Mixed-case Ethereum addresses are rejected, not silently lowercased without checksum verification. Address validation is format/network validation only; it does not prove ownership or receive funds.

One transaction locks current actor authorization and target application, validates commercial fields and current pending status, inserts a versioned/effective-dated commercial record, changes approval, advances account/grant/session versions, writes an audit event and records the idempotency result. SQL applies the policy's returned target ID and tenant. Any failure rolls back the decision and configuration together. Rejection requires a reason of 3–500 characters after trimming, no control characters, and no commercial payload.

The UI retains a UUID request ID for the same payload and rotates it when edited. `(actor_id, request_id)` is unique and bound to the normalized payload digest. A committed identical retry returns its original result; a different payload or competing decision conflicts. PostgreSQL serialization/lock failures return a safe unavailable response; the client can retry the same payload. New applications receive commercial version 1. There is no repricing/edit endpoint and no historical transaction repricing.

Approval never changes deposit, statement, UPI, funding or operational eligibility. Approved/unfunded Users can complete MFA and see onboarding; financial operations remain unavailable.

## Mandatory authenticator flow

The isolated module boundary is `lib/wpay/auth/runtime/dependencies/`: exact direct dependencies **otplib 13.5.0** and **qrcode 1.5.4**. It loads only its own installed packages, with no root/transitive fallback. The maintained otplib APIs generate/verify TOTP; no custom TOTP algorithm is implemented. Six digits, SHA-1, 30-second period, current or immediately previous step (`epochTolerance: [30, 0]`), no future step. Verification uses the database clock and `afterTimeStep`. QR rendering is local to the Node process and returned as a data URL under restrictive CSP. No CDN/remote QR request occurs.

1. Password verification rechecks active status and User/Merchant approval.
2. A locked database account row is checked again before issuing a five-minute challenge. Only a SHA-256 digest of its random 32-byte opaque cookie is stored.
3. A challenge captures purpose, account ID, permission version, session epoch, security version and factor version. It cannot read profile, navigation, Security or Admin APIs.
4. First enrollment returns a unique random secret/manual key and locally rendered QR only through that restricted owner challenge. Successful TOTP consumes the enrollment challenge and rotates to a separate recovery-acknowledgement challenge; no full session exists yet.
5. Acknowledgement commits the encrypted factor, recovery digests, version/epoch changes and a new full session together. Assurance time is the original TOTP verification time, not the later acknowledgement time.
6. Later login atomically consumes the challenge and advances the factor's accepted time step before session promotion. The actual principal adapter validates the new session in the same transaction.

Account row locks serialize workers; challenge consumption and accepted-step compare-and-update prevent concurrent reuse. Five attempts per challenge, ten account attempts per fifteen minutes, and at most five live outstanding challenges constrain verification/enrollment. Failed proof attempts commit their counters before safe public errors are raised. Independent loopback registration/login/CSRF limits persist in PostgreSQL. Old challenge epochs/versions, expired challenges, inactive status and revoked approval deny promotion.

## Secret storage and outage behavior

Factors and pending enrollment candidates use AES-256-GCM with fresh 96-bit IVs. Authenticated data binds a stored factor to principal ID/factor version, or a candidate to principal ID/challenge digest. A key identifier detects incorrect key configuration; tampering or wrong associated data fails closed.

`WPAY_AUTH_DEV_MFA_KEY` must be canonical base64 for exactly 32 random bytes. An operator must create and persist it in an authorized secret manager/OS credential mechanism outside this repository/database/browser, then inject it privately into the process. This task has **not** provisioned that storage or key. There is no fallback key, startup regeneration, key-recovery backdoor or automatic rotation. Losing the key makes the encrypted factors unusable; a separately designed verified recovery/key rotation procedure is necessary.

Startup requires the key and scoped libraries, validates both migration checksums plus the latest schema fingerprint, and decrypt-checks enabled factors before listening. Protected requests also verify the current encrypted factor; missing/wrong key or database outage cannot fall back to cached principal state. Secret-bearing responses are `no-store`; setup keys, TOTP, QR URIs, recovery codes, password records and session/challenge cookies are not logged or returned in Admin lists. Only CSRF tokens may appear in ordinary JSON; authentication tokens stay HttpOnly cookies.

## Owner Security and recovery

Settings → Security / Two-Factor Authentication is available for User, Merchant, Admin, Super Admin and Employee using self-scoped `account_security.view/update`. It exposes MFA status, bounded active-session timestamps/current-session indicator, replacement, recovery-code regeneration, fresh verification and logout-all. It does not expose another account's factor or grant admin powers.

Replacement, regeneration and recent-MFA step-up require both the current password and an unused TOTP. Replacement advances the epoch/security version, invalidates previous recovery codes and sessions/challenges, and enters restricted enrollment. Regeneration invalidates old recovery codes/sessions/challenges and issues new codes plus a rotated fully assured session after fresh proof. There is no disable-MFA operation.

Recovery codes each have 128 random bits, encoded as 32 hex characters; ten are displayed to the owner and only domain-separated SHA-256 digests persist. A fresh password challenge plus atomic consumption of a valid unused recovery code starts restricted replacement. It invalidates previous sessions/challenges/recovery material. The old factor is not disabled to make a password-only enrollment shortcut; the new factor must be verified before normal access resumes. Losing both authenticator and recovery codes requires a separately verified recovery process; this task deliberately provides no email or Admin reset shortcut.

Security changes and approvals record principal IDs, event, timestamps and rejection reason without secrets. Existing password/session/CSRF/expiry/ownership behavior is retained. A transaction may finish before a later revocation commits; subsequent requests see revocation. Session lifespan remains 12 hours absolute and 30 minutes idle.

## Merchant localization

One dictionary module serves `en`, `ru`, and `zh-CN` (Simplified Chinese). Header and Merchant Settings selectors are available; auth, pending denial, enrollment, challenge, recovery, Security, profile, approvals, statuses, forms, stable errors, planned pages and every Merchant navigation descriptor have keys. IDs, permissions, API keys, statuses, amounts, currency and timestamps remain machine-stable. Decimal inputs are never parsed from translated text, and choosing a locale never selects a role.

Precedence: supported explicit choice → saved authenticated Merchant preference → supported browser locale → English. Pre-auth browser storage holds only `wpay-locale`. Merchant choices, including an explicit pre-auth choice on login, persist through a policy-filtered update to that principal's preference record. Unsupported locales and injected account IDs are rejected. `document.documentElement.lang` tracks selection. Russian and Chinese wording is machine-translated and **has not received human linguistic review**. Dictionary key parity/coverage is unit tested; rendered mobile/layout/browser checks remain blocked.

## Migration and verification

Migration 001 remains byte-for-byte unchanged. Additive migration `002_approval_mfa.sql` extends only Task 5's `wpay_auth` schema: role constraints, session assurance, account security, challenges, recovery digests, commercial versions, approval request idempotency, security audit and locale preferences. Existing accounts gain explicit self Security grants; Merchants gain owner profile update; the recorded bootstrap Super Admin gains the four explicit approval/rejection actions. Epoch/grant versions advance together. Tables have RLS and revoke public/browser/API-role privileges. No public/customer table is touched.

The runner applies pending migration files transactionally under an advisory lock, records each checksum/fingerprint and refuses unexpected schema drift or changed recorded SQL. Startup only validates; it does not migrate. **Neither migration was run for Task 6.**

The explicit PostgreSQL suite has numbered scenarios matching the 21 requested areas plus retained Task 5 security assertions. It checks an empty acceptance target before migrations and leaves synthetic records for review. It uses actual HTTP endpoints, real library-generated TOTP and the database clock; no synthetic factor bypass or fake promotion is used. Restart checks create a new HTTP service and database pool with the same externally supplied key; they do not simulate a whole host restart. Rendering/mobile/console/screenshot checks still require a real browser after infrastructure is unblocked. A failed preflight is not a passed/skipped acceptance scenario.

Remaining work: restore access to a verified isolated development target and a separate empty acceptance target; enable authorized npm registry installation to create/review the scoped lockfile and install packages; provision persistent private connection/key configuration; run migrations, actual acceptance, all real-browser flows and secret-free screenshots; fix any findings. No acceptance screenshots are included while those flows cannot run.

## Library references

- [otplib releases](https://github.com/yeojz/otplib/releases)
- [otplib verification options](https://otplib.yeojz.dev/api/otplib/type-aliases/OTPVerifyFunctionalOptions.html)
- [otplib successful verification result](https://otplib.yeojz.dev/api/%40otplib/totp/type-aliases/VerifyResultValid.html)
- [Local QR rendering: node-qrcode](https://github.com/soldair/node-qrcode)

Existing deployed legacy routes remain outside this new authentication boundary. No production rollout, banking access, OTP/APK integration, payments, deposits, withdrawals, routing or ledger implementation is included.
