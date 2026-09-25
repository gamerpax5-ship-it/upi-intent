"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const adminUpi=require('../lib/wpay/business/admin-upi'),{BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger'),{migrate,transaction}=require('../lib/wpay/db/migrations');
const {Gateway}=require('../lib/wpay/gateway/core'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),{queue}=require('../lib/wpay/operations/utr-verification');
const grants=['bank_upi.view','bank_upi.approve','assignments.view','assignments.update','utr_center.view','statement_reconciliation.view','statement_reconciliation.upload'];
const ctx=id=>({principal:{id,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a'],platform:true}});
test('Pending UTR review final results, source binding and concurrent rejection on real PostgreSQL',async t=>{
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

 const crypto=new MfaCrypto(randomBytes(32)),gateway=new Gateway({pool,crypto,allowSynthetic:true});gateway.core=core;
 await pool.query("INSERT INTO wpay_auth.grants(account_id,permissions,permission_version) VALUES($1,ARRAY['merchant.gateway.view','merchant.gateway.create'],1)",[ids.m1]);
 const tx=fn=>transaction(pool,fn),create=reference=>tx(c=>gateway.create(c,ids.m1,{reference,idempotencyKey:reference,amountMinor:'100',currency:'INR'},'manual','https://test.invalid'));

 const review=require('../lib/wpay/operations/utr-review');
 const now=new Date(),actor={id:ids.admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,mfa_at:null,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0};
 const add=async(ref,utr)=>{const order=await create(ref);await tx(c=>gateway.customer(c,order.paymentUrl.split('/').at(-1),utr));const claim=(await pool.query('SELECT id FROM wpay_auth.gateway_claims WHERE order_id=$1',[order.id])).rows[0];return {...order,claimId:claim.id,utr};};
 const one=await add('to-verify','123456789111'),two=await add('to-reject','123456789112');
 const decision=(o,action)=>({claimId:o.claimId,action,reason:'Admin reviewed payment receipt'});
 assert.equal((await review.list(pool,actor,context,{},crypto)).records.length,2);
 await assert.rejects(tx(c=>review.prepare(c,{...actor,account_type:'merchant'},context,decision(one,'verify'),crypto,gateway)),{code:'FORBIDDEN'});
 await assert.rejects(tx(c=>review.prepare(c,actor,{...context,adminScope:{tenantIds:['foreign']}},decision(one,'verify'),crypto,gateway)),{code:'FORBIDDEN'});
 const request=await tx(c=>review.prepare(c,actor,context,decision(one,'verify'),crypto,gateway));
 const missing=await gateway.verifyOrder(request.orderId,{expectedUtr:request.utr});
 assert.equal((await tx(c=>review.finish(c,actor,context,decision(one,'verify'),crypto,missing))).reviewStatus,'not_verified');
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
 const proof=s=>({...s,status:'confirmed',verified:true,final:true,synthetic:true,source:'normal',utr:s.claims[0],evidenceId:'receipt-'+s.orderId,economicId:'bank-'+s.orderId,receivedAt:new Date().toISOString()});
 gateway.verifier=async s=>({...proof(s),utr:'999999999999'});
 assert.equal((await gateway.verifyOrder(one.id,{expectedUtr:one.utr})).status,'not_verified');
 gateway.verifier=async s=>proof(s);
 const verified=await gateway.verifyOrder(one.id,{expectedUtr:one.utr});
 assert.equal((await tx(c=>review.finish(c,actor,context,decision(one,'verify'),crypto,verified))).reviewStatus,'verified');
 await gateway.verifyOrder(one.id,{expectedUtr:one.utr});
 let observed,release;const started=new Promise(r=>observed=r);
 gateway.verifier=s=>new Promise(r=>{release=()=>r(proof(s));observed();});
 const inFlight=gateway.verifyOrder(two.id,{expectedUtr:two.utr});await started;
 assert.equal((await tx(c=>review.prepare(c,actor,context,decision(two,'reject'),crypto,gateway))).reviewStatus,'rejected');
 release();assert.equal((await inFlight).status,'failed');
 assert.equal((await gateway.get(pool,ids.m1,two.id)).status,'failed');
 assert.equal((await review.list(pool,actor,context,{status:'pending'},crypto)).records.length,0);
 assert.equal((await review.list(pool,actor,context,{status:'verified'},crypto)).records.length,1);
 assert.equal((await review.list(pool,actor,context,{status:'rejected'},crypto)).records.length,1);
 await assert.rejects(tx(c=>review.prepare(c,actor,context,decision(two,'verify'),crypto,gateway)),{code:'CONFLICT'});
 await assert.rejects(tx(c=>queue(c,actor,context,{orderId:two.id,utr:two.utr,reason:'Retry old endpoint'},crypto)),{code:'CONFLICT'});
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,1);
});
