'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {passwordAssurance,sessionAssurance,recentAuthenticationAt}=require('../lib/wpay/auth/runtime/session-assurance');
const {begin,change,issue}=require('../lib/wpay/auth/runtime/admin-account');
const {hashPassword}=require('../lib/wpay/auth/runtime/passwords');
const now=new Date('2026-09-22T12:00:00Z');
const row={id:'test',account_type:'admin',status:'active',auth_method:'password',mfa_at:null,password_at:now,created_at:now,database_now:now,security_version:1,session_security_version:1,factor_version:0,session_factor_version:0};
test('password assurance only authorizes active admin roles with valid provenance',()=>{
 for(const role of ['admin','super_admin'])assert.equal(passwordAssurance({...row,account_type:role}),true);
 for(const role of ['user','merchant','employee'])assert.equal(sessionAssurance({...row,account_type:role}),false);
 for(const patch of [{status:'disabled'},{password_at:null},{password_at:new Date(+now+1)},{password_at:new Date(+now-1)},{session_security_version:2},{session_factor_version:1},{mfa_at:now},{auth_method:'mfa'}])assert.equal(passwordAssurance({...row,...patch}),false);
 assert.equal(recentAuthenticationAt(row),now);
});
test('nonadmin sessions still require MFA',()=>{
 const mfa={...row,account_type:'employee',auth_method:'mfa',mfa_enabled:true,mfa_at:now,factor_version:1,session_factor_version:1};
 assert.equal(sessionAssurance(mfa),true);assert.equal(sessionAssurance({...mfa,mfa_enabled:false}),false);
});
test('nonadmin cannot call admin account changes or session issuer',async()=>{
 await assert.rejects(change({},null,{...row,account_type:'user'},{},'email'),{code:'FORBIDDEN'});
 await assert.rejects(issue({},null,{...row,account_type:'employee'}),{code:'AUTH_FAILED'});
});
test('invalid current password and throttling cannot mutate credentials',async()=>{
 const password_record=await hashPassword('valid current password');let calls=0;
 const service={repository:{lockedAccount:async()=>({...row,password_record}),attempt:async()=>true}};
 const client={query:async()=>{calls++;throw Error('unexpected write');}};
 assert.deepEqual(await change(service,client,row,{password:'incorrect password',newEmail:'new@example.com'},'email'),{failure:'AUTH_FAILED'});
 service.repository.attempt=async()=>false;
 assert.deepEqual(await change(service,client,row,{password:'valid current password',newEmail:'new@example.com'},'email'),{failure:'RATE_LIMITED'});
 assert.equal(calls,0);
});
test('issuer records password provenance, validates snapshot and audits without MFA claim',async()=>{
 const queries=[];let validated=false;
 const service={repository:{snapshot:async()=>row},mfa:{validate:r=>{assert.equal(passwordAssurance(r),true);validated=true;}}};
 const result=await issue(service,{query:async(sql,args)=>queries.push({sql,args})},row);
 assert.equal(result.stage,'authenticated');assert.ok(result.sessionToken);assert.ok(validated);
 assert.match(queries[0].sql,/auth_method,password_at/);assert.doesNotMatch(queries[0].sql,/mfa_at/);
 assert.equal(queries[1].args[3],'admin_password_session_issued');
});
test('admin password login skips MFA and refuses a mismatched portal',async()=>{
 const {AuthService}=require('../lib/wpay/auth/runtime/service');
 const password_record=await hashPassword('valid current password');
 const account={...row,password_record};let began=0;
 const service={repository:{throttle:async()=>{},credential:async()=>account,startAdminSession:async(id,record,fn)=>{began++;return fn({query:async()=>({})},account);},snapshot:async()=>row},mfa:{validate:()=>{},begin:()=>{throw Error('MFA must not run');}}};
 assert.equal((await AuthService.prototype.login.call(service,{email:'admin@example.com',password:'valid current password'},'local','admin')).stage,'authenticated');
 await assert.rejects(AuthService.prototype.login.call(service,{email:'admin@example.com',password:'valid current password'},'local','user'),{code:'AUTH_FAILED'});
 assert.equal(began,1);
});
test('email change verifies password, rotates epoch and issues replacement session',async()=>{
 const {MfaService}=require('../lib/wpay/auth/runtime/mfa-service');
 const password_record=await hashPassword('valid current password'),queries=[];
 const current={...row,email:'old@example.com',session_epoch:2,password_record};
 const client={query:async(sql,args)=>{queries.push({sql,args});return {rowCount:0,rows:[]};}};
 const service={repository:{lockedAccount:async()=>current,attempt:async()=>true,snapshot:async()=>row},mfa:{revokeEpoch:MfaService.prototype.revokeEpoch,validate:()=>{}}};
 const result=await change(service,client,row,{password:'valid current password',newEmail:'NEW@example.com'},'email');
 assert.equal(result.stage,'authenticated');
 assert.equal(queries.find(q=>q.sql.includes('SET email=')).args[1],'new@example.com');
 assert.equal(queries.find(q=>q.sql.includes('SET session_epoch=')).args[1],3);
 assert.equal(queries.find(q=>q.sql.includes('SET security_version=')).args[1],2);
 assert.equal(queries.find(q=>q.sql.includes('INSERT INTO wpay_auth.sessions')).args[3],3);
 assert.ok(!JSON.stringify(queries).includes('valid current password'));
});
