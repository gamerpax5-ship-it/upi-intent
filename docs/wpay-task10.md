# Task 10 — Merchant gateway checkpoint

Built from `f3d434413b98c2984ed3c4d240c7ec5f1495f038` on `wpay/hosted-integration`.

## Scope and trust

The gateway lives in `lib/wpay/gateway`, migration 012, and the separate WPay HTTP composition. All 197 legacy files remain byte-for-byte protected. No legacy mount, APK capture/pairing, OTP ingestion/API/dashboard, UTR algorithm, statement parser/matcher, or checkout algorithm changes. Banking OTP and WPay login authenticator MFA remain separate. Merchant responses contain no User/bank/device/UPI identifiers or UTRs. Existing scoped legacy adapters remain independently usable; no global Admin proxy was added.

An approved, active Merchant with current MFA and explicit gateway grants can create an order. `BusinessCore.reserve` selects only an assigned eligible User and Running, current approved/verified UPI with funding, per-version statement, device prerequisites where configured, ticket limits and available capacity. The order and reservation commit together. `NO_ROUTE` rolls both back. The existing routing mutex prevents oversubscription.

Orders freeze the reservation, original bank version, exact amount, original expiry window and commercial snapshot. Customer capability tokens are random 256-bit values, hashed for lookup and encrypted for authorized link retrieval. Customer pages show the exact amount/reference and a QR produced by the unchanged `public/upi.js` builder plus the existing scoped QR dependency. Merchant order projections expose the customer link, not the receiving account details. Possession of that customer link intentionally grants access to the minimum payment destination.

## States and accounting

| Condition | Order / evidence | Financial result |
| --- | --- | --- |
| Atomically routed | `pending_payment` / unavailable | Capacity reserved |
| Submitted UTR | `verification_pending` / claim_submitted | No credit |
| Bound non-final provider observation | Existing order state / observed | No credit |
| Final independently verified receipt | `successful` / verified | Existing accounting posts once |
| Trusted terminal failure | `failed` / verified | Reservation released; no receipt credit |
| Expired link | `expired` | Reservation released once |
| Claim after expiry | `recovery_review` | No credit until verified |
| Verified late/recovered receipt | `successful`, recovery webhook | Existing late-receipt/deficit accounting |

The server-injected `PaymentEvidenceVerifier(snapshot)` receives only the bound order context and encrypted-at-rest claim values after decryption. Its default is disconnected. A matching UTR, app callback, legacy candidate, or browser claim is never sufficient. A final proof must bind order, reservation, Merchant, User, bank and version, receiving UPI/account digest, exact INR amount, original time window, received time, UTR and economic identity. Synthetic proofs require an explicit test-only constructor option; hosted startup supplies none.

Normal receipts retain configured User commission. Statement/recovery sources map to `statement_recovered`, with zero User commission. Existing immutable snapshots, Merchant fee calculation, global economic/UTR deduplication, ledger entries and late deficits are reused. Order success and durable webhook insertion occur in the same transaction as accounting. Recovery never reopens an expired reservation. Gateway totals come from orders and ledger, not editable balances. User UPI analytics use the same underlying reservations/financial events. Success rate is successful / (successful + failed); pending, expired and cancelled are excluded.

## API v1

Create: `POST /wpay-api/v1/orders`. Read: `GET /wpay-api/v1/orders/{orderId}`.

```http
Authorization: Bearer YOUR_API_KEY
Idempotency-Key: shop-order-001
Content-Type: application/json
```

```json
{"reference":"shop-order-001","amountMinor":"125050","currency":"INR","description":"Example order","metadata":{"cart":"example"},"ttlSeconds":300}
```

Amounts are exact positive integer paise (strings); currency is INR. TTL is 30–900 seconds. Metadata permits up to 12 bounded string entries / 2048 serialized characters. Description is optional and bounded. Unknown fields, supplied routing identities, accounting/evidence/rate/status fields and per-request callback URLs are rejected. The latest configured callback version is frozen when the order is created. No configured endpoint means events are retained as `unconfigured`; configure the endpoint before creating orders that require callbacks.

Idempotency is scoped to Merchant and the normalized full input. Exact retries return the same order/link. A changed payload or reference conflict returns `CONFLICT`. Retry a timed-out request with the same key and body. Keys have 256-bit entropy, SHA-256 digest storage, prefix/ID/label/scopes, created/last-used/revoked times and audits. Plaintext is returned once on creation. Key replacement can atomically revoke `rotateId` while creating a new key. Current Merchant approval, status, grants and MFA factor/security versions are checked on each use. API authentication accepts Bearer keys only; cookie/Origin-bearing requests are rejected. The durable rate limit is 60 authenticated requests per key per minute, including failed business requests.

The session UI requires recent MFA for key and webhook management. No Employee inherits Merchant credential rights. Admin diagnostics require explicit transaction and webhook permissions and intersect their tenant scopes. They never expose endpoint secrets, API digests, raw claims, User routes or private credentials.

## Webhooks

Events: `payment.success`, `payment.failed` (trusted final failure only), `payment.expired`, `payment.recovered`. Payloads contain stable event ID/type/version, order ID, Merchant reference, amount/currency/status and timestamps. No User, account, banking OTP/SMS, device or UTR data is included.

Sign exact UTF-8 body bytes with HMAC-SHA256:

```text
timestamp + "." + eventId + "." + exactBodyBytes
```

Headers are `x-wpay-timestamp` (Unix seconds), `x-wpay-event-id`, `x-wpay-signature` (`v1=` plus hex digest), and `x-wpay-secret-version` (immutable endpoint version ID). Consumers must verify using constant-time comparison, reject more than five minutes of clock skew, and durably deduplicate event IDs before acknowledging with 2xx. At-least-once delivery can repeat an event; it cannot repeat accounting. Rotation applies to new orders. Retain the previous signing secret until deliveries for its endpoint version are complete.

The outbox uses PostgreSQL row locks with `SKIP LOCKED`, 30-second leases, eight total attempts, bounded exponential retry and immutable attempt records. A final-attempt crash becomes failed when its lease expires. Manual retry advances a pending delivery without resetting its attempt budget. Financial transactions contain no webhook network I/O. Response bodies are discarded; response size, network duration and DNS time are bounded. A disconnected or slow verifier cannot prevent the worker from attempting queued callbacks first; verification is separately bounded and fair across due orders.

Hosted endpoints require HTTPS on port 443, no credentials/query/fragment. Every delivery resolves and validates all addresses, rejects non-public ranges (including mapped IPv6/private/link-local/metadata), pins the vetted destination while retaining TLS hostname validation, and never follows redirects. Only an exact loopback callback URL explicitly injected into a synthetic local fixture is allowed for HTTP testing. This follows [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) and uses [Node HTTPS request options](https://nodejs.org/api/https.html#httpsrequestoptions-callback).

## Migration and indirect configuration impact

Migration 012 adds WPay-only tables, explicit runtime grants and RLS policies. New gateway grants are backfilled for Merchants, with scoped diagnostics grants for Super Admin. Those accounts receive a permission/session version increment, requiring fresh login. Existing password records, encrypted factors, private master key and prior bank/accounting records are preserved. The real published schema 11 → 12 upgrade, idempotent rerun and restricted-runtime validation passed on a separate local database.

Only the WPay server gains `/wpay-api/v1/`, `/wpay-pay/`, gateway panel routes/assets and an unref'ed background timer for expiry, outbox delivery and optional evidence verification. Existing legacy startup remains unchanged. No root/scoped dependency manifest or lockfile changes. The WPay CI helper adds a fresh gateway database and integration suite; legacy CI configuration is untouched. No Railway/Supabase resource, deployment, plan or spending-limit changes.

## Acceptance

Local passing checks: full `npm test` (353 tests plus real disposable PostgreSQL startup smoke), `npm run check`, auth/MFA (25), business (20), correctness (6), funding (15), onboarding (11), legacy adapters (9), gateway PostgreSQL/HTTP (9 including parent), gateway unit/security contracts (4, included in npm test), OTP/Android (8), and all 197 protected hashes. No existing test was changed or weakened. Early gateway failures were optional-field validation and two new fixture SQL errors; corrected runs passed.

Gateway acceptance covers duplicate idempotency, QR execution, claim-only and observed-only states, repeated-claim limits, Merchant-safe projections, cookie/API separation, revoked key/suspended Merchant, cross-Merchant keys, Employee default deny and explicit tenant scope, missing pool, unfunded/MFA-disabled/frozen/unverified/over-limit routes, stopped UPI, concurrent reservation limits, duplicate economic receipt, normal and recovered accounting, signed retry, concurrent webhook claims, and logout denial. Existing suites retain statement, funding, ownership, expiry, MFA and legacy contract regression coverage.

Browser checks use synthetic identities/data only: Merchant English/Russian/Simplified Chinese, create/pending/claim/success/history, once-only secret hidden before capture, API key revoke, delivered webhook, User UPI analytics, Admin scoped diagnostics, and actual 390px viewport with no horizontal overflow. Private screenshots and test databases stay outside Git.

| Capability | Status |
| --- | --- |
| Local synthetic gateway / QR / accounting / callback | VERIFIED |
| Hosted Railway gateway | NOT DEPLOYED |
| Real independent payment provider / real payment acceptance | NOT CONNECTED / NOT TESTED |
| Live device → legacy dashboard OTP delivery | NOT TESTED |

No real payment or banking OTP was generated. No payouts, withdrawals or parking were started. Publication SHA and exact-commit CI results are reported separately after publication; this document does not pre-claim them.
