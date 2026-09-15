"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {migrate,validateMigrations,transaction}=require('../lib/wpay/db/migrations'),{verifyRuntimeRole}=require('../lib/wpay/db/hosted-config');
const {AuthService,DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service'),{SecurityRepository}=require('../lib/wpay/db/security-repository');
const {MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),{hashPassword}=require('../lib/wpay/auth/runtime/passwords');
const {BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger'),money=require('../lib/wpay/business/money');
const {startAuthServer,SESSION_COOKIE}=require('../lib/wpay/auth/runtime/http');
const onboarding=require('./helpers/wpay-onboarding-setup');
test('Task 8 actual isolated PostgreSQL business core and HTTP authorization',{timeout:240000},async t=>{
 assert.equal(process.env.WPAY_BUSINESS_TEST_CONFIRM,'fresh-local-synthetic-only');const config=JSON.parse(fs.readFileSync(process.env.WPAY_BUSINESS_TEST_CONFIG,'utf8'));
 for(const k of ['migration','runtime']){assert.equal(config[k].host,'127.0.0.1');assert.match(config[k].database,/^wpay_(8_business_[0-9]+|business_ci)$/);}
 const owner=new Pool(config.migration),runtime=new Pool(config.runtime);let server;
 t.after(async()=>{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await Promise.all([owner.end(),runtime.end()]);});
 assert.equal((await owner.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname IN('public','wpay_auth')")).rowCount,0,'Fresh target only; never reset a used database.');
 await migrate(owner);await validateMigrations(owner);await validateMigrations(runtime);await verifyRuntimeRole(runtime);
 const crypto=new MfaCrypto(Buffer.from(config.mfaKey,'base64')),repo=new SecurityRepository(runtime),service=new AuthService(repo,{mfaCrypto:crypto,fixedCurrency:'INR'}),setup=new AuthService(new SecurityRepository(owner),{mfaCrypto:crypto});
 const password='Task 8 synthetic acceptance passphrase!';await setup.bootstrap({name:'Synthetic Business Admin',email:'admin@business.example.invalid',password});
 for(const [name,type] of [['alice','user'],['bob','user'],['merchant','merchant'],['second','merchant'],['third','merchant']])await service.register({name:'Synthetic '+name,email:name+'@business.example.invalid',password,accountType:type},'127.0.0.1');
 const record=await hashPassword(password),ownerRepo=new SecurityRepository(owner);
 for(const [name,permissions] of [['employee',DEFAULT_GRANTS.employee],['reviewer',[...DEFAULT_GRANTS.employee,'bank_upi.view','bank_upi.review']]]){
  const id=await ownerRepo.createAccount({name:'Synthetic '+name,email:name+'@business.example.invalid',accountType:'employee'},record,permissions);
  if(name==='reviewer')await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[id,{tenantIds:['wpay-auth-development']}]);
 }
 const ids=Object.fromEntries((await owner.query('SELECT id,email FROM wpay_auth.accounts')).rows.map(r=>[r.email.split('@')[0],r.id]));
 // Explicit isolated setup; real Admin MFA approval is covered by the auth suite.
 await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved',operations_enabled=true,statement_satisfied=true");
 for(const name of ['alice','bob','merchant','second','third'])await owner.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[name],['alice','bob'].includes(name)?{payinCommission:'1.25',payoutCommission:'0.5',inrPerUsdt:'85.75',depositNetwork:'ETHEREUM-ERC20',depositAddress:'0x'+'1'.repeat(40)}:{payinFee:'1.2',payoutFee:'0.7',fixedPayoutFee:'0.5',fixedFeeCurrency:'INR'},ids.admin]);
 const sessions={};for(const name of Object.keys(ids)){
  const first=await service.login({email:name+'@business.example.invalid',password},'127.0.0.1'),enroll=await service.mfa.challenge(first.challengeToken,'setup',{});
  const code=await crypto.libraries().otp.generate({secret:enroll.setupKey}),verified=await service.mfa.challenge(first.challengeToken,'verify',{code});
  sessions[name]=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true})).sessionToken;
 }
 const call=(name,route,body={})=>service.authenticated(sessions[name],route,0,body),tx=fn=>transaction(runtime,fn),proofs=new Map();
 const core=new BusinessCore({verifyEvidence:async(kind,input)=>proofs.get(input.evidenceReference||input.reference)||null});
 const details={upiId:'synthetic.user@bank',bankName:'Synthetic Bank',holderName:'Synthetic Holder',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'1000000000',accountType:'personal',providerName:'',notes:'Synthetic business integration test'};
 const banks={},assignments={};
 const assign=async(merchant,user)=>{const data={id:null,merchantId:ids[merchant],userId:ids[user],priority:10,weight:1,minMinor:'1',maxMinor:'1000000000',enabled:true};const result=await call('admin','business/assignments/update',data);assignments[merchant+user]={...data,id:result.id};return result;};
 const reserve=(merchant,order,amount,ttlSeconds=300)=>tx(client=>core.reserve(client,ids[merchant],{orderReference:order,idempotencyKey:order,amountMinor:amount,ttlSeconds}));
 async function proofFor(reservation,source,reference,utr){const r=(await owner.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1',[reservation.id])).rows[0];proofs.set(reference,{verified:true,kind:'payin',evidenceId:reference,economicId:'economic:'+reference,utr,source,reservationId:r.id,bankId:r.bank_id,bankVersion:r.bank_version,userId:r.user_id,merchantId:r.merchant_id,amountMinor:r.amount_minor,currency:'INR'});}
 async function consume(reservation,source,reference,utr){await proofFor(reservation,source,reference,utr);return tx(client=>core.confirmedPayin(client,{reservationId:reservation.id,evidenceReference:reference}));}
 await t.test('zero summaries, bank submission isolation, strict safe fields and no client verification',async()=>{
  const zero=await call('alice','business/summary');assert.equal(zero.available,'0');assert.equal(zero.commission,'0');
  assert.deepEqual((await call('alice','business/banks')).actions,['create','update']);
  const merchant=await call('merchant','business/summary');assert.equal(merchant.gross,'0');assert.equal(merchant.routingAvailable,false);
  await assert.rejects(call('merchant','business/banks'),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','business/banks/save',{bankId:null,version:null,details:{...details,password:'forbidden'}}),{code:'INVALID_INPUT'});
  await assert.rejects(call('alice','business/banks/save',{bankId:null,version:null,details:{...details,notes:'bank password credential'}}),{code:'INVALID_INPUT'});
  for(const name of ['alice','bob'])banks[name]=await call(name,'business/banks/save',{bankId:null,version:null,details:{...details,upiId:'synthetic.'+name+'@bank'}});
  await assert.rejects(call('bob','business/banks/save',{bankId:banks.alice.id,version:1,details}),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','business/banks/transition',{bankId:banks.alice.id,version:1,action:'request_verification',reason:'Synthetic verification request'}),{code:'CONFLICT'});
  await assert.rejects(call('alice','business/banks/review',{bankId:banks.alice.id,version:1,action:'approve',reason:'Synthetic self approval'}),{code:'FORBIDDEN'});
 });
 await t.test('audited Admin review and disabled real verifier hook enforce lifecycle',async()=>{
  for(const name of ['alice','bob']){
   const base={bankId:banks[name].id,version:1,reason:'Synthetic owner-reviewed lifecycle test'};
   await call(name,'business/banks/transition',{...base,action:'submit'});await call('admin','business/banks/review',{...base,action:'review'});await call('admin','business/banks/review',{...base,action:'approve'});
   await call(name,'business/banks/transition',{...base,action:'request_verification'});
   await assert.rejects(tx(c=>new BusinessCore().verifyBank(c,base.bankId,1,'not-connected')),{code:'UNAVAILABLE'});
   const ref='bank-'+name;proofs.set(ref,{verified:true,kind:'bank_verification',bankId:base.bankId,version:1,evidenceId:ref});
   await tx(c=>core.verifyBank(c,base.bankId,1,ref));await onboarding.statement(tx,ids[name],banks[name]);await call(name,'business/banks/transition',{...base,action:'enable'});await assert.rejects(call(name,'business/banks/transition',{...base,action:'run'}),{code:'FUNDING_REQUIRED'});
  }
 });
 await t.test('Employee default denies; explicit view/review grants produce bounded navigation and mutation rights',async()=>{
  for(const route of ['business/banks','business/assignments','business/ledger','business/routing'])await assert.rejects(call('employee',route),{code:'FORBIDDEN'});
  assert.equal((await call('reviewer','business/banks')).banks.length,2);
  await assert.rejects(call('reviewer','business/banks/review',{bankId:banks.alice.id,version:1,action:'freeze',reason:'No freeze grant'}),{code:'FORBIDDEN'});
  const nav=JSON.stringify(await call('employee','navigation'));assert.doesNotMatch(nav,/business-assignments|Bank \/ UPI Reviews/);
 });
 await t.test('confirmed capacity allocation is exact, idempotent and requires independent evidence',async()=>{
  for(const [name,amount] of [['alice','100000000'],['bob','10000']]){
   const input={ownerId:ids[name],amountMinor:amount,reference:'fund-'+name,kind:'collateral'};
   await assert.rejects(tx(c=>new BusinessCore().allocateConfirmed(c,input)),{code:'UNAVAILABLE'});
   proofs.set(input.reference,{verified:true,kind:'capacity_credit',evidenceId:input.reference,ownerId:input.ownerId,amountMinor:amount,reference:input.reference,creditKind:'collateral',status:'confirmed'});
   const first=await tx(c=>core.allocateConfirmed(c,input)),second=await tx(c=>core.allocateConfirmed(c,input));assert.equal(first.journalId,second.journalId);assert.equal((await call(name,'business/summary')).allocated,amount);
   await onboarding.startEnabled(tx,core,ids[name]);
  }
 });
 await t.test('assignment is Admin-controlled; Merchant cannot choose another User or bank',async()=>{
  await assign('merchant','alice');await assign('second','bob');
  await assert.rejects(call('merchant','business/assignments/update',assignments.merchantalice),{code:'FORBIDDEN'});
  await assert.rejects(call('third','business/reservations/reserve',{orderReference:'unassigned',idempotencyKey:'unassigned',amountMinor:'100',ttlSeconds:300}),{code:'NO_ROUTE'});
  const summary=JSON.stringify(await call('merchant','business/summary'));for(const forbidden of [ids.alice,banks.alice.id,details.accountNumber,details.mobile,'synthetic.alice@bank'])assert.equal(summary.includes(forbidden),false);
 });
 let normal,reserved;
 await t.test('normal pay-in consumes a reservation once, snapshots terms and matches the capacity example',async()=>{
  normal=await reserve('merchant','normal-order','30000000');assert.equal(normal.paymentCreated,false);
  const result=await consume(normal,'normal','normal-proof','111111111111');assert.equal(result.commissionMinor,'375000');assert.equal(result.feeMinor,'360000');
  reserved=await reserve('merchant','remaining-order','10000000');const b=await call('alice','business/summary');
  assert.deepEqual([b.allocated,b.reserved,b.consumed,b.available],['100000000','10000000','30000000','60000000']);
  const merchant=await call('merchant','business/summary');assert.deepEqual([merchant.gross,merchant.fees,merchant.available],['30000000','360000','29640000']);
  const replay=await tx(c=>core.confirmedPayin(c,{reservationId:normal.id,evidenceReference:'normal-proof'}));assert.equal(replay.alreadyAccounted,true);
  const changed={...proofs.get('normal-proof'),source:'statement_recovered'};proofs.set('normal-later-recovery',changed);
  const recovered=await tx(c=>core.confirmedPayin(c,{reservationId:normal.id,evidenceReference:'normal-later-recovery'}));assert.equal(recovered.source,'normal');assert.equal((await call('alice','business/summary')).commission,'375000');
 });
 await t.test('two concurrent Merchants cannot oversubscribe one User capacity',async()=>{
  await assign('third','bob');const results=await Promise.allSettled(['second','third'].map(name=>call(name,'business/reservations/reserve',{orderReference:'race-'+name,idempotencyKey:'race-'+name,amountMinor:'6000',ttlSeconds:300})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='NO_ROUTE').length,1);
  const success=results.find(r=>r.status==='fulfilled').value;assert.equal((await call('bob','business/summary')).available,'4000');
  await tx(c=>core.release(c,success.id,ids.admin));await tx(c=>core.release(c,success.id,ids.admin));assert.equal((await call('bob','business/summary')).available,'10000');
  await assert.rejects(call('merchant','business/reservations/release',{reservationId:success.id}),{code:'FORBIDDEN'});
 });
 let expiry;
 await t.test('reservation idempotency binds Merchant order and amount, with no bank identity in output',async()=>{
  expiry=await reserve('second','expiry-order','1000',30);assert.deepEqual(await reserve('second','expiry-order','1000',30),expiry);
  await assert.rejects(reserve('second','expiry-order','2000',30),{code:'CONFLICT'});assert.equal(Object.hasOwn(expiry,'userId'),false);assert.equal(Object.hasOwn(expiry,'bankId'),false);
 });
 await t.test('new commercial versions never reprice old reservations; recovered commission is zero',async()=>{
  for(const name of ['alice','merchant']){const prior=(await owner.query('SELECT settings FROM wpay_auth.commercial_versions WHERE account_id=$1',[ids[name]])).rows[0].settings;
   await owner.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,2,$3,$4)',[randomUUID(),ids[name],name==='alice'?{...prior,payinCommission:'9'}:{...prior,payinFee:'8'},ids.admin]);}
  const result=await consume(reserved,'statement_recovered','recovered-proof','222222222222');assert.equal(result.commissionMinor,'0');assert.equal(result.feeMinor,'120000');
  assert.equal((await call('alice','business/summary')).commission,'375000');const fresh=await reserve('merchant','new-rate','10000');
  const newResult=await consume(fresh,'normal','new-rate-proof','333333333333');assert.equal(newResult.feeMinor,'800');assert.equal(newResult.commissionMinor,'900');
  await assert.rejects(owner.query('UPDATE wpay_auth.commercial_versions SET version=version WHERE account_id=$1',[ids.alice]),{code:'42501'});
 });
 await t.test('duplicate financial evidence cannot credit a different order or remove prior commission',async()=>{
  const duplicate=await reserve('merchant','duplicate-evidence','10000');await proofFor(duplicate,'statement_recovered','duplicate-proof','333333333333');
  await assert.rejects(tx(c=>core.confirmedPayin(c,{reservationId:duplicate.id,evidenceReference:'duplicate-proof'})),{code:'CONFLICT'});
  await tx(c=>core.release(c,duplicate.id,ids.admin));assert.equal((await call('alice','business/summary')).commission,'375900');
 });
 await t.test('User and Merchant holds reduce availability and release exactly once',async()=>{
  for(const name of ['alice','merchant']){const before=await call(name,'business/summary');const input={id:randomUUID(),ownerId:ids[name],amountMinor:'1000',reference:'hold-'+name,reason:'Synthetic administrative hold',release:false};
   await call('admin','business/holds/update',input);await call('admin','business/holds/update',input);assert.equal(BigInt((await call(name,'business/summary')).available),BigInt(before.available)-1000n);
   await assert.rejects(call(name,'business/holds/update',{...input,release:true}),{code:'FORBIDDEN'});await call('admin','business/holds/update',{...input,release:true});await call('admin','business/holds/update',{...input,release:true});assert.equal((await call(name,'business/summary')).available,before.available);}
 });
 await t.test('bank stop/freeze, disabled assignment and identity edits stop new routing without rewriting history',async()=>{
  const base={bankId:banks.alice.id,version:1,reason:'Synthetic stop review'};await call('alice','business/banks/transition',{...base,action:'stop'});
  await assert.rejects(reserve('merchant','stopped','100'),{code:'NO_ROUTE'});await call('alice','business/banks/transition',{...base,action:'enable'});
  await call('admin','business/banks/review',{...base,action:'freeze'});await assert.rejects(reserve('merchant','frozen','100'),{code:'NO_ROUTE'});
  const edit=await call('alice','business/banks/save',{bankId:base.bankId,version:1,details:{...details,holderName:'Synthetic Updated Holder'}});assert.equal(edit.status,'submitted');
  const current=await tx(c=>core.bankRecord(c,base.bankId));assert.equal(current.verified_version,null);assert.equal(current.frozen,true);
  const history=(await owner.query('SELECT snapshot FROM wpay_auth.business_reservations WHERE id=$1',[normal.id])).rows[0];assert.equal(history.snapshot.route.bankVersion,1);
  await call('admin','business/assignments/update',{...assignments.merchantalice,enabled:false});await assert.rejects(reserve('merchant','disabled','100'),{code:'NO_ROUTE'});
  await call('alice','business/banks/transition',{bankId:base.bankId,version:2,action:'deactivate',reason:'Synthetic soft deactivation'});
  assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_bank_versions WHERE bank_id=$1',[base.bankId])).rowCount,2);assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_financial_events WHERE reservation_id=$1',[normal.id])).rowCount,1);
 });
 await t.test('append-only balanced/sealed journals reject mutation, late lines, unbalanced posts and tampered snapshots',async()=>{
  const journal=(await owner.query('SELECT id FROM wpay_auth.business_journals ORDER BY created_at LIMIT 1')).rows[0].id;
  for(const sql of ['UPDATE wpay_auth.business_entries SET amount_minor=1','DELETE FROM wpay_auth.business_journals','TRUNCATE wpay_auth.business_audit'])await assert.rejects(runtime.query(sql),{code:'42501'});
  await assert.rejects(owner.query('UPDATE wpay_auth.business_entries SET amount_minor=amount_minor'),{code:'42501'});
  await assert.rejects(runtime.query("INSERT INTO wpay_auth.business_entries(id,journal_id,owner_key,book,ledger_type,direction,amount_minor,currency) VALUES($1,$2,'system:wpay','cash','clearing','credit',1,'INR')",[randomUUID(),journal]),{code:'42501'});
  await assert.rejects(tx(async c=>{await c.query("INSERT INTO wpay_auth.business_journals(id,idempotency_key,payload_digest,reference_type,reference_id,actor_source,snapshot,metadata) VALUES($1,$2,$3,'test','unbalanced','synthetic','{}','{}')",[randomUUID(),'unbalanced', '0'.repeat(64)]);}),{code:'23514'});
  await assert.rejects(runtime.query("UPDATE wpay_auth.business_reservations SET snapshot='{}'"),{code:'42501'});
  const sums=(await owner.query("SELECT journal_id,book,currency FROM wpay_auth.business_entries GROUP BY journal_id,book,currency HAVING sum(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END)<>0")).rows;assert.equal(sums.length,0);
 });
 await t.test('HTTP CSRF/authentication and projection forbid raw bank data, actor injection and confirmation endpoints',async()=>{
  server=await startAuthServer({service,port:0});const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(name,route)=>fetch(origin+'/wpay-auth/'+route,{headers:name?{Cookie:`${SESSION_COOKIE}=${sessions[name]}`}:{}});
  assert.equal((await request(null,'business/summary')).status,401);assert.equal((await request('merchant','business/banks')).status,403);
  const summary=await(await request('merchant','business/summary')).json();assert.equal(Object.hasOwn(summary,'userId'),false);
  const merchantLedger=await call('merchant','business/ledger');const text=JSON.stringify(merchantLedger);for(const secret of [details.accountNumber,details.mobile,details.upiId,'depositAddress','bankVersion',ids.alice])assert.equal(text.includes(secret),false);
  const noCsrf=await fetch(origin+'/wpay-auth/business/assignments/update',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:`${SESSION_COOKIE}=${sessions.admin}`},body:'{}'});assert.equal(noCsrf.status,403);
  for(const route of ['business/confirm-payin','business/verify-bank','business/credit','api/device/otp-event'])assert.equal((await request('admin',route)).status,404);
  await assert.rejects(call('alice','business/ledger/search',{ownerId:ids.bob,reference:'',type:'',offset:0}),{code:'FORBIDDEN'});
 });
 await t.test('expiry uses the real database clock and release events restore capacity once',async()=>{
  const remaining=+new Date(expiry.expiresAt)-Date.now()+100;if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  const before=(await call('bob','business/summary')).available;await tx(c=>core.expire(c));await tx(c=>core.expire(c));
  const r=(await owner.query('SELECT state FROM wpay_auth.business_reservations WHERE id=$1',[expiry.id])).rows[0];assert.equal(r.state,'expired');assert.equal((await call('bob','business/summary')).available,before);
  assert.equal((await owner.query("SELECT 1 FROM wpay_auth.business_reservation_events WHERE reservation_id=$1 AND state='expired'",[expiry.id])).rowCount,1);
 });
 await t.test('late statement recovery requires released capacity and awards zero commission',async()=>{
  const before=await call('bob','business/summary');const result=await consume(expiry,'statement_recovered','late-recovery','444444444444');
  assert.equal(result.commissionMinor,'0');assert.equal(BigInt((await call('bob','business/summary')).available),BigInt(before.available)-1000n);
  await tx(c=>core.confirmedPayin(c,{reservationId:expiry.id,evidenceReference:'late-recovery'}));assert.equal((await call('bob','business/summary')).commission,'0');
 });
 await t.test('payout and parking return hooks require approved completion and never execute a transfer',async()=>{
  for(const kind of ['payout_return','parking_return']){const input={ownerId:ids.bob,amountMinor:'100',reference:kind,kind};
   const proof={verified:true,kind:'capacity_credit',evidenceId:kind,ownerId:ids.bob,amountMinor:'100',reference:kind,creditKind:kind,status:'pending',approved:true};proofs.set(kind,proof);
   await assert.rejects(tx(c=>core.allocateConfirmed(c,input)),{code:'FORBIDDEN'});proof.status='completed';proof.approved=false;
   await assert.rejects(tx(c=>core.allocateConfirmed(c,input)),{code:'FORBIDDEN'});proof.approved=true;
   const before=(await call('bob','business/summary')).allocated;await tx(c=>core.allocateConfirmed(c,input));await tx(c=>core.allocateConfirmed(c,input));assert.equal(BigInt((await call('bob','business/summary')).allocated),BigInt(before)+100n);
  }
 });
 await t.test('exact minor-unit arithmetic and explicit administrative adjustments have no floating point drift',async()=>{
  assert.equal(money.fromDecimal('0.01'),'1');assert.equal(money.fee('999999999999999999999999','0.000001'),'9999999999999999');assert.throws(()=>money.fromDecimal(0.1));
  const input={ownerId:ids.bob,amountMinor:'1',direction:'credit',idempotencyKey:'adjust-one',reference:'adjust-one',reason:'Synthetic rounding reconciliation'};
  const before=(await call('bob','business/summary')).allocated;await tx(c=>core.adjustment(c,ids.admin,input));await tx(c=>core.adjustment(c,ids.admin,input));assert.equal(BigInt((await call('bob','business/summary')).allocated),BigInt(before)+1n);
  await assert.rejects(call('employee','business/ledger/adjust',input),{code:'FORBIDDEN'});
 });
 await t.test('Admin tenant scope excludes foreign banks, assignments, routing, ledger and mutations',async()=>{
  await owner.query('UPDATE wpay_auth.accounts SET tenant_id=$2 WHERE id=$1',[ids.bob,'isolated-other-tenant']);
  assert.equal((await call('admin','business/banks')).banks.some(b=>b.owner_id===ids.bob),false);
  assert.equal((await call('admin','business/assignments')).assignments.some(a=>a.user_id===ids.bob),false);
  assert.equal((await call('admin','business/routing')).candidates.some(c=>c.userId===ids.bob),false);
  assert.deepEqual((await call('admin','business/ledger/search',{ownerId:ids.bob,reference:'',type:'',offset:0})).entries,[]);
  await assert.rejects(call('reviewer','business/banks/review',{bankId:banks.bob.id,version:1,action:'review',reason:'Foreign tenant review denied'}),{code:'FORBIDDEN'});
  await assert.rejects(call('admin','business/assignments/update',assignments.secondbob),{code:'FORBIDDEN'});
 });
 assert.equal((await owner.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname='public'")).rowCount,0);await validateMigrations(runtime);
});
