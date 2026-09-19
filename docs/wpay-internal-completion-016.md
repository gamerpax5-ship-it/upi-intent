# Internal completion: migration 016 and release boundary

Owner decisions D1–D10 authorize internal policy and isolated synthetic tests. All live connections remain deferred. This document describes the proposed additive persistence before applying it to isolated staging.

## Exact schema impact

Six new tables in `wpay_auth` only:

- `parking_requests`: immutable accepted amount and original commercial/rate snapshot.
- `parking_transitions`: immutable, versioned actor/reason/evidence history; duplicate actor requests and transition versions are unique.
- `parking_postings`: one posting per parking request and one per economic digest, linked to the existing immutable journal.
- `email_verification_requests`: owner/current-email digest, session epoch, token digest and expiry. No raw tokens.
- `email_verifications`: single-use consumption and current-email ownership evidence.
- `notification_deliveries`: encrypted provider payload, bounded retry/lease and explicit accepted/delivered/failure states. No configured provider means unavailable, never delivered.

No existing rows, grants, secrets, balances or account state are modified. Migrations 001–015 stay byte-for-byte unchanged. Runtime receives SELECT/INSERT on these tables and column-only delivery-state updates; PUBLIC receives no access. Immutable tables reject update/delete/truncate. No extension or paid resource is added.

## Policy boundaries

Parking creation/approval never restores capacity. Only authorized, independently evidenced final completion posts exactly once. Late success after failure/expiry enters review. Disputes prevent posting until an explicit reconciliation decision. This is internal accounting; provider execution, beneficiary approval and any unspecified transfer fees remain disabled rather than invented.

Admin provisioning uses existing accounts, grants, immutable panel audit and request-id tables; it does not need migration 016. The recorded bootstrap or a Super Admin with platform scope plus explicit `admin_authority.manage` may administer ordinary tenant Admins. Existing ordinary Admin/Employee defaults do not change. Ordinary Admins cannot provision peers, change platform policy or grant platform scope. No role promotion or inferred platform grant occurs.

Email verification concerns only the account's existing email; email changes remain out of scope. Fixed implementation limits: 15-minute challenge, one request/minute and three/hour/account; 256-bit opaque token, digest-only verification, owner/email/epoch binding, single-use acceptance. Delivery uses encrypted payloads and at most three attempts with stable idempotency. An accepted/queued delivery is not reported as delivered. External sender/provider/template approval and private configuration remain deferred.

## Required acceptance and controlled release

Before staging upgrade: exact old-migration hashes; new fresh-install and 015-upgrade tests; preservation digests of all existing account/security/financial records; complete regressions; scoped authorization for existing tests' four schema-version assertions (15 to 16) only; exact-SHA CI success and secret audit.

Before any hosted migration: fresh encrypted backup and verified local recovery, controlled maintenance, then additive upgrade with separate migrator credentials. Preserve existing volume/database and app's seven-variable runtime configuration. Verify runtime fingerprint/least privilege, exact deployed files, readiness and final authenticated browser matrix. Keep autodeploy off. Recovery pairs schema 015 backup with old code, or schema 016 data with compatible new code; never run old code against schema 016.

The owner approved the four existing schema-version assertions only, and conditionally authorized controlled staging upgrade after all acceptance gates. No other existing test assertion changed.

## Local acceptance

The corrected local code passed 406 general tests and all 198 PostgreSQL/HTTP integration tests. An adapter setup timeout was retained and the unchanged suite passed on fresh isolated databases; every remaining suite then passed, with no skipped assertions. This includes existing OTP/Android contract regressions, authority and authorization checks, fresh 001–016 installation, populated 015–016 upgrade, repeat migrations, schema checksums/fingerprints and every new table's runtime privileges/RLS/revokes. All 197 protected hashes and all 15 old migration files match their original bytes.

The first complete run reproduced a pre-migration compatibility defect: the new email-status lookup accessed a table absent from schema 014. The lookup now returns unavailable/unverified when notification storage is absent. The existing authority upgrade assertions remain intact and pass; hosted readiness still rejects an incompatible schema.

The first Linux CI run subsequently exposed a parking concurrency serialization conflict. Bounded whole-transaction retries now live at the authenticated repository boundary, so internal parking callers also reread the current session and permission snapshot after rollback. The service no longer multiplies that retry budget. Three added regression tests prove fresh-principal reuse prevention, revocation denial, no retries for policy failures and the three-attempt bound. Existing assertions remain unchanged. The failed CI commit was not deployed.

Provider-neutral additions have synthetic evidence only. Parking has no HTTP execution route or connected transfer provider. Email delivery has no configured provider. Merchant USDT settlement, delegated pairing and editable platform security policy remain disabled/read-only. Live OTP delivery is NOT TESTED. Exact commit/CI, encrypted recovery, hosted application and final browser evidence must be recorded separately; passing local tests is not hosted acceptance.
