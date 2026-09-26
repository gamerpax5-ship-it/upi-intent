"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const p = require('../lib/wpay/business/user-workflow-policy');
const start = Date.parse('2026-09-26T00:00:00Z');

test('payment claims retain the grace period, but do not extend after delayed worker execution', () => {
  assert.equal(p.claimWindow(start, start + 599999).phase, 'payment');
  assert.equal(p.claimWindow(start, start + 600000).phase, 'submission_grace');
  assert.equal(p.claimWindow(start, start + 899999).canSubmit, true);
  assert.equal(p.claimWindow(start, start + 900000).canSubmit, false);
  assert.equal(p.claimWindow(start, start + 3600000).submitUntil, start + 900000);
});

test('first deposit threshold is based on confirmed history, never just a prior request', () => {
  assert.equal(p.depositMinimumSatisfied('1999999999', false), false);
  assert.equal(p.depositMinimumSatisfied('2000000000', false), true);
  assert.equal(p.depositMinimumSatisfied('1', true), true);
  assert.throws(() => p.depositMinimumSatisfied('2000000000', 'true'));
  assert.throws(() => p.depositMinimumSatisfied('0', true));
});

test('INR withdrawal fee is inside the gross reservation, including paise rounding', () => {
  assert.deepEqual(p.inrWithdrawal('100000'), {grossMinor:'100000', feeMinor:'500', netMinor:'99500'});
  assert.deepEqual(p.inrWithdrawal('1'), {grossMinor:'1', feeMinor:'0', netMinor:'1'});
  assert.deepEqual(p.inrWithdrawal('100'), {grossMinor:'100', feeMinor:'1', netMinor:'99'});
  const large = p.inrWithdrawal('9007199254740993');
  assert.equal(BigInt(large.netMinor) + BigInt(large.feeMinor), 9007199254740993n);
});

test('Parking permits the whole below-minimum remainder, never a smaller arbitrary portion', () => {
  const limits = {remainingMinor:'500000', minMinor:'1000000', maxMinor:'5000000'};
  assert.equal(p.parkingPortionAllowed({...limits, amountMinor:'500000'}), true);
  assert.equal(p.parkingPortionAllowed({...limits, amountMinor:'400000'}), false);
  assert.equal(p.parkingPortionAllowed({...limits, amountMinor:'600000'}), false);
  assert.equal(p.parkingPortionAllowed({amountMinor:'6000000', remainingMinor:'7000000', minMinor:'1000000', maxMinor:'5000000'}), false);
});

test('review timeout and single-dispute window use approval/submission timestamps', () => {
  assert.equal(p.reviewDue(start, start + 899999), false);
  assert.equal(p.reviewDue(start, start + 900000), true);
  assert.equal(p.disputeAllowed(start, start + 172799999), true);
  assert.equal(p.disputeAllowed(start, start + 172800000), false);
  assert.equal(p.disputeAllowed(start, start + 1000, true), false);
  assert.equal(p.disputeAllowed(start, start - 1), false);
});

test('verification grace accepts late evidence only for timely payment on a current online challenge', () => {
  const evidence = {createdAt:start, paidAt:start+599999, receivedAt:start+899999, superseded:false, deviceOnline:true};
  assert.equal(p.verificationEvidenceAllowed(evidence), true);
  assert.equal(p.verificationEvidenceAllowed({...evidence, paidAt:start+600000}), false);
  assert.equal(p.verificationEvidenceAllowed({...evidence, receivedAt:start+900000}), false);
  assert.equal(p.verificationEvidenceAllowed({...evidence, superseded:true}), false);
  assert.equal(p.verificationEvidenceAllowed({...evidence, deviceOnline:false}), false);
});
