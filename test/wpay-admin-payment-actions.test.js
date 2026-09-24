'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),http=require('node:http');
const {migrate,transaction}=require('../lib/wpay/db/migrations'),{Gateway}=require('../lib/wpay/gateway/core'),actions=require('../lib/wpay/gateway/admin-actions'),adminUpi=require('../lib/wpay/business/admin-upi'),ledger=require('../lib/wpay/business/ledger');
const grants=['bank_upi.view','bank_upi.approve','assignments.view','assignments.update','transactions.view','webhooks.view','payment_admin.approve','payment_admin.callback'];
const context=id=>({principal:{id,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a'],platform:true}});
test('manual payment actions reject customer and employee roles',async()=>{for(const account_type of ['user','merchant','employee'])await assert.rejects(actions.run({}, {query(){throw Error('unexpected query');}}, {account_type},{},'gateway/admin/approve',{}),e=>e.code==='FORBIDDEN');});
test('Admin manual payment and callback integration under runtime database role',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const {Pool}=require('pg'),root=new Pool({connectionString:url.toString()}),db='admin_actions_'+randomUUID().replaceAll('-','');
 await root.query("DO $$ BEGIN CREATE ROLE wpay_runtime NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");await root.query('CREATE DATABASE '+db);url.pathname='/'+db;const owner=new Pool({connectionString:url.toString()});await migrate(owner);
 const runtime=new Pool({connectionString:url.toString(),options:'-c role=wpay_runtime'});t.after(async()=>{await runtime.end();await owner.end();await root.query('DROP DATABASE '+db);await root.end();});
 const ids={};await transaction(owner,async c=>{
  for(const [name,type]of [['admin','super_admin'],['user','user'],['merchant','merchant']]){const id=ids[name]=randomUUID();await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,'tenant-a',$3,$4,$5,'active',$6,$7)",[id,randomUUID(),name,name+'@test.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);await c.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied,operations_enabled) VALUES($1,'approved',true,true)",[id]);await c.query('INSERT INTO wpay_auth.account_security(account_id,enabled) VALUES($1,false)',[id]);await c.query('INSERT INTO wpay_auth.grants(account_id,permissions,permission_version) VALUES($1,$2,1)',[id,type==='merchant'?['merchant.gateway.view','merchant.gateway.create','merchant.gateway.manage']:[]]);}
  await c.query('UPDATE wpay_auth.bank_onboarding_policy SET statement_required=false');
  for(const name of ['user','merchant'])await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[name],name==='user'?{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107',depositNetwork:'TRON-TRC20',depositAddress:'synthetic'}:{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'},ids.admin]);
  await ledger.post(c,{key:'seed',referenceType:'test',referenceId:'seed',entries:ledger.pair(ids.user,'capacity_allocated','100000')});
 });
 const received=[];let responseCode=503;const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({body,headers:req.headers});res.writeHead(responseCode);res.end('test');});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const gateway=new Gateway({pool:runtime,crypto:{seal:value=>({value}),open:value=>value.value},allowSynthetic:true,testCallback:'http://127.0.0.1:'+server.address().port+'/callback'}),ctx=context(ids.admin);
 const call=(op,b,override={})=>transaction(runtime,async c=>{const now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;const row={id:ids.admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,mfa_at:null,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0,...override.row};return op.startsWith('business/')?adminUpi.run(gateway.core,c,row,override.context||ctx,op,b):actions.run(gateway,c,row,override.context||ctx,op,b);});
 const details={upiId:'admin@bank',bankName:'Test Bank',holderName:'Test Holder',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'100000',accountType:'business',providerName:'',notes:''};
 const bank=await call('business/admin-upi/create',{ownerId:ids.user,details,reason:'Test admin approval',requestId:randomUUID()});assert.equal(bank.status,'running');
 await call('business/admin-upi/route',{id:null,bankId:bank.id,version:1,merchantId:ids.merchant,priority:1,minMinor:'100',maxMinor:'100000',enabled:true,reason:'Test assignment'});
 const endpoint=await transaction(runtime,c=>gateway.configure(c,ids.merchant,{url:gateway.testCallback}));
 const create=ref=>transaction(runtime,c=>gateway.create(c,ids.merchant,{reference:ref,idempotencyKey:ref,amountMinor:'10000',currency:'INR'},'manual','https://test.invalid'));
 const order=await create('manual-first'),payload={orderId:order.id,amountMinor:'10000',reason:'Receipt checked by admin',requestId:randomUUID()};
 await t.test('tenant, permission, recent authentication and amount checks',async()=>{
  await assert.rejects(call('gateway/admin/approve',payload,{context:{...ctx,adminScope:{tenantIds:['other'],platform:true}}}),e=>e.code==='FORBIDDEN');
  await assert.rejects(call('gateway/admin/approve',payload,{context:{...ctx,grants:['transactions.view']}}),e=>e.code==='FORBIDDEN');
  await assert.rejects(call('gateway/admin/approve',payload,{row:{password_at:new Date(0),created_at:new Date(0)}}),e=>e.code==='RECENT_MFA_REQUIRED');
  await assert.rejects(call('gateway/admin/approve',{...payload,amountMinor:'9999'}),e=>e.code==='CONFLICT');
  await assert.rejects(call('gateway/admin/callback',{orderId:order.id,reason:'Retry',requestId:randomUUID()}),e=>e.code==='CONFLICT');
 });
 await t.test('concurrent manual approvals credit once without fabricated UTR and retain fees',async()=>{
  const result=await Promise.all([call('gateway/admin/approve',payload),call('gateway/admin/approve',payload)]);assert.equal(result[0].journalId,result[1].journalId);
  assert.equal((await call('gateway/admin/approve',{...payload,requestId:randomUUID()})).alreadyAccounted,true);
  const f=(await owner.query('SELECT * FROM wpay_auth.business_financial_events')).rows;assert.equal(f.length,1);assert.equal(f[0].source,'admin_manual');assert.equal(f[0].utr_digest,null);
  assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.gateway_claims')).rows[0].n,0);
  const balance=await ledger.summary(runtime,ids.merchant),user=await ledger.summary(runtime,ids.user);assert.equal(balance.gross,'10000');assert.equal(balance.fees,'200');assert.equal(user.consumed,'10000');assert.equal(user.commission,'100');
  const shown=await transaction(runtime,c=>gateway.get(c,ids.merchant,order.id));assert.equal(shown.evidenceStatus,'admin_approved');
 });
 await t.test('exhausted callback retries keep stable event ID, signatures and history without new credit',async()=>{
  for(let i=0;i<8;i++){await owner.query("UPDATE wpay_auth.gateway_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE order_id=$1",[order.id]);await gateway.dispatch();}
  const event=(await owner.query('SELECT * FROM wpay_auth.gateway_outbox WHERE order_id=$1',[order.id])).rows[0];assert.equal(event.state,'failed');assert.equal(event.attempts,8);
  const retry={orderId:order.id,reason:'Merchant requested callback',requestId:randomUUID()};await call('gateway/admin/callback',retry);await call('gateway/admin/callback',retry);
  responseCode=200;await gateway.dispatch();assert.equal(received.length,9);assert.equal(received[0].body,received[8].body);assert.equal(received[8].headers['x-wpay-event-id'],event.id);
  assert.equal(require('../lib/wpay/gateway/webhooks').verifySignature(endpoint.secret,received[8].headers,received[8].body),true);
  assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.gateway_attempts WHERE event_id=$1',[event.id])).rows[0].n,9);
  assert.equal((await ledger.summary(runtime,ids.merchant)).gross,'10000');await assert.rejects(call('gateway/admin/callback',{...retry,requestId:randomUUID()}),e=>e.code==='RATE_LIMITED');
 });
 await t.test('expired manual receipt records recovery and consumes bank volume',async()=>{
  const late=await create('late');await owner.query("UPDATE wpay_auth.business_reservations SET created_at=CURRENT_TIMESTAMP-interval '1 minute',expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=(SELECT reservation_id FROM wpay_auth.gateway_orders WHERE id=$1)",[late.id]);
  await call('gateway/admin/approve',{...payload,orderId:late.id,requestId:randomUUID()});assert.equal((await ledger.summary(runtime,ids.user)).commission,'100');
  assert.equal((await require('../lib/wpay/business/bank-volume').volume(runtime,bank.id,1)).used,'20000');
  assert.equal((await owner.query("SELECT count(*)::int n FROM wpay_auth.gateway_outbox WHERE order_id=$1 AND event_type='payment.recovered'",[late.id])).rows[0].n,1);
 });
 await t.test('runtime cannot rewrite manual action audit records',async()=>{await assert.rejects(runtime.query("UPDATE wpay_auth.admin_payment_actions SET reason='changed'"));});
});
