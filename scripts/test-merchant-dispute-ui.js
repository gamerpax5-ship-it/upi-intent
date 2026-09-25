'use strict';
const fs=require('node:fs');
const harness=fs.readFileSync('scripts/test-merchant-ui.js','utf8').split('(async()=>{await tick();')[0];
const checks=String.raw`
(async()=>{
 await tick();
 const payout={id:'disputed-payout',reference:'<script>unsafe</script>',amountMinor:'10000',percentageFeeMinor:'100',fixedFeeMinor:'600',reserveMinor:'10700',status:'successful',disputable:true,beneficiary:{upiId:'synthetic@test'}};
 fixture['payout/search']={orders:[payout],hasMore:false};fixture['payout/get']=payout;
 document.querySelector('[data-page="payouts"]').click();await tick();
 document.querySelector('[data-action="payout"]').click();await tick();
 assert.equal(document.querySelector('#modalBody script'),null);
 document.querySelector('[data-action="payout-dispute"]').click();await tick();
 for(const id of ['disputeReason','disputeFrom','disputeThrough','disputeStatement'])assert.ok(document.getElementById(id));
 const bytes=Buffer.from('%PDF-1.4\nSynthetic fresh statement\n%%EOF');
 Object.defineProperty(document.getElementById('disputeStatement'),'files',{value:[{name:'statement.pdf',size:bytes.length,arrayBuffer:async()=>bytes}]});
 document.getElementById('disputeReason').value='Synthetic missing payment';document.getElementById('disputeFrom').value='2026-09-25T10:00';document.getElementById('disputeThrough').value='2026-09-25T12:00';
 fixture['payout/dispute/open']={status:'pending'};
 document.getElementById('modalForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
 const sent=JSON.parse(calls.find(c=>c.route==='payout/dispute/open').opts.body);
 assert.equal(sent.id,payout.id);assert.equal(sent.reason,'Synthetic missing payment');assert.equal(sent.statement.data,bytes.toString('base64'));assert.ok(sent.coverageFrom.endsWith('Z'));assert.equal(Object.hasOwn(sent,'userId'),false);
 console.log('PASS Merchant dispute form opens, escapes reference, uploads statement and submits coverage to the real API route');
})().catch(e=>{console.error(e);process.exitCode=1;});`;
new Function('require',harness+checks)(require);
