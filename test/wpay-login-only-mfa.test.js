'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {change}=require('../lib/wpay/auth/runtime/optional-mfa'),{hashPassword}=require('../lib/wpay/auth/runtime/passwords');
test('All optional-MFA roles manage factors with password only; wrong passwords and employees are rejected',async()=>{
 const password='Synthetic-login-only-2026!',password_record=await hashPassword(password,'user');
 for(const account_type of ['user','merchant','admin','super_admin'])for(const action of ['disable','replace','regenerate']){
  const now=new Date(),row={id:randomUUID(),account_type,status:'active',approval_status:'approved',mfa_enabled:true,auth_method:'mfa',mfa_at:new Date(+now-600000),database_now:now,security_version:1,session_security_version:1,factor_version:1,session_factor_version:1,password_record},writes=[];
  const client={query:async(sql,args)=>{writes.push(sql);return {rows:[],rowCount:1};}},service={repository:{lockedAccount:async()=>row,attempt:async()=>true,snapshot:async()=>row,replaceRecovery:async(c,n,codes)=>{assert.equal(codes.length,10);writes.push('replaceRecovery');},promote:async(c,n,d,v,at)=>{assert.equal(at,row.mfa_at);writes.push('promote');}},mfa:{validate(){},fresh(){throw Error('MFA must not run');},revokeEpoch:async(c,r)=>{writes.push('revoke');return {...r,security_version:2};},newChallenge:async(c,r,purpose)=>({stage:purpose})},crypto:{verify(){throw Error('MFA must not run');}}};
  assert.equal((await change(service,client,row,{password:'wrong-password'},action,'session')).failure,'AUTH_FAILED');assert.equal(writes.length,0);
  const result=await change(service,client,row,{password},action,'session');assert.ok(writes.includes('revoke'));assert.equal(result.stage,action==='replace'?'replace':action==='regenerate'?'recovery-codes':'authenticated');
  await assert.rejects(change(service,client,{...row,account_type:'employee'},{password},action,'session'),{code:'FORBIDDEN'});
 }
});
test('PostgreSQL login-only MFA lifecycle preserves login challenge and revokes replaced sessions',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='login_only_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await require('../lib/wpay/db/migrations').migrate(pool);
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),crypto=new MfaCrypto(randomBytes(32)),service=new AuthService(new SecurityRepository(pool),{mfaCrypto:crypto}),password='Synthetic-login-only-2026!';
 for(const role of ['user','merchant']){
  const email=role+'@login-only.invalid';await service.register({accountType:role,name:'Fixture',email,password},'127.0.0.1',role);await pool.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=(SELECT id FROM wpay_auth.accounts WHERE email=$1)",[email]);
  const login=await service.login({email,password},'127.0.0.1',role),start=await service.authenticated(login.sessionToken,'security/enable',0,{password});
  const complete=async challenge=>{const setup=await service.mfa.challenge(challenge.challengeToken,'setup',{},role),code=await crypto.libraries().otp.generate({secret:setup.setupKey}),checked=await service.mfa.challenge(challenge.challengeToken,'verify',{code},role);return service.mfa.challenge(checked.challengeToken,'complete',{saved:true},role);};
  const enabled=await complete(start);assert.equal((await service.login({email,password},'127.0.0.1',role)).stage,'challenge');
  const regenerated=await service.authenticated(enabled.sessionToken,'security/regenerate',0,{password});assert.equal(regenerated.recoveryCodes.length,10);await assert.rejects(service.authenticated(enabled.sessionToken,'me'),{code:'AUTH_FAILED'});
  const replacement=await service.authenticated(regenerated.sessionToken,'security/replace',0,{password}),replaced=await complete(replacement);assert.equal((await service.authenticated(replaced.sessionToken,'security')).enabled,true);
  await assert.rejects(service.authenticated(replaced.sessionToken,'security/disable',0,{password:'wrong-password'}),{code:'AUTH_FAILED'});
  const disabled=await service.authenticated(replaced.sessionToken,'security/disable',0,{password});assert.equal((await service.authenticated(disabled.sessionToken,'security')).enabled,false);await assert.rejects(service.authenticated(replaced.sessionToken,'me'),{code:'AUTH_FAILED'});assert.equal((await service.login({email,password},'127.0.0.1',role)).stage,'authenticated');
 }
});
