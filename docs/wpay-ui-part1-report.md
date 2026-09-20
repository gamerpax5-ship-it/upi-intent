# Part 1 — supplied HTML UI application

Branch: wpay/html-ui-part1. Base: 2a5b7b3 (wpay/hosted-integration).

/user now serves user-prototype.html; /merchant serves merchant-prototype.html on this branch. Both derive directly from the supplied HTML files (source SHA-256 and page inventory in wpay-ui-part1-source-manifest.json). Original markup, CSS and JavaScript are retained, with styles/scripts extracted into same-origin assets, a role meta tag, and a persistent preview notice. Merchant XLSX uses the repository's existing local library instead of a CDN. User includes 26 page sections; Merchant includes 20.

This is an isolated UI preview, not a production-ready authentication or financial implementation. Demo credentials, mock balances, simulated MFA and actions remain prototype behavior. Preview CSP blocks network connections and native form submission; no live API is called. Its scoped style policy permits the reference's inline/dynamic style attributes; existing backend/API/admin policy remains unchanged. Do not deploy this UI-only branch to production before real authentication/data integration.

Existing user.html, merchant.html and all real frontend/backend modules remain intact for Part 2 reuse. No database, migration, Railway configuration or deployed service changed. The branch does not claim a completed live cutover.

Validation:
- 197/197 protected legacy file hashes PASS.
- Existing role HTTP and runtime-integration checks: 2 PASS.
- /user, /merchant and five required static assets: HTTP 200, nonempty; preview marker and network-blocking CSP checked.
- Extracted JavaScript syntax checks PASS.
- npm run check: 97 JavaScript files PASS.
- npm test: BLOCKED before tests; embedded PostgreSQL refuses root in this environment. No tests edited or skipped to resolve it.
- Comprehensive screenshot, responsive and end-to-end verification NOT RUN; reserved for requested subsequent parts.

Next only after user says next:
2. Map existing real login/MFA/session, API and financial workflows into the reference UI; implement missing authorized logic; remove mocks.
3. Verify implementation and fix identified bugs.
4. Full-system and desktop/mobile/light/dark visual checks, fixes and report.
