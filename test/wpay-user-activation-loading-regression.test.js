'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {canUsePermission,authorize}=require('../lib/wpay/authorization-policy');
const context={principal:{id:'user-a',userId:'user-a',type:'user',tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['user.analytics.view'],eligibility:{approvalStatus:'approved',initialDepositSatisfied:false,statementSatisfied:false,upiApproved:false,upiVerified:false,operationsEnabled:false},permissionId:'user.analytics.view'};
test('own read-only analytics does not depend on funding; approval and grants remain required',()=>{
 assert.equal(canUsePermission(context).allowed,true);
 assert.equal(canUsePermission({...context,grants:[]}).allowed,false);
 assert.equal(canUsePermission({...context,eligibility:{approvalStatus:'pending'}}).allowed,false);
 assert.equal(canUsePermission({...context,principal:{...context.principal,status:'suspended'}}).allowed,false);
 assert.equal(authorize({...context,context:{kind:'list',tenantId:'tenant-a',ownerType:'user',ownerId:'user-a'}}).allowed,true);
 assert.equal(authorize({...context,context:{kind:'list',tenantId:'tenant-a',ownerType:'user',ownerId:'user-b'}}).allowed,false);
 assert.equal(authorize({...context,context:{kind:'list',tenantId:'tenant-b',ownerType:'user',ownerId:'user-a'}}).allowed,false);
});
function fixture(post){
 class Node{constructor(tag,text,cls){this.tagName=tag;this.textContent=text;this.className=cls;this.children=[];this.dataset={};}append(...n){this.children.push(...n);}prepend(...n){this.children.unshift(...n);}replaceChildren(...n){this.children=n;}setAttribute(){} }
 const ctx={crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},setTimeout(){},setInterval(){},clearInterval(){}};
 vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/device-setup.js','utf8'),ctx);
 const el=(...args)=>new Node(...args),container=el('main');
 return {container,render:()=>ctx.WPayDeviceSetupPage.render({destination:'operations.activation',account:{accountType:'user'},el,container,title:el('h1'),post,action:fn=>fn()})};
}
const all=n=>[n,...n.children.flatMap(all)];
test('activation loads setup and history concurrently and exposes no premature generate button',async()=>{
 let finish;const calls=[];
 const f=fixture(async path=>{calls.push(path);if(path==='operations/pairing-history')return new Promise(resolve=>{finish=resolve;});return {pairingAvailable:true,canCreate:true};});
 const pending=f.render();await Promise.resolve();
 assert.deepEqual(calls,['operations/device-setup','operations/pairing-history']);
 assert.equal(all(f.container).some(n=>n.textContent==='Generate activation code'),false);
 finish({requests:[]});await pending;
 assert.equal(all(f.container).find(n=>n.textContent==='Generate activation code').disabled,false);
});
test('activation failures are visible inline and retries keep the idempotency key',async()=>{
 const ids=[];const f=fixture(async(path,body)=>{
  if(path==='operations/pairing-history')return {requests:[]};
  if(path==='operations/device-setup')return {pairingAvailable:true,canCreate:true};
  ids.push(body.requestId);throw new Error('error.OTP_SOURCE_UNAVAILABLE');
 });await f.render();const button=all(f.container).find(n=>n.textContent==='Generate activation code');
 await assert.rejects(button.onclick(),/OTP_SOURCE_UNAVAILABLE/);
 assert.equal(button.disabled,false);assert.ok(all(f.container).some(n=>n.textContent?.includes('could not be generated')));
 await assert.rejects(button.onclick());assert.equal(ids[0],ids[1]);
});
test('activation success displays code and visible confirmation',async()=>{
 const f=fixture(async path=>path==='operations/pairing-history'?{requests:[]}:path==='operations/device-setup'?{pairingAvailable:true,canCreate:true}:{id:'synthetic',pairingCode:'TESTABCD',expiresAt:new Date(Date.now()+600000).toISOString()});
 await f.render();await all(f.container).find(n=>n.textContent==='Generate activation code').onclick();
 assert.ok(all(f.container).some(n=>n.tagName==='code'&&n.textContent==='TESTABCD'));
 assert.ok(all(f.container).some(n=>n.textContent?.includes('Activation code is ready below')));
 const nodes=all(f.container);assert.ok(nodes.findIndex(n=>n.tagName==='code')>nodes.findIndex(n=>n.textContent==='Generate activation code'));
});
