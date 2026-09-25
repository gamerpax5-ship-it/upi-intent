"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const adminUpi=require('../lib/wpay/business/admin-upi'),{BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger'),{migrate,transaction}=require('../lib/wpay/db/migrations');
const {Gateway}=require('../lib/wpay/gateway/core'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),{queue}=require('../lib/wpay/operations/utr-verification');
const grants=['bank_upi.view','bank_upi.approve','assignments.view','assignments.update','utr_center.view','utr_center.approve','statement_reconciliation.view','statement_reconciliation.upload'];
const ctx=id=>({principal:{id,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a'],platform:true}});
test('Manual UTR approval without evidence, automatic matching and financial idempotency on PostgreSQL',async t=>{
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
 const decision=(o,action='approve')=>({claimId:o.claimId,action,reason:'Admin independently reviewed this payment'});
 const approve=(o,who=actor,scope=context)=>tx(c=>review.prepare(c,who,scope,decision(o),crypto,gateway));
 const one=await add('manual-no-source','123456789211');
 assert.equal(gateway.verifier,null);
 await assert.rejects(approve(one,actor,{...context,grants:grants.filter(g=>g!=='utr_center.approve')}),{code:'FORBIDDEN'});
 await assert.rejects(approve(one,{...actor,account_type:'user'}),{code:'FORBIDDEN'});
 await assert.rejects(approve(one,actor,{...context,adminScope:{tenantIds:['other']}}),{code:'FORBIDDEN'});
 await assert.rejects(approve(one,{...actor,password_at:new Date(+now-600001)}),{code:'RECENT_MFA_REQUIRED'});
 const outcomes=await Promise.all([approve(one),approve(one)]);
 assert.ok(outcomes.every(r=>r.status==='successful'&&r.final));
 assert.equal(outcomes[0].bankVerified,false);
 assert.equal((await gateway.get(pool,ids.m1,one.id)).evidenceStatus,'admin_approved');
 assert.equal((await ledger.summary(pool,ids.m1)).gross,'100');
 assert.equal((await ledger.summary(pool,ids.m1)).fees,'2');
 assert.equal((await ledger.summary(pool,ids.user)).commission,'1');
 let financial=(await pool.query('SELECT * FROM wpay_auth.business_financial_events')).rows;
 assert.equal(financial.length,1);assert.equal(financial[0].source,'admin_manual');assert.ok(financial[0].utr_digest);
 const callbacks=(await pool.query('SELECT body FROM wpay_auth.gateway_outbox WHERE order_id=$1',[one.id])).rows;
 assert.equal(callbacks.length,1);const payload=typeof callbacks[0].body==='string'?JSON.parse(callbacks[0].body):callbacks[0].body;
 assert.equal(payload.bankVerified,false);assert.equal(payload.approvalMethod,'admin_manual');assert.equal(payload.status,'successful');
 assert.equal((await pool.query("SELECT count(*)::int n FROM wpay_auth.business_audit WHERE event='admin_utr_approved'")).rows[0].n,1);
 assert.equal((await review.list(pool,actor,context,{},crypto)).records.length,0);
 const duplicate=await add('duplicate-receipt',one.utr);
 await assert.rejects(approve(duplicate),{code:'CONFLICT'});
 assert.equal((await ledger.summary(pool,ids.m1)).gross,'100');
 const rejected=await add('closed-rejection','123456789212');
 await tx(c=>review.prepare(c,actor,context,decision(rejected,'reject'),crypto,gateway));
 await assert.rejects(approve(rejected),{code:'CONFLICT'});
 const late=await add('late-manual','123456789213');
 await pool.query("UPDATE wpay_auth.gateway_orders SET created_at=CURRENT_TIMESTAMP-interval '1 minute',expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[late.id]);
 await pool.query("UPDATE wpay_auth.business_reservations SET created_at=CURRENT_TIMESTAMP-interval '1 minute',expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=(SELECT reservation_id FROM wpay_auth.gateway_orders WHERE id=$1)",[late.id]);
 await tx(c=>gateway.expire(c));
 assert.equal((await gateway.get(pool,ids.m1,late.id)).status,'failed');
 await approve(late);assert.equal((await ledger.summary(pool,ids.user)).commission,'1');
 // Existing automatic worker settles authenticated matching evidence without
 // any admin action, and removes every claim for the resulting paid order.
 const sms=await add('auto-sms','123456789214'),statement=await add('auto-statement','123456789215');
 await tx(c=>gateway.customer(c,sms.paymentUrl.split('/').at(-1),'123456789999'));
 const proof=s=>({...s,status:'confirmed',verified:true,final:true,synthetic:true,source:s.orderId===statement.id?'statement':'normal',utr:s.claims[0],evidenceId:'receipt-'+s.orderId,economicId:'bank-'+s.orderId,receivedAt:new Date().toISOString()});
 gateway.verifier=async s=>[sms.id,statement.id].includes(s.orderId)?proof(s):null;
 await gateway.tick();await gateway.tick();
 assert.equal((await gateway.get(pool,ids.m1,sms.id)).status,'successful');
 assert.equal((await gateway.get(pool,ids.m1,statement.id)).status,'successful');
 assert.deepEqual((await review.list(pool,actor,context,{},crypto)).records.map(r=>r.orderId),[duplicate.id]);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,4);
 // A source response already in flight must not double-post after manual approval.
 const racing=await add('racing-approval','123456789216');let start,release;const started=new Promise(r=>start=r);
 gateway.verifier=s=>new Promise(r=>{release=()=>r(proof(s));start();});
 const inflight=gateway.verifyOrder(racing.id);await started;await approve(racing);release();
 assert.equal((await inflight).alreadyAccounted,true);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events WHERE reservation_id=(SELECT reservation_id FROM wpay_auth.gateway_orders WHERE id=$1)',[racing.id])).rows[0].n,1);
});
