# Admin completion and masked dashboard review

Reference: `WPay-Admin-Premium-Full-Working-Prototype-V5(2).html`, supplied by the owner. Base: `0abb8947a49769540efa670d3940bc5452fe3a18`.

## Changes

| File | Previous behavior | New behavior |
| --- | --- | --- |
| `dev/wpay-auth/web/admin-v5-pages.js` | Missing form/dialog/status helpers broke populated account actions; approvals/UPI reads lacked a request binding; generic metric markup had no matching reference styles | Restored helpers and read bindings; reference metric cards and SVG icons; consistent purple button classes; actual account-rate exchange reporting |
| `dev/wpay-auth/web/admin-ui.css` | Later overrides removed metric padding and changed reference spacing; mobile menu class did not match JavaScript; light-theme switch had no styles | Reference spacing, padded metric cards, responsive drawer, functional optional light theme, masked-event table styles |
| `dev/wpay-auth/web/admin-ui.js` | Stale exchange subtitle and incomplete menu accessibility state | Accurate exchange description and expanded state on drawer controls |
| `dev/wpay-auth/web/operations.js` | OTP events were stacked fact cards and trusted response fields without a per-event masking marker | Shared Admin/Employee/User table; only confirmed masked payloads displayed; older/unmarked responses hidden |
| `lib/wpay/operations/devices.js` | Requested reveal and could pass through a message when its source token was absent | Requests masked data; applies fail-closed presentation redaction; scoped optional device metadata |
| `lib/wpay/operations/masked-content.js` | No shared fail-closed redactor | Bounded placeholders, missing-token fallback, numeric/alphanumeric-token and URL redaction |
| `lib/wpay/panels/api.js` | Approved suspended accounts could not use a dedicated safe reactivation path | Preserves commercial settings and UPI verification; routing remains stopped until Admin restarts it |
| `lib/wpay/panels/admin-finance.js`, `exchange-summary.js` | FX unavailable; manual confirmed receipts could be undercounted | Uses actual received/settled quantities and locked per-account rates; gross receipts separate from setup-adjusted capacity |
| `.github/workflows/wpay-admin-review.yml` | Pending Admin changes lacked current targeted database evidence | Additive isolated PostgreSQL diagnostics; existing checks retained |

No APK, legacy OTP router, ingestion, authentication, ownership policy, protected manifest, or existing tests were changed by this patch. Prototype sample balances and financial state are not copied into production.

## Verification

- 15 focused runtime, masking, reactivation and exchange tests passed.
- 41 related navigation, authority and overview checks passed; one PostgreSQL test skipped locally.
- Syntax check passed (161 JavaScript files); changed JavaScript also checked directly; whitespace check passed.
- All 53 Admin V5 navigation destinations have corresponding render handlers. This is route coverage, not proof that every action has passed end-to-end.
- The canonical reference CSS is the prefix of the live Admin stylesheet; fixes address incompatible markup and later overrides.
- Local `npm test` cannot initialize embedded PostgreSQL as root. CI uses its isolated PostgreSQL container for targeted database diagnostics.
- Protected-source check still reports the two pre-existing differences in `lib/device-otp-router.js` and `test/device-otp-router.test.js`. Neither file nor the baseline was modified here.

## Remaining verification limits

Browser policy rejected the local HTML preview URL. Live Admin browser session showed an authentication error. Therefore screenshot parity across all pages, mobile visual inspection and authenticated production action testing are **not certified** by this review. Existing broad mandatory-MFA acceptance failures must be assessed separately; this change does not weaken them.

Global topbar search currently matches page names, not individual users/merchants/UTRs. This existing gap remains; per-page server-scoped searches are unchanged. No unsupported global data endpoint or permission bypass was introduced.
