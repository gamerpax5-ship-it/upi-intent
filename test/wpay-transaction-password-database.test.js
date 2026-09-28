'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {requireTransactionPassword}=require('../lib/wpay/auth/runtime/transaction-password');
const {digest}=require('../lib/wpay/auth/runtime/tokens');
test('transaction password confirmation preserves real PostgreSQL MFA session provenance and isolation',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='transaction_password_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 const {migrate,validateMigrations}=require('../lib/wpay/db/migrations');await migrate(pool);await validateMigrations(pool);
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
 const crypto=new MfaCrypto(randomBytes(32)),repo=new SecurityRepository(pool),service=new AuthService(repo,{mfaCrypto:crypto}),password='Synthetic-transaction-password-2026!';
 for(const type of ['user','merchant','admin'])await t.test(type,async()=>{
  const email=type+'@transaction.invalid';if(type==='admin')await service.bootstrap({name:type,email,password});else await service.register({accountType:type,name:type,email,password},'127.0.0.1',type);
  await pool.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=(SELECT id FROM wpay_auth.accounts WHERE email=$1)",[email]);
  const login=await service.login({email,password},'127.0.0.1',type);
  await repo.withSession(digest(login.sessionToken),async(c,row)=>assert.doesNotThrow(()=>requireTransactionPassword(row)));
  const setup=await service.authenticated(login.sessionToken,'security/enable',0,{password}),q=await service.mfa.challenge(setup.challengeToken,'setup',{},type);
  const code=await crypto.libraries().otp.generate({secret:q.setupKey}),istCode=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(':',''),checked=await service.mfa.challenge(setup.challengeToken,'verify',type==='admin'?{code,istCode}:{code},type),enabled=await service.mfa.challenge(checked.challengeToken,'complete',{saved:true},type);
  const tokenDigest=digest(enabled.sessionToken),read=async()=> (await pool.query('SELECT * FROM wpay_auth.sessions WHERE token_digest=$1',[tokenDigest])).rows[0],before=await read();
  assert.equal(before.auth_method,'mfa');assert.equal(before.password_at,null);assert.equal(before.transaction_password_at,null);
  await repo.withSession(tokenDigest,async(c,row)=>assert.throws(()=>requireTransactionPassword(row),{code:'RECENT_PASSWORD_REQUIRED'}));
  await assert.rejects(service.authenticated(enabled.sessionToken,'security/stepup',0,{password:'Incorrect synthetic password'}),{code:'AUTH_FAILED'});
  assert.equal((await read()).transaction_password_at,null);
  assert.equal((await service.authenticated(enabled.sessionToken,'security/stepup',0,{password})).ok,true);
  const after=await read();assert.ok(after.transaction_password_at);assert.equal(after.password_at,null);assert.equal(after.auth_method,'mfa');assert.deepEqual(after.mfa_at,before.mfa_at);
  await repo.withSession(tokenDigest,async(c,row)=>assert.doesNotThrow(()=>requireTransactionPassword(row)));
  assert.equal((await service.authenticated(enabled.sessionToken,'security')).enabled,true);
  assert.equal((await service.login({email,password},'127.0.0.1',type)).stage,'challenge');
  assert.equal((await pool.query('SELECT transaction_password_at FROM wpay_auth.sessions WHERE token_digest=$1',[digest(login.sessionToken)])).rows[0].transaction_password_at,null);
  await pool.query('UPDATE wpay_auth.sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_digest=$1',[tokenDigest]);
  await assert.rejects(service.authenticated(enabled.sessionToken,'security/stepup',0,{password}),{code:'AUTH_FAILED'});
 });
});
