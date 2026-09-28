# Telegram bot change report

Branch: `feat/telegram-operations`. Base: `3a4369c603e6d6256674f21f61690abf34558cbd`.

## Existing files: old → new

| File | Before | After |
| --- | --- | --- |
| `lib/wpay/auth/runtime/http.js` | `startAuthServer({ service, port = 4174, hostedOrigin, readiness })` | Adds optional `webhook` argument; dispatches it after host/origin/method checks. Existing authentication routes retained. |
| `lib/wpay/db/migrations.js` | Migration list ends with `032_account_support_backfill.sql` | Appends `033_telegram_operations.sql`. No previous migration rewritten. |
| `scripts/serve-wpay-hosted.js` | No Telegram lifecycle | Creates bot adapter, passes its webhook into HTTP server, starts worker, stops worker before database shutdown. Invalid bot configuration does not take down website. |

## New files

| File | Purpose |
| --- | --- |
| `lib/wpay/telegram/access.js` | Exact five numeric controller IDs; controller must personally be a group member to issue commands. Before every delivery, require a controller in group and bot administrator status. |
| `lib/wpay/telegram/commands.js` | Number/UPI validation, command aliases, connect/disconnect subscriptions. |
| `lib/wpay/telegram/format.js` | Metadata-only notification: number, literal `[MASKED]`, timestamp. No SMS body or authentication code. |
| `lib/wpay/telegram/transport.js` | Official Telegram API, bounded messages, per-group pacing, sanitized failures. |
| `lib/wpay/telegram/store.js` | Persistent subscriptions, duplicate-update protection, serialized group changes, delivery records. |
| `lib/wpay/telegram/source.js` | Active account and verified ownership checks; tenant-scoped metadata and explicitly mapped credit observations. |
| `lib/wpay/telegram/credit-reader.js` | Scoped read-only credit projections, excluding SMS bodies and credentials. Requires source column privileges. |
| `lib/wpay/telegram/engine.js` | Command execution and notification batches. Separate UTR query IDs allow repeated history requests. |
| `lib/wpay/telegram/runtime.js` | Secret-checked webhook, allowlisted command queue, worker, retry on initialization failure. |
| `migrations/wpay-auth/033_telegram_operations.sql` | Three bot-only tables, RLS, runtime role access. |
| `.github/workflows/wpay-telegram-review.yml` | Isolated PostgreSQL diagnostics alongside unchanged legacy checks. |
| `test/wpay-telegram*.test.js` | Authorization, masked output, webhook, read projections, persistence, real schema query tests. |

## Configuration and deployment requirements

- `TELEGRAM_BOT_TOKEN`, strong `TELEGRAM_WEBHOOK_SECRET`, HTTPS `WPAY_HOSTED_ORIGIN`.
- Controller IDs: `8248339578,8431990409,7925279541,8403294379,7668086423`.
- Multiple active tenants require explicit `TELEGRAM_TENANT_IDS`; no global fallback.
- Migration 033 must complete using migration role before new app starts.
- Bot must be group administrator. Only the five IDs can change subscriptions; notifications are visible to the group.
- UTR commands require verified receiving-account/device or statement mappings and scoped source read privileges. Missing mappings are rejected, never guessed from a phone number.

## Honest limits and outstanding deployment gates

- Location is the last permitted device report, with timestamp; it is not a requested fresh GPS fix.
- Device history reports pairing, revocation, and available diagnostics. Offline is not proof of APK uninstall. Historical online/offline transitions are not yet persisted by this adapter.
- Credit observations do not approve payments. Native statement uploads that do not persist credit rows cannot supply missing transaction detail.
- Delivery records prevent normal replay; a crash between Telegram accepting a message and database recording it may duplicate that message.
- Protected OTP source/test files already differ from baseline on the base branch. This change does not modify them or relax protection checks.
- Local full suite cannot initialize embedded PostgreSQL as root. Use isolated CI PostgreSQL results for database verification.
- Do not describe this integration as live until migration, deployment, webhook registration, and a real authorized group command have been verified.
