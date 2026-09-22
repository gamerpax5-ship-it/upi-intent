"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/wpay-9a-fixture'),{Gateway}=require('../lib/wpay/gateway/core'),{verifySignature}=require('../lib/wpay/gateway/webhooks'),{startAuthServer}=require('../lib/wpay/auth/runtime/http');
test('isolated Merchant gateway / credentials / accounting / webhook acceptance',{timeout:180000},async t=>{
 const f=await fixture(t),{owner,runtime,ids,call,tx,service}=f;const bank=await f.bank('alice');await f.funding('alice','1000000');await f.assign('alice');
 const observations=new Map(),received=[];let callbackCode=503,signing;
 const callback=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({body,headers:req.headers,valid:verifySignature(signing,req.headers,body)});res.writeHead(callbackCode);res.end('synthetic');});await new Promise(resolve=>callback.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>callback.close(resolve)));
 const gateway=service.gateway=new Gateway({pool:runtime,crypto:f.crypto,allowSynthetic:true,testCallback:`http://127.0.0.1:${callback.address().port}/callback`,verifier:async snapshot=>observations.has(snapshot.orderId)?{...snapshot,...observations.get(snapshot.orderId)}:null});
 const server=await startAuthServer({service,port:0});t.after(()=>new Promise(resolve=>server.close(resolve)));const origin=`http://127.0.0.1:${server.address().port}`;
 const body=(reference,amountMinor='10000')=>({reference,idempotencyKey:reference,amountMinor,currency:'INR'});
 const proof=(order,source='normal',utr='123456789012')=>observations.set(order.id,{verified:true,final:true,synthetic:true,status:'confirmed',source,utr,evidenceId:'proof-'+order.id,economicId:'economic-'+order.id,receivedAt:new Date().toISOString()});
 let order,key,endpoint;
 await t.test('real scoped migration, one-time key and callback secrets, exact QR, claim never credits',async()=>{
  assert.equal((await owner.query('SELECT max(version) AS v FROM wpay_auth.schema_migrations')).rows[0].v,16);
  endpoint=await call('merchant','gateway/webhooks/configure',{url:gateway.testCallback});signing=endpoint.secret;
  key=await call('merchant','gateway/keys/create',{label:'Synthetic SDK',scopes:['orders:read','orders:write']});assert.match(key.secret,/^wpay_mk_/);
  const stored=(await owner.query('SELECT * FROM wpay_auth.gateway_keys WHERE id=$1',[key.id])).rows[0];assert.equal(JSON.stringify(stored).includes(key.secret),false);
  order=await call('merchant','gateway/create',body('synthetic-first'));assert.equal(order.status,'pending_payment');assert.ok(order.paymentUrl.startsWith(origin));
  assert.equal((await call('merchant','gateway/create',body('synthetic-first'))).id,order.id);await assert.rejects(call('merchant','gateway/create',body('synthetic-first','10001')),e=>e.code==='CONFLICT');
  const projection=JSON.stringify(await call('merchant','gateway/orders'));for(const forbidden of ['synthetic.user@bank','123456780001','9000000001',ids.alice,bank.id,'encrypted_token'])assert.equal(projection.includes(forbidden),false);
  const status=await (await fetch(order.paymentUrl+'/status')).json();assert.match(status.qr,/^data:image\/png;base64,/);assert.match(status.uri,/am=100/);
  const claim=await fetch(order.paymentUrl+'/claim',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({utr:'123456789012'})});assert.equal(claim.status,200);assert.equal((await claim.json()).status,'verification_pending');
  assert.equal((await owner.query('SELECT count(*)::integer AS n FROM wpay_auth.business_financial_events')).rows[0].n,0);assert.equal((await gateway.verifyOrder(order.id)).status,'unavailable');
  for(let n=0;n<4;n++)await tx(c=>gateway.customer(c,order.paymentUrl.split('/').at(-1),'123456789012'));await assert.rejects(tx(c=>gateway.customer(c,order.paymentUrl.split('/').at(-1),'123456789012')),e=>e.code==='RATE_LIMITED');
  observations.set(order.id,{synthetic:true,status:'pending',verified:false});assert.equal((await gateway.verifyOrder(order.id)).evidenceStatus,'observed');observations.delete(order.id);assert.equal((await owner.query('SELECT count(*)::integer AS n FROM wpay_auth.business_financial_events')).rows[0].n,0);
 });
 await t.test('API enforces Bearer-only auth, cross Merchant scope, key revocation and suspension',async()=>{
  const response=await fetch(origin+'/wpay-api/v1/orders',{method:'POST',headers:{authorization:'Bearer '+key.secret,'content-type':'application/json','idempotency-key':'api-order-1'},body:JSON.stringify({reference:'api-order-1',amountMinor:'20000',currency:'INR'})});assert.equal(response.status,201);const apiOrder=await response.json();assert.equal(apiOrder.origin,'api');
  assert.equal((await fetch(origin+'/wpay-api/v1/orders/'+order.id,{headers:{authorization:'Bearer '+key.secret,cookie:'wpay_auth_dev_session=x'}})).status,401);
  await assert.rejects(call('alice','gateway/orders'),e=>e.code==='FORBIDDEN');await assert.rejects(tx(c=>gateway.get(c,ids.bob,order.id,origin)),e=>e.code==='FORBIDDEN');
  await owner.query("UPDATE wpay_auth.accounts SET status='suspended' WHERE id=$1",[ids.merchant]);await assert.rejects(gateway.api(key.secret,'orders:read',()=>true),e=>e.code==='FORBIDDEN');await owner.query("UPDATE wpay_auth.accounts SET status='active' WHERE id=$1",[ids.merchant]);
  await call('merchant','gateway/keys/revoke',{id:key.id});await assert.rejects(gateway.api(key.secret,'orders:read',()=>true),e=>e.code==='FORBIDDEN');
 });
 await t.test('trusted normal receipt posts exactly once; callback failure never undoes money; retry signature valid',async()=>{
  proof(order);await gateway.verifyOrder(order.id);await gateway.verifyOrder(order.id);
  assert.equal((await owner.query('SELECT count(*)::integer AS n FROM wpay_auth.business_financial_events')).rows[0].n,1);const event=(await owner.query('SELECT * FROM wpay_auth.gateway_outbox WHERE order_id=$1',[order.id])).rows[0];assert.equal(event.event_type,'payment.success');
  await gateway.dispatch();assert.equal(received.length,1);assert.equal(received[0].valid,true);assert.equal((await owner.query('SELECT state FROM wpay_auth.gateway_outbox WHERE id=$1',[event.id])).rows[0].state,'pending');
  callbackCode=200;await call('merchant','gateway/webhooks/retry',{id:event.id});await gateway.dispatch();assert.equal(received.at(-1).valid,true);assert.equal(received.at(-1).headers['x-wpay-event-id'],event.id);assert.equal(received.at(-1).body,received[0].body);
  const summary=await call('merchant','gateway/summary');assert.equal(summary.gross,'10000');assert.equal(summary.fees,'120');assert.equal(summary.counts.successful,1);
  const diagnostics=JSON.stringify(await call('admin','gateway/diagnostics'));assert.equal(diagnostics.includes(signing),false);assert.equal(diagnostics.includes('encrypted_secret'),false);assert.equal(diagnostics.includes(gateway.testCallback),false);
 });
 await t.test('expired reservation releases once, trusted recovery accounts once with zero User commission',async()=>{
  const late=await call('merchant','gateway/create',body('late-recovery','30000'));const r=(await owner.query('SELECT reservation_id FROM wpay_auth.gateway_orders WHERE id=$1',[late.id])).rows[0];
  // Isolated fixture clock advancement; no real payments or production objects.
  await owner.query("UPDATE wpay_auth.gateway_orders SET created_at=CURRENT_TIMESTAMP-interval '1 minute',expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[late.id]);await owner.query("UPDATE wpay_auth.business_reservations SET created_at=CURRENT_TIMESTAMP-interval '1 minute',expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[r.reservation_id]);await tx(c=>gateway.expire(c));await tx(c=>gateway.expire(c));
  proof(late,'recovery','123456789013');await gateway.verifyOrder(late.id);await gateway.verifyOrder(late.id);
  const journal=(await owner.query('SELECT j.metadata FROM wpay_auth.business_financial_events f JOIN wpay_auth.business_journals j ON j.id=f.journal_id WHERE f.reservation_id=$1',[r.reservation_id])).rows[0];assert.equal(journal.metadata.commissionMinor,'0');assert.equal((await owner.query("SELECT count(*)::integer AS n FROM wpay_auth.gateway_outbox WHERE order_id=$1 AND event_type='payment.recovered'",[late.id])).rows[0].n,1);
 });
 await t.test('second Merchant key cannot read or create under another Merchant; Employee has no default gateway permission',async()=>{
  const password='Task 10 synthetic isolated passphrase!';await service.register({name:'Synthetic Other Merchant',email:'other@10.example.invalid',password,accountType:'merchant'},'127.0.0.1');const other=(await owner.query("SELECT id FROM wpay_auth.accounts WHERE email='other@10.example.invalid'")).rows[0].id;
  await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=$1",[other]);await owner.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) SELECT $1,$2,1,settings,$3 FROM wpay_auth.commercial_versions WHERE account_id=$4 LIMIT 1',[randomUUID(),other,ids.admin,ids.merchant]);
  const login=await service.login({email:'other@10.example.invalid',password},'127.0.0.1'),enroll=await service.mfa.challenge(login.challengeToken,'setup',{}),verified=await service.mfa.challenge(login.challengeToken,'verify',{code:await f.crypto.libraries().otp.generate({secret:enroll.setupKey})}),session=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true})).sessionToken;
  const otherKey=await service.authenticated(session,'gateway/keys/create',0,{label:'Other key',scopes:['orders:read','orders:write']});await assert.rejects(gateway.api(otherKey.secret,'orders:read',(c,id)=>gateway.get(c,id,order.id,origin)),e=>e.code==='FORBIDDEN');await assert.rejects(gateway.api(otherKey.secret,'orders:write',(c,id)=>gateway.create(c,id,body('other-no-pool'),'api',origin)),e=>e.code==='NO_ROUTE');
  assert.equal((await service.authenticated(session,'gateway/orders')).orders.length,0);
  await owner.query("UPDATE wpay_auth.gateway_rate SET hits=60 WHERE key_id=$1",[otherKey.id]);await assert.rejects(gateway.api(otherKey.secret,'orders:read',()=>true),e=>e.code==='RATE_LIMITED');
  await owner.query("UPDATE wpay_auth.accounts SET account_type='employee',merchant_id=NULL WHERE id=$1",[other]);await owner.query("UPDATE wpay_auth.grants SET permissions=ARRAY['profile.view','account_security.view','account_security.update'],admin_scope=NULL WHERE account_id=$1",[other]);await assert.rejects(service.authenticated(session,'gateway/orders'));
  await owner.query("UPDATE wpay_auth.grants SET permissions=permissions||ARRAY['transactions.view'],admin_scope=$2 WHERE account_id=$1",[other,{tenantIds:['wpay-auth-development']}]);assert.ok((await service.authenticated(session,'gateway/orders')).orders.length>0);
  await owner.query("UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1",[other,{tenantIds:['other-tenant']}]);assert.equal((await service.authenticated(session,'gateway/orders')).orders.length,0);
 });
 await t.test('ineligible routing cannot bypass funding, current verified version, frozen state or bank limit',async()=>{
  for(const [sql,restore]of [
   ["UPDATE wpay_auth.eligibility SET initial_deposit_satisfied=false WHERE account_id=$1","UPDATE wpay_auth.eligibility SET initial_deposit_satisfied=true WHERE account_id=$1"],
   ["UPDATE wpay_auth.account_security SET enabled=false WHERE account_id=$1","UPDATE wpay_auth.account_security SET enabled=true WHERE account_id=$1"]]){
   await owner.query(sql,[ids.alice]);await assert.rejects(call('merchant','gateway/create',body('ineligible-'+randomUUID())),e=>e.code==='NO_ROUTE');await owner.query(restore,[ids.alice]);
  }
  for(const [change,restore]of [['frozen=true','frozen=false'],['verified_version=NULL','verified_version=1'],['approved_version=NULL','approved_version=1']]){await owner.query('UPDATE wpay_auth.business_bank_accounts SET '+change+' WHERE id=$1',[bank.id]);await assert.rejects(call('merchant','gateway/create',body('bank-ineligible-'+randomUUID())),e=>e.code==='NO_ROUTE');await owner.query('UPDATE wpay_auth.business_bank_accounts SET '+restore+' WHERE id=$1',[bank.id]);}
  await assert.rejects(call('merchant','gateway/create',body('over-bank-limit','100000001')),e=>e.code==='NO_ROUTE');
 });
 await t.test('duplicate economic receipt cannot credit another order, trusted terminal failure and webhook lease concurrency',async()=>{
  const duplicate=await call('merchant','gateway/create',body('duplicate-receipt'));proof(duplicate,'normal','123456789012');await assert.rejects(gateway.verifyOrder(duplicate.id),e=>e.code==='CONFLICT');assert.notEqual((await call('merchant','gateway/get',{id:duplicate.id})).status,'successful');observations.delete(duplicate.id);
  const failed=await call('merchant','gateway/create',body('trusted-failure'));proof(failed,'normal','123456789019');observations.get(failed.id).status='failed';assert.equal((await gateway.verifyOrder(failed.id)).status,'failed');
  const event=(await owner.query("SELECT id FROM wpay_auth.gateway_outbox WHERE order_id=$1 AND event_type='payment.failed'",[failed.id])).rows[0];await owner.query("UPDATE wpay_auth.gateway_outbox SET next_attempt_at=CURRENT_TIMESTAMP+interval '1 hour' WHERE id<>$1 AND state='pending'",[event.id]);
  const before=received.length;await Promise.all([gateway.dispatch(),gateway.dispatch()]);assert.equal(received.length,before+1);
  const analytics=await call('alice','onboarding/analytics');assert.ok(JSON.stringify(analytics).includes('failed'));
 });
 await t.test('no route for stopped bank; concurrent orders cannot oversubscribe; logout denies',async()=>{
  await call('alice','business/banks/transition',{bankId:bank.id,version:1,action:'stop',reason:'Synthetic security check'});await assert.rejects(call('merchant','gateway/create',body('stopped')),e=>e.code==='NO_ROUTE');await call('alice','business/banks/transition',{bankId:bank.id,version:1,action:'run',reason:'Synthetic security check'});
  const results=await Promise.allSettled([call('merchant','gateway/create',body('capacity-a','600000')),call('merchant','gateway/create',body('capacity-b','600000'))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(results.some(r=>r.status==='rejected'&&r.reason.code==='NO_ROUTE'));
  await call('merchant','logout');await assert.rejects(call('merchant','gateway/orders'),e=>e.code==='AUTH_FAILED');
 });
});
