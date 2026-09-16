"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture}=require('./helpers/wpay-9a-fixture');
const ledger=require('../lib/wpay/business/ledger');
const {startAuthServer}=require('../lib/wpay/auth/runtime/http');
const denied=(promise,code)=>assert.rejects(promise,e=>e.code===code);
test('Task 11 isolated PostgreSQL payout and shared entitlement contracts',async t=>{
 const f=await fixture(t),{call,owner,ids,tx}=f;
 const alice=await f.bank('alice'),bob=await f.bank('bob',{accountNumber:'123456780002'});await f.funding('alice','10000000');await f.funding('bob','10000000');await f.assign('alice');
 const payin=await f.reserve('payout-fixture-funding','6000000');await f.payin(payin,'normal');
 const order=(reference,amountMinor='200000')=>({reference,idempotencyKey:reference,beneficiaryName:'Synthetic Beneficiary',accountNumber:'999988887777',ifsc:'TEST0000001',amountMinor,note:'Synthetic payout acceptance'});
 await t.test('migration 13 and runtime boundaries',async()=>{
  assert.equal((await owner.query('SELECT max(version) AS v FROM wpay_auth.schema_migrations')).rows[0].v,14);
  await denied(f.runtime.query('CREATE TABLE wpay_auth.unapproved_payout_test(id integer)'),'42501');
  for(const table of ['payout_orders','commission_withdrawals','payout_proofs'])await denied(f.runtime.query('DELETE FROM wpay_auth.'+table),'42501');
 });
 await t.test('Merchant reserve, exact fee snapshot, idempotency and pre-claim release',async()=>{
  const before=await tx(c=>ledger.summary(c,ids.merchant)),p=await call('merchant','payout/create',order('reserve-001'));
  assert.equal(p.percentageFeeMinor,'1400');assert.equal(p.fixedFeeMinor,'50');assert.equal(p.reserveMinor,'201450');
  assert.equal((await call('merchant','payout/create',order('reserve-001'))).id,p.id);
  assert.equal(BigInt((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable),BigInt(before.merchantAvailable)-201450n);
  await denied(call('merchant','payout/create',order('reserve-001','200001')),'CONFLICT');
  assert.equal((await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic cancellation'})).status,'cancelled');
  await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic cancellation'});
  assert.equal((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable,before.merchantAvailable);
 });
 await t.test('concurrent Merchant reservations cannot overspend',async()=>{
  const balance=BigInt((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable),amount=(balance*3n/4n).toString();
  const result=await Promise.allSettled(['concurrent-1','concurrent-2'].map(r=>call('merchant','payout/create',order(r,amount))));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'INSUFFICIENT_BALANCE');
  assert.ok(BigInt((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable)>=0n);
  await call('merchant','payout/review',{id:result.find(r=>r.status==='fulfilled').value.id,action:'cancel',reason:'Synthetic cancellation'});
 });
 await t.test('INR and USDT reserve the same entitlement with exact fixed FX',async()=>{
  const before=await call('alice','payout/commission');assert.equal(before.balance.payin,'75000');
  const inr=await call('alice','payout/withdrawal/create',{idempotencyKey:'inr-1',currency:'INR',amountMinor:'10000',bankId:alice.id});
  const usdt=await call('alice','payout/withdrawal/create',{idempotencyKey:'usdt-1',currency:'USDT',amountMinor:'1000000',network:'ETHEREUM-ERC20',address:'0x'+'3'.repeat(40)});
  assert.equal(usdt.entitlementMinor,'8575');assert.equal(usdt.statusLabel,'Pending Admin Processing');assert.equal(usdt.blockchainConfirmed,false);
  const balance=(await call('alice','payout/commission')).balance;assert.equal(balance.available,'56425');assert.equal(balance.reserved,'18575');
  await denied(call('bob','payout/withdrawal/get',{id:inr.id}),'FORBIDDEN');
  await call('admin','payout/withdrawal/transition',{id:inr.id,action:'reject',reason:'Synthetic request rejected'});
  await call('alice','payout/withdrawal/transition',{id:usdt.id,action:'cancel',reason:'Synthetic cancellation'});
  assert.equal((await call('alice','payout/commission')).balance.available,'75000');
 });
 await t.test('commission hold is distinct from capacity and Merchant holds',async()=>{
  const id=randomUUID(),body={id,userId:ids.alice,amountMinor:'10000',reference:'commission-hold-1',reason:'Synthetic review hold',release:false};
  const before=await tx(c=>ledger.summary(c,ids.alice));await call('admin','payout/hold/manage',body);
  assert.equal((await call('alice','payout/commission')).balance.available,'65000');assert.equal((await tx(c=>ledger.summary(c,ids.alice))).available,before.available);
  await call('admin','payout/hold/manage',{...body,release:true});assert.equal((await call('alice','payout/commission')).balance.available,'75000');
 });
 await t.test('Merchant USDT stays disabled without inventing an FX rate',async()=>{
  assert.equal((await call('merchant','payout/merchant-usdt')).message,'USDT settlement rate not configured');
  await denied(call('merchant','payout/merchant-usdt/create',{}),'MERCHANT_FX_UNCONFIGURED');
 });
 await t.test('simultaneous INR and USDT requests cannot withdraw the same entitlement twice',async()=>{
  const requests=[{idempotencyKey:'race-inr',currency:'INR',amountMinor:'60000',bankId:alice.id},{idempotencyKey:'race-usdt',currency:'USDT',amountMinor:'7000000',network:'ETHEREUM-ERC20',address:'0x'+'3'.repeat(40)}];
  const result=await Promise.allSettled(requests.map(b=>call('alice','payout/withdrawal/create',b)));assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'INSUFFICIENT_COMMISSION');
  const balance=(await call('alice','payout/commission')).balance;assert.ok(BigInt(balance.available)>=0n);assert.equal(BigInt(balance.available)+BigInt(balance.reserved),75000n);
  await call('admin','payout/withdrawal/transition',{id:result.find(r=>r.status==='fulfilled').value.id,action:'reject',reason:'Synthetic race cleanup'});
 });
 await t.test('historical FX and destination bindings are immutable; future requests use new terms',async()=>{
  const body={idempotencyKey:'fx-old',currency:'USDT',amountMinor:'1000000',network:'ETHEREUM-ERC20',address:'0x'+'3'.repeat(40)},old=await call('alice','payout/withdrawal/create',body);
  await owner.query("INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) SELECT $1,account_id,2,jsonb_set(settings,'{inrPerUsdt}','\"100\"'),actor_id FROM wpay_auth.commercial_versions WHERE account_id=$2 AND version=1",[randomUUID(),ids.alice]);
  const newer=await call('alice','payout/withdrawal/create',{...body,idempotencyKey:'fx-new'});assert.equal(newer.entitlementMinor,'10000');assert.equal(newer.rate,'100');assert.equal(newer.rateVersion,2);
  const history=await call('alice','payout/withdrawal/get',{id:old.id});assert.equal(history.rate,'85.75');assert.equal(history.rateVersion,1);assert.equal(history.entitlementMinor,'8575');
  await denied(f.runtime.query("UPDATE wpay_auth.commission_withdrawals SET snapshot='{}' WHERE id=$1",[old.id]),'42501');await assert.rejects(owner.query("UPDATE wpay_auth.commission_withdrawals SET snapshot='{}' WHERE id=$1",[old.id]));
  for(const w of [old,newer])await call('admin','payout/withdrawal/transition',{id:w.id,action:'reject',reason:'Synthetic FX test complete'});
  assert.equal((await call('alice','payout/commission')).balance.available,'75000');
 });
 await t.test('manual completion consumes once, binds network/time/reference and cannot be cancelled after processing',async()=>{
  const w=await call('alice','payout/withdrawal/create',{idempotencyKey:'manual-usdt',currency:'USDT',amountMinor:'1000000',network:'ETHEREUM-ERC20',address:'0x'+'3'.repeat(40)});
  for(const action of ['review','approve','process'])await call('admin','payout/withdrawal/transition',{id:w.id,action,reason:'Synthetic manual workflow'});
  await denied(call('alice','payout/withdrawal/transition',{id:w.id,action:'cancel',reason:'Unsafe after processing'}),'CONFLICT');await denied(call('admin','payout/withdrawal/transition',{id:w.id,action:'reject',reason:'Unsafe after processing'}),'CONFLICT');
  const complete={id:w.id,action:'complete',reason:'Synthetic manual completion',reference:'0x'+'a'.repeat(64),network:'ETHEREUM-ERC20',completedAt:new Date().toISOString()};
  await denied(call('admin','payout/withdrawal/transition',{...complete,network:'TRON-TRC20'}),'INVALID_INPUT');
  assert.equal((await call('admin','payout/withdrawal/transition',complete)).state,'completed');await call('admin','payout/withdrawal/transition',complete);
  assert.equal((await call('alice','payout/commission')).balance.available,'65000');assert.equal((await call('alice','payout/commission')).balance.withdrawn,'10000');
  const result=await call('alice','payout/withdrawal/get',{id:w.id});assert.equal(result.blockchainConfirmed,false);assert.equal(result.completion.recordType,'manual_admin_record');
  await denied(call('admin','payout/withdrawal/transition',{...complete,reference:'0x'+'b'.repeat(64)}),'CONFLICT');
  assert.equal((await owner.query("SELECT count(*)::integer AS n FROM wpay_auth.business_journals WHERE reference_type='commission_complete' AND reference_id=$1",[w.id])).rows[0].n,1);
 });
 await t.test('withdrawal approval requires recent MFA and an unchanged verified owned INR destination',async()=>{
  await denied(call('alice','payout/withdrawal/create',{idempotencyKey:'other-bank',currency:'INR',amountMinor:'100',bankId:bob.id}),'FORBIDDEN');
  const w=await call('alice','payout/withdrawal/create',{idempotencyKey:'inr-stale',currency:'INR',amountMinor:'100',bankId:alice.id});
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE account_id=$1",[ids.admin]);await denied(call('admin','payout/withdrawal/transition',{id:w.id,action:'approve',reason:'Synthetic stale MFA'}),'RECENT_MFA_REQUIRED');await owner.query('UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP WHERE account_id=$1',[ids.admin]);
  await owner.query('UPDATE wpay_auth.business_bank_accounts SET frozen=true WHERE id=$1',[alice.id]);await denied(call('admin','payout/withdrawal/transition',{id:w.id,action:'approve',reason:'Synthetic frozen bank'}),'FORBIDDEN');await owner.query('UPDATE wpay_auth.business_bank_accounts SET frozen=false WHERE id=$1',[alice.id]);
  await call('admin','payout/withdrawal/transition',{id:w.id,action:'reject',reason:'Synthetic request closed'});
 });
 await t.test('bulk batches are all-or-nothing, report bad rows and reserve once',async()=>{
  const header='reference,beneficiaryName,accountNumber,ifsc,amountINR,note\n',valid='bulk-good,Synthetic Beneficiary,999988887777,TEST0000001,100.00,Synthetic\n',bad='bulk-bad,Synthetic Beneficiary,12,bad,0,Synthetic\n';
  const file=text=>({name:'synthetic.csv',data:Buffer.from(text).toString('base64')}),before=(await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable;
  const result=await call('merchant','payout/bulk',{idempotencyKey:'bad-batch',file:file(header+valid+bad)});assert.equal(result.created,false);assert.equal(result.errors[0].row,3);assert.equal((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable,before);
  const input={idempotencyKey:'good-batch',file:file(header+valid)},created=await call('merchant','payout/bulk',input);assert.equal(created.created,true);assert.equal(created.orders.length,1);assert.equal((await call('merchant','payout/bulk',input)).orders[0].id,created.orders[0].id);
  await call('merchant','payout/review',{id:created.orders[0].id,action:'cancel',reason:'Synthetic batch cancellation'});
 });
 await t.test('bulk cannot adopt an existing single payout with a colliding row key',async()=>{
  const p=await call('merchant','payout/create',{...order('batch-collision','10000'),idempotencyKey:'collision-batch:2',note:'Synthetic'}),before=(await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable;
  const csv='reference,beneficiaryName,accountNumber,ifsc,amountINR,note\nbatch-collision,Synthetic Beneficiary,999988887777,TEST0000001,100.00,Synthetic\n';
  await denied(call('merchant','payout/bulk',{idempotencyKey:'collision-batch',file:{name:'synthetic.csv',data:Buffer.from(csv).toString('base64')}}),'CONFLICT');
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM wpay_auth.payout_batches WHERE idempotency_key='collision-batch'")).rows[0].n,0);
  assert.equal((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable,before);
  await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic collision cleanup'});
 });
 await t.test('HTTP routes enforce session, CSRF, field boundaries and return scoped projections',async()=>{
  const server=await startAuthServer({service:f.service,port:0});try{
   const origin='http://127.0.0.1:'+server.address().port,cookie='wpay_auth_dev_session='+f.sessions.merchant;
   assert.equal((await fetch(origin+'/wpay-auth/payout/orders')).status,401);
   assert.equal((await fetch(origin+'/wpay-auth/payout/create',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(order('http-no-csrf'))})).status,403);
   const csrfResponse=await fetch(origin+'/wpay-auth/csrf',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:'{}'}),csrf=await csrfResponse.json(),csrfCookie=csrfResponse.headers.getSetCookie()[0].split(';')[0];
   const response=await fetch(origin+'/wpay-auth/payout/create',{method:'POST',headers:{origin,cookie:cookie+'; '+csrfCookie,'content-type':'application/json','x-wpay-csrf-token':csrf.csrfToken},body:JSON.stringify(order('http-create'))});assert.equal(response.status,200);const p=await response.json();assert.equal(p.status,'open');
   const list=await (await fetch(origin+'/wpay-auth/payout/orders',{headers:{cookie}})).json();for(const secret of ['123456780001','encrypted_beneficiary',ids.alice])assert.equal(JSON.stringify(list).includes(secret),false);
   await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic HTTP cancellation'});
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
 // Give both Users consumed capacity through actual synthetic pay-in journals.
 await f.tx(c=>f.core.transitionBank(c,alice.id,1,'stop',ids.alice,{reason:'Synthetic queue preparation'}));await f.assign('bob');const bobPayin=await f.reserve('bob-payout-funding','6000000');await f.payin(bobPayin,'normal','987654321013');await f.tx(c=>f.core.transitionBank(c,alice.id,1,'run',ids.alice,{reason:'Synthetic queue preparation'}));
 for(const b of [alice,bob])await call('admin','payout/capability',{bankId:b.id,version:1,enabled:true,reason:'Synthetic payout capability approved'});
 const proof={name:'synthetic.pdf',data:Buffer.from('%PDF-1.4\nSynthetic proof; originating-bank metadata must not reach Merchant\n%%EOF').toString('base64')};
 let winner,loser,won,winningBank;
 await t.test('global atomic claim has one winner and no beneficiary disclosure to the loser',async()=>{
  won=await call('merchant','payout/create',order('atomic-claim','2000000'));
  for(const name of ['alice','bob']){const q=await call(name,'payout/queue');assert.ok(q.orders.some(p=>p.id===won.id));assert.equal(JSON.stringify(q.orders).includes('999988887777'),false);assert.equal(JSON.stringify(q.orders).includes('Synthetic Beneficiary'),false);}
  const outcomes=await Promise.allSettled([call('alice','payout/claim',{id:won.id,bankId:alice.id}),call('bob','payout/claim',{id:won.id,bankId:bob.id})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'CONFLICT');winner=outcomes[0].status==='fulfilled'?'alice':'bob';loser=winner==='alice'?'bob':'alice';winningBank=winner==='alice'?alice:bob;
  assert.equal((await call(winner,'payout/get',{id:won.id})).beneficiary.accountNumber,'999988887777');await denied(call(loser,'payout/get',{id:won.id}),'FORBIDDEN');
  assert.equal((await call(loser,'payout/jobs')).orders.some(p=>p.id===won.id),false);
  const merchant=JSON.stringify(await call('merchant','payout/get',{id:won.id}));for(const forbidden of [ids[winner],winningBank.id,'123456780001','123456780002','synthetic.user@bank','payoutCommission','depositAddress'])assert.equal(merchant.includes(forbidden),false);
 });
 await t.test('claim submission requires exact amount and ownership, preserves reserve, and raw proof stays private',async()=>{
  const before=await tx(c=>ledger.summary(c,ids[winner])),submission={id:won.id,amountMinor:won.amountMinor,utr:'123456789021',proof,note:'Synthetic payment submitted'};
  await denied(call(loser,'payout/submit',submission),'FORBIDDEN');await denied(call(winner,'payout/submit',{...submission,amountMinor:'2000001'}),'PAYOUT_AMOUNT');
  assert.equal((await call(winner,'payout/submit',submission)).accountingFinal,false);await call(winner,'payout/submit',submission);
  const after=await tx(c=>ledger.summary(c,ids[winner]));assert.equal(after.consumed,before.consumed);assert.equal(after.commission,before.commission);
  const detail=await call(winner,'payout/get',{id:won.id});assert.equal(detail.proof.scanState,'unscanned');const download=await call(winner,'payout/proof',{id:won.id,proofId:detail.proof.id});assert.equal(download.data,proof.data);assert.match(download.name,/^[0-9a-f-]{36}\.pdf$/);
  await denied(call('merchant','payout/proof',{id:won.id,proofId:detail.proof.id}),'FORBIDDEN');await denied(call(loser,'payout/proof',{id:won.id,proofId:detail.proof.id}),'FORBIDDEN');
  const merchant=await call('merchant','payout/get',{id:won.id});assert.equal(merchant.proof.downloadAllowed,false);assert.equal(merchant.evidence.note,undefined);
  assert.equal(JSON.stringify((await owner.query('SELECT encrypted_bytes FROM wpay_auth.payout_proofs WHERE id=$1',[detail.proof.id])).rows[0]).includes(proof.data),false);
  await denied(call(winner,'payout/release',{id:won.id}),'CONFLICT');await denied(call('merchant','payout/review',{id:won.id,action:'cancel',reason:'Must protect submitted funds'}),'CONFLICT');
 });
 await t.test('approval settles once, restores consumed capacity once and snapshots commission at completion',async()=>{
  const before=await tx(c=>ledger.summary(c,ids[winner])),commissionBefore=(await call(winner,'payout/commission')).balance,merchantBefore=await tx(c=>ledger.summary(c,ids.merchant));
  await owner.query("INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) SELECT $1,account_id,version+1,jsonb_set(settings,'{payoutCommission}','\"1.5\"'),actor_id FROM wpay_auth.commercial_versions WHERE account_id=$2 ORDER BY version DESC LIMIT 1",[randomUUID(),ids[winner]]);
  const body={id:won.id,action:'approve',reason:'Merchant acknowledges synthetic payout'};assert.equal((await call('merchant','payout/review',body)).status,'successful');await call('merchant','payout/review',body);
  const after=await tx(c=>ledger.summary(c,ids[winner])),merchantAfter=await tx(c=>ledger.summary(c,ids.merchant)),entitlement=(await call(winner,'payout/commission')).balance;
  assert.equal(BigInt(before.consumed)-BigInt(after.consumed),2000000n);assert.equal(BigInt(after.available)-BigInt(before.available),2000000n);assert.equal(after.allocated,before.allocated);
  assert.equal(BigInt(entitlement.payout)-BigInt(commissionBefore.payout),30000n);assert.equal(merchantAfter.merchantAvailable,merchantBefore.merchantAvailable);assert.equal(BigInt(merchantBefore.merchantPayoutReserved)-BigInt(merchantAfter.merchantPayoutReserved),2014050n);
  const settlements=(await owner.query('SELECT * FROM wpay_auth.payout_settlements WHERE payout_id=$1',[won.id])).rows;assert.equal(settlements.length,1);assert.equal(settlements[0].user_snapshot.settings.payoutCommission,'1.5');
  const hook=(await owner.query("SELECT body FROM wpay_auth.gateway_outbox WHERE payout_id=$1 AND event_type='payout.success'",[won.id])).rows;assert.equal(hook.length,1);for(const value of [ids[winner],winningBank.id,'123456780001','payoutCommission','depositAddress',proof.data])assert.equal(hook[0].body.includes(value),false);
 });
 await t.test('duplicate UTR cannot fund another payout; rejection protects reserve until Admin not-paid',async()=>{
  const p=await call('merchant','payout/create',order('dispute-not-paid','100000'));await call(winner,'payout/claim',{id:p.id,bankId:winningBank.id});
  await denied(call(winner,'payout/submit',{id:p.id,amountMinor:p.amountMinor,utr:'123456789021',proof,note:''}),'DUPLICATE_TRANSFER');
  await call(winner,'payout/submit',{id:p.id,amountMinor:p.amountMinor,utr:'123456789022',proof,note:''});
  const before=await tx(c=>ledger.summary(c,ids[winner])),mBefore=await tx(c=>ledger.summary(c,ids.merchant));
  assert.equal((await call('merchant','payout/review',{id:p.id,action:'reject',reason:'Merchant requests independent review'})).status,'merchant_rejected_review');
  await f.tx(c=>f.service.payouts.expire(c));assert.equal((await call('merchant','payout/get',{id:p.id})).status,'merchant_rejected_review');await denied(call(loser,'payout/claim',{id:p.id,bankId:(loser==='alice'?alice:bob).id}),'CONFLICT');
  assert.equal((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable,mBefore.merchantAvailable);assert.equal((await tx(c=>ledger.summary(c,ids[winner]))).consumed,before.consumed);
  const resolve={id:p.id,action:'not_paid',reason:'Synthetic Admin confirms no payment'};await call('admin','payout/resolve',resolve);await call('admin','payout/resolve',resolve);
  assert.equal((await tx(c=>ledger.summary(c,ids[winner]))).consumed,before.consumed);assert.equal(BigInt((await tx(c=>ledger.summary(c,ids.merchant))).merchantAvailable)-BigInt(mBefore.merchantAvailable),100750n);
 });
 await t.test('Admin confirm-paid uses the same settlement once and requires recent MFA',async()=>{
  const p=await call('merchant','payout/create',order('dispute-paid','100000'));await call(winner,'payout/claim',{id:p.id,bankId:winningBank.id});await call(winner,'payout/submit',{id:p.id,amountMinor:p.amountMinor,utr:'123456789023',proof,note:''});await call('merchant','payout/review',{id:p.id,action:'reject',reason:'Synthetic review requested'});
  const body={id:p.id,action:'paid',reason:'Synthetic Admin confirms payment'},before=await tx(c=>ledger.summary(c,ids[winner]));
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE account_id=$1",[ids.admin]);await denied(call('admin','payout/resolve',body),'RECENT_MFA_REQUIRED');await owner.query('UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP WHERE account_id=$1',[ids.admin]);
  await call('admin','payout/resolve',body);await call('admin','payout/resolve',body);assert.equal(BigInt(before.consumed)-BigInt((await tx(c=>ledger.summary(c,ids[winner]))).consumed),100000n);assert.equal((await owner.query('SELECT count(*)::integer AS n FROM wpay_auth.payout_settlements WHERE payout_id=$1',[p.id])).rows[0].n,1);
 });
 await t.test('unsubmitted lease expires safely while submitted claims never expire or reassign',async()=>{
  // Backdated synthetic rows exercise PostgreSQL's actual clock without altering
  // immutable production bindings or weakening expiry guards.
  for(const submitted of [false,true]){
   const p=await call('merchant','payout/create',order('expiry-'+submitted,'10000')),claimId=randomUUID();
   await owner.query("INSERT INTO wpay_auth.payout_claims(id,payout_id,user_id,bank_id,bank_version,account_key,state,created_at,expires_at) SELECT $1,$2,$3,bank_id,version,account_key,$4,CURRENT_TIMESTAMP-interval '20 minutes',CURRENT_TIMESTAMP-interval '5 minutes' FROM wpay_auth.business_bank_identities WHERE bank_id=$5 AND version=1",[claimId,p.id,ids[winner],submitted?'submitted':'active',winningBank.id]);await owner.query('UPDATE wpay_auth.payout_orders SET state=$2 WHERE id=$1',[p.id,submitted?'submitted':'claimed']);
   await f.tx(c=>f.service.payouts.expire(c));assert.equal((await call('merchant','payout/get',{id:p.id})).status,submitted?'submitted':'open');
   if(submitted)await denied(call(loser,'payout/claim',{id:p.id,bankId:(loser==='alice'?alice:bob).id}),'CONFLICT');else{const claimed=await call(loser,'payout/claim',{id:p.id,bankId:(loser==='alice'?alice:bob).id});assert.equal(claimed.status,'claimed');await call(loser,'payout/release',{id:p.id});await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic lease test complete'});}
  }
 });
 await t.test('claim eligibility enforces owner bank, current capability, conservative capacity and session expiry',async()=>{
  const p=await call('merchant','payout/create',order('claim-security','10000'));
  await denied(call(winner,'payout/claim',{id:p.id,bankId:(loser==='alice'?alice:bob).id}),'FORBIDDEN');
  await call('admin','payout/capability',{bankId:winningBank.id,version:1,enabled:false,reason:'Synthetic capability revocation'});await denied(call(winner,'payout/claim',{id:p.id,bankId:winningBank.id}),'PAYOUT_BANK_REQUIRED');await call('admin','payout/capability',{bankId:winningBank.id,version:1,enabled:true,reason:'Synthetic capability restoration'});
  const big=await call('merchant','payout/create',order('excess-capacity','4000000'));await denied(call(winner,'payout/claim',{id:big.id,bankId:winningBank.id}),'INSUFFICIENT_CAPACITY');await call('merchant','payout/review',{id:big.id,action:'cancel',reason:'Synthetic capacity test complete'});
  const session=(await owner.query('SELECT created_at,expires_at FROM wpay_auth.sessions WHERE account_id=$1',[ids[loser]])).rows[0];await owner.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '13 hours',expires_at=CURRENT_TIMESTAMP-interval '1 hour' WHERE account_id=$1",[ids[loser]]);await denied(call(loser,'payout/queue'),'AUTH_FAILED');await owner.query('UPDATE wpay_auth.sessions SET created_at=$2,expires_at=$3 WHERE account_id=$1',[ids[loser],session.created_at,session.expires_at]);
  await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic security test complete'});
 });
 await t.test('parallel jobs cannot promise the same consumed capacity and outgoing limits also constrain incoming routing',async()=>{
  const bank=loser==='alice'?alice:bob,created=[];for(const ref of ['capacity-race-1','capacity-race-2'])created.push(await call('merchant','payout/create',order(ref,'4000000')));
  const before=(await f.tx(c=>f.core.candidates(c,ids.merchant))).find(r=>r.bankId===bank.id).bankRemainingMinor;
  const result=await Promise.allSettled(created.map(p=>call(loser,'payout/claim',{id:p.id,bankId:bank.id})));assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'INSUFFICIENT_CAPACITY');
  const after=(await f.tx(c=>f.core.candidates(c,ids.merchant))).find(r=>r.bankId===bank.id).bankRemainingMinor;assert.equal(BigInt(before)-BigInt(after),4000000n);
  await call(loser,'payout/release',{id:result.find(r=>r.status==='fulfilled').value.id});for(const p of created)await call('merchant','payout/review',{id:p.id,action:'cancel',reason:'Synthetic concurrent job complete'});
 });
 await t.test('cross-Merchant access denies; Employee needs explicit permission and tenant scope',async()=>{
  const password='Task 11 synthetic other principal passphrase!';await f.service.register({name:'Synthetic Other Merchant',email:'other@11.example.invalid',password,accountType:'merchant'},'127.0.0.1');const other=(await owner.query("SELECT id FROM wpay_auth.accounts WHERE email='other@11.example.invalid'")).rows[0].id;
  await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=$1",[other]);await owner.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) SELECT $1,$2,1,settings,$3 FROM wpay_auth.commercial_versions WHERE account_id=$4 LIMIT 1',[randomUUID(),other,ids.admin,ids.merchant]);
  const login=await f.service.login({email:'other@11.example.invalid',password},'127.0.0.1'),setup=await f.service.mfa.challenge(login.challengeToken,'setup',{}),verified=await f.service.mfa.challenge(login.challengeToken,'verify',{code:await f.crypto.libraries().otp.generate({secret:setup.setupKey})}),session=(await f.service.mfa.challenge(verified.challengeToken,'complete',{saved:true})).sessionToken,otherCall=(route,body={})=>f.service.authenticated(session,route,0,body);
  await denied(otherCall('payout/get',{id:won.id}),'FORBIDDEN');assert.equal((await otherCall('payout/orders')).orders.length,0);await denied(otherCall('payout/review',{id:won.id,action:'approve',reason:'Cross Merchant approval denied'}),'FORBIDDEN');
  await owner.query("UPDATE wpay_auth.accounts SET account_type='employee',merchant_id=NULL WHERE id=$1",[other]);await owner.query("UPDATE wpay_auth.grants SET permissions=ARRAY['profile.view','account_security.view','account_security.update'],admin_scope=NULL WHERE account_id=$1",[other]);
  for(const route of ['payout/orders','payout/withdrawals','payout/holds','payout/queue'])await denied(otherCall(route),'FORBIDDEN');
  await owner.query("UPDATE wpay_auth.grants SET permissions=permissions||ARRAY['payout_operations.view'],admin_scope=$2 WHERE account_id=$1",[other,{tenantIds:['wpay-auth-development']}]);assert.ok((await otherCall('payout/orders')).orders.length>0);
  const detail=await otherCall('payout/get',{id:won.id});await denied(otherCall('payout/proof',{id:won.id,proofId:detail.proof.id}),'FORBIDDEN');await denied(otherCall('payout/resolve',{id:won.id,action:'paid',reason:'No resolution permission'}),'FORBIDDEN');
  await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[other,{tenantIds:['other-tenant']}]);assert.equal((await otherCall('payout/orders')).orders.length,0);await denied(otherCall('payout/get',{id:won.id}),'FORBIDDEN');
 });
 await t.test('payout events use the existing signed durable webhook retry dispatcher',async()=>{
  const http=require('node:http'),{Gateway}=require('../lib/wpay/gateway/core'),{verifySignature}=require('../lib/wpay/gateway/webhooks');let status=503,secret;const received=[];
  const callback=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({body,headers:req.headers,valid:verifySignature(secret,req.headers,body)});res.writeHead(status);res.end('Synthetic callback');});await new Promise(resolve=>callback.listen(0,'127.0.0.1',resolve));
  try{const gateway=new Gateway({pool:f.runtime,crypto:f.crypto,allowSynthetic:true,testCallback:'http://127.0.0.1:'+callback.address().port+'/payout-callback'});f.service.gateway=gateway;f.service.payouts.gateway=gateway;secret=(await call('merchant','gateway/webhooks/configure',{url:gateway.testCallback})).secret;
   const p=await call('merchant','payout/create',order('webhook-payout','10000'));await gateway.dispatch();assert.equal(received.length,1);assert.equal(received[0].valid,true);const first=JSON.parse(received[0].body);assert.equal(first.eventType,'payout.created');assert.equal(first.payoutId,p.id);
   status=200;await call('merchant','gateway/webhooks/retry',{id:first.eventId});await gateway.dispatch();assert.equal(received[1].body,received[0].body);assert.equal(received[1].valid,true);
   const bank=loser==='alice'?alice:bob;await call(loser,'payout/claim',{id:p.id,bankId:bank.id});await call(loser,'payout/submit',{id:p.id,amountMinor:p.amountMinor,utr:'123456789031',proof,note:''});await call('merchant','payout/review',{id:p.id,action:'reject',reason:'Synthetic webhook dispute'});await call('admin','payout/resolve',{id:p.id,action:'paid',reason:'Synthetic webhook resolution'});
   const cancelled=await call('merchant','payout/create',order('webhook-cancel','10000'));await call('merchant','payout/review',{id:cancelled.id,action:'cancel',reason:'Synthetic callback cancellation'});
   for(let n=0;n<8;n++)if(!await gateway.dispatch())break;
   const kinds=new Set(received.map(r=>JSON.parse(r.body).eventType));for(const kind of ['payout.created','payout.claimed','payout.success','payout.rejected_review','payout.cancelled'])assert.ok(kinds.has(kind));assert.ok(received.every(r=>r.valid));
   for(const r of received)for(const forbidden of [secret,ids.alice,ids.bob,alice.id,bob.id,'encrypted_secret','payoutCommission','depositAddress'])assert.equal(r.body.includes(forbidden),false);
  }finally{await new Promise(resolve=>callback.close(resolve));}
 });
 await t.test('logout denies future reads while an accepted submitted payment can still settle',async()=>{
  const p=await call('merchant','payout/create',order('logout-settlement','10000'));await call(winner,'payout/claim',{id:p.id,bankId:winningBank.id});await call(winner,'payout/submit',{id:p.id,amountMinor:p.amountMinor,utr:'123456789029',proof,note:''});
  await call(winner,'logout');await denied(call(winner,'payout/get',{id:p.id}),'AUTH_FAILED');await denied(call(winner,'payout/queue'),'AUTH_FAILED');
  const before=await tx(c=>ledger.summary(c,ids[winner]));assert.equal((await call('merchant','payout/review',{id:p.id,action:'approve',reason:'Accepted payment survives browser logout'})).status,'successful');assert.equal(BigInt(before.consumed)-BigInt((await tx(c=>ledger.summary(c,ids[winner]))).consumed),10000n);
 });
});
