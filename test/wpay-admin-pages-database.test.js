'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
test('Merchant route-count query excludes generic Merchant to User assignments',()=>{
 const fs=require('node:fs'),api=fs.readFileSync(require.resolve('../lib/wpay/panels/api.js'),'utf8');
 assert.ok(api.includes("x.bank_id IS NOT NULL"));
 assert.ok(api.includes("JOIN wpay_auth.business_bank_accounts b ON b.id=x.bank_id"));
});
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
 await t.test('Merchant Active routes counts only running bank-specific eligible UPI bindings',async()=>{
  const adminRow=(await pool.query("SELECT id,tenant_id FROM wpay_auth.accounts WHERE email='admin@example.invalid'")).rows[0],adminId=adminRow.id,tenantId=adminRow.tenant_id;
  const userId=randomUUID(),merchantId=randomUUID(),bankId=randomUUID(),bankRouteId=randomUUID();
  for(const [id,type,name,email] of [[userId,'user','Route User','route-user@example.invalid'],[merchantId,'merchant','Route Merchant','route-merchant@example.invalid']]){
   await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8)",[id,randomUUID(),tenantId,name,email,type,type==='user'?id:null,type==='merchant'?id:null]);
   await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied) VALUES($1,'approved',true)",[id]);
  }
  await pool.query("INSERT INTO wpay_auth.business_bank_accounts(id,owner_id,version,status,approved_version,verified_version) VALUES($1,$2,1,'stopped',1,1)",[bankId,userId]);
  await pool.query("INSERT INTO wpay_auth.business_bank_versions(bank_id,version,details,limit_minor,actor_id) VALUES($1,1,$2,'100000',$3)",[bankId,{upiId:'route@test',holderName:'Route User',bankName:'Test',accountNumber:'1234567890',ifsc:'TEST0000001',mobile:'+919000000000',providerName:'',notes:'',accountType:'business',bankLimitMinor:'100000'},adminId]);
  await pool.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,bank_id,status,priority,weight,min_minor,max_minor,created_by) VALUES($1,$2,$3,$4,'active',10,1,'100','10000',$5)",[bankRouteId,merchantId,userId,bankId,adminId]);
  let directory=await service.authenticated(login.sessionToken,'panel/directory',0,{type:'merchant',search:'Route Merchant'});
  assert.equal(directory.rows[0].routeCount,0,'stopped UPI must not count as an active route');
  await pool.query("UPDATE wpay_auth.business_bank_accounts SET status='running' WHERE id=$1",[bankId]);
  directory=await service.authenticated(login.sessionToken,'panel/directory',0,{type:'merchant',search:'Route Merchant'});
  assert.equal(directory.rows[0].routeCount,1,'running bank-specific UPI route counts once');
  await pool.query("UPDATE wpay_auth.business_assignments SET status='disabled' WHERE id=$1",[bankRouteId]);
  directory=await service.authenticated(login.sessionToken,'panel/directory',0,{type:'merchant',search:'Route Merchant'});
  assert.equal(directory.rows[0].routeCount,0,'disabled bank-specific route must not count');
 });
});
