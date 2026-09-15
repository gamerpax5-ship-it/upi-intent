"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const w=require('../lib/wpay/gateway/webhooks'),v=require('../lib/wpay/gateway/validation'),{validateEvidence}=require('../lib/wpay/gateway/evidence');
test('gateway input rejects authority, imprecise money, metadata abuse and unsupported currency',()=>{
 const body={reference:'shop-1',idempotencyKey:'shop-key-1',amountMinor:'12500',currency:'INR'};assert.equal(v.order(body).amountMinor,'12500');
 for(const field of ['userId','bankId','upi','status','rate','evidence','callbackUrl'])assert.throws(()=>v.order({...body,[field]:'forged'}));
 for(const amountMinor of ['0','-1','1.1','01',1,'1e5'])assert.throws(()=>v.order({...body,amountMinor}));assert.throws(()=>v.order({...body,currency:'USD'}));assert.throws(()=>v.order({...body,metadata:{nested:{secret:'x'}}}));
});
test('webhook SSRF blocks non-public literals and all unsafe DNS answers, including mapped addresses',async()=>{
 for(const url of ['http://example.com/','https://127.0.0.1/','https://169.254.169.254/','https://[::1]/','https://[::ffff:127.0.0.1]/','https://10.0.0.1/','https://user:pass@example.com/','https://example.com:8443/','https://example.com/#x','https://example.com/?token=x'])assert.throws(()=>w.endpoint(url));
 await assert.rejects(w.destination('https://example.com/',{lookup:async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]}));
 assert.equal((await w.destination('https://example.com/',{lookup:async()=>[{address:'93.184.216.34',family:4}]})).address.address,'93.184.216.34');
 assert.throws(()=>w.endpoint('http://127.0.0.1:1234/wrong',{testCallback:'http://127.0.0.1:1234/callback'}));
});
test('webhook signatures bind exact bytes, event and timestamp, with freshness check',()=>{
 const secret='synthetic-signing-secret',id=randomUUID(),timestamp=String(Math.floor(Date.now()/1000)),body='{"ok":true}',headers={'x-wpay-timestamp':timestamp,'x-wpay-event-id':id,'x-wpay-signature':'v1='+w.signature(secret,timestamp,id,body)};
 assert.equal(w.verifySignature(secret,headers,body),true);assert.equal(w.verifySignature(secret,headers,body+' '),false);assert.equal(w.verifySignature(secret,{...headers,'x-wpay-event-id':randomUUID()},body),false);assert.equal(w.verifySignature(secret,headers,body,Date.now()+301000),false);
});
test('trusted evidence requires every order and economic binding; synthetic provider cannot run by default',()=>{
 const s={orderId:randomUUID(),reservationId:randomUUID(),merchantId:randomUUID(),userId:randomUUID(),bankId:randomUUID(),bankVersion:1,upi:'synthetic@bank',accountDigest:'digest',amountMinor:'10000',currency:'INR',createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+30000).toISOString()};
 const p={...s,verified:true,final:true,synthetic:true,status:'confirmed',source:'normal',evidenceId:'synthetic-evidence',economicId:'synthetic-economic',utr:'123456789012',receivedAt:new Date().toISOString()};
 assert.throws(()=>validateEvidence(s,p));assert.equal(validateEvidence(s,p,true),p);for(const field of Object.keys(s))assert.throws(()=>validateEvidence(s,{...p,[field]:'wrong'},true));assert.throws(()=>validateEvidence(s,{...p,verified:false},true));assert.throws(()=>validateEvidence(s,{...p,status:'pending'},true));
});
