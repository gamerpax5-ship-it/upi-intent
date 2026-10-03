'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {summarizeTransactions}=require('../lib/wpay/statement-bot/parser-worker');

test('Statement Bot captures only UPI credit rows with valid 12-digit UTRs',()=>{
 const s=summarizeTransactions([
  {direction:'credit',amount:'100.00',isUpi:true,utr:'123456789012',date:'01/10/2026'},
  {direction:'credit',amount:'200.00',isUpi:true,utr:'123456789012',date:'01/10/2026'},
  {direction:'credit',amount:'300.00',isUpi:true,utr:null,date:'01/10/2026'},
  {direction:'credit',amount:'400.00',isUpi:false,utr:'999999999999',date:'01/10/2026'},
  {direction:'debit',amount:'50.00',isUpi:true,utr:'555555555555',date:'01/10/2026'}
 ]);
 assert.equal(s.upiCreditCount,3);
 assert.equal(s.otherCreditCount,1);
 assert.equal(s.totalUpiCreditMinor,'60000');
 assert.equal(s.totalOtherCreditMinor,'40000');
 assert.equal(s.upiDebitCount,1);
 assert.equal(s.totalUpiDebitMinor,'5000');
 assert.equal(s.otherDebitCount,0);
 assert.equal(s.upiCreditWithoutUtrCount,1);
 assert.deepEqual(s.creditUtrs,[{date:'01/10/2026',utr:'123456789012',amountMinor:'10000'}]);
});

test('Repeated Statement Bot files stay processable and are deduped at UTR capture level',()=>{
 const store=fs.readFileSync(require.resolve('../lib/wpay/statement-bot/store.js'),'utf8');
 const jobs=fs.readFileSync(require.resolve('../lib/wpay/statement-bot/jobs.js'),'utf8');
 assert.ok(store.includes('duplicate_of=$4'));
 assert.equal(store.includes("state='duplicate',duplicate_of"),false);
 assert.equal(jobs.includes("format.error('DUPLICATE_STATEMENT')"),false);
});

test('Statement Bot summary separates accepted UPI credit from other credit',()=>{
 const format=require('../lib/wpay/statement-bot/format');
 const text=format.summary({selected_upi:'test@upi'},{
  upiCreditCount:2,totalUpiCreditMinor:'30000',upiDebitCount:1,totalUpiDebitMinor:'4000',otherCreditCount:1,totalOtherCreditMinor:'50000',otherDebitCount:3,totalOtherDebitMinor:'5000',upiCreditWithoutUtrCount:1,
  debitCount:4,totalDebitMinor:'9000',creditUtrCount:1,newUtrCount:1,duplicateUtrCount:0,
  callbackDelivered:0,callbackAlreadyDelivered:0,callbackQueued:0,callbackPending:0,callbackExhausted:0
 });
 assert.match(text,/UPI credit transactions: 2/);
 assert.match(text,/UPI debit transactions: 1/);
 assert.match(text,/Other credit transactions \(not captured\): 1/);
 assert.match(text,/Other debit transactions: 3/);
 assert.match(text,/UPI credits without valid 12-digit UTR: 1/);
 assert.match(text,/New UPI UTRs sent to Admin: 1/);
});
