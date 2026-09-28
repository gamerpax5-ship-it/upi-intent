'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('User/Admin password dialog retries only the rejected request and preserves idempotency data',async()=>{
 const source=fs.readFileSync('dev/wpay-auth/web/app.js','utf8'),post=source.slice(source.indexOf('async function post(route'),source.indexOf('async function action('));
 for(const confirm of [true,false]){const calls=[],body={requestId:'unchanged-request',amountMinor:'100'},ctx={confirmTransactionPassword:async()=>confirm,request:async(route,method,value)=>{if(route==='csrf')return {csrfToken:'synthetic'};calls.push({route,value});if(calls.length===1)throw Error('error.RECENT_PASSWORD_REQUIRED');return {ok:true};}};vm.runInNewContext(post,ctx);if(confirm)assert.equal((await ctx.post('funding/create',body)).ok,true);else await assert.rejects(ctx.post('funding/create',body),/RECENT_PASSWORD_REQUIRED/);assert.equal(calls.length,confirm?2:1);assert.ok(calls.every(c=>c.value===body));}
});
test('Merchant retry handles password requirement without an authenticator and retains the request',async()=>{
 const source=fs.readFileSync('dev/wpay-auth/web/merchant-premium.js','utf8'),mutate=source.slice(source.indexOf('async function mutate('),source.indexOf('// Retain a key'));
 let prompts=0,calls=0;const body={idempotencyKey:'unchanged'},ctx={invalidate:()=>{},reauthenticate:async()=>{prompts++;},post:async(route,value)=>{assert.equal(value,body);if(++calls===1)throw Object.assign(Error(),{code:'RECENT_PASSWORD_REQUIRED'});return {ok:true};}};vm.runInNewContext(mutate,ctx);assert.equal((await ctx.mutate('payout/create',body)).ok,true);assert.equal(prompts,1);assert.equal(calls,2);
 const reauth=source.slice(source.indexOf('async function reauthenticate()'),source.indexOf('\n',source.indexOf('async function reauthenticate()')));assert.doesNotMatch(reauth,/stepCode|Authenticator code|code:/);
});
test('Merchant transaction entry requires password before any downstream gateway mutation',async()=>{
 const {DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service'),api=require('../lib/wpay/gateway/api');const id='10000000-0000-4000-8000-000000000001',context={principal:{id,merchantId:id,type:'merchant',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:DEFAULT_GRANTS.merchant,eligibility:{approvalStatus:'approved',operationsEnabled:true}},row={id,merchant_id:id,account_type:'merchant',tenant_id:'a',database_now:new Date(),password_at:null};let mutations=0;const gateway={merchant:async()=>({}),create:async()=>{mutations++;return {ok:true};}};
 await assert.rejects(api.run(gateway,{},row,context,'gateway/create',{}),{code:'RECENT_PASSWORD_REQUIRED'});assert.equal(mutations,0);row.transaction_password_at=row.database_now;assert.equal((await api.run(gateway,{},row,context,'gateway/create',{})).ok,true);assert.equal(mutations,1);
 await assert.rejects(api.run(gateway,{},row,{...context,grants:[]},'gateway/create',{}),{code:'FORBIDDEN'});assert.equal(mutations,1);
});
