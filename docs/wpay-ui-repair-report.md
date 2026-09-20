# WPay panel repair

## Confirmed defects and changes

- Replaced generic dashboard cards with the original User and Merchant dashboard structures: metric grids, chart areas, readiness/health cards, quick links and recent-activity tables. Values come from existing authorized APIs; empty, unavailable and partial-period data are labelled rather than fabricated.
- Restored original page headings/descriptions, login branding, password visibility control, reference form styling and tabular record presentation. Existing real form handlers/validation are retained when nodes are moved. This is not yet a pixel-by-pixel acceptance claim for all 46 original inner pages.
- Fixed Merchant Fees opening the ledger: an owner-scoped, paginated fee-history endpoint now reads only effective commercial versions and returns only public fee fields.
- Payout Review initially selects submitted requests; Security returns to Security after its existing actions.
- Rapid navigation now queues the latest requested section instead of silently discarding clicks during an action.
- Account and navigation metadata load concurrently and can be reused for 15 seconds during section navigation. Financial responses are not cached; backend authorization still runs for every API request.
- Concurrent POST reads share a short-lived in-memory CSRF exchange. Authentication transitions clear it. Only a pre-action CSRF rejection is retried; network failures never automatically retry financial actions.
- Requests have a 20-second timeout covering response-body parsing.
- Static assets use gzip and content-hash revalidation. Role HTML and authenticated responses remain no-store. Deferred scripts retain their execution order.
- Compressed active CSS/JS payload: User 306,893 → 105,239 bytes (66% less); Merchant 287,171 → 100,594 bytes (65% less). These are byte measurements, not an end-to-end latency benchmark.
- Locked sections now explain server-provided setup requirements without granting access or relaxing financial eligibility.

## Verification before deployment

- Broad local suite: 431 passed, 0 failed, 3 existing database skips.
- Existing role HTTP/HTML tests: 2 passed.
- Focused new regression tests cover CSRF concurrency/rotation, metadata reuse, HTTP compression/revalidation, and own-Merchant fee isolation.
- All 26 User and 20 Merchant sections rendered in authenticated DOM fixtures using the real navigation derivation and runtime modules. Fixtures are not live payment acceptance.
- All 197 protected legacy hashes unchanged.
- Full `npm test` remains blocked before execution by embedded PostgreSQL's root-user restriction.
- Browser sign-in successfully reached the live User account. Bank & UPI and Support loaded. Analytics, Withdraw, Payout and Parking were server-disabled by account setup/eligibility; no grant or eligibility bypass was performed.
- Offline visual preview was rejected by the browser's local-file protocol policy; no workaround was attempted. Live post-deployment browser review is required.

No migrations, bank credential collection, OTP/APK expansion, provider transfer or real-money operation was added or performed.
