# WPay UI integration — Part 2

## Result

The active `/user` and `/merchant` routes now load the supplied visual shell with the existing real WPay browser modules. Mock scripts, demo credentials, simulated payments and sample account values are excluded from active routes. The original prototype HTML and JavaScript are no longer served by the asset allowlist.

The supplied sidebar, login artwork, top bar, icons, colors and theme remain. Inner pages are rendered by functional existing modules styled to that shell; this is not a claim of pixel-identical reproduction of all original mock page interiors. Browser visual review belongs to Part 4.

## Connected behavior

- Role-scoped login, registration, password policy, MFA, recovery, session refresh, CSRF, logout and logout-all reuse the existing authentication flow.
- All 26 User and 20 Merchant sidebar entries map through server-returned navigation. Unavailable destinations remain disabled; backend permissions and account ownership remain authoritative.
- User bank/UPI, onboarding, statements, funding, commission, withdrawals, payout jobs, parking, holds, account, support and existing device modules use existing API-backed renderers.
- Merchant collection links, orders, transactions, API keys, webhooks and delivery logs now open their relevant gateway view instead of the entire combined screen. Payout review omits the creation form.
- User successful history combines real successful payout results and completed parking orders. Payout results paginate; parking results explicitly cover only the latest 100 orders, not an exhaustive all-time export.
- Settings saves the local appearance preference. Search navigates available sections; transaction searches remain inside their corresponding modules.
- Real dashboard rendering takes precedence over the generic business renderer. Account names and approval status come from the authenticated account.
- Action completion no longer unconditionally enables all buttons, preserving validation and workflow-specific disabled states. Session lock clears rendered content and secret displays.

Exact navigation mappings are maintained in `dev/wpay-auth/web/reference-navigation.js`.

## Validation

- New reference UI suite: 3 tests passed (permission filtering, HTTP asset/route integration and authentication wiring).
- Existing role HTML/route tests: 2 tests passed.
- Legacy protection: all 197 baseline files unchanged.
- `npm run check`: syntax checks passed for 98 JavaScript files.
- Temporary DOM smoke checks: both role login bootstraps passed; five isolated gateway section checks passed. These use mocked responses and are not live backend acceptance tests.
- `npm test`, with inherited service configuration cleared, was attempted but embedded PostgreSQL refuses execution as root. The full database-backed suite did not run. No test runner or protection rule was weakened.

## Remaining verification and limits

Part 3 will review the integration and fix discovered bugs after the user says next. Part 4 will test the broader system and browser visuals after the subsequent next. Live authenticated flows, financial provider execution, actual transfers, Railway deployment and Supabase connectivity are not verified by these local checks. Existing provider/environment configuration is still required; frontend wiring does not establish operational payment readiness.

No live deployment, database migration, production record change, protected legacy edit or expansion of OTP/APK collection was performed.
