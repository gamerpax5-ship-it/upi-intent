'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renew}=require('../lib/wpay/auth/runtime/retain-login-assurance');
function row(type){return {id:'fixture',account_type:type,status:'active',approval_status:'approved',mfa_enabled:true,auth_method:'mfa',mfa_at:new Date('2026-09-29T01:00:00Z'),database_now:new Date('2026-09-29T02:00:00Z'),security_version:2,session_security_version:2,factor_version:1,session_factor_version:1};}
test('All panel roles retain original login MFA provenance after a password-verified credential change',async()=>{
 for(const type of ['user','merchant','admin','super_admin']){const previous=row(type);let promoted=false;const service={mfa:{validate(){}},repository:{promote:async(client,next,digest,validate,verifiedAt)=>{promoted=true;assert.equal(verifiedAt,previous.mfa_at);assert.notEqual(verifiedAt,previous.database_now);assert.equal(next.security_version,3);assert.equal(digest.length,64);}}};const result=await renew(service,{},previous,{...previous,security_version:3});assert.equal(result.stage,'authenticated');assert.ok(promoted);}
});
test('Credential session renewal rejects changed owner, factor and invalid assurance',async()=>{
 const previous=row('user');for(const patch of [{id:'foreign'},{mfa_enabled:false},{factor_version:2}])await assert.rejects(renew({}, {},previous,{...previous,...patch}),{code:'AUTH_FAILED'});
 await assert.rejects(renew({}, {},{...previous,session_security_version:0},previous),{code:'AUTH_FAILED'});
});
test('Enabled customer password changes verify the password without invoking fresh MFA',async()=>{
 const {hashPassword}=require('../lib/wpay/auth/runtime/passwords'),{change}=require('../lib/wpay/auth/runtime/optional-mfa');
 const password='Synthetic-fixture-password-2026!',password_record=await hashPassword(password,'user');
 for(const type of ['user','merchant']){const previous={...row(type),password_record},queries=[];let promoted=false;const client={query:async(sql)=>{queries.push(sql);return {rows:[],rowCount:1};}},service={repository:{lockedAccount:async()=>previous,attempt:async()=>true,promote:async(c,n,d,v,at)=>{promoted=true;assert.equal(at,previous.mfa_at);}},mfa:{fresh(){throw Error('Repeated MFA requested');},validate(){},revokeEpoch:async()=>({...previous,security_version:3})}};
  const result=await change(service,client,previous,{password,newPassword:password+'new'},'password','session');assert.equal(result.stage,'authenticated');assert.ok(promoted);assert.ok(queries.some(s=>s.startsWith('UPDATE wpay_auth.credentials')));
  promoted=false;queries.length=0;assert.equal((await change(service,client,previous,{password:'Incorrect-fixture-password',newPassword:password+'new'},'password','session')).failure,'AUTH_FAILED');assert.equal(promoted,false);assert.equal(queries.length,0);
 }
});
