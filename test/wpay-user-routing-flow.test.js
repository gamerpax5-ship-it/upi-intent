'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.style={};this.value='';this.isConnected=true;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this[k]=v;}showModal(){this.open=true;}close(){this.open=false;}remove(){}addEventListener(){}}
const el=(tag,text,cls)=>Object.assign(new E(tag,text),{className:cls}),all=n=>[n,...n.children.flatMap(all)];
test('User verification displays approval blocker, Verify, then one Start/Stop routing action and refreshes stale approval',async()=>{
 const ctx={crypto:{randomUUID},setInterval:()=>1,clearInterval:()=>{}};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/onboarding.js','utf8'),ctx);
 const bank={id:randomUUID(),version:3,status:'submitted',approved_version:null,verified_version:null,details:{upiId:'test@boi',holderName:'Test',accountNumber:'123456789',mobile:'9000000001',bankLimitMinor:'10000'}},container=el('main'),calls=[];
 const render=()=>ctx.WPayOnboardingPage.render({destination:'user.onboarding-upi-verification',locale:'en',el,container,title:el('h1'),action:f=>f(),request:async()=>({banks:[bank]}),post:async(route,b)=>{calls.push([route,b]);if(b.action==='run')bank.status='running';if(b.action==='stop')bank.status='stopped';return {};}});
 const button=s=>all(container).find(n=>n.tag==='button'&&n.textContent===s);
 await render();assert.equal(button('Verify').disabled,true);bank.approved_version=3;bank.status='approved';await button('Refresh').onclick();assert.notEqual(button('Verify').disabled,true);
 bank.status='verified';bank.verified_version=3;await render();assert.ok(button('Start routing'));assert.equal(button('Enable'),undefined);await button('Start routing').onclick();assert.equal(calls.at(-1)[1].action,'run');assert.ok(button('Stop routing'));await button('Stop routing').onclick();assert.ok(button('Start routing'));
 bank.status='running';bank.verified_version=null;await render();assert.equal(button('Stop routing'),undefined);assert.ok(all(container).some(n=>n.textContent==='Admin-managed route; not User-verified.'));
});
test('User Analytics shows routing status below UPI identity',async()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/onboarding.js','utf8'),ctx);const container=el('main');
 await ctx.WPayOnboardingPage.render({destination:'user.onboarding-upi-analytics',locale:'en',el,container,title:el('h1'),action:f=>f(),request:async()=>({banks:[{upi_id:'test@boi',status:'stopped',routingStatus:'Stopped by Admin',total:0,successful:0,failed:0,pending:0,expired:0,cancelled:0,successful_volume_minor:'0',successRate:null}]})});
 assert.ok(all(container).some(n=>n.textContent==='Status: Stopped by Admin'));
});
test('Direct Start from verified retains approval, verification, funding checks and stop eligibility',async()=>{
 const {BusinessCore}=require('../lib/wpay/business/core'),state=require('../lib/wpay/onboarding/state');const prior=state.canStart;let checked=0;state.canStart=async()=>{checked++;};
 try{const core=new BusinessCore(),bank={id:randomUUID(),owner_id:randomUUID(),version:3,approved_version:3,verified_version:3,status:'verified',frozen:false,deactivated:false};core.bankRecord=async()=>bank;const client={query:async()=>({rows:[],rowCount:1})};
 assert.equal((await core.transitionBank(client,bank.id,3,'run',bank.owner_id,{ownerId:bank.owner_id})).status,'running');assert.equal(checked,1);
 for(const patch of [{approved_version:null},{verified_version:null},{frozen:true},{deactivated:true},{version:4}]){core.bankRecord=async()=>({...bank,...patch});await assert.rejects(core.transitionBank(client,bank.id,3,'run',bank.owner_id,{ownerId:bank.owner_id}),{code:'CONFLICT'});}
 core.bankRecord=async()=>bank;state.canStart=async()=>{throw Object.assign(Error(),{code:'FUNDING_REQUIRED'});};await assert.rejects(core.transitionBank(client,bank.id,3,'run',bank.owner_id),{code:'FUNDING_REQUIRED'});
 }finally{state.canStart=prior;}
});
