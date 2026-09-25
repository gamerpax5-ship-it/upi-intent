# User Burgundy integration: confirmed product rules

Recorded 2026-09-26 from the current implementation conversation. This is a requirements checklist, not a completion report. Existing production behavior has not yet been changed by this task.

## Implementation checkpoint (incomplete; do not deploy yet)

- Local edits: new Burgundy login/sidebar shell and CSS from the supplied HTML, distinct SVG gradient IDs, shared workflow policy helpers, Parking per-payment maximum/one-active-lock/10+5 submission handling and visible rejection reason, first-deposit-only minimum, initial draft of capacity-building payout claims and prospective timeout approval.
- Migration 025 allows a payout claim without a registered source bank and a system-attributed timeout settlement. It has NOT been applied to production or verified with a database yet.
- Existing inner User page renderers still require exact-template integration. Disputes, withdrawals, full device policy, Admin controls and the remaining confirmed rules are NOT complete.
- 21 focused policy/protection/parser tests passed; new historical-rate PostgreSQL test skipped locally because no isolated database is running. Syntax check passed (126 files); 197 legacy hashes unchanged. Full npm test cannot start embedded PostgreSQL as root. New isolated CI workflow prepared for wpay/user-workflow. GitHub create_tree was NOT executed: automatic approval review failed to initialize its session (internal HTTP 500). No remote changes or CI run resulted; retry through the authorized connector after service recovery, never bypass approval.
- Confirmed: a new User may claim a payout created before their account/first commercial rate. Use the latest rate effective at order creation, falling back to that User's first effective configured rate when none existed then. Future scheduled rates are unavailable. Queue, claim and settlement now use this rule locally; database verification is still required.
- No deployment or remote branch update performed for this task. Preserve all local changes; use git diff rather than assuming any checklist item is implemented.

## Delivery and boundaries

- Apply `WPay-User-Burgundy-Complete-Working-Prototype-DASHBOARD-FINAL.html` faithfully to `/user`, including login, every page, real actions, responsive layout and the workspace WPay logo.
- Add missing Admin/Employee and Merchant controls needed for these workflows, grouped by role and section.
- Test before deployment, deploy, then request interactive sign-in and inspect the actual authenticated system. Correct discovered issues.
- Preserve existing OTP capture/code/configuration. Do not upload or integrate OTP changes now. The user will mask OTPs and explicitly authorize later integration. Future view: masked OTP and full message with OTP masked; user sees own devices, Admin/authorized Employee sees permitted devices.
- Trade with WPay remains Coming soon.
- Login details remains a text-field label for non-secret notes; no banking passwords/PINs/OTPs.

## Capacity and routing

- Only earned, available commission is withdrawable. Deposits buy collection capacity, not a withdrawable wallet balance.
- Confirmed deposit, approved payout and approved Parking payment increase capacity. Successful pay-in decreases it.
- Reserve capacity atomically when creating a payment link. Pending reservations count; failed/expired links release once; success consumes once.
- Late trustworthy SMS/statement match can recover a failed/expired pay-in automatically. Never double-credit Merchant or double-consume User capacity. Recovery may make capacity negative; normal Users then receive no new links.
- All user UPIs share the user's available capacity. Each UPI has a separate daily limit, including success plus pending reservations; failed/expired reservations release. Daily limits reset at midnight IST, not user funded capacity.
- Users may change daily limits immediately, without approval. A higher daily limit creates no capacity.
- Bank/UPI identity edits stop routing and require fresh Admin approval and verification. Limit-only edits are the exception.
- New Users can complete Payout/Parking without a deposit to gain capacity. APK access/new Bank/UPI setup requires positive capacity unless free access is granted. At zero capacity existing devices stay connected and existing payments continue verification.
- Admin may grant free setup and unlimited capacity to selected Users. Verification, device-online, permission health and daily UPI limits still apply. Disputes do not stop these unlimited Users' collections; holds/debts remain recorded. Revoking unlimited access restores actual capacity rules, without cancelling existing links.
- Admin-added UPIs retain separate exceptions: no deposit, capacity, APK or verification requirement. Admin can assign many UPIs to many Merchants.

## Bank/UPI and verification

- Business UPI and Merchant QR (Bank) forms follow the supplied HTML. Business UPI also needs bank name and account last four digits for matching.
- Store the APK mobile number with each UPI. Multiple UPIs may use one number, whether on the same or different bank accounts. Both SIM numbers on a dual-SIM device can map to its UPIs.
- Show the linked APK status in the verification popup. QR generation and statement-based verification both require an online linked APK.
- Random verification amount is INR 1.10–9.90. QR is valid 10 minutes, followed by a 5-minute evidence grace period for a payment made during the original 10 minutes. Afterward a new challenge is needed.
- Regenerating invalidates the old challenge and uses a new random amount. Match amount, bank/account, owner/device and payment window; never verify solely from an unrelated matching amount.
- Use captured credit UTR or uploaded statement as the verification source. Test verification payment is excluded from financial volume, commission and capacity.
- Offline/unlinked/removed APK stops NEW links. Existing links continue until expiry. Same User's re-paired device with the same verified number reconnects previous UPIs automatically. Resume on recovery unless manually stopped.

## Payout and Parking

- Merchant request reserves principal plus fees immediately, including each item in a bulk file. One Admin batch approval; individual User cards.
- A payout is routable only when Merchant deadline has at least 15 minutes remaining. Expired unsubmitted claims requeue only with another 15 minutes available; otherwise expire and release Merchant principal/fees.
- User can hold one active payout and one active Parking lock concurrently. Submitting UTR AND proof frees that category's active-task slot; capacity is credited only after approval.
- Both types allow 10 minutes to pay plus 5 minutes to submit UTR/proof. Amount stays unavailable to others for the full 15 minutes. Deadline calculation uses original timestamps, not worker execution time.
- Payout submission begins Merchant review immediately. Merchant has 15 minutes from submission, regardless of page access, then auto-approval. Merchant rejection goes to Admin/authorized Employee dispute review; principal remains reserved.
- Parking is approved only by Admin/authorized Employee, never by timeout. It grants capacity only, no commission. Submitted amount remains locked until decision. Rejection requires a user-visible reason and returns that amount to the order.
- Parking can be funded by multiple Users. Only remaining unlocked amount is offered. Admin sets per-payment minimum and maximum, identical for all Users. After submission a User may take another portion of the same order. A remaining balance below minimum can be taken in full.
- Payout/Parking late UTR+proof review request is available after timeout. Hold any still-unclaimed corresponding amount. If another User already claimed it, retain that User's task and show the conflict to reviewers. No automatic credit for the late request.
- Order commission rates are fixed at order creation, including when rates change before completion. Resolve payout User terms as effective at that creation time once a claimant exists.

## Post-approval payout disputes

- Merchant can dispute manual or automatic approval within 48 hours after approval. One dispute per payout, no reopening after a final decision.
- Require reason plus fresh receiving bank/UPI statement covering payment time through dispute time.
- Immediately freeze disputed User capacity and commission; show notifications and allow User explanation/additional proof.
- Capacity and commission may become negative if already consumed/withdrawn. Future credits cover deficits. Keep holds and permanent reversals separate so final decisions do not deduct twice.
- Admin or specifically authorized Employee resolves. Payment valid: release capacity/commission holds. Invalid: reverse User capacity benefit and commission, return Merchant principal AND fees, release holds as part of the same atomic settlement.
- Merchant payout/withdrawal reservations prevent repeated spending of the same balance.

## Commission withdrawals

- INR and USDT withdrawals use available commission only. No product minimum; valid positive supported precision still required.
- INR: User can enter new destination bank details. Fee 0.5% deducted from requested gross: INR 1,000 entitlement -> INR 995 transfer + INR 5 fee. Rejection/cancellation releases full gross, including fee reserve.
- USDT: User enters TRC20 address; no withdrawal fee. Lock Admin-set FX rate at request creation. Show equivalent values and prevent overdraft/concurrent double reservation.
- Rejection requires visible reason (including insufficient operator INR liquidity).
- Completing INR withdrawal requires UTR; completing USDT withdrawal requires transaction hash. Admin and authorized Employees have scoped actions.

## USDT deposits

- Minimum 2,000 USDT applies ONLY to first deposit. Later deposits do not have this product minimum.
- First received deposit below 2,000 cannot credit capacity, including manual approval. Do not combine top-ups. Refunds are handled outside this system; do not create a refund feature.
- Rate is locked at request creation. Confirmed received amount drives credit at that rate.
- Exact, timely, independently confirmed deposit auto-credits. Expired/amount-mismatched payments go to review. Above-minimum amount mismatch may credit actual receipt after review.
- Admin or explicitly authorized Employee may approve after independent manual checking using mandatory reason, without entering hash/evidence reference. Label provenance as manual, not blockchain verified. Subsequent provider confirmation must not credit again.

## APK setup and visibility

- Four User pages: latest WPay Agent download, Activation Codes, Linked Devices, OTP Events (future masked integration remains deferred).
- Every eligible User, Admin and authorized Employee can issue codes without choosing a hardware device. One code pairs one device. Unused code validity is 24 hours. No product device-count limit; retain sensible anti-abuse request controls.
- User-issued devices visible to that User, Admin and authorized Employees. Admin/Employee-issued devices visible to Admin/authorized Employees, never other Users. Access based on verified pairing provenance, never arbitrary device ID supplied by a browser.
- Code history: Pending, Used, Expired, Revoked; linked-device details for Used; unused code revocation.
- User can unlink own device; Admin/authorized Employee can revoke permitted devices. Keep audit history. Reinstallation/unlink requires a fresh code.
- Device cards open status, network/SIM/provider, battery/health and location. Offline cards show last-known values with last-updated time, never fake live telemetry.
- Location history every 5 minutes, rolling retention 48 hours; User sees own, Admin/authorized Employee permitted devices.
- All required permission losses: reminder every 5 minutes; 30-minute grace before stopping NEW links. Restore all permissions -> automatic resume unless manually stopped. Device-offline rule remains immediate based on trustworthy heartbeat status.
- Download always serves latest verified release. On app reopening check/download latest update; Update now opens Android installation confirmation. Older APK continues working. While app is open, remind with center popup every 30 minutes until updated. Preserve existing OTP modules.
- Captured credit UTR listing belongs only in Admin/authorized Employee APK setup. User instead sees own Pay-in History: UPI ID, amount, DATE ONLY, WPay order reference, status. Admin/authorized Employee retain exact timestamps.

## Verification requirements

- All authorization and balance invariants enforced on server, not only hidden buttons.
- Concurrent reservations, retries, duplicate UTRs, duplicate callbacks, permission revocation, boundary times and delayed workers need meaningful isolated tests.
- Use real backend data and explicit empty/unavailable states. Do not ship demo balance mutations, simulated verification, invented parsed statement rows or browser-generated activation codes.
- Preserve immutable old financial records and locked terms; additive migrations, explicit new-policy provenance and no retroactive auto-approval of historical records without a recorded policy.
