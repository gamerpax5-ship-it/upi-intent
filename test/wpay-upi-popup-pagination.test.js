'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.style={};this.value='';this.isConnected=true;this.open=false;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this[k]=v;}showModal(){this.open=true;}close(){this.open=false;}remove(){this.isConnected=false;}addEventListener(){}}
const all=n=>[n,...n.children.flatMap(all)],el=(tag,text,cls)=>Object.assign(new E(tag,text),{className:cls});
test('popup fetch follows the next UTR page, ignores wrong amounts and sends selected evidence for server checks',async()=>{
 const ctx={crypto:{randomUUID},setInterval:()=>1,clearInterval:()=>{}};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/onboarding.js','utf8'),ctx);
 const container=el('main'),calls=[],bank={id:randomUUID(),version:1,approved_version:1,status:'approved',details:{upiId:'test@bank',holderName:'Test',accountNumber:'123456789',mobile:'9000000001',bankLimitMinor:'10000'}};
 const challenge={id:randomUUID(),status:'waiting',amountMinor:'1000',createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+599000).toISOString(),qr:'test-qr'};
 await ctx.WPayOnboardingPage.render({destination:'user.onboarding-upi-verification',locale:'en',el,container,title:el('h1'),action:f=>f(),request:async()=>({banks:[bank]}),post:async(route,body)=>{
  calls.push({route,body});if(route==='onboarding/device-status')return {ready:true,status:'online',devices:[{device:'owned'}]};
  if(route==='operations/device-setup/utrs')return body.before?{records:[{utr:'123456789012',amount:'10.00',capturedAt:new Date(),status:'CREDIT_RECEIVED'}]}:{records:[{utr:'999999999999',amount:'20.00',capturedAt:new Date(),status:'CREDIT_RECEIVED'}],nextCursor:'next-page'};
  return {...challenge};
 }});
 const click=label=>all(container).find(n=>n.tag==='button'&&n.textContent===label).onclick();
 await click('Verify');await click('Generate Test QR');await click('Fetch');
 assert.deepEqual(calls.filter(x=>x.route==='operations/device-setup/utrs').map(x=>x.body.before),[undefined,'next-page']);
 assert.ok(all(container).some(n=>n.textContent==='123456789012'));assert.ok(!all(container).some(n=>n.textContent==='999999999999'));
 await click('Use UTR');assert.equal(calls.at(-1).route,'onboarding/poll');assert.equal(calls.at(-1).body.utr,'123456789012');
 assert.equal(all(container).find(n=>n.textContent==='Enable verified UPI').disabled,true);
});
