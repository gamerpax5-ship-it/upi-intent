"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/wpay-9a-fixture'),{csv}=require('./helpers/wpay-onboarding-setup');
const {PaymentEvidence}=require('../lib/wpay/onboarding/evidence'),{startAuthServer,SESSION_COOKIE}=require('../lib/wpay/auth/runtime/http');
test('Task 9B real PostgreSQL and HTTP onboarding acceptance',{timeout:180000},async t=>{
 const f=await fixture(t),{owner,ids,call,tx,core,service,sessions}=f,proofs=new Map();
 service.onboarding.workflow.evidence=new PaymentEvidence({allowSynthetic:true,verify:async c=>proofs.get(c.id)});
 const details={upiId:'synthetic.9b@bank',bankName:'Synthetic Bank',holderName:'Synthetic User',accountNumber:'123456789001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'100000000',accountType:'personal',providerName:'',notes:'Synthetic onboarding acceptance'};
 const bank=await call('alice','business/banks/save',{bankId:null,version:null,details}),base={bankId:bank.id,version:1},transition=action=>call('alice','business/banks/transition',{...base,action,reason:'Synthetic lifecycle acceptance'});
 const create=()=>call('alice','onboarding/create',{...base,requestId:randomUUID()});let challenge;
 async function trusted(id,patch={}){const c=(await owner.query('SELECT * FROM wpay_auth.upi_verification_challenges WHERE id=$1',[id])).rows[0];const p={verified:true,status:'credited',currency:'INR',challengeId:c.id,ownerId:c.owner_id,bankId:c.bank_id,bankVersion:c.bank_version,receivingUpi:c.expected_upi,accountDigest:c.account_digest,amountMinor:String(c.amount_minor),paymentId:'synthetic-payment-'+c.id,source:'synthetic-test',receivedAt:new Date()};proofs.set(id,{...p,...patch});return p;}
 const poll=id=>call('alice','onboarding/poll',{challengeId:id}),reset=id=>owner.query('UPDATE wpay_auth.upi_verification_challenges SET last_attempt_at=NULL WHERE id=$1',[id]);
 await t.test('Employee role is denied before any onboarding query; empty analytics are real zeros',async()=>{
  for(const operation of ['onboarding/create','onboarding/upload','onboarding/analytics'])await assert.rejects(service.onboarding.run({query:()=>{throw Error('Must deny before reading');}},{account_type:'employee'},{},operation,{}),{code:'FORBIDDEN'});
  const a=(await call('alice','onboarding/analytics')).banks[0];assert.deepEqual([a.total,a.successful,a.failed,a.successful_volume_minor,a.successRate],[0,0,0,'0',null]);
 });
 await t.test('approval and current owner scope precede QR or statement access',async()=>{
  await assert.rejects(create(),{code:'CONFLICT'});await transition('submit');await call('admin','business/banks/review',{...base,action:'approve',reason:'Synthetic approved bank'});
  for(const name of ['bob','merchant','admin'])await assert.rejects(call(name,'onboarding/create',{...base,requestId:randomUUID()}),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','onboarding/create',{...base,version:2,requestId:randomUUID()}),{code:'CONFLICT'});
  const input={...base,requestId:randomUUID()};const results=await Promise.all([call('alice','onboarding/create',input),call('alice','onboarding/create',input),create()]);challenge=results[0];assert.ok(results.every(r=>r.id===challenge.id));assert.match(challenge.qr,/^data:image\/png;base64/);assert.ok(+challenge.amountMinor>=100&&+challenge.amountMinor<=999);assert.equal((await owner.query("SELECT 1 FROM wpay_auth.upi_verification_challenges WHERE bank_id=$1 AND status='waiting'",[bank.id])).rowCount,1);
 });
 await t.test('missing and wrong trusted evidence never verifies; browser proof fields reject',async()=>{
  assert.equal((await poll(challenge.id)).message,'Waiting for verified payment evidence');
  for(const patch of [{amountMinor:'9999'},{ownerId:ids.bob},{receivingUpi:'other@bank'},{accountDigest:'0'.repeat(64)},{bankVersion:2},{source:'legacy-success'},{status:'failed'},{receivedAt:new Date(Date.now()-3600000)}]){await trusted(challenge.id,patch);await reset(challenge.id);assert.equal((await poll(challenge.id)).status,'waiting');}
  await assert.rejects(call('alice','onboarding/poll',{challengeId:challenge.id,verified:true}),{code:'INVALID_INPUT'});
  await assert.rejects(call('bob','onboarding/poll',{challengeId:challenge.id}),{code:'FORBIDDEN'});assert.equal((await core.bankRecord(owner,bank.id)).verified_version,null);
 });
 await t.test('verification, one-use evidence and audit commit atomically; duplicates credit nothing',async()=>{
  await trusted(challenge.id);await reset(challenge.id);
  await assert.rejects(tx(async c=>{assert.equal((await service.onboarding.workflow.challenge(c,ids.alice,{challengeId:challenge.id})).status,'verified');throw Error('synthetic rollback');}),/synthetic rollback/);
  assert.equal((await core.bankRecord(owner,bank.id)).verified_version,null);assert.equal((await owner.query('SELECT 1 FROM wpay_auth.upi_consumed_evidence')).rowCount,0);
  const results=await Promise.all([poll(challenge.id),poll(challenge.id)]);assert.ok(results.every(r=>r.status==='verified'));assert.equal((await core.bankRecord(owner,bank.id)).status,'verified');
  assert.equal((await owner.query('SELECT 1 FROM wpay_auth.upi_consumed_evidence')).rowCount,1);assert.equal((await owner.query("SELECT 1 FROM wpay_auth.business_audit WHERE event='upi_verified'")).rowCount,1);assert.equal((await call('alice','business/summary')).allocated,'0');
 });
 await t.test('Enable does not Start; confirmed funding, accepted version statement and device gate are mandatory',async()=>{
  await transition('enable');await assert.rejects(transition('run'),{code:'FUNDING_REQUIRED'});
  const input={ownerId:ids.alice,amountMinor:'6000000',reference:'synthetic-confirmed-funding-9b',kind:'collateral'};f.proofs.set(input.reference,{verified:true,kind:'capacity_credit',evidenceId:input.reference,ownerId:ids.alice,amountMinor:input.amountMinor,reference:input.reference,creditKind:'collateral',status:'confirmed'});await tx(c=>core.allocateConfirmed(c,input));
  await assert.rejects(transition('run'),{code:'STATEMENT_REQUIRED'});assert.equal((await core.bankRecord(owner,bank.id)).status,'enabled');
  await f.assign('alice');await assert.rejects(f.reserve('not-started','100'),{code:'NO_ROUTE'});
 });
 let imported;
 await t.test('statement imports are bounded, owner/version bound, immutable and never payment truth',async()=>{
  const input={...base,requestId:randomUUID(),format:'csv',base64:Buffer.from(csv).toString('base64')};
  for(const name of ['bob','merchant','admin'])await assert.rejects(call(name,'onboarding/upload',input),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','onboarding/upload',{...input,format:'exe'}),{code:'INVALID_INPUT'});
  assert.equal((await call('alice','onboarding/upload',{...input,requestId:randomUUID(),base64:Buffer.from('invalid statement').toString('base64')})).status,'rejected');
  imported=await call('alice','onboarding/upload',input);assert.equal(imported.status,'accepted');assert.equal(imported.financialEvidence,false);assert.equal((await call('alice','onboarding/upload',input)).id,imported.id);
  await assert.rejects(call('alice','onboarding/upload',{...input,base64:Buffer.from(csv+'\n').toString('base64')}),{code:'CONFLICT'});
  await assert.rejects(call('bob','onboarding/import',{importId:imported.id}),{code:'FORBIDDEN'});
  await assert.rejects(f.runtime.query("UPDATE wpay_auth.bank_statement_imports SET status='accepted'"),{code:'42501'});
  assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_financial_events')).rowCount,0);assert.equal((await call('alice','business/summary')).consumed,'0');
  await owner.query('INSERT INTO wpay_auth.business_routing_requirements(owner_id,device_required) VALUES($1,true)',[ids.alice]);await assert.rejects(transition('run'),{code:'DEVICE_REQUIRED'});
  await owner.query('UPDATE wpay_auth.business_routing_requirements SET device_eligible=true WHERE owner_id=$1',[ids.alice]);await transition('run');assert.equal((await core.bankRecord(owner,bank.id)).status,'running');await transition('stop');await assert.rejects(f.reserve('stopped','100'),{code:'NO_ROUTE'});await transition('run');
 });
 await t.test('analytics uses once-accounted success and terminal failures with explicit exclusions',async()=>{
  const success=await f.reserve('analytics-success','1000');await f.payin(success,'normal','987654321099');
  const failure=await f.reserve('analytics-failed','100');await tx(c=>core.release(c,failure.id,ids.alice,'released'));await owner.query("INSERT INTO wpay_auth.upi_order_outcomes(reservation_id,outcome,evidence_digest) VALUES($1,'failed',$2)",[failure.id,'1'.repeat(64)]);
  const cancelled=await f.reserve('analytics-cancelled','100');await tx(c=>core.release(c,cancelled.id,ids.alice,'cancelled'));await f.reserve('analytics-pending','100');
  const a=(await call('alice','onboarding/analytics')).banks.find(b=>b.id===bank.id);assert.deepEqual([a.total,a.successful,a.failed,a.cancelled,a.pending,a.eligibleCompleted,a.successRate,a.successful_volume_minor],[4,1,1,1,1,2,50,'1000']);
  assert.equal((await call('bob','onboarding/analytics')).banks.length,0);await assert.rejects(call('merchant','onboarding/analytics'),{code:'FORBIDDEN'});
 });
 await t.test('freeze and sensitive edits invalidate verification and require new statement acceptance',async()=>{
  await call('admin','business/banks/review',{...base,action:'stop',reason:'Synthetic Admin stop'});assert.equal((await core.bankRecord(owner,bank.id)).status,'stopped');await transition('run');
  await call('admin','business/banks/review',{...base,action:'freeze',reason:'Synthetic Admin freeze'});await assert.rejects(transition('run'),{code:'CONFLICT'});await assert.rejects(create(),{code:'CONFLICT'});
  await call('admin','business/banks/review',{...base,action:'release_freeze',reason:'Synthetic release requires reapproval'});
  const edited=await call('alice','business/banks/save',{...base,details:{...details,upiId:'synthetic.edited@bank'}});base.version=edited.version;
  await call('admin','business/banks/review',{...base,action:'approve',reason:'Synthetic revised bank approval'});assert.equal((await call('alice','business/banks')).banks[0].statement_accepted,false);
  challenge=await create();await call('alice','business/banks/save',{...base,details:{...details,upiId:'synthetic.third@bank'}});assert.equal((await owner.query('SELECT status FROM wpay_auth.upi_verification_challenges WHERE id=$1',[challenge.id])).rows[0].status,'invalidated');await assert.rejects(poll(challenge.id),{code:'CONFLICT'});base.version=3;
  await call('admin','business/banks/review',{...base,action:'approve',reason:'Synthetic current bank approval'});
 });
 await t.test('cancel, natural expiry and consumed-payment replay never verify a new challenge',async()=>{
  challenge=await create();await call('alice','onboarding/cancel',{challengeId:challenge.id});assert.equal((await poll(challenge.id)).status,'cancelled');
  challenge=await create();await owner.query("UPDATE wpay_auth.upi_verification_challenges SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE id=$1",[challenge.id]);await new Promise(resolve=>setTimeout(resolve,150));assert.equal((await poll(challenge.id)).status,'expired');
  challenge=await create();const first=(await owner.query("SELECT id FROM wpay_auth.upi_verification_challenges WHERE status='verified' LIMIT 1")).rows[0];await trusted(challenge.id,{paymentId:'synthetic-payment-'+first.id});assert.equal((await poll(challenge.id)).status,'waiting');assert.equal((await core.bankRecord(owner,bank.id)).verified_version,null);
 });
 await t.test('HTTP auth/CSRF, recent MFA and logout forbid challenge and statement access',async()=>{
  const server=await startAuthServer({service,port:0});t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));const origin='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(origin+'/wpay-auth/onboarding/analytics')).status,401);
  assert.equal((await fetch(origin+'/wpay-auth/onboarding/create',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:SESSION_COOKIE+'='+sessions.alice},body:JSON.stringify({...base,requestId:randomUUID()})})).status,403);
  const csrf=await fetch(origin+'/wpay-auth/csrf',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:SESSION_COOKIE+'='+sessions.alice},body:'{}'}),token=await csrf.json(),cookie=csrf.headers.getSetCookie()[0].split(';')[0];
  const valid=await fetch(origin+'/wpay-auth/onboarding/upload',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:SESSION_COOKIE+'='+sessions.alice+'; '+cookie,'X-WPay-CSRF-Token':token.csrfToken},body:JSON.stringify({...base,requestId:randomUUID(),format:'csv',base64:Buffer.from(csv+'\n'.repeat(5000)).toString('base64')})});assert.equal(valid.status,200);assert.equal((await valid.json()).status,'accepted');
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE account_id=$1",[ids.alice]);await assert.rejects(poll(challenge.id),{code:'RECENT_MFA_REQUIRED'});
  await call('alice','logout');await assert.rejects(call('alice','onboarding/analytics'),{code:'AUTH_FAILED'});await assert.rejects(poll(challenge.id),{code:'AUTH_FAILED'});
  await owner.query('UPDATE wpay_auth.account_security SET enabled=false WHERE account_id=$1',[ids.bob]);await assert.rejects(call('bob','onboarding/analytics'),{code:'AUTH_FAILED'});await owner.query('UPDATE wpay_auth.account_security SET enabled=true WHERE account_id=$1',[ids.bob]);
  await owner.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '12 hours 1 second',expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE account_id=$1",[ids.bob]);await assert.rejects(call('bob','onboarding/analytics'),{code:'AUTH_FAILED'});
 });
});
