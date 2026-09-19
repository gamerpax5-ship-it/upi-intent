'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PaymentEvidence}=require('../lib/wpay/onboarding/evidence'),{PayoutProvider}=require('../lib/wpay/payouts/provider');
test('UPI provider unavailable, pending, invalid and bounded transient-error states remain distinct',async()=>{
 assert.deepEqual(await new PaymentEvidence().inspect({}),{state:'unavailable',reason:'not_configured',proof:null});
 assert.deepEqual(await new PaymentEvidence({verify:async()=>null}).inspect({}),{state:'pending',proof:null});
 assert.deepEqual(await new PaymentEvidence({verify:async()=>({verified:true})}).inspect({}),{state:'invalid_evidence',proof:null});
 let n=0;const keys=[];const provider=new PaymentEvidence({verify:async(_,context)=>{n++;keys.push(context.idempotencyKey);throw Object.assign(Error('private-error'),{retryable:true});}});
 assert.deepEqual(await provider.inspect({id:'synthetic-challenge'}),{state:'unavailable',reason:'provider_error',proof:null});assert.equal(n,2);assert.equal(new Set(keys).size,1);
});
test('payout provider status is scoped, replay-identifiable and never itself accounting completion',async()=>{
 const request={operationId:'synthetic-payout',ownerId:'user-a',tenantId:'tenant-a',currency:'INR',amountMinor:'10000',snapshotDigest:'a'.repeat(64)};
 assert.deepEqual(await new PayoutProvider().inspect(request),{state:'unavailable',reason:'not_configured',accountingFinal:false});
 for(const state of ['pending','submitted','failed','expired','cancelled','disputed'])assert.deepEqual(await new PayoutProvider({read:async()=>({...request,state})}).inspect(request),{state,accountingFinal:false});
 const proof={...request,state:'confirmed',independentlyVerified:true,final:true,economicId:'synthetic-economic',evidenceId:'synthetic-evidence',synthetic:true},provider=new PayoutProvider({read:async()=>proof,allowSynthetic:true});
 const accepted=await provider.inspect(request);assert.equal(accepted.state,'evidence_ready');assert.equal(accepted.accountingFinal,false);assert.deepEqual(await provider.inspect(request),accepted);
 for(const key of ['operationId','ownerId','tenantId','amountMinor','currency','snapshotDigest']){const p=new PayoutProvider({read:async()=>({...proof,[key]:'other'}),allowSynthetic:true});assert.equal((await p.inspect(request)).state,'review');}
 assert.equal((await new PayoutProvider({read:async()=>proof}).inspect(request)).state,'review');
 assert.equal((await new PayoutProvider({read:async()=>({...proof,independentlyVerified:false}),allowSynthetic:true}).inspect(request)).state,'review');
 for(const key of ['economicId','evidenceId'])assert.equal((await new PayoutProvider({read:async()=>({...proof,[key]:undefined}),allowSynthetic:true}).inspect(request)).state,'review');
 assert.equal(typeof provider.submit,'undefined');
});
