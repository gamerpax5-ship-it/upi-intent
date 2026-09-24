'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const adminUpi=require('../lib/wpay/business/admin-upi'),{BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger'),{migrate,transaction}=require('../lib/wpay/db/migrations');
const grants=['bank_upi.view','bank_upi.approve','assignments.view','assignments.update'];
const ctx=id=>({principal:{id,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a'],platform:true}});
test('Admin UPI endpoints reject customer/employee roles before querying',async()=>{
 for(const account_type of ['user','merchant','employee'])await assert.rejects(adminUpi.run({}, {query(){throw Error('unexpected query');}}, {account_type}, {}, 'business/admin-upi',{}),e=>e.code==='FORBIDDEN');
});
test('Admin-managed real collections can reserve without collateral and still account for actual receipts',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_upi_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});await migrate(pool);
 const ids={};
 await transaction(pool,async c=>{
  for(const [key,type,tenant]of [['admin','super_admin','tenant-a'],['user','user','tenant-a'],['m1','merchant','tenant-a'],['m2','merchant','tenant-a'],['m3','merchant','tenant-a'],['foreign','merchant','tenant-b']]){
   const id=ids[key]=randomUUID();await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8)",[id,randomUUID(),tenant,key,key+'@test.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
   await c.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied) VALUES($1,'approved',false)",[id]);
   await c.query("INSERT INTO wpay_auth.account_security(account_id,enabled,factor_version,encrypted_secret) VALUES($1,false,1,'{}')",[id]);
  }
  await c.query('UPDATE wpay_auth.bank_onboarding_policy SET statement_required=true');
  for(const key of ['user','m1','m2'])await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[key],key==='user'?{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107',depositNetwork:'TRON-TRC20',depositAddress:'synthetic'}:{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'},ids.admin]);
  await c.query('INSERT INTO wpay_auth.business_routing_requirements(owner_id,device_required,device_eligible) VALUES($1,true,false)',[ids.user]);
 });
 const core=new BusinessCore({adminManagedCollections:true}),context=ctx(ids.admin),call=(op,b,contextOverride=context)=>transaction(pool,async c=>{const now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;return adminUpi.run(core,c,{id:ids.admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,mfa_at:null,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0},contextOverride,op,b);});
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

 await t.test('zero funding and missing device do not block the explicitly Admin-managed route',async()=>{
  const c=(await candidates())[0];assert.equal(c.funded,false);assert.equal(c.availableMinor,'0');assert.equal(c.deviceEligible,false);assert.equal((await decision()).eligible,true);
  assert.equal((await ledger.summary(pool,ids.m1)).gross,'0');
  assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
  // Legacy/default configuration remains collateral-backed.
  const legacy=(await transaction(pool,c=>new BusinessCore({adminManagedCollections:false}).candidates(c,ids.m1)))[0];assert.ok(eligibility(legacy,'100',legacy.databaseNow).reasons.includes('funding_required'));
 });
 await t.test('verified payment records owner exposure and credits once, without inventing a deposit',async()=>{
  const r=(await pool.query("SELECT * FROM wpay_auth.business_reservations WHERE order_reference='admin-no-statement'")).rows[0];
  const proof={verified:true,kind:'payin',source:'normal',utr:'123456789012',economicId:'test-real-shape',evidenceId:'fixture-proof',reservationId:r.id,bankId:r.bank_id,bankVersion:r.bank_version,userId:r.user_id,merchantId:r.merchant_id,amountMinor:r.amount_minor,currency:'INR'};
  const accounting=new BusinessCore({verifyEvidence:async()=>proof}),input={reservationId:r.id,evidenceReference:'fixture-proof'};
  await transaction(pool,c=>accounting.confirmedPayin(c,input));await transaction(pool,c=>accounting.confirmedPayin(c,input));
  const balance=await ledger.summary(pool,ids.user);assert.equal(balance.allocated,'0');assert.equal(balance.consumed,'100');assert.equal(balance.deficit,'100');assert.equal((await ledger.summary(pool,ids.m1)).gross,'100');assert.equal((await decision()).eligible,true);
 });
 await t.test('limits, explicit stop, account status and bank-version approval still protect routes',async()=>{
  assert.ok((await decision('10001')).reasons.includes('ticket_limit'));
  await call('business/admin-upi/state',{bankId:bank.id,version:1,action:'stop',reason:'Pause collections'});assert.ok((await decision()).reasons.includes('bank_unavailable'));
  await call('business/admin-upi/state',{bankId:bank.id,version:1,action:'start',reason:'Resume collections'});
  await pool.query("UPDATE wpay_auth.accounts SET status='suspended' WHERE id=$1",[ids.user]);assert.ok((await decision()).reasons.includes('account_unavailable'));await pool.query("UPDATE wpay_auth.accounts SET status='active' WHERE id=$1",[ids.user]);
  await transaction(pool,c=>core.saveBank(c,ids.user,{bankId:bank.id,version:1,details:{...details,upiId:'edited@bank'}}));assert.ok((await decision()).reasons.includes('funding_required'));
 });
});
