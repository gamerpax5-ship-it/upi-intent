# Admin UI and IST login check

Prepared against hosted commit 67a2f544cba502b7bb50e5fccd690619a2438892.

- Admin-only midnight/violet interface, responsive navigation, section search, overview cards, payment-volume chart, approval shortcuts, recent payouts, fees/commissions and settlement total.
- Existing authorized destinations retained. No new grants, bank OTP access, APK changes or pairing changes.
- Read-only overview uses authorized tenant scope and feature-specific permissions. Missing financial capabilities stay unavailable, never replaced by the concept image's fictional figures. Net profit and expense/FX accounting are not implemented by this UI change.
- Admin and Super Admin authenticator verification additionally requires current Asia/Kolkata HHmm (server/database clock, exact minute, four ASCII digits with leading zeroes). Also required during enrollment/recovery verification. Generic entry cannot bypass the account-role check. Password, authenticator replay protection, rate limits and session policies remain required. This public time value is a clock confirmation, not a secret or an additional security factor.
- User, Merchant and Employee authenticator contracts unchanged.
- No Railway variable changes or legacy-service deployment.

Validation: 16 focused tests passed; syntax checks passed; all 197 protected legacy hashes passed. Full npm test could not initialize its disposable PostgreSQL because the runtime is root; no runner or operating-system identity was altered. Database-backed acceptance and a real Admin login remain unverified. Existing integration fixtures that log in as Admin will need to provide the new required field in a separately approved test update; existing tests were not edited.
