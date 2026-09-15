# WPay Task 4 — isolated visual panel preview

## Run locally

From this repository checkout, run:

```sh
node scripts/serve-wpay-preview.js --port 4173
```

Open **http://127.0.0.1:4173/**. Use the numeric loopback address, not `localhost`: the preview checks the exact loopback Host header. Stop the terminal process with Ctrl+C. If that port is already occupied, choose another explicit port from 1–65535. No dependency installation or database is needed beyond the existing supported Node environment.

Do not use `npm start` or `server-wrapper.js` to launch this preview. The new assets live outside `public/` and are not mounted by the production application. There is no production routing, session, account, database, migration, financial or deployment integration.

The separate **Demo persona** selector is in the preview toolbar. It selects one of five synthetic snapshots, not an authenticated identity:

| Persona ID | Preview |
| --- | --- |
| `user` | Approved/funded User; all applicable User demo navigation |
| `merchant` | Approved Merchant; Merchant navigation and only Merchant data |
| `admin` | Super Admin; the existing fourteen administrative categories |
| `employee` | Restricted Employee; explicit deposit, ledger, withdrawal, payout and report view grants only |
| `onboarding` | Active User login account with pending business approval, unconfirmed initial funding and unmet operational prerequisites |

Reloading returns to the approved User demo. Persona switching resets to that persona's first permitted destination. Display state is in memory only; no principal, grants, approval values or preferences are persisted to localStorage/sessionStorage. Navigation uses preview-local hashes such as `#merchant.payment-orders`, never the catalog's planned production paths.

## Implemented screens

| Screen | Actual preview behavior |
| --- | --- |
| User Dashboard | Eight requested metric cards, local SVG pay-in chart, capacity allocation, recent synthetic activity |
| Pending User Dashboard | Zero operational amounts, checklist for approval/initial 2,000-USDT funding/statement/UPI prerequisites; permitted onboarding menus remain visible |
| User Bank & UPI | Masked synthetic UPI/bank/account table with configured limit, approval, verification and operational states; disabled workflow controls communicate pending/verified/stopped states |
| Merchant Dashboard | Eight requested metrics, local collection chart, balance summary and recent orders |
| Merchant Payment Orders | Six curated orders with ID, reference, amount, status, source, created and paid times; local search and status filters; deliberate empty state |
| Create Payment Link | Disabled planned form; no link, QR, order, callback or payment generation |
| Admin Dashboard | Ten requested metrics, synthetic alerts and recent administrative activity; link into the canonical approval queue |
| Admin Pending Approvals | User, Merchant and Bank/UPI category links reuse the existing canonical directory/review destinations; no duplicate approval editor |
| User approval modal | Pay-in commission %, payout commission %, fixed USDT rate, demo deposit network and an explicitly invalid demo deposit-address placeholder |
| Merchant approval modal | Pay-in fee %, payout fee %, fixed fee per payout; currency explicitly remains an unresolved future policy decision |
| Bank/UPI review modal | Synthetic holder, bank, masked account/UPI, submitted limit and review status |
| Employee Finance/Reports | View-only synthetic summary and report entries on the five permitted destinations; no approval, editing, export or Employee administration controls |

Modal submission performs only native required/numeric/range validation and displays **“Preview checked — nothing was saved. The application remains pending.”** It sends no request and changes no fixture. Closing clears form values. Escape closes the native dialog and focus returns to its opening button. No banking password/login/PIN, OTP/raw SMS, seed phrase or private-key input exists.

Other destinations have a purposeful **Planned — not connected** screen with the existing catalog description. Trade with WPay is **Coming Soon**. APK, activation, device and OTP destinations are navigation placeholders only. API credentials are placeholders; none are generated or shown. Withdrawals, payouts, parking, deposits and statements have no executable financial or file-processing flow. The Employee's financial pages are read-only synthetic reports, not working ledger/deposit services. No Employee permissions editor is included, so no new checkbox catalog or grant editing is introduced.

## Layout and accessibility

The preview retains WPay's branding and card-based dark workspace structure after read-only inspection of `public/index.html`. All layout, styles and handlers are new; protected scripts/inline handlers were not copied. Neutral charcoal surfaces, restrained emerald accents and system fonts follow Task 4's direction.

- Category buttons are native keyboard-operable buttons with `aria-expanded` and `aria-controls`. One category expands at a time; empty categories never appear.
- The separate preview toolbar and **DEMO — No live transactions** header stay visible while scrolling.
- Desktop has a sidebar and multiple metric columns; tablet layouts adapt; mobile uses a drawer, stacked sections and two compact card columns.
- The drawer closes on destination selection, close button, backdrop or Escape; background content becomes inert while open, focus is contained, and Escape returns focus to the opening button.
- Tables have semantic headers and named keyboard-focusable scrolling regions. Wide data remains within its table container.
- Native labels, status text, visible focus outlines and reduced-motion styles are included. Color is supplementary to explicit status text.
- Every page uses safe DOM creation/text nodes. Search/form values are never inserted into HTML or script sinks.

This is targeted keyboard/responsive verification, not a comprehensive screen-reader or WCAG certification.

## Existing policy integration

`demo-fixtures.js` defines deterministic, frozen server-side fixtures matching the actual Task 3 identity/account/grant/eligibility envelope. User, Merchant and Super Admin demo selections explicitly select the applicable catalog descriptors; the Employee selection is the fixed five view permissions. This is a demo fixture provider, not a production default-grant policy.

`preview-model.js` calls the actual `buildPrincipalContext`, `deriveNavigation`, `getPermission` and `canUsePermission` helpers. View dispatch maps existing destination IDs to implemented or deliberate planned views. It does not create another navigation/authorization engine. The browser receives derived navigation, synthetic data and preview capability booleans, not principal/account/grant records. Merchant models exclude User bank/UPI/account-holder/device records. Unknown persona IDs and browser-supplied role/principal objects are rejected rather than promoted to Admin.

Anyone who can access the isolated local demo can select any demo persona; this is **not login or verified identity**. No protected route has gained authentication. A visible menu, a preview capability or a pure policy decision does not prove ownership, filter a real query, verify evidence or execute a transaction. Existing OTP `DESCRIPTOR_ONLY` behavior and financial/statement integration blockers remain unchanged.

## Server API and boundary

Exports from `scripts/serve-wpay-preview.js`:

- `createPreviewServer()` returns an unbound Node HTTP server, reading exactly the three allowlisted web files. Importing the module starts no listener and reads no assets or environment variables. Consumers should use `startPreviewServer` for the fixed loopback binding.
- `startPreviewServer({port = 4173})` returns a promise of a server listening only on `127.0.0.1`. Tests use `port:0` for an ephemeral local port and close the returned server explicitly.

Only GET is supported:

| Path | Response |
| --- | --- |
| `/` | Exact preview HTML |
| `/styles.css` | Exact preview CSS |
| `/app.js` | Exact preview client JS |
| `/favicon.ico` | Empty 204 response; prevents an unrelated favicon lookup |
| `/demo/personas` | Allowlisted demo IDs and labels |
| `/demo/model?persona=user` | Synthetic model for one exact allowlisted persona ID; no other query keys accepted |

Unsupported methods return 405; unknown paths/personas return 404; malformed/traversal/extra-query requests return 400; foreign Host/Origin returns 403. Raw path validation precedes normalization. URL paths never select filesystem filenames. There is no general static directory, repository/source exposure, permissive CORS, cookie creation or operational POST endpoint.

Responses have no-store, nosniff, no-referrer and restrictive CSP headers (same-origin scripts/styles/connects; no frames or form navigation). No CDN, external font/image, analytics, outbound request, database client, provider/dashboard credentials or legacy application import is used. Environment credentials are never read. The CLI reads only its own port arguments.

## Verification

Starting branch: `audit/wpay-legacy-protection`. HEAD: `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541`. Starting state contained exactly eighteen untracked Task 1/2/3 additions and zero tracked changes. Every prior addition matched its original delivery hash; the baseline protection check passed before edits. The delivery records all eighteen preflight SHA-256 values and full status. No patch was reapplied and no reset, clean, stash or rebase occurred.

Commands:

```sh
node --test test/wpay-authorization-policy.test.js test/wpay-navigation.test.js test/wpay-principal-context.test.js test/wpay-preview.test.js
npm run check
node scripts/check-protected-legacy.js
node --check scripts/serve-wpay-preview.js
node --check preview/wpay/demo-fixtures.js
node --check preview/wpay/preview-model.js
node --check preview/wpay/web/app.js
node --check test/wpay-preview.test.js
```

The combined standalone tests pass: **209 tests, 0 failed, 0 skipped** (193 existing Task 2/3 tests plus 16 new preview tests). Tests cover import purity, actual adapters/navigation, restricted Employee views, unknown personas, Merchant data separation, deliberate page dispatch, immutable fixtures, real loopback HTTP responses, hostile paths/methods/origins, exact asset allowlist and clean server shutdown. Source/HTTP tests are not browser tests. Explicit syntax checks cover all five new JS files because the old syntax script is not recursive. Final logs and protection/hash results are in the Task 4 delivery.

### Actual browser verification

The implemented app was launched on `127.0.0.1:4173` and exercised through the authorized in-app browser:

- User, Merchant and Admin desktop dashboards at approximately **1440×900**; real screenshots captured.
- User Bank/UPI state table and disabled workflow controls inspected.
- Merchant search `DEMO-1047` plus Pending filter returned exactly that order; HTML-like search text produced the deliberate empty state.
- All three approval modal variants inspected; User commission 101% failed range validation; valid preview showed nothing saved and retained Pending rows. Escape closed the dialog and returned focus to Review preview. Cancel closed Merchant and Bank review dialogs.
- Employee showed only Finance/Reports and its five view destinations; no approval/export/Employee administration control appeared.
- Pending User checklist and missing operational navigation verified.
- **390×844** User mobile dashboard screenshot; drawer opening, Shift+Tab focus wrapping, Enter category expansion, destination closure and Escape/focus-return verified. The document width was 375 CSS pixels within the 390-pixel viewport; the bank table scrolled within a 341-pixel container rather than overflowing the page.
- Merchant tablet view checked at **1024×768**, with no page-wide overflow.
- Browser console returned no warning/error entries after the checks. Observed resource inventory contained only the local CSS, JS, empty favicon and `/demo/` fetches, all on `http://127.0.0.1:4173/`; no external resources were observed. Direct Performance API access was unavailable in the restricted evaluator, so the supported observed-resource inventory was used. This is not a packet capture or proof about every future interaction.

Screenshots are native browser JPEG captures stored outside the repository in the delivery: User desktop, Merchant desktop, Admin desktop, Admin User-approval modal, User mobile, plus Employee desktop. No illustrative/mockup image was substituted for an implemented-app screenshot.

### Full suite and remaining blockers

Full `npm test` was **not rerun for Task 4**. The known embedded PostgreSQL `os.userInfo()` failure remains: `SystemError ERR_SYSTEM_ERROR / uv_os_get_passwd ENOMEM` under sandbox identity, before tests start. No authorized alternative isolated runner is available. No sandbox bypass, identity change, monkey-patch, runner edit, skipped assertion, unknown/production database or provider call was used. Historical Task 1 full-suite success is not a current result.

Live identity/session revocation, server record resolution, actual ownership filtering, financial eligibility and workflow execution remain unimplemented. Legacy global matching isolation (B1), trusted bank/statement evidence (B2), raw OTP/SMS exposure (B3), legacy shared-identity limitations (B4), prior-accounting mappings and unresolved financial/network/release policies remain open. The preview clears none of those blockers and must not be deployed or treated as a secure panel.

## Exact file scope

Only these eight new files belong to Task 4:

1. `scripts/serve-wpay-preview.js`
2. `preview/wpay/demo-fixtures.js`
3. `preview/wpay/preview-model.js`
4. `preview/wpay/web/index.html`
5. `preview/wpay/web/styles.css`
6. `preview/wpay/web/app.js`
7. `test/wpay-preview.test.js`
8. `docs/wpay-preview.md`

All 197 baseline files and eighteen Task 1/2/3 additions remain frozen. Screenshots, logs and the Task 4-only patch are delivery artifacts outside the repository. No push, merge, deployment, production operation or next task is performed.
