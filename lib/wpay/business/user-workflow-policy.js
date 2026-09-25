"use strict";

// Product rules confirmed for the Burgundy workspace. Values here are consumed
// by server workflows; a browser timer is never settlement authority.
const MS = 1000;
const POLICY = Object.freeze({
  version: 'user-burgundy-2026-09-26',
  firstDepositUsdtMinor: 2000n * 1000000n,
  paymentMs: 10 * 60 * MS,
  submissionGraceMs: 5 * 60 * MS,
  payoutReviewMs: 15 * 60 * MS,
  disputeMs: 48 * 60 * 60 * MS,
  activationMs: 24 * 60 * 60 * MS,
  verificationMinPaise: 110,
  verificationMaxPaise: 990,
  permissionGraceMs: 30 * 60 * MS,
  permissionReminderMs: 5 * 60 * MS,
  updateReminderMs: 30 * 60 * MS,
  locationIntervalMs: 5 * 60 * MS,
  locationRetentionMs: 48 * 60 * 60 * MS
});

function instant(value) {
  const result = value instanceof Date ? +value : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new TypeError('A valid server timestamp is required');
  return result;
}

function positiveMinor(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,29}$/.test(value)) throw new TypeError('Positive minor units required');
  return BigInt(value);
}

function claimWindow(createdAt, now) {
  const created = instant(createdAt), current = instant(now);
  const paymentUntil = created + POLICY.paymentMs;
  const submitUntil = paymentUntil + POLICY.submissionGraceMs;
  return {paymentUntil, submitUntil,
    phase: current < created ? 'not_started' : current < paymentUntil ? 'payment' : current < submitUntil ? 'submission_grace' : 'expired',
    canSubmit: current >= created && current < submitUntil};
}

function reviewDue(submittedAt, now) {
  return instant(now) >= instant(submittedAt) + POLICY.payoutReviewMs;
}

function disputeAllowed(approvedAt, now, alreadyDisputed = false) {
  const approved = instant(approvedAt), current = instant(now);
  return !alreadyDisputed && current >= approved && current < approved + POLICY.disputeMs;
}

function depositMinimumSatisfied(receivedUsdtMinor, hasConfirmedDeposit) {
  const amount = positiveMinor(receivedUsdtMinor);
  if (typeof hasConfirmedDeposit !== 'boolean') throw new TypeError('Server deposit history required');
  return hasConfirmedDeposit || amount >= POLICY.firstDepositUsdtMinor;
}

function inrWithdrawal(grossMinor) {
  const gross = positiveMinor(grossMinor);
  // 0.5%, rounded to the nearest paise. Gross, not net, is reserved from
  // commission, and the full gross is released if the request is cancelled.
  const fee = (gross * 5n + 500n) / 1000n;
  return {grossMinor: gross.toString(), feeMinor: fee.toString(), netMinor: (gross - fee).toString()};
}

function parkingPortionAllowed({amountMinor, remainingMinor, minMinor, maxMinor}) {
  const amount = positiveMinor(amountMinor), remaining = positiveMinor(remainingMinor);
  const min = positiveMinor(minMinor), max = positiveMinor(maxMinor);
  if (min > max) throw new TypeError('Invalid Parking limits');
  return amount <= remaining && amount <= max && (amount >= min || (remaining < min && amount === remaining));
}

function verificationEvidenceAllowed({createdAt, paidAt, receivedAt, superseded, deviceOnline}) {
  if (superseded !== false || deviceOnline !== true) return false;
  const created = instant(createdAt), paid = instant(paidAt), received = instant(receivedAt);
  return paid >= created && paid < created + POLICY.paymentMs && received >= paid &&
    received < created + POLICY.paymentMs + POLICY.submissionGraceMs;
}

module.exports = {POLICY, claimWindow, reviewDue, disputeAllowed, depositMinimumSatisfied,
  inrWithdrawal, parkingPortionAllowed, verificationEvidenceAllowed};
