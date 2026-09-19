'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/wpay-9a-fixture'),{Parking}=require('../lib/wpay/parking/workflow'),{resolveContext}=require('../lib/wpay/auth/runtime/service');
const {token,digest}=require('../lib/wpay/auth/runtime/tokens'),ledger=require('../lib/wpay/business/ledger'),{emailDigest}=require('../lib/wpay/notifications/service');
const deny=(p,code='FORBIDDEN')=>assert.rejects(p,e=>e.code===code);
test('D5/D10: durable internal policy, concurrency, ownership, outage and replay',async t=>{
 const f=await fixture(t),{owner,runtime,service,ids,call}=f;
 const parking=new Parking({allowSynthetic:true,verify:async wanted=>({...wanted,independentlyVerified:true,final:true,status:'completed',revoked:false,synthetic:true,validUntil:Date.now()+60000,sourceId:'synthetic-authority',economicId:wanted.evidenceReference})});
 const invoke=(name,method,b)=>service.repository.withSession(digest(f.sessions[name]),(c,row)=>parking[method](c,row,resolveContext(row),b));
 const move=(r,action,evidenceReference=null,extras={})=>invoke('admin','transition',{id:r.id,requestId:randomUUID(),expectedVersion:r.version,action,reason:'Synthetic internal policy test',evidenceReference,...extras});
 let bank,first;
 await t.test('default grants cannot start parking; explicit scoped synthetic grants do not restore capacity on request/approval',async()=>{
  bank=await f.bank('alice');await f.funding('alice','1000000');const body={requestId:randomUUID(),bankId:bank.id,bankVersion:1,amountMinor:'10000'};
  await deny(invoke('alice','request',body));await deny(invoke('merchant','request',body));
  await owner.query("UPDATE wpay_auth.grants SET permissions=permissions||ARRAY['user.parking_payments.view','user.parking_payments.create'] WHERE account_id=$1",[ids.alice]);
  await owner.query("UPDATE wpay_auth.grants SET permissions=permissions||ARRAY['parking.view','parking.review','parking.approve','parking.reject'] WHERE account_id=$1",[ids.admin]);
  const before=await ledger.summary(runtime,ids.alice);first=await invoke('alice','request',body);assert.equal(first.state,'requested');assert.equal(first.executionConnected,false);assert.equal((await invoke('alice','request',body)).id,first.id);
  first=await move(first,'submitted');first=await move(first,'approved');assert.deepEqual(await ledger.summary(runtime,ids.alice),before);
 });
 await t.test('accepted completion restores once under concurrency and keeps original commercial snapshot',async()=>{
  const original=(await owner.query('SELECT snapshot FROM wpay_auth.parking_requests WHERE id=$1',[first.id])).rows[0].snapshot;
  await owner.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,2,$3,$4)',[randomUUID(),ids.alice,{...original.user.settings,inrPerUsdt:'99'},ids.admin]);
  const before=await ledger.summary(runtime,ids.alice),body={id:first.id,requestId:randomUUID(),expectedVersion:first.version,action:'complete',reason:'Synthetic final completion',evidenceReference:'economic-first'};
  const results=await Promise.all([invoke('admin','transition',body),invoke('admin','transition',body)]);first=results[0];assert.equal(first.state,'completed');assert.equal(results[1].version,first.version);
  assert.equal(BigInt((await ledger.summary(runtime,ids.alice)).allocated)-BigInt(before.allocated),10000n);
  const posting=(await owner.query('SELECT j.snapshot FROM wpay_auth.parking_postings p JOIN wpay_auth.business_journals j ON j.id=p.journal_id WHERE p.parking_id=$1',[first.id])).rows[0];assert.deepEqual(posting.snapshot,original);
  first=await move(first,'complete','economic-first');assert.equal((await owner.query('SELECT 1 FROM wpay_auth.parking_postings WHERE parking_id=$1',[first.id])).rowCount,1);
 });
 await t.test('a dispute freezes the restored amount; explicit evidenced reconciliation releases only the hold',async()=>{
  const before=await ledger.summary(runtime,ids.alice);first=await move(first,'disputed');const held=await ledger.summary(runtime,ids.alice);assert.equal(BigInt(held.held)-BigInt(before.held),10000n);assert.equal(held.allocated,before.allocated);
  await deny(move(first,'complete','economic-first'),'CONFLICT');first=await move(first,'reconcile_complete','economic-first');assert.deepEqual(await ledger.summary(runtime,ids.alice),before);
 });
 await t.test('late success after failure/expiry goes to review, then posts once; duplicates and bad evidence never post',async()=>{
  for(const state of ['failed','expired']){
   let r=await invoke('alice','request',{requestId:randomUUID(),bankId:bank.id,bankVersion:1,amountMinor:'10000'});r=await move(r,state);const before=await ledger.summary(runtime,ids.alice);
   r=await move(r,'complete','economic-'+state);assert.equal(r.state,'review');assert.deepEqual(await ledger.summary(runtime,ids.alice),before);
   r=await move(r,'reconcile_complete','economic-'+state);assert.equal(r.state,'completed');assert.equal(BigInt((await ledger.summary(runtime,ids.alice)).allocated)-BigInt(before.allocated),10000n);
  }
  let r=await invoke('alice','request',{requestId:randomUUID(),bankId:bank.id,bankVersion:1,amountMinor:'10000'});r=await move(r,'approved');await deny(move(r,'complete','economic-first'),'DUPLICATE_TRANSFER');
  const verifier=parking.verify;parking.verify=async wanted=>({...await verifier(wanted),ownerId:ids.bob});await deny(move(r,'complete','wrong-owner'));
  parking.verify=async wanted=>({...await verifier(wanted),revoked:true});await deny(move(r,'complete','revoked'));
  for(const key of ['economicId','sourceId']){parking.verify=async wanted=>({...await verifier(wanted),[key]:undefined});await deny(move(r,'complete','missing-authority-id'));}
  parking.verify=null;await deny(move(r,'complete','unavailable'),'UNAVAILABLE');parking.verify=verifier;
  const before=await ledger.summary(runtime,ids.alice);r=await move(r,'cancelled');await deny(move(r,'complete','cancelled'),'CONFLICT');assert.deepEqual(await ledger.summary(runtime,ids.alice),before);
 });
 await t.test('parking immutable records, cross-tenant targets and missing permission cannot be bypassed',async()=>{
  await assert.rejects(runtime.query("UPDATE wpay_auth.parking_requests SET snapshot='{}' WHERE id=$1",[first.id]));await assert.rejects(runtime.query('DELETE FROM wpay_auth.parking_postings WHERE parking_id=$1',[first.id]));
  const body={id:first.id,requestId:randomUUID(),expectedVersion:first.version,action:'disputed',reason:'Synthetic denial',evidenceReference:null};await deny(invoke('alice','transition',body));
  await owner.query("UPDATE wpay_auth.accounts SET tenant_id='foreign' WHERE id=$1",[ids.alice]);await deny(invoke('admin','transition',body));await owner.query("UPDATE wpay_auth.accounts SET tenant_id='wpay-auth-development' WHERE id=$1",[ids.alice]);
  assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_entries WHERE ledger_type=\'user_commission\'')).rowCount,0);
 });
 await t.test('D1 real gateway transaction revalidates authoritative source, posts recovery once and preserves zero first-posting User commission',async()=>{
  const {AuthoritativeStatementSource}=require('../lib/wpay/integrations/authoritative-statement-source'),{StatementEvidence}=require('../lib/wpay/integrations/statement-evidence');
  await f.assign('alice');let revoked=false,revokeAtPosting=true;
  const source=new AuthoritativeStatementSource({sourceId:'synthetic-statements',allowSynthetic:true,
   resolveBinding:async(s,client)=>{const db=client||runtime;const result=(await db.query('SELECT b.owner_id,b.version,a.tenant_id,m.tenant_id AS merchant_tenant FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id JOIN wpay_auth.accounts m ON m.id=$2 WHERE b.id=$1',[s.bankId,s.merchantId])).rows[0];return {sourceId:'synthetic-statements',id:'mapping-a',version:1,sourceAccountId:'independent-bank-a',tenantId:result.tenant_id,merchantTenantId:result.merchant_tenant,active:true,revokedAt:null,validFrom:1,validUntil:4102444800000,...Object.fromEntries(['orderId','reservationId','merchantId','accountDigest'].map(k=>[k,s[k]])),userId:result.owner_id,bankId:s.bankId,bankVersion:result.version};},
   read:async({request:s})=>{const i=s.imports[0];return {proof:{...s,verified:true,final:true,synthetic:true,status:'confirmed',source:'statement',evidenceId:'fixture-'+s.orderId,economicId:'fixture-economic-'+s.orderId,utr:'987654321091',receivedAt:new Date().toISOString(),statementImportId:i.id,statementFileDigest:i.file_digest,statementResultDigest:i.result_digest,statementParserDigest:i.parser_digest,matcher:'protected-statement-match',accountScopeVerified:true}};},
   attest:async(receipt,{mapping,request})=>({id:'attestation-'+request.orderId,authenticated:true,independent:true,synthetic:true,revoked,sourceId:mapping.sourceId,sourceAccountId:mapping.sourceAccountId,tenantId:mapping.tenantId,merchantTenantId:mapping.merchantTenantId,mappingId:mapping.id,mappingVersion:mapping.version,receiptDigest:ledger.digest(receipt),economicId:receipt.proof.economicId,requestDigest:ledger.digest(request),checkedAt:Date.now(),validUntil:Date.now()+60000})});
  const statements=new StatementEvidence({pool:runtime,lookup:s=>source.verify(s),allowSynthetic:true});service.gateway.verifier=s=>statements.verify(s);service.gateway.allowSynthetic=true;
  service.gateway.beforeEvidencePosting=(c,p)=>{if(revokeAtPosting)revoked=true;return source.beforePosting(c,p);};
  const order=await call('merchant','gateway/create',{reference:'authoritative-fixture',idempotencyKey:randomUUID(),amountMinor:'10000',currency:'INR',ttlSeconds:900}),before=await ledger.summary(runtime,ids.alice);
  await deny(service.gateway.verifyOrder(order.id));assert.deepEqual(await ledger.summary(runtime,ids.alice),before);assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_financial_events')).rowCount,0);
  revoked=false;revokeAtPosting=false;assert.equal((await service.gateway.verifyOrder(order.id)).status,'successful');assert.equal((await service.gateway.verifyOrder(order.id)).alreadyAccounted,true);
  const after=await ledger.summary(runtime,ids.alice);assert.equal(after.commission,before.commission);assert.equal(BigInt(after.consumed)-BigInt(before.consumed),10000n);assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_financial_events')).rowCount,1);
  const audits=(await owner.query("SELECT metadata FROM wpay_auth.business_audit WHERE event='authoritative_statement_accepted'")).rows;assert.equal(audits.length,1);assert.equal(audits[0].metadata.sourceId,'synthetic-statements');assert.equal(JSON.stringify(audits).includes('987654321091'),false);
 });
 await t.test('D6/D9 deferred settlement and delegated pairing remain denied even for staff',async()=>{
  assert.equal((await call('merchant','payout/merchant-usdt')).message,'USDT settlement rate not configured');
  await deny(call('admin','operations/device/create',{requestId:randomUUID()}));await deny(call('merchant','operations/device/create',{requestId:randomUUID()}));
 });
 const captured=[],provider={id:'synthetic-mail',approved:true,send:async(message,context)=>{captured.push({message,context});return {status:'accepted',providerId:'synthetic-mail'};}};
 await t.test('no provider means unavailable with no verification token or external delivery',async()=>{
  assert.equal((await call('alice','email/status')).emailOwnershipVerified,false);
  assert.deepEqual(await call('alice','email/request',{requestId:randomUUID()}),{requested:false,deliveryState:'unavailable',emailOwnershipVerified:false});assert.equal((await owner.query('SELECT 1 FROM wpay_auth.email_verification_requests')).rowCount,0);
  assert.deepEqual(await service.notifications.dispatch(),{state:'unavailable',attempted:0});
 });
 await t.test('owner/email bound token, queued vs accepted vs verified, rate limit, single-use concurrency and secret-free audit',async()=>{
  service.notifications.provider=provider;const requestId=randomUUID(),r=await call('alice','email/request',{requestId});assert.equal(r.deliveryState,'pending');assert.equal(r.token,undefined);assert.equal((await call('alice','email/request',{requestId})).requestId,r.requestId);
  await deny(call('alice','email/request',{requestId:randomUUID()}),'RATE_LIMITED');assert.equal((await call('alice','email/status')).emailOwnershipVerified,false);
  await service.notifications.dispatch();assert.equal(captured.length,1);const raw=captured[0].message.token;assert.equal(captured[0].message.recipient,'alice@9a.example.invalid');
  const status=await call('alice','email/status');assert.equal(status.deliveryState,'accepted');assert.equal(status.delivered,false);assert.equal(status.emailOwnershipVerified,false);
  await deny(call('bob','email/verify',{token:raw}));
  const results=await Promise.allSettled([call('alice','email/verify',{token:raw}),call('alice','email/verify',{token:raw})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'CONFLICT');
  assert.equal((await call('alice','me')).emailOwnershipVerified,true);await deny(call('alice','email/verify',{token:raw}),'CONFLICT');
  const logs=(await owner.query('SELECT details FROM wpay_auth.panel_audit WHERE target_id=$1',[ids.alice])).rows;assert.equal(JSON.stringify(logs).includes(raw),false);
  const stored=(await owner.query('SELECT * FROM wpay_auth.email_verification_requests')).rows;assert.equal(JSON.stringify(stored).includes(raw),false);
 });
 await t.test('delivery errors retry at most three times under one idempotency key and never imply delivered',async()=>{
  const keys=[];service.notifications.provider={...provider,send:async(_,c)=>{keys.push(c.idempotencyKey);throw Error('private transport failure');}};
  await call('bob','email/request',{requestId:randomUUID()});for(let i=0;i<3;i++){await service.notifications.dispatch();await owner.query("UPDATE wpay_auth.notification_deliveries SET next_attempt_at=CURRENT_TIMESTAMP-interval '1 second' WHERE account_id=$1",[ids.bob]);}
  await service.notifications.dispatch();assert.equal(keys.length,3);assert.equal(new Set(keys).size,1);const s=await call('bob','email/status');assert.equal(s.deliveryState,'unavailable');assert.equal(s.delivered,false);assert.equal(s.emailOwnershipVerified,false);
 });
 await t.test('expiry, changed email binding and epoch, undelivered evidence and verification-attempt throttling deny',async()=>{
  service.notifications.provider=provider;
  async function historical(overrides={}){const raw=token(),id=randomUUID(),account=(await owner.query('SELECT * FROM wpay_auth.accounts WHERE id=$1',[ids.merchant])).rows[0],hash=overrides.emailDigest||emailDigest(account.email);
   await owner.query("INSERT INTO wpay_auth.email_verification_requests(id,account_id,request_id,token_digest,email_digest,session_epoch,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP-interval '1 hour',CURRENT_TIMESTAMP+($7*interval '1 second'))",[id,ids.merchant,randomUUID(),digest(raw),hash,overrides.epoch??account.session_epoch,overrides.seconds??300]);
   await owner.query("INSERT INTO wpay_auth.notification_deliveries(id,account_id,kind,source_id,encrypted_payload,email_digest,state) VALUES($1,$2,'email_verification',$3,'{}',$4,$5)",[randomUUID(),ids.merchant,id,hash,overrides.state||'accepted']);return raw;
  }
  for(const options of [{seconds:-60},{emailDigest:'a'.repeat(64)},{epoch:999},{state:'failed'}])await deny(call('merchant','email/verify',{token:await historical(options)}));
  for(let i=0;i<6;i++)await deny(call('merchant','email/verify',{token:token()}));await deny(call('merchant','email/verify',{token:token()}),'RATE_LIMITED');
  assert.equal((await call('merchant','email/status')).emailOwnershipVerified,false);
 });
});
