'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
test('admin password login and credential rotation on isolated PostgreSQL',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable test PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname),'test database must be local');
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_password_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await require('../lib/wpay/db/migrations').migrate(pool);
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service');
 const service=new AuthService(new SecurityRepository(pool),{mfaCrypto:{open:()=>{throw Error('Password admin must not decrypt MFA');}}});
 const password='test admin password only',newPassword='replacement admin password';
 await service.bootstrap({name:'Test admin',email:'admin@example.invalid',password});
 const login=await service.login({email:'admin@example.invalid',password},'127.0.0.1','admin');assert.equal(login.stage,'authenticated');
 let session=login.sessionToken;assert.equal((await service.authenticated(session,'me')).email,'admin@example.invalid');
 const provenance=(await pool.query('SELECT auth_method,mfa_at,password_at FROM wpay_auth.sessions')).rows[0];
 assert.equal(provenance.auth_method,'password');assert.equal(provenance.mfa_at,null);assert.ok(provenance.password_at);
 await assert.rejects(service.authenticated(session,'security/admin-email',0,{password:'wrong password value',newEmail:'next@example.invalid'}),{code:'AUTH_FAILED'});
 assert.equal((await service.authenticated(session,'me')).email,'admin@example.invalid');
 const changed=await service.authenticated(session,'security/admin-email',0,{password,newEmail:'next@example.invalid'});
 await assert.rejects(service.authenticated(session,'me'),{code:'AUTH_FAILED'});session=changed.sessionToken;
 assert.equal((await service.authenticated(session,'me')).email,'next@example.invalid');
 const reset=await service.authenticated(session,'security/admin-password',0,{password,newPassword});
 await assert.rejects(service.authenticated(session,'me'),{code:'AUTH_FAILED'});
 await assert.rejects(service.login({email:'next@example.invalid',password},'127.0.0.1','admin'),{code:'AUTH_FAILED'});
 assert.equal((await service.login({email:'next@example.invalid',password:newPassword},'127.0.0.1','admin')).stage,'authenticated');
 assert.ok(reset.sessionToken);
});
