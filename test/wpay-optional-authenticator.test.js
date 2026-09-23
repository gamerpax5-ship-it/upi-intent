'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {passwordAssurance}=require('../lib/wpay/auth/runtime/session-assurance');
test('password assurance accepts only opted-out customers and preserves privileged checks',()=>{
 const now=new Date(),row={account_type:'user',mfa_enabled:false,auth_method:'password',mfa_at:null,password_at:now,created_at:now,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0};
 assert.equal(passwordAssurance(row),true);assert.equal(passwordAssurance({...row,account_type:'merchant'}),true);
 for(const patch of [{mfa_enabled:true},{account_type:'employee'},{approval_status:'pending'},{session_security_version:0},{password_at:new Date(+now+1000)},{mfa_enabled:undefined}])assert.equal(passwordAssurance({...row,...patch}),false);
});
test('optional authenticator lifecycle and upgrade on disposable PostgreSQL',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='optional_mfa_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 const {migrate}=require('../lib/wpay/db/migrations');await migrate(pool,{through:20});
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
 const crypto=new MfaCrypto(randomBytes(32)),repo=new SecurityRepository(pool),service=new AuthService(repo,{mfaCrypto:crypto}),password='Test-customer-password-2026';
 for(const type of ['user','merchant']){await service.register({accountType:type,name:type,email:type+'@optional.invalid',password},'127.0.0.1',type);await pool.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=(SELECT id FROM wpay_auth.accounts WHERE email=$1)",[type+'@optional.invalid']);}
 const user=await repo.credential('user@optional.invalid');
 await pool.query("UPDATE wpay_auth.account_security SET enabled=true,factor_version=1,encrypted_secret='{}' WHERE account_id=$1",[user.id]);
 const merchant=await repo.credential('merchant@optional.invalid'),keys=[randomUUID(),randomUUID(),randomUUID()];
 for(let i=0;i<keys.length;i++)await pool.query("INSERT INTO wpay_auth.gateway_keys(id,merchant_id,prefix,digest,label,scopes,security_version,factor_version,revoked_at) VALUES($1,$2,'test',$3,'synthetic',ARRAY['orders:read'],$4,0,$5)",[keys[i],merchant.id,keys[i],i===2?0:1,i===1?new Date():null]);
 await migrate(pool);assert.equal((await repo.credential('user@optional.invalid')).mfa_enabled,false);
 const versions=(await pool.query('SELECT id,security_version FROM wpay_auth.gateway_keys WHERE merchant_id=$1',[merchant.id])).rows;
 assert.equal(versions.find(k=>k.id===keys[0]).security_version,2);
 assert.equal(versions.find(k=>k.id===keys[1]).security_version,1);
 assert.equal(versions.find(k=>k.id===keys[2]).security_version,0);
 for(const type of ['user','merchant'])await t.test(type+' password login, password change and optional enrollment',async()=>{
  const email=type+'@optional.invalid',login=await service.login({email,password},'127.0.0.1',type);assert.equal(login.stage,'authenticated');
  assert.equal((await service.authenticated(login.sessionToken,'security')).enabled,false);
  await assert.rejects(service.login({email,password},'127.0.0.1',type==='user'?'merchant':'user'),{code:'AUTH_FAILED'});
  const changed=await service.authenticated(login.sessionToken,'security/password',0,{password,newPassword:password+' changed'});
  await assert.rejects(service.authenticated(login.sessionToken,'me'),{code:'AUTH_FAILED'});
  await assert.rejects(service.authenticated(changed.sessionToken,'security/enable',0,{password:'incorrect-password'}),{code:'AUTH_FAILED'});
  const setup=await service.authenticated(changed.sessionToken,'security/enable',0,{password:password+' changed'});assert.equal(setup.stage,'enroll');
  const q=await service.mfa.challenge(setup.challengeToken,'setup',{},type),code=await crypto.libraries().otp.generate({secret:q.setupKey});
  const checked=await service.mfa.challenge(setup.challengeToken,'verify',{code},type),enabled=await service.mfa.challenge(checked.challengeToken,'complete',{saved:true},type);
  assert.equal((await service.authenticated(enabled.sessionToken,'security')).enabled,true);
  assert.equal((await service.login({email,password:password+' changed'},'127.0.0.1',type)).stage,'challenge');
  await assert.rejects(service.authenticated(enabled.sessionToken,'security/disable',0,{password:password+' changed',code:'invalid'}),{code:'MFA_FAILED'});
  // Wait for the next real TOTP step: never weaken replay protection for the test.
  await new Promise(r=>setTimeout(r,31000-Date.now()%30000));
  const fresh=await crypto.libraries().otp.generate({secret:q.setupKey}),disabled=await service.authenticated(enabled.sessionToken,'security/disable',0,{password:password+' changed',code:fresh});
  assert.equal((await service.authenticated(disabled.sessionToken,'security')).enabled,false);
  await assert.rejects(service.authenticated(enabled.sessionToken,'me'),{code:'AUTH_FAILED'});
  assert.equal((await service.login({email,password:password+' changed'},'127.0.0.1',type)).stage,'authenticated');
 });
});
