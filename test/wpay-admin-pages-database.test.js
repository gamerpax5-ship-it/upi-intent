'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
test('Admin read pages execute against real isolated PostgreSQL',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable test PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname),'test database must be local');
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_pages_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await require('../lib/wpay/db/migrations').migrate(pool);
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service');
 const service=new AuthService(new SecurityRepository(pool),{mfaCrypto:{open:()=>{throw Error('Password admin must not decrypt MFA');}}});
 const password='test admin password only',newPassword='replacement admin password';
 await service.bootstrap({name:'Test admin',email:'admin@example.invalid',password});
 const login=await service.login({email:'admin@example.invalid',password},'127.0.0.1','admin');
 for(const [operation,body] of [
 ['panel/admin-overview',{days:30}],['panel/directory',{type:'user'}],['panel/directory',{type:'merchant'}],
 ['panel/reports',{}],['panel/settings',{}],['business/banks',{}],['business/assignments',{}],['business/routing',{}],['business/holds',{}],['panel/devices',{}],['panel/webhooks',{}],['panel/credentials',{}],['panel/api-logs',{}],['panel/support',{}],['panel/notifications',{}]
 ])await t.test(operation,async()=>{const result=await service.authenticated(login.sessionToken,operation,0,body);assert.ok(result);});
});
