# WPay User UI inspection and refinement — 23 September 2026

## Source inspected

- Repository: gamerpax5-ship-it/upi-intent.
- Default branch main at inspection: 58e1236bfc9b5b10a7aea36ecf592bbe49b416e2. This contains the separate device/UPI service, not the hosted User workspace.
- Correct dashboard base: wpay/hosted-integration at 9722dd1023d62a7393a6ac5cbd24c9fcb6980255.
- Clean isolated checkout on improve/user-panel-20260923.
- User attachment: WPay-User-Complete-Working-Prototype-FINAL(3).html. Its script matches user-prototype.js exactly after trimming whitespace. The live User shell already loads real authentication and service-backed renderers; shipping the demo script would replace real operations with simulations.

## Findings and changes

1. Small labels and muted copy made dense financial screens difficult to scan. User-scoped styles increase legibility, simplify card treatments, align metrics and use tabular financial figures while retaining the existing purple/navy design.
2. The original search only selected the first matching section on Enter. The User shell now displays available section suggestions, supports arrow keys, Enter, Escape and Ctrl/Cmd+K. It reads existing disabled/aria-disabled states, rechecks before selection, and delegates to the original navigation button. No account permission is added and no network call is introduced.
3. Mobile navigation could leave off-screen controls in the keyboard flow. The User enhancement makes a closed mobile drawer inert, isolates background controls while open, traps Tab within the drawer, provides a labelled close button, and returns focus on dismissal. The backdrop is aligned with the existing 920px drawer breakpoint.
4. Mobile search was hidden. It is now available in a second compact header row. The supplied prototype's inline four-column metrics are corrected to two columns on small screens and one below 360px.
5. Live login copy is shorter and clearer. Authentication forms, backend account status, CSRF, permissions, payment actions and API contracts are unchanged.

## Scope

Modified only:
- dev/wpay-auth/web/user-live.html
- dev/wpay-auth/web/user-prototype.css (new rules scoped under body.user-workspace)
- dev/wpay-auth/web/user-icons.js (isolated User-only presentation module appended)
- This review document

No Merchant/Admin pages, shared service modules, OTP/APK/device data processing, UTR/deeplink logic, authentication handlers, migrations, dependencies, deployment configuration or existing tests were changed. All 197 pinned legacy file hashes remain intact.

## Verification

- node scripts/check-protected-legacy.js: PASS, all 197 exact hashes.
- npm run check: PASS, 109 JavaScript files.
- node --check dev/wpay-auth/web/user-icons.js: PASS.
- git diff --check: PASS.
- Node 20.20.2 focused regression run: 69/69 passed, no skips. Files: protected-legacy, statement-parser-contract, wpay-reference-ui, wpay-reference-regression, wpay-navigation, wpay-panel-speed, wpay-password-policy, wpay-support-ui and wpay-history-completion tests. This includes HTTP asset/CSP checks, permission resolution, session lock behavior and existing Support interactions. The same set also passed under Node 24.19.0.
- Browser: supplied demo and actual production shell were reviewed with isolated sample data; desktop plus 390px and 320px frames fit without horizontal document overflow. Keyboard search selects the matching section; an unavailable USDT section does not appear in suggestions. Mobile open/close moves and restores focus.
- Full npm test: BLOCKED before test execution. The bundled PostgreSQL runner refuses root execution in this environment; switching to an unprivileged user was not permitted. The protected test runner was not edited. Full database/end-to-end validation must run in the normal non-root CI environment before merge.

## Handoff

The standalone HTML is a design preview with sample data and the original prototype interactions. Its Open demo workspace button is preview-only and is not present in production source. No fixture data or preview script is added to the production shell.

This change is prepared for review on a separate branch. It has not been merged or deployed. Recheck the target branch for concurrent work before merging.
