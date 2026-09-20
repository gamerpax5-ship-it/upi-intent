# Password establishment and Merchant payment-link entry

## Scope

New or explicitly changed User/Merchant passwords require 8–128 Unicode code points, ASCII uppercase/lowercase/digit and Unicode punctuation or symbol. Whitespace alone is not a symbol. The existing 512 UTF-8 byte maximum and well-formed Unicode check remain. Passwords are never trimmed, normalized or truncated. Ordinary login and security verification do not apply new composition rules to existing passwords. Admin/Super Admin/Employee establishment remains at least 15 code points; scrypt parameters are unchanged.

The new own-account `security/password` operation uses server-resolved account type, the existing ownership permission, CSRF and throttling. It requires the current password and a fresh non-replayed authenticator code. The credential update, epoch/security-version changes, immutable audit record and replacement session commit atomically. Other sessions become stale. The existing authenticator factor and recovery-code records are retained. This does not add password recovery or a privileged reset route.

The browser mirrors establishment validation and provides localized instructions. New password entry requires the account owner. Existing manual account passwords are not bulk changed.

## Payment links

Merchant navigation names the existing gateway page **Create Payment Link**. The existing `gateway/create`, `gateway/get` and `gateway/search` contracts remain canonical. INR input accepts a strict positive decimal string with at most two decimal places, converting through BigInt to integer paise without floating-point rounding. The API amount maximum remains unchanged. Reference and optional description use existing bounds. An unchanged retry retains its idempotency key; changing the payload creates a new key.

The backend still controls eligibility, ownership, routing, reservation and accounting. NO_ROUTE/insufficient capacity is explicit and produces no fabricated URL. Generated details retain QR, status, expiry, Copy Link and protected checkout access. Positive acceptance is limited to isolated synthetic eligible fixtures. Hosted manual accounts stay unfunded.

## Validation and release boundary

New unit and PostgreSQL/HTTP tests cover policy compatibility, mandatory MFA, password step-up/change, revocation and exact conversion/localization. Existing tests only receive the five explicitly authorized policy-incompatible synthetic registration password updates; behavioral assertions are retained. No applied migration, legacy engine, dependency manifest or production configuration changes are required. Local and exact-SHA CI evidence must pass before pinned staging deployment. Browser results are reported separately from automated tests.

## Local acceptance on 2026-09-20

- Full general suite: 421 passed, no failures or skips; full serial PostgreSQL/HTTP suite: 202 passed, no failures or skips. Protection checker: all 197 exact. Applied migrations 001–016 unchanged.
- An initial concurrent database run rejected a synthetic statement fixture and dependent routing assertions failed. The unchanged parser accepted that exact CSV in 231 ms in isolation; the full serial rerun passed without any assertion or parser-timeout change. Failure evidence remains private.
- Actual local Merchant login with its existing synthetic authenticator, visible canonical generator, INR 1250.50 creation, QR presence, actual Copy Link, protected checkout opening, natural expiry and logout passed. The checkout success screen stayed hidden; no UTR or payment was submitted. Database readback confirmed one 125050-paise order, zero orders from NO_ROUTE attempts, and zero pay-in postings.
- Generator and empty password-change form rendered without horizontal overflow at 1280 and 390 pixels in EN/RU/zh-CN (six views each). Real NO_ROUTE responses were localized in all three languages. Secret-free screenshots and non-secret result summaries remain outside Git. Browser credential-change submission was not performed; the real password-change/MFA/session transition was tested over HTTP.
- These are isolated synthetic browser results. Hosted Admin recovery/login, current User profile/support readback and the required User private password update remain separate human handoffs. Historical role matrices retain their original tested SHA; neither local rendering nor automated HTTP results replace hosted acceptance.
