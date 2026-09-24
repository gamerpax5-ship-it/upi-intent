'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const adminUpi=require('../lib/wpay/business/admin-upi'),{BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger'),{migrate,transaction}=require('../lib/wpay/db/migrations');
const grants=['bank_upi.view','bank_upi.approve','assignments.view','assignments.update'];
const ctx=id=>({principal:{id,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a'],platform:true}});
test('Admin UPI endpoints reject customer/employee roles before querying',async()=>{
 for(const account_type of ['user','merchant','employee'])await assert.rejects(adminUpi.run({}, {query(){throw Error('unexpected query');}}, {account_type}, {}, 'business/admin-upi',{}),e=>e.code==='FORBIDDEN');
});
test('Admin-approved UPI routes do not require a user statement, while funding and limits remain enforced',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_upi_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});await migrate(pool);
 const ids={};
 await transaction(pool,async c=>{
  for(const [key,type,tenant]of [['admin','super_admin','tenant-a'],['user','user','tenant-a'],['m1','merchant','tenant-a'],['m2','merchant','tenant-a'],['m3','merchant','tenant-a'],['foreign','merchant','tenant-b']]){
   const id=ids[key]=randomUUID();await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8)",[id,randomUUID(),tenant,key,key+'@test.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
   await c.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied) VALUES($1,'approved',true)",[id]);
   await c.query("INSERT INTO wpay_auth.account_security(account_id,enabled,factor_version,encrypted_secret) VALUES($1,false,1,'{}')",[id]);
  }
  await c.query('UPDATE wpay_auth.bank_onboarding_policy SET statement_required=true');
  for(const key of ['user','m1','m2'])await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[key],key==='user'?{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107',depositNetwork:'TRON-TRC20',depositAddress:'synthetic'}:{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'},ids.admin]);
  await ledger.post(c,{key:'test-capacity',referenceType:'test',referenceId:'seed',actorId:ids.admin,entries:ledger.pair(ids.user,'capacity_allocated','15000')});
 });
 const core=new BusinessCore(),context=ctx(ids.admin),call=(op,b,contextOverride=context)=>transaction(pool,async c=>{const now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;return adminUpi.run(core,c,{id:ids.admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,mfa_at:null,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0},contextOverride,op,b);});
 const details={upiId:'admin.collection@bank',bankName:'Test Bank',holderName:'Test Holder',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'10000',accountType:'business',providerName:'',notes:''};

 const bank=await call('business/admin-upi/create',{ownerId:ids.user,details,reason:'Admin checked bank details',requestId:randomUUID()});
 const route=await call('business/admin-upi/route',{id:null,bankId:bank.id,version:1,merchantId:ids.m1,priority:10,minMinor:'100',maxMinor:'10000',enabled:true,reason:'Assign approved UPI'});
 const candidates=()=>transaction(pool,c=>core.candidates(c,ids.m1)),eligibility=require('../lib/wpay/business/routing').eligibility;
 const decision=async(amount='100')=>{const c=(await candidates())[0];return eligibility(c,amount,c.databaseNow);};
 await t.test('with statement policy on, current Admin-approved UPI can generate a reservation without a statement',async()=>{
  assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.bank_statement_imports')).rows[0].n,0);
  assert.equal((await decision()).eligible,true);
  const reserved=await transaction(pool,c=>core.reserve(c,ids.m1,{orderReference:'admin-no-statement',idempotencyKey:'admin-no-statement',amountMinor:'100'}));assert.ok(reserved.id);
  const listing=await call('business/admin-upi',{});assert.equal(listing.routes.find(r=>r.id===route.id).readiness.eligible,true);
 });
 await t.test('assignment does not bypass balance, deposit, stopped UPI or ticket limits',async()=>{
  assert.ok((await decision('10001')).reasons.includes('ticket_limit'));
  await pool.query('UPDATE wpay_auth.eligibility SET initial_deposit_satisfied=false WHERE account_id=$1',[ids.user]);assert.ok((await decision()).reasons.includes('funding_required'));
  await pool.query('UPDATE wpay_auth.eligibility SET initial_deposit_satisfied=true WHERE account_id=$1',[ids.user]);
  await transaction(pool,c=>ledger.post(c,{key:'test-withdraw-capacity',referenceType:'test',referenceId:'held',entries:ledger.pair(ids.user,'capacity_hold','15000')}));assert.ok((await decision()).reasons.includes('capacity_insufficient'));
  await transaction(pool,c=>ledger.post(c,{key:'test-release-capacity',referenceType:'test',referenceId:'release',entries:ledger.pair(ids.user,'capacity_hold','15000','INR','debit')}));
  await call('business/admin-upi/state',{bankId:bank.id,version:1,action:'stop',reason:'Pause collections'});assert.ok((await decision()).reasons.includes('bank_unavailable'));
  await call('business/admin-upi/state',{bankId:bank.id,version:1,action:'start',reason:'Resume collections'});assert.equal((await decision()).eligible,true);
 });
 await t.test('editing identity removes statement exemption; ordinary user banks retain statement requirement',async()=>{
  await transaction(pool,c=>core.saveBank(c,ids.user,{bankId:bank.id,version:1,details:{...details,upiId:'edited@bank'}}));
  // Fixture represents completed payment verification of the new bank version, but no accepted statement.
  await pool.query("UPDATE wpay_auth.business_bank_accounts SET status='running',approved_version=version,verified_version=version WHERE id=$1",[bank.id]);
  await require('../lib/wpay/onboarding/state').refresh(pool,ids.user);
  const c=(await candidates())[0];assert.equal(c.bankAdminApproved,false);assert.equal(c.bankVerified,true);assert.ok((await decision()).reasons.includes('statement_required'));
  await assert.rejects(transaction(pool,c=>core.reserve(c,ids.m1,{orderReference:'must-block',idempotencyKey:'must-block',amountMinor:'100'})),e=>e.code==='NO_ROUTE');
 });
});
