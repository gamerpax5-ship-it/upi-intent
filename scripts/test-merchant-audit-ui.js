'use strict';
// Synthetic DOM regression cases; no real accounts, network or money movement.
const fs=require('node:fs');
const harness=fs.readFileSync('scripts/test-merchant-ui.js','utf8').split('(async()=>{await tick();')[0];
const checks=String.raw`
(async()=>{
 await tick();
 const page=async id=>{document.querySelector('.nav-item[data-page="'+id+'"]').click();await tick();};
 const entry=(ledger_type,direction,amount_minor)=>({ledger_type,direction,amount_minor,currency:'INR',reference_id:'synthetic',created_at:'2026-09-28T00:00:00Z'});
 fixture['business/ledger/search']={entries:[entry('merchant_gross','credit','100000'),entry('merchant_platform_fee','credit','4000'),entry('merchant_payout_reserved','credit','21200'),entry('merchant_payout_reserved','debit','21200'),entry('merchant_settlement_principal','credit','5000')],nextOffset:null};
 for(const id of ['ledger','transactions']){
  await page(id);const rows=[...document.querySelectorAll('#'+(id==='ledger'?'ledgerRows':'txRows')+' tr')];
  for(const [i,debit,credit] of [[0,'—','₹1000.00'],[1,'₹40.00','—'],[2,'₹212.00','—'],[3,'—','₹212.00'],[4,'₹50.00','—']]){
   assert.equal(rows[i].children[3].textContent,debit);assert.equal(rows[i].children[4].textContent,credit);
  }
 }
 console.log('PASS Merchant balance direction: income, fees, reservations, release and settlement');
 await page('settlement');document.getElementById('useFullBalance').click();
 assert.equal(document.getElementById('merchantUsdtInr').value,'1000.00');
 document.getElementById('merchantUsdtAmount').value='';document.getElementById('merchantUsdtAmount').oninput();
 assert.equal(document.getElementById('merchantUsdtInr').value,'');
 for(const value of ['-1','invalid']){document.getElementById('merchantUsdtAmount').value=value;document.getElementById('merchantUsdtAmount').oninput();assert.equal(document.getElementById('merchantUsdtInr').value,'');}
 console.log('PASS cleared/invalid USDT cannot fall back to a stale INR withdrawal');
 let releaseOld;fixture['gateway/search']=()=>new Promise(resolve=>{releaseOld=resolve;});
 document.querySelector('.nav-item[data-page="orders"]').click();await tick();
 fixture['gateway/search']={orders:[{...order,reference:'new-result'}],hasMore:false};
 document.getElementById('refreshPage').click();await tick();
 releaseOld({orders:[{...order,reference:'stale-result'}],hasMore:false});await tick();
 assert.match(document.getElementById('orderRows').textContent,/new-result/);assert.doesNotMatch(document.getElementById('orderRows').textContent,/stale-result/);
 console.log('PASS late search response cannot replace newer results');
 document.getElementById('mobileMenuBtn').click();assert.equal(document.getElementById('mobileMenuBtn').getAttribute('aria-expanded'),'true');
 await page('reports');assert.equal(document.getElementById('mobileMenuBtn').getAttribute('aria-expanded'),'false');
 console.log('PASS navigation closes drawer and resets its accessibility state');
})().catch(e=>{console.error(e);process.exitCode=1;});`;
new Function('require',harness+checks)(require);
