"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),{randomUUID,createHash}=require('node:crypto'),{Pool}=require('pg');
const {fixture}=require('./helpers/wpay-9a-fixture'),{StatementEvidence}=require('../lib/wpay/integrations/statement-evidence'),{startAuthServer}=require('../lib/wpay/auth/runtime/http'),{alias}=require('../lib/wpay/integrations/checkout');
const denied=(p,code='FORBIDDEN')=>assert.rejects(p,e=>e.code===code);
test('Task12 scoped UTR / statement / protected checkout / actual APK / recovery outbox',{timeout:180000},async t=>{
 const f=await fixture(t),{service,call,owner,runtime,ids,tx}=f,bank=await f.bank('alice');await f.bank('bob');await f.funding('alice','1000000');await f.assign('alice');
 let order,imported,proof,callbackCode=503;const deliveries=[];
 const callback=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;deliveries.push({body,headers:req.headers});res.writeHead(callbackCode);res.end();});await new Promise(r=>callback.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>callback.close(r)));
 service.gateway.allowSynthetic=true;service.gateway.testCallback='http://127.0.0.1:'+callback.address().port+'/callback';
 const source=new StatementEvidence({pool:runtime,allowSynthetic:true,lookup:async snapshot=>proof?{...snapshot,...proof}:null});service.gateway.verifier=s=>source.verify(s);
 const server=await startAuthServer({service,port:0});t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const origin='http://127.0.0.1:'+server.address().port;
 const endpoint=await call('merchant','gateway/webhooks/configure',{url:service.gateway.testCallback});
 await t.test('scope and current-version parser upload; content alone creates no credit',async()=>{
  await denied(call('merchant','operations/statements'));await denied(call('merchant','operations/transactions'));
  await denied(call('bob','operations/statements',{bankId:bank.id}));
  const csv='Date,Narration,Debit,Credit,Balance\n'+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata'}).format(new Date())+',UPI/123456789012 received,,1250.50,2250.50';
  const body={ownerId:ids.alice,bankId:bank.id,version:1,requestId:randomUUID(),format:'csv',base64:Buffer.from(csv).toString('base64')};
  await denied(call('bob','operations/statement/upload',body));await denied(call('admin','operations/statement/upload',{...body,version:2}),'CONFLICT');
  imported=await call('admin','operations/statement/upload',body);assert.equal(imported.status,'accepted');assert.equal(imported.financialEvidence,false);
  assert.equal((await call('admin','operations/statement/upload',body)).id,imported.id);
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE account_id=$1",[ids.admin]);await denied(call('admin','operations/statements'),'RECENT_MFA_REQUIRED');await owner.query('UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP WHERE account_id=$1',[ids.admin]);
  assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
  order=await call('merchant','gateway/create',{reference:'task12-synthetic',idempotencyKey:randomUUID(),amountMinor:'125050',currency:'INR',ttlSeconds:900});
  await denied(call('bob','operations/transactions',{orderId:order.id}));assert.equal((await call('alice','operations/transactions',{orderId:order.id})).records[0].observations.length,0);
 });
 let checkoutCookie,checkoutId;
 await t.test('legacy UTR source reads require verified parent ownership and current Admin tenant scope',async()=>{
  const parent=randomUUID(),link=randomUUID();
  for(const [id,kind,ref,parentId]of [[parent,'receiving_account','synthetic-bank',null],[link,'device','synthetic-device',parent]])await owner.query(`INSERT INTO wpay_auth.resource_links(id,account_id,resource_kind,source_id,resource_id,status,verified_at,verification_digest,verifier_id,valid_from,valid_until,parent_id) VALUES($1,$2,$3,'legacy-primary',$4,'verified',CURRENT_TIMESTAMP,$5,$6,CURRENT_TIMESTAMP-interval '1 minute',CURRENT_TIMESTAMP+interval '1 hour',$7)`,[id,ids.alice,kind,ref,'1'.repeat(64),ids.admin,parentId]);
  let reads=0;service.operations.utrs.reader={sourceId:'legacy-primary',async read(l){reads++;assert.equal(l.account_id,ids.alice);assert.equal(l.resource_id,'synthetic-device');return {rows:[{id:'1',utr:'123456789012',amount:'1250.50',created_at:new Date(),sms_body:'MUST NEVER LEAK'}],nextCursor:null};}};
  await denied(call('alice','operations/utr-source',{linkId:link}));await denied(call('merchant','operations/utr-source',{linkId:link}));
  const result=await call('admin','operations/utr-source',{linkId:link});assert.equal(result.observations[0].evidenceState,'unbound_observation');assert.doesNotMatch(JSON.stringify(result),/MUST NEVER LEAK|sms_body/);assert.equal(reads,1);
  await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[ids.admin,{platform:true,tenantIds:['other-tenant']}]);await denied(call('admin','operations/utr-source',{linkId:link}));assert.equal(reads,1);
  await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[ids.admin,{platform:true,tenantIds:['wpay-auth-development']}]);await call('alice','resources/revoke',{linkId:parent});await denied(call('admin','operations/utr-source',{linkId:link}));assert.equal(reads,1);
  service.operations.utrs.reader=null;
 });
 await t.test('exact protected checkout and assets, strong capability required, claim never credits',async()=>{
  const entry=await fetch(order.paymentUrl,{redirect:'manual'});assert.equal(entry.status,303);checkoutCookie=entry.headers.get('set-cookie').split(';')[0];checkoutId=alias(order.paymentUrl.split('/').at(-1));assert.equal(entry.headers.get('location'),'/pay/'+checkoutId);
  const page=await fetch(origin+entry.headers.get('location'));assert.deepEqual(Buffer.from(await page.arrayBuffer()),fs.readFileSync('public/pay.html'));
  for(const file of ['upi.js','checkout.js'])assert.deepEqual(Buffer.from(await (await fetch(origin+'/'+file)).arrayBuffer()),fs.readFileSync('public/'+file));
  assert.equal((await fetch(origin+'/api/payments/'+checkoutId)).status,404);
  assert.equal((await fetch(origin+'/api/payments/WP00000000',{headers:{cookie:checkoutCookie}})).status,404);
  const payment=await (await fetch(origin+'/api/payments/'+checkoutId,{headers:{cookie:checkoutCookie}})).json();assert.match(payment.upiUri,/am=1250.50/);
  const claim=await fetch(origin+'/api/payments/'+checkoutId+'/utr',{method:'POST',headers:{cookie:checkoutCookie,origin,'content-type':'application/json'},body:JSON.stringify({utr:'999999999999'})});assert.equal(claim.status,200);assert.equal((await claim.json()).verified,false);
  assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
  const merchant=await call('merchant','gateway/get',{id:order.id});assert.match(merchant.paymentQr,/^data:image\/png;base64,/);assert.doesNotMatch(JSON.stringify(merchant),/synthetic.user@bank|123456780001|encrypted_|userId|bankId/);
 });
 await t.test('actual authenticated APK downloads match protected artifact in User and Admin routes',async()=>{
  const bytes=fs.readFileSync('public/downloads/WPAY-Agent.apk'),digest=createHash('sha256').update(bytes).digest('hex');assert.ok(bytes.length>0);
  for(const [who,role]of [['alice','user'],['admin','admin']]){const result=await fetch(origin+'/wpay-auth/roles/'+role+'/apk/download',{headers:{cookie:'wpay_auth_dev_session='+f.sessions[who]}});assert.equal(result.status,200);assert.match(result.headers.get('content-disposition'),/attachment/);const downloaded=Buffer.from(await result.arrayBuffer());assert.deepEqual(downloaded,bytes);assert.equal((await call(who,'apk')).sha256,digest);}
  assert.equal((await fetch(origin+'/wpay-auth/apk/download')).status,401);
 });
 await t.test('unchanged matcher executes in a disposable single-bank source; bound recovery posts once',async()=>{
  // Test fixture only: this complete disposable source contains one known bank.
  // This is not a shared-production matcher wrapper or SQL rewriting adapter.
  assert.equal(f.cfg.legacyOwner.host,'127.0.0.1');assert.match(f.cfg.legacyOwner.database,/^wpay_12_source_(\d{3}|ci_reconciliation)$/);const legacy=new Pool(f.cfg.legacyOwner);t.after(()=>legacy.end());assert.equal((await legacy.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount,0);
  await require('../server').initDb(legacy);await require('../lib/device-pairing').initDeviceTables(legacy);await require('../lib/payment-verification').initPaymentVerificationTables(legacy);const matcher=require('../lib/statement-match-router');await matcher.initStatementTables(legacy);
  const today=(await legacy.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS d")).rows[0].d;
  await legacy.query("INSERT INTO payment_links(id,upi_uri,source,profile,amount,status,created_at,expires_at,original_upi_uri,provider,requested_amount) VALUES('WP12345678','upi://pay?pa=test%40bank','merchant','scan',1250.50,'pending',CURRENT_TIMESTAMP-interval '1 minute',CURRENT_TIMESTAMP+interval '10 minutes','upi://pay?pa=test%40bank','static_qr',1250.50)");
  await legacy.query("INSERT INTO statement_imports(id,file_hash,file_name) VALUES('STsynthetic',$1,'synthetic.csv')",['1'.repeat(64)]);await legacy.query("INSERT INTO statement_credit_events(import_id,txn_date,utr_normalized,amount) VALUES('STsynthetic',$1,'123456789012',1250.50)",[today]);
  const matched=await matcher.matchImportedTransactions(legacy,[{txnDate:today,utr:'123456789012',amount:'1250.50'}],'STsynthetic');assert.equal(matched[0].recoveredUtr,true);assert.equal(matched[0].paymentId,'WP12345678');
  const i=(await owner.query('SELECT * FROM wpay_auth.bank_statement_imports WHERE id=$1',[imported.id])).rows[0];
  proof={verified:true,final:true,synthetic:true,status:'confirmed',source:'statement',utr:'123456789012',economicId:'test12:receipt:1',evidenceId:'test12:statement:1',receivedAt:new Date().toISOString(),statementImportId:i.id,statementFileDigest:i.file_digest,statementResultDigest:i.result_digest,accountScopeVerified:true,matcher:'protected-statement-match'};
  const valid=proof;for(const change of [{statementFileDigest:'0'.repeat(64)},{accountScopeVerified:false},{statementImportId:randomUUID()},{userId:ids.bob},{bankVersion:2},{amountMinor:'1'},{source:'normal'}]){proof={...valid,...change};await denied(service.gateway.verifyOrder(order.id));}proof=valid;
  await Promise.all([service.gateway.verifyOrder(order.id),service.gateway.verifyOrder(order.id)]);
  const result=(await owner.query('SELECT f.*,j.metadata FROM wpay_auth.business_financial_events f JOIN wpay_auth.business_journals j ON j.id=f.journal_id')).rows;assert.equal(result.length,1);assert.equal(result[0].source,'statement_recovered');assert.equal(result[0].metadata.commissionMinor,'0');assert.equal(result[0].metadata.feeMinor,'1500');
  const summary=await call('merchant','gateway/summary');assert.equal(summary.gross,'125050');assert.equal(summary.fees,'1500');
  const user=(await call('alice','operations/transactions',{orderId:order.id})).records[0];assert.equal(user.recovered,true);assert.equal(user.observations.find(o=>o.utr==='123456789012').verified,true);assert.equal(user.observations.find(o=>o.utr==='999999999999').verified,false);
  assert.equal((await call('bob','operations/transactions')).records.length,0);assert.equal((await call('admin','operations/transactions')).records[0].userId,ids.alice);
  const status=await (await fetch(origin+'/api/payments/'+checkoutId+'/verification-status',{headers:{cookie:checkoutCookie}})).json();assert.equal(status.verified,true);assert.equal(status.status,'success');
 });
 await t.test('durable recovered callback failure/retry, duplicate evidence, secret-free audit and logout',async()=>{
  await service.gateway.dispatch();const event=(await owner.query("SELECT * FROM wpay_auth.gateway_outbox WHERE order_id=$1 AND event_type='payment.recovered'",[order.id])).rows;assert.equal(event.length,1);assert.equal(event[0].state,'pending');
  callbackCode=200;await call('merchant','gateway/webhooks/retry',{id:event[0].id});await service.gateway.dispatch();assert.equal(deliveries.length,2);assert.equal(deliveries[0].body,deliveries[1].body);assert.equal(require('../lib/wpay/gateway/webhooks').verifySignature(endpoint.secret,deliveries[1].headers,deliveries[1].body),true);
  await service.gateway.verifyOrder(order.id);assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,1);
  assert.doesNotMatch(JSON.stringify((await owner.query('SELECT * FROM wpay_auth.operations_audit')).rows),/123456789012|999999999999|encrypted|secret/);
  await call('alice','logout');await denied(call('alice','operations/transactions'),'AUTH_FAILED');
 });
});
