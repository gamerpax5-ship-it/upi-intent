# WPay repository instructions

## Task 1 legacy protection

- Baseline: `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541` (inspected `main`). All 197 files present at this commit are frozen in `docs/protected-legacy-files.json`.
- Do not rewrite, refactor, rename, move, duplicate, reformat, remove, or otherwise change protected modules. This includes OTP, Android APK/device pairing, UPI generation, checkout HTML and inline handlers, credit/UTR ingestion, payment verification, statement parsing/matching, authentication, transitive dependencies, vendor files, APK artifacts, existing tests, startup, dependency manifests/lockfiles, database initialization and deployment/CI configuration.
- Report defects with evidence. Any protected-file change requires separate explicit user approval for that change. Approval to add panels is not approval to alter legacy behavior. Do not automatically regenerate the manifest, change its pinned digest, omit entries, or weaken checks to accept a change. A future approved baseline update must have a separately reviewed diff, reason, exact new commit/hashes and regression evidence.
- Before work, read applicable instructions, record branch, HEAD and working-tree status. Preserve uncommitted changes; no resets or overwrites. Keep existing instructions, including `vendor/smart-upi-parser/AGENTS.md`, intact.
- Task 1 permits additive audit documentation, this instruction file, the standalone protection checker, and separate tests only. Do not implement panels, migrations, financial services, or wire `server-wrapper.js` in Task 1.
- Future features belong in separate modules using the existing Node/Express/PostgreSQL/plain-browser stack. Propose minimal wrapper composition separately. Never expose legacy dashboard credentials, sessions, device tokens, or admin APIs to User/Merchant browsers.
- Enforce permissions and ownership on the backend. Existing global matching is a multi-tenant integration BLOCKER; do not work around it with proxies, SQL rewriting, monkey-patching, or auth bypass. Require approved ownership and trusted evidence before financial posting. Never equate a submitted proof, app callback, matched response, or terminal-but-failed provider status with a new financial credit.
- New code must not collect, log, store, or forward bank passwords, banking PINs/OTPs, seed phrases, or private keys. Do not expand existing OTP/APK collection; report legacy risks separately.
- Never edit, skip, or weaken existing tests. Run `node scripts/check-protected-legacy.js`, `npm run check`, and `npm test`. The test runner creates local disposable PostgreSQL. Clear inherited database/provider/dashboard configuration first; never use production DATABASE_URL, live wallets, real payments, or production records. Do not start the application independently against an unknown environment.
- Exercise protection failures only on generated temporary fixtures; never mutate real protected files for a test. Report failed, skipped, and unrun checks accurately.
- Do not directly push main, auto-merge, or deploy. Task 1 ends after audit/protection/design delivery.

## Check commands

```sh
node scripts/check-protected-legacy.js
node --test test/protected-legacy.test.js test/statement-parser-contract.test.js
npm run check
npm test
```

`npm test` already discovers new `test/*.test.js` files; package scripts and CI are unchanged. The standalone checker uses Node built-ins only and does not initialize the app or database. See the audit for command results and coverage limits.
