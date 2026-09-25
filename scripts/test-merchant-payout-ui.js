'use strict';
// Reuse the existing isolated DOM/API fixture without changing its assertions.
const fs=require('node:fs');
const harness=fs.readFileSync('scripts/test-merchant-ui.js','utf8').split('(async()=>{await tick();')[0];
const checks=String.raw`
(async()=>{
 await tick();const clickPage=async page=>{document.querySelector('[data-page="'+page+'"]').click();await tick();};
 await clickPage('payouts');
 const mode=document.getElementById('poMode');mode.value='upi';mode.onchange();
 assert.equal(document.getElementById('poAccount').disabled,true);assert.equal(document.getElementById('poUpi').required,true);
 fixture['payout/create']={id:'test-upi'};document.getElementById('payoutForm').reset=()=>{};
 for(const [id,value]of Object.entries({poRef:'test-upi',poName:'Test Receiver',poUpi:'receiver@test',poAmount:'12.34',poDuration:'30'}))document.getElementById(id).value=value;
 document.getElementById('payoutForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
 const body=JSON.parse(calls.find(r=>r.route==='payout/create').opts.body);assert.equal(body.transferMode,'upi');assert.equal(body.durationMinutes,30);assert.equal(body.amountMinor,'1234');assert.equal(Object.hasOwn(body,'accountNumber'),false);assert.equal(Object.hasOwn(body,'ifsc'),false);
 await clickPage('settlement');document.getElementById('useFullBalance').click();assert.equal(document.getElementById('merchantUsdtAmount').value,'10.000000');assert.equal(document.getElementById('merchantUsdtInr').value,'1000.00');
 fixture['payout/merchant-usdt/create']={id:'test-usdt'};document.getElementById('merchantUsdtWithdrawForm').reset=()=>{};document.getElementById('merchantUsdtAddress').value='synthetic-address';
 document.getElementById('merchantUsdtWithdrawForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();const withdrawal=JSON.parse(calls.find(r=>r.route==='payout/merchant-usdt/create').opts.body);assert.equal(withdrawal.usdtMinor,'10000000');assert.equal(withdrawal.rateVersion,1);assert.equal(Object.hasOwn(withdrawal,'amountMinor'),false);
 fixture['gateway/analytics']={channels:[{origin:'manual',successful:1,pending:0,failed:0,expired:0,total:1,volume:'1000000'}],days:[{day:'2026-09-25',volume:'1000000',successful:1}]};await clickPage('analytics');assert.match(document.getElementById('analyticsTotals').textContent,/Successful orders1/);assert.match(document.getElementById('analyticsTotals').textContent,/10000\.00/);
 await clickPage('fees');assert.match(document.getElementById('chargedFeeSummary').textContent,/Total fees charged/);await clickPage('ledger');assert.match(document.getElementById('payoutBalanceSummary').textContent,/Completed payout principal/);
 console.log('PASS independent UPI inputs, duration, full USDT conversion, FX binding, successful analytics, charged fees and payout balance summaries');
})().catch(e=>{console.error(e);process.exitCode=1;});`;
new Function('require',harness+checks)(require);
