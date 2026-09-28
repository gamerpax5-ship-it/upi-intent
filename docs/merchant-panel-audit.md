# Merchant panel audit — 28 September 2026

Authenticated live Merchant review: all 20 navigation pages loaded with no page API error or document horizontal overflow at the available desktop viewport. Dashboard, analytics, links, orders, transactions, payout requests/review, API credentials, webhooks, API logs/docs, fees, ledger, holds, USDT withdrawal, reports, notifications, support, security and profile were inspected. No financial requests, approvals, cancellations, credentials, webhooks or profile changes were submitted.

## Changes

| File | Before | After |
| --- | --- | --- |
| `dev/wpay-auth/web/merchant-premium.css` | Late reference overrides kept dark cards/backgrounds when light theme was selected, hiding headings | Final light-theme overrides restore readable surfaces, headings, labels and controls while retaining layout |
| `dev/wpay-auth/web/merchant-premium.js` | Internal expense/reservation book credits appeared as Merchant incoming credits | Merchant debit/credit columns reflect their effect on available funds; posting and raw accounting exports are unchanged |
| Same controller | Clearing USDT left the previous INR amount available for fallback submission | Invalid/cleared USDT also clears the derived INR amount |
| Same controller | A slow order search could overwrite a newer search | Per-page response version discards stale search results |
| Same controller | Logout retained cached analytics, settlement and ticket data | Account-specific cached objects are cleared |
| Same controller | Mobile drawer close left aria-expanded true | Navigation resets the expanded state |
| Same controller | USDT detail showed irrelevant payout destination/deadline placeholders | Only actual USDT withdrawal fields are displayed |
| `scripts/test-merchant-audit-ui.js` | These edge cases had no regression coverage | Synthetic checks cover financial display, stale quote, out-of-order responses and drawer state |
| `.github/workflows/wpay-merchant-audit.yml` | No dedicated audit regression job | Additive disposable PostgreSQL and DOM checks; legacy protection remains enabled |

## Financial findings

Live dashboard, payout and settlement available values agreed. Gross minus charged fees minus pending payout reservation matched available funds. Full-balance USDT conversion used the Merchant's actual Admin-set rate, with six-decimal USDT floor and paise ceiling. No money movement was used for testing.

Backend inspection confirms serialized available-balance checks and reservation posting for single/bulk payouts and USDT settlement; cancellation/rejection releases reservations and completion replaces reservation with principal. Existing tests cover 15-minute approval/routing and 48-hour dispute boundaries, rate history and ownership. Settlement history already uses 50 rows consistently: the suspected pagination mismatch was ruled out and no pagination code changed.

One existing payout has no deadline (legacy record); no deadline was invented. Webhooks are unconfigured and the existing API credential is revoked: these are account configuration states, not page-load defects. No submitted payout or USDT history existed to exercise live approval/dispute/history actions, so those paths use synthetic tests.

## Validation and limits

Local syntax: 164 JavaScript files passed. All existing Merchant DOM suites passed, including 20 pages and English/Russian/Chinese persistence, error rollback, dialogs and injection protection. New audit regressions passed. Focused backend tests: 14 passed, four database cases require disposable PostgreSQL in CI.

Full local npm test remains blocked because embedded PostgreSQL cannot run as root. Legacy protection reports the two pre-existing changes to `lib/device-otp-router.js` and `test/device-otp-router.test.js`; this patch changes neither. Existing checks were not weakened. Do not claim a globally green suite.

This is a desktop live audit plus source/DOM/backend verification. Exact reference pixel parity, mobile viewport rendering and every real financial outcome are not certified. The supplied layout assets are retained; only confirmed defects are changed. Raw accounting CSV exports retain their original book direction, whereas on-screen Merchant debit/credit columns show available-balance impact.
