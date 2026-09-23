'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const adminUpi=require('../lib/wpay/business/admin-upi'),{BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger'),{migrate,transaction}=require('../lib/wpay/db/migrations');
const grants=['bank_upi.view','bank_upi.approve','assignments.view','assignments.update'];
const ctx=id=>({principal:{id,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a'],platform:true}});
test('Admin UPI endpoints reject customer/employee roles before querying',async()=>{
 for(const account_type of ['user','merchant','employee'])await assert.rejects(adminUpi.run({}, {query(){throw Error('unexpected query');}}, {account_type}, {}, 'business/admin-upi',{}),e=>e.code==='FORBIDDEN');
});
test('Admin many-to-many UPI routes keep owner capacity and bank limits shared',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_upi_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});await migrate(pool);
 const ids={};
 await transaction(pool,async c=>{
  for(const [key,type,tenant]of [['admin','super_admin','tenant-a'],['user','user','tenant-a'],['m1','merchant','tenant-a'],['m2','merchant','tenant-a'],['foreign','merchant','tenant-b']]){
   const id=ids[key]=randomUUID();await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8)",[id,randomUUID(),tenant,key,key+'@test.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
   await c.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied) VALUES($1,'approved',true)",[id]);
   await c.query("INSERT INTO wpay_auth.account_security(account_id,enabled,factor_version,encrypted_secret) VALUES($1,true,1,'{}')",[id]);
  }
  await c.query('UPDATE wpay_auth.bank_onboarding_policy SET statement_required=false');
  for(const key of ['user','m1','m2'])await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[key],key==='user'?{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107',depositNetwork:'TRON-TRC20',depositAddress:'synthetic'}:{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'},ids.admin]);
  await ledger.post(c,{key:'test-capacity',referenceType:'test',referenceId:'seed',actorId:ids.admin,entries:ledger.pair(ids.user,'capacity_allocated','15000')});
 });
 const core=new BusinessCore(),context=ctx(ids.admin),call=(op,b,contextOverride=context)=>transaction(pool,async c=>{const now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;return adminUpi.run(core,c,{id:ids.admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,mfa_at:null,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0},contextOverride,op,b);});
 const details={upiId:'admin.collection@bank',bankName:'Test Bank',holderName:'Test Holder',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'10000',accountType:'business',providerName:'',notes:''};
 let bank,bank2,route1,route2;
 const create={ownerId:ids.user,details,reason:'Owner reviewed by admin',requestId:randomUUID()};
 await t.test('Admin approval is durable/idempotent and never fabricates payment verification',async()=>{
  bank=await call('business/admin-upi/create',create);assert.equal((await call('business/admin-upi/create',create)).id,bank.id);
  const row=(await pool.query('SELECT * FROM wpay_auth.business_bank_accounts WHERE id=$1',[bank.id])).rows[0];assert.equal(row.status,'running');assert.equal(row.approved_version,1);assert.equal(row.verified_version,null);
  assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
  await assert.rejects(call('business/admin-upi/create',{...create,details:{...details,upiId:'changed@bank'}}),e=>e.code==='CONFLICT');
 });
 const route=(bank,merchantId,extra={})=>({id:null,bankId:bank.id,version:bank.version,merchantId,priority:10,minMinor:'100',maxMinor:'10000',enabled:true,reason:'Merchant route approved',...extra});
 await t.test('one UPI maps to two merchants; one merchant maps to two UPIs',async()=>{
  route1=await call('business/admin-upi/route',route(bank,ids.m1));route2=await call('business/admin-upi/route',route(bank,ids.m2));
  bank2=await call('business/admin-upi/create',{...create,requestId:randomUUID(),details:{...details,upiId:'second@bank',accountNumber:'123456780002'}});
  await call('business/admin-upi/route',route(bank2,ids.m1,{priority:20}));
  const listing=await call('business/admin-upi',{search:'admin.collection'});assert.equal(listing.banks.length,1);assert.equal(listing.routes.length,2);assert.equal(listing.accounts.some(a=>a.id===ids.foreign),false);
  await assert.rejects(call('business/admin-upi/route',route(bank,ids.m1)),e=>e.code==='CONFLICT');
  await assert.rejects(call('business/admin-upi/route',route(bank,ids.foreign)),e=>e.code==='FORBIDDEN');
 });
 await t.test('route disable and re-enable preserve independent merchant bindings',async()=>{
  await call('business/admin-upi/route',route(bank,ids.m1,{id:route1.id,enabled:false}));
  assert.equal((await transaction(pool,c=>core.candidates(c,ids.m1))).find(r=>r.bankId===bank.id).assignmentActive,false);
  assert.equal((await transaction(pool,c=>core.candidates(c,ids.m2))).find(r=>r.bankId===bank.id).assignmentActive,true);
  await call('business/admin-upi/route',route(bank,ids.m1,{id:route1.id}));
 });
 await t.test('concurrent merchant reservations cannot double-spend shared UPI limit',async()=>{
  const reserve=(merchant,key)=>transaction(pool,c=>core.reserve(c,merchant,{orderReference:key,idempotencyKey:key,amountMinor:'6000'}));
  // Use m2 twice: it has only the first UPI, with a shared 10000-paise limit.
  const results=await Promise.allSettled([reserve(ids.m2,'shared-one'),reserve(ids.m2,'shared-two')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'NO_ROUTE');
  const m1=await transaction(pool,c=>core.candidates(c,ids.m1));assert.equal(m1.find(r=>r.bankId===bank.id).bankRemainingMinor,'4000');assert.equal(m1[0].availableMinor,'9000');
  const chosen=await reserve(ids.m1,'fallback-bank');const record=(await pool.query('SELECT bank_id FROM wpay_auth.business_reservations WHERE id=$1',[chosen.id])).rows[0];assert.equal(record.bank_id,bank2.id);assert.equal((await transaction(pool,c=>ledger.summary(c,ids.user))).available,'3000');
 });
 await t.test('global stop applies to every merchant, and identity edit invalidates Admin approval',async()=>{
  await call('business/admin-upi/state',{bankId:bank.id,version:1,action:'stop',reason:'Maintenance requested'});for(const m of [ids.m1,ids.m2])assert.equal((await transaction(pool,c=>core.candidates(c,m))).find(r=>r.bankId===bank.id).bankStatus,'stopped');
  await call('business/admin-upi/state',{bankId:bank.id,version:1,action:'start',reason:'Maintenance completed'});
  await transaction(pool,c=>core.saveBank(c,ids.user,{bankId:bank.id,version:1,details:{...details,upiId:'updated@bank'}}));
  assert.equal((await transaction(pool,c=>core.candidates(c,ids.m2))).find(r=>r.bankId===bank.id).bankAdminApproved,false);
  await assert.rejects(call('business/admin-upi/state',{bankId:bank.id,version:2,action:'start',reason:'Stale approval denied'}),e=>e.code==='CONFLICT');
 });
 await t.test('permission removal blocks mutations and owner scope blocks reads',async()=>{
  await assert.rejects(call('business/admin-upi/create',{...create,requestId:randomUUID()},{...context,grants:['bank_upi.view']}),e=>e.code==='FORBIDDEN');
  const listing=await call('business/admin-upi',{}, {...context,adminScope:{tenantIds:['tenant-b'],platform:true}});assert.equal(listing.banks.length,0);
 });
});
