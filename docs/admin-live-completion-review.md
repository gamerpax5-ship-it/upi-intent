# Authenticated Admin completion review — 2026-09-28

Base: `78f3c6103365a8485dc38c8603fc00d893f4427f`. Reference: owner-supplied Admin Premium V5 HTML.

## Live findings

After successful secure sign-in and a reload to load the deployed assets, Overview plus all 53 remaining Admin navigation pages loaded with no application status error. The initial old browser tab still had pre-deployment scripts; refresh resolved the old Users/Merchants/Approvals/UPI rendering errors.

Checked groups: accounts and approvals, bank/UPI and routing, transactions and statements, parking, payout/settlement/commission, APK/event pages, employees/Admin authority, finance, reports/audit, developer tools, support, notifications, security, settings and profile. User rate and collection-access dialogs opened and closed successfully without saving changes.

OTP Events correctly displayed “No linked device” for this live scope. There was no live linked event to verify. Admin/Employee/User redaction behavior remains covered by automated tests; no new device was paired and no banking OTP was collected or exposed.

## Confirmed fixes

| File | Before | After |
| --- | --- | --- |
| `dev/wpay-auth/web/admin-ui.js` | Global search matched page labels only | Permission-filtered User/Merchant search and exact 12-digit UTR lookup; keyboard-accessible results, Escape/outside dismissal, Ctrl/Cmd+K and stale-result protection |
| `dev/wpay-auth/web/app.js` | Admin presentation could not use the shared authenticated request helper or carry search selection | Passes the existing helper and selected filter to Admin renderers; authentication and session logic unchanged |
| `dev/wpay-auth/web/admin-v5-pages.js` | UTR page had only source-type tabs | Exact UTR input, matching claim view and source-page navigation; selected global result opens the relevant filter |
| `dev/wpay-auth/web/admin-ui.css` | Shared base stylesheet forced green headings, and nonempty error toast could remain transparent | Reference purple headings/focus and form button styling, visible error/status toast, styled search dropdown and light-theme results |
| `lib/wpay/operations/utr-review.js` | Claims could only filter by state/offset | Optional validated exact UTR digest filter, retaining both User and Merchant tenant predicates |
| `lib/wpay/operations/legacy-utrs.js` | No exact UTR source filter | Validates and forwards exact UTR, defensively filters observations; existing verified ownership/consent/time/revocation checks unchanged |
| `lib/wpay/integrations/legacy-reader.js` | Only paginated source reads | Separate parameterized UTR queries preserve source ID, authorized time interval, cursor, read-only transaction and timeout; existing queries unchanged when no filter is supplied |
| `test/wpay-admin-search.test.js` | No global-search regression coverage | Granted-only reads, no OTP search, error handling, tenant/digest filtering and PostgreSQL source/time isolation checks |
| `.github/workflows/wpay-admin-review.yml` | Existing targeted Admin checks | Adds search tests to the same disposable PostgreSQL diagnostics; existing gates retained |

Search intentionally never searches OTP contents or activation secrets. Account matching searches the server-scoped directory. UTR matches search claims and authorized source observations; they remain observations and cannot post accounting. Dropdown returns a small result set; when more source links exist it directs to the UTR page, whose source pagination remains available. Source failures are shown, not treated as proof that no receipt exists.

## Validation and limits

- Local focused run: 19 pass, one PostgreSQL case skipped locally; database test runs in CI.
- Syntax check passed (163 JavaScript files); changed modules checked directly; no whitespace errors.
- Existing full-test limitation remains: embedded PostgreSQL cannot initialize as root in this workspace.
- Legacy protection still flags the same two previously modified legacy OTP files. This patch does not change those files or the protected baseline.
- Prior broad MFA acceptance failures remain separate; no authentication changes or test weakening were made.
- Live desktop account-card layout inspected against the supplied HTML's styles. This is not a claim of pixel-by-pixel parity across every viewport: local reference preview was blocked by browser policy, and mobile screenshot comparison was not available.
- Production financial submissions, permissions changes, credential changes and destructive actions were not executed as tests.
