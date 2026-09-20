# WPay UI integration — Part 3

Starting branch: `wpay/html-ui-part1`
Starting commit: `f700279c67c1368bdf22ac76c5f82873da63a8a3`

## Verification and fixes

1. **Restricted-account landing:** the reference shell previously fell back only to Profile when Dashboard was unavailable. Accounts without Profile could fail despite having another granted section. It now selects Profile if permitted, otherwise the first permitted section. Empty permissions still fail closed.
2. **Successful-history permissions:** the combined payout/Parking history previously depended on unrelated pay-in transaction navigation. It now opens when either underlying history module is available, and does not request destinations explicitly marked unavailable. Backend authorization remains unchanged.
3. **Dashboard error handling:** optional recent-order/Parking requests previously swallowed every failure, including session expiry and network failures, into empty results. Only explicit permission denial is now represented as unavailable; other errors propagate to the existing error/session handler. Unavailable Parking data is no longer shown as zero.
4. **Blocked browser storage:** theme preference reads/writes could throw and prevent application bootstrap or appearance changes. Theme persistence is now optional, matching the locale preference behavior. Both role login bootstraps were checked with storage forced to throw.
5. **Logout cleanup:** logout now resets the selected destination, clears displayed account identity, and closes the mobile sidebar/overlay. A later login does not inherit the previous account's selected route.

## Evidence

- Reference UI and new regression suites: **11 passed**, including eight behavior tests covering the fixes.
- Existing navigation, role constraint, public asset, localization, protection and statement parser suites: **48 passed**.
- Existing targeted User/Merchant HTTP and role HTML checks: **2 passed**. The remaining database-backed cases in that file were not run by this filtered command.
- Total executed Node tests across these commands: **61 passed, 0 failed**.
- Temporary DOM smoke checks: both ordinary role bootstraps, both blocked-storage/logout cases, and five isolated gateway sections passed. These are mocked DOM/API checks, not browser or live financial acceptance tests.
- Legacy checker: **197 exact baseline hashes preserved**.
- `npm run check`: **99 JavaScript files passed syntax checks**.
- `git diff --check`: passed.
- `npm test` attempted with inherited service configuration cleared. It exits before tests because embedded PostgreSQL refuses to run as root. Full database-backed tests remain unrun; the runner and existing tests were not altered.

## Scope and remaining work

No backend authorization change, migration, provider transaction, protected legacy change, GitHub publication or live deployment was performed. The previous publication approval rejection remains unresolved; this part is committed locally. Supabase/Railway runtime connectivity is not established by these local results.

Part 4 remains: whole-system testing and desktop/mobile browser visual review, followed by fixes for issues discovered there. Exact original inner-page layout fidelity and live provider readiness are not asserted by Part 3.
