# WPay integration — Part 4 verification report

Starting commit: `fde9a58`, branch `wpay/html-ui-part1`.

## Status

Available local automated checks completed and discovered issues fixed. **Full system and visual acceptance remains blocked**, so Part 4 is not an end-to-end completion claim.

## Fixes

- Merchant mobile navigation lacked the overlay element and backdrop styling that the shared controller expected. Added the overlay and shared responsive styles, so outside-click dismissal can operate on both roles.
- Both mobile menu buttons now expose their controlled sidebar and expanded state; opening, dismissal and logout update that state.
- Search placeholders previously implied record search although the top-bar search only navigates sections. Both now read “Search sections…”; record filtering remains inside the relevant modules.
- Added a responsive maximum width for images inside live page content.
- Restored the existing isolated authentication/QR dependencies with `npm ci --prefix lib/wpay/auth/runtime/dependencies --ignore-scripts --no-audit --no-fund`. No manifest or lockfile changed. This resolved a local missing-`otplib` failure in the real QR/onboarding test.

These layout fixes were identified by source/DOM inspection. They have not been visually confirmed in a rendered browser.

## Test results

| Check | Result |
| --- | --- |
| 47 test files, with inherited service configuration cleared | 426 passed, 0 failed, 3 skipped |
| Existing targeted User/Merchant HTTP and role HTML tests | 2 passed |
| Combined executed tests | **428 passed, 0 failed, 3 skipped** |
| Both roles: login bootstrap, blocked preference storage, logout reset, menu open and backdrop dismissal (temporary mocked DOM harness) | Passed |
| Five isolated gateway sections (temporary mocked API harness) | Passed |
| Legacy protection | 197 baseline file hashes unchanged |
| JavaScript syntax | 99 files passed |
| Diff whitespace check | Passed |

The three pre-existing skip conditions apply to the PostgreSQL API integration, statement matching and verification-source tests when `TEST_DATABASE_URL` is absent. No skip conditions or existing tests were changed. The database-heavy `wpay-live-user-merchant.test.js` file was excluded from the 47-file command and only its two non-database route/HTML checks were executed separately. Other database-backed integration/startup coverage remains unrun.

The initial broad run had 425 passes and one failure because the isolated QR dependency was missing. After restoring the locked dependencies and applying the UI fixes, the same broad run completed with 426 passes and no failures.

## Blockers and unverified scope

1. **Full database suite:** `npm test` was attempted with inherited environment/service credentials cleared. Embedded PostgreSQL rejects execution as root before the tests begin. The existing runner was not modified and operating-system restrictions were not bypassed. A supported non-root test environment is needed for the original full test command.
2. **Rendered desktop/mobile visuals:** an isolated HTTP preview with no database or real account connection was started at `http://127.0.0.1:4177/user`. The supported cloud browser returned `net::ERR_BLOCKED_BY_CLIENT`. No screenshot, responsive rendering, keyboard-in-browser or pixel-fidelity acceptance was completed. No alternate network route was used to bypass that restriction.
3. **Hosted/live acceptance:** this local branch has not been published or deployed. Supabase/Railway connectivity, authenticated live accounts, provider execution and actual transfers were not verified by these results. No live financial action was attempted.
4. **Original HTML fidelity:** the reference shells use functional runtime-rendered inner pages. Exact original mock inner-page layouts are still not asserted as pixel-identical.

## Delivery

Changes remain on the isolated local review branch. The prior GitHub upload rejection is still unresolved; the user's staged “next” instructions have been used to advance verification, not as explicit publication approval. No main-branch push, merge, deployment, database migration or protected legacy edit was performed.

To finish acceptance: run the original full suite in a supported non-root environment, provide a browser-accessible isolated preview for real desktop/mobile rendering, then test authenticated flows against an authorized test backend. These steps remain pending rather than being recorded as passed.
