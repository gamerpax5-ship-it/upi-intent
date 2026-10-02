'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.style={};this.dataset={};this.value='';this.isConnected=true;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this[k]=v;}showModal(){this.open=true;}close(){this.open=false;}remove(){}addEventListener(){}}
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
test('User Analytics shows an explicit routing status column',async()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/onboarding.js','utf8'),ctx);const container=el('main');
 await ctx.WPayOnboardingPage.render({destination:'user.onboarding-upi-analytics',locale:'en',el,container,title:el('h1'),action:f=>f(),request:async()=>({banks:[{upi_id:'test@boi',status:'stopped',routingStatus:'Stopped by Admin',total:0,successful:0,failed:0,pending:0,expired:0,cancelled:0,successful_volume_minor:'0',successRate:null}]})});
 assert.ok(all(container).some(n=>n.textContent==='Status: Stopped by Admin'));
 assert.ok(all(container).some(n=>n.tag==='th'&&n.textContent==='Status'));
});

test('User Analytics can stop and restart an owned Admin-added route and hides controls without update permission',async()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/onboarding.js','utf8'),ctx);const container=el('main'),calls=[],bank={id:randomUUID(),version:1,upi_id:'admin@test',adminManaged:true,status:'running',routingStatus:'Running',canStop:true,canStart:false,total:0,successful:0,failed:0,pending:0,expired:0,cancelled:0,successful_volume_minor:'0',successRate:null};let canUpdate=true;
 const render=()=>ctx.WPayOnboardingPage.render({destination:'user.onboarding-upi-analytics',locale:'en',el,container,title:el('h1'),action:f=>f(),request:async()=>({canUpdate,banks:[bank]}),post:async(route,b)=>{calls.push([route,b]);if(b.action==='stop'){bank.canStop=false;bank.canStart=true;bank.status='stopped';bank.routingStatus='Stopped by you';}if(b.action==='run'){bank.canStop=true;bank.canStart=false;bank.status='running';bank.routingStatus='Running';}}});
 await render();assert.ok(all(container).some(n=>n.textContent==='Admin-added'));const stopButton=all(container).find(n=>n.tag==='button'&&n.textContent==='Stop');assert.ok(stopButton);assert.equal(stopButton.className,'upi-analytics-route-button route-stop');await stopButton.onclick();assert.equal(calls[0][0],'business/banks/transition');assert.equal(calls[0][1].bankId,bank.id);assert.equal(calls[0][1].action,'stop');assert.ok(all(container).some(n=>n.textContent==='Status: Stopped by you'));const startButton=all(container).find(n=>n.tag==='button'&&n.textContent==='Start');assert.ok(startButton);assert.equal(startButton.className,'upi-analytics-route-button route-start');
 await startButton.onclick();assert.equal(calls.at(-1)[1].action,'run');assert.ok(all(container).some(n=>n.textContent==='Status: Running'));
 bank.canStop=false;bank.canStart=true;bank.status='stopped';bank.routingStatus='Stopped by you';canUpdate=false;await render();assert.ok(!all(container).some(n=>n.tag==='button'&&['Stop','Start'].includes(n.textContent)));
});

test('Bank cards expose confirmed Freeze only for editable unfrozen routes',async()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/user-burgundy-banks.js','utf8'),ctx);const container=el('main'),calls=[],bank={id:randomUUID(),version:1,status:'running',verified_version:null,approved_version:1,frozen:false,details:{upiId:'admin@test',bankName:'Test',accountNumber:'12345678',mobile:'9000000001',bankLimitMinor:'10000'}};let actions=['update'];
 const render=()=>ctx.WPayUserBurgundyBanks.render({account:{name:'Test'},el,container,title:el('h1'),action:f=>f(),request:async()=>({banks:[bank],actions}),post:async(route,b)=>{calls.push([route,b]);bank.frozen=true;bank.status='frozen';}});
 const button=s=>all(container).find(n=>n.tag==='button'&&n.textContent===s);
 await render();await button('Freeze').onclick();assert.equal(calls.length,0);await button('Confirm freeze').onclick();assert.equal(calls[0][1].action,'freeze');assert.equal(calls[0][1].bankId,bank.id);assert.equal(button('Freeze'),undefined);
 bank.frozen=false;actions=[];await render();assert.equal(button('Freeze'),undefined);
});
test('Owner can restart a self-stopped Admin-approved UPI without fabricated payment verification',async()=>{
 const {BusinessCore}=require('../lib/wpay/business/core'),state=require('../lib/wpay/onboarding/state');const prior=state.canStart;state.canStart=async()=>{};
 try{
  const owner=randomUUID(),bank={id:randomUUID(),owner_id:owner,version:1,approved_version:1,verified_version:null,status:'stopped',frozen:false,deactivated:false},core=new BusinessCore();
  core.bankRecord=async()=>bank;
  const queries=[];
  const client={query:async(sql,args)=>{queries.push([sql,args]);if(sql.includes('admin_bank_approvals'))return {rows:[{one:1}],rowCount:1};if(sql.includes('business_audit'))return {rows:[{actor_id:owner}],rowCount:1};return {rows:[],rowCount:1};}};
  assert.equal((await core.transitionBank(client,bank.id,1,'run',owner,{ownerId:owner,reason:'Owner restart'})).status,'running');assert.ok(queries.some(([sql])=>sql.includes('admin_bank_approvals')));
  client.query=async(sql)=>{if(sql.includes('admin_bank_approvals'))return {rows:[{one:1}],rowCount:1};if(sql.includes('business_audit'))return {rows:[{actor_id:randomUUID()}],rowCount:1};return {rows:[],rowCount:1};};
  await assert.rejects(core.transitionBank(client,bank.id,1,'run',owner,{ownerId:owner,reason:'Owner restart'}),{code:'CONFLICT'});
 }finally{state.canStart=prior;}
});
test('Direct Start from verified retains approval, verification, funding checks and stop eligibility',async()=>{
 const {BusinessCore}=require('../lib/wpay/business/core'),state=require('../lib/wpay/onboarding/state');const prior=state.canStart;let checked=0;state.canStart=async()=>{checked++;};
 try{const core=new BusinessCore(),bank={id:randomUUID(),owner_id:randomUUID(),version:3,approved_version:3,verified_version:3,status:'verified',frozen:false,deactivated:false};core.bankRecord=async()=>bank;const client={query:async()=>({rows:[],rowCount:1})};
 assert.equal((await core.transitionBank(client,bank.id,3,'run',bank.owner_id,{ownerId:bank.owner_id})).status,'running');assert.equal(checked,1);
 for(const patch of [{approved_version:null},{verified_version:null},{frozen:true},{deactivated:true},{version:4}]){core.bankRecord=async()=>({...bank,...patch});await assert.rejects(core.transitionBank(client,bank.id,3,'run',bank.owner_id,{ownerId:bank.owner_id}),{code:'CONFLICT'});}
 core.bankRecord=async()=>bank;state.canStart=async()=>{throw Object.assign(Error(),{code:'FUNDING_REQUIRED'});};await assert.rejects(core.transitionBank(client,bank.id,3,'run',bank.owner_id),{code:'FUNDING_REQUIRED'});
 }finally{state.canStart=prior;}
});
