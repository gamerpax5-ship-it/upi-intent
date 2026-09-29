'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {phone,readiness}=require('../lib/wpay/onboarding/device-readiness');
test('ten-minute verification spaces polls to preserve the database sixty-attempt budget',async()=>{
 const {Onboarding}=require('../lib/wpay/onboarding/workflow');
 for(const [ttl,age,attempts,expected] of [[600,5000,59,0],[600,11000,59,1],[600,11000,60,0],[undefined,5000,59,1]]){
  const owner=randomUUID(),id=randomUUID(),challenge={id,owner_id:owner,bank_id:randomUUID(),bank_version:1,status:'waiting',attempts,last_attempt_at:new Date(Date.now()-age),expires_at:new Date(Date.now()+240000)};
  const workflow=new Onboarding(ttl?{challengeTtlSeconds:ttl}:{});let inspected=0;
  workflow.bank=async()=>({});workflow.result=()=>({status:'waiting'});workflow.evidence.inspect=async()=>{inspected++;return {state:'pending',proof:null};};
  const client={query:async sql=>({rows:sql.startsWith('SELECT * FROM wpay_auth.upi_verification_challenges')?[challenge]:[],rowCount:0})};
  await workflow.challenge(client,owner,{challengeId:id});assert.equal(inspected,expected);
 }
});
test('UPI mobile matching is exact, owner scoped, fresh and unambiguous',async()=>{
 const row={id:randomUUID()},bank={details:{mobile:'+919000000001'}};
 assert.equal(phone('9000000001'),phone('+91 9000000001'));assert.notEqual(phone('+44 9000000001'),phone('+91 9000000001'));
 const device={ownerId:row.id,phone:'9000000001',device:'owned-device',status:'online',linked:true};
 for(const [devices,connected,expected] of [[[device],true,true],[[{...device,ownerId:randomUUID()}],true,false],[[{...device,phone:'9000000002'}],true,false],[[{...device,status:'offline'}],true,false],[[{...device,linked:false}],true,false],[[device,device],true,false],[[device],false,false]]){
  const result=await readiness({list:async()=>({devices,sourceConnected:connected})},{},row,{},bank);assert.equal(result.ready,expected);
 }
});
test('server rejects offline QR creation and enforces a ten-minute new challenge policy',async()=>{
 const {OnboardingApi}=require('../lib/wpay/onboarding/api'),id=randomUUID(),bankId=randomUUID(),now=new Date(),row={id,user_id:id,tenant_id:'tenant-a',account_type:'user',database_now:now,transaction_password_at:now};
 const context={principal:{id,userId:id,type:'user',tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['user.bank_upi.update','user.bank_upi.view'],eligibility:{approvalStatus:'approved'}};
 let online=false,created=0;const api=new OnboardingApi({deviceSetup:{list:async()=>({sourceConnected:true,devices:[{ownerId:id,phone:'9000000001',status:online?'online':'offline',linked:true,device:'owned-device'}]})}});
 const bank={id:bankId,owner_id:id,details:{mobile:'9000000001'}};api.workflow.core.bankRecord=async()=>bank;api.workflow.bank=async()=>bank;api.workflow.create=async()=>{created++;return {qr:'synthetic'};};
 const body={bankId,version:1,requestId:randomUUID()};
 assert.equal(api.workflow.challengeTtlSeconds,600);
 await assert.rejects(api.run({},row,context,'onboarding/create',body),{code:'DEVICE_REQUIRED'});assert.equal(created,0);
 online=true;assert.equal((await api.run({},row,context,'onboarding/create',body)).qr,'synthetic');
 await assert.rejects(api.run({},row,{...context,grants:[]},'onboarding/create',body),{code:'FORBIDDEN'});assert.equal(created,1);
 const status=await api.run({}, {...row,transaction_password_at:null},context,'onboarding/device-status',{bankId,version:1});assert.equal(status.ready,true);
});
class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.style={};this.isConnected=true;this.open=false;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this[k]=v;}showModal(){this.open=true;}close(){this.open=false;}remove(){this.isConnected=false;}addEventListener(){}}
const all=n=>[n,...n.children.flatMap(all)],el=(t,s,c)=>Object.assign(new E(t,s),{className:c});
test('Verify opens the popup first, keeps QR blocked offline and includes statement fallback',async()=>{
 const c={crypto:{randomUUID},setInterval:()=>1,clearInterval:()=>{},WPayLocales:{translate:(_,k)=>k}};
 vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/onboarding.js','utf8'),c);
 const container=el('main'),calls=[],bank={id:randomUUID(),version:1,approved_version:1,status:'approved',details:{upiId:'synthetic@bank',holderName:'Synthetic',accountNumber:'12345678',mobile:'9000000001',bankLimitMinor:'100000'}};
 let online=false;
 await c.WPayOnboardingPage.render({destination:'user.onboarding-upi-verification',locale:'en',el,container,title:el('h1'),action:f=>f(),request:async()=>({banks:[bank]}),post:async(route)=>{
  calls.push(route);if(route==='onboarding/device-status')return {ready:online,status:online?'online':'offline',devices:[]};
  if(route==='onboarding/create')return {id:'challenge',status:'waiting',amountMinor:'100',qr:'synthetic-qr',expiresAt:new Date(Date.now()+600000).toISOString()};throw Error(route);
 }});
 await all(container).find(n=>n.tag==='button'&&n.textContent==='Verify').onclick();
 assert.deepEqual(calls,['onboarding/device-status']);assert.equal(all(container).filter(n=>n.tag==='img').length,0);
 const generate=all(container).find(n=>n.textContent==='Generate Test QR');assert.equal(generate.disabled,true);
 assert.ok(all(container).some(n=>n.textContent==='Statement fallback'));
 online=true;await all(container).find(n=>n.textContent==='Refresh APK status').onclick();assert.equal(generate.disabled,false);
 await generate.onclick();assert.equal(calls.filter(x=>x==='onboarding/create').length,1);assert.ok(all(container).some(n=>n.tag==='img'&&n.src==='synthetic-qr'));
 assert.equal(all(container).find(n=>n.textContent==='Enable verified UPI').disabled,true);
});
