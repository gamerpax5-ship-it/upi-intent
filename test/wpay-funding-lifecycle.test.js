'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {migrate,transaction}=require('../lib/wpay/db/migrations');
const {FundingWorkflow,retry}=require('../lib/wpay/funding/workflow');
const {manualReview}=require('../lib/wpay/funding/manual-review');
const {providerFixture}=require('./helpers/wpay-funding-provider-fixture');
const ledger=require('../lib/wpay/business/ledger'),net=require('../lib/wpay/funding/networks');
const collection=require('../lib/wpay/business/collection-policy');

test('PostgreSQL funding lifecycle: automatic/manual races, fee, reversal and exemptions',{timeout:120000},async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const server=new Pool({connectionString:url.toString()}),name='funding_lifecycle_'+randomUUID().replaceAll('-','');
 await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()}),flow=new FundingWorkflow();
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await migrate(pool);
 const admin=randomUUID(),ids=Array.from({length:4},()=>randomUUID());
 for(const id of [admin,...ids]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id) VALUES($1,$2,'funding-lifecycle','Synthetic Test',$3,$4,'active',$5)",[id,randomUUID(),id+'@example.invalid',id===admin?'super_admin':'user',id===admin?null:id]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
 }
 async function terms(id,rate,version=1){await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,version,{inrPerUsdt:rate,depositNetwork:'ETHEREUM-ERC20',depositAddress:'0x'+String(ids.indexOf(id)+1).repeat(40)},admin]);}
 for(const id of ids)await terms(id,'107');
 const create=(id,amount)=>retry(pool,c=>flow.create(c,{id,tenant_id:'funding-lifecycle'},{idempotencyKey:randomUUID(),amountUsdt:amount}));
 async function evidence(r,char){
  const claim={request_id:r.id,tx_hash:'0x'+char.repeat(64),event_index:0,transfer_key:net.transferKey(r.snapshot.network,'0x'+char.repeat(64),0)};
  const proof=await providerFixture(r.snapshot,claim).provider.verify(r.snapshot,claim);assert.equal(proof.state,'verified');return {claim,proof};
 }
 const auto=(r,e)=>retry(pool,c=>flow.applyVerification(c,r,e.claim,e.proof));
 const human=r=>retry(pool,c=>manualReview(flow,c,r,{requestId:r.id,action:'manual_confirm',reason:'Synthetic independently reviewed receipt'},admin));
 const review=(r,e,action)=>retry(pool,c=>flow.review(c,r,{requestId:r.id,action,reason:'Synthetic reversal or restoration',evidenceReference:'synthetic-receipt',attributionReference:'synthetic-owner',network:r.snapshot.network,token:r.snapshot.token,address:r.snapshot.address,amountUsdt:'2000',txHash:e.claim.tx_hash,eventIndex:0,reviewedFinal:true},admin));
 let first,firstEvidence;
 await t.test('automatic and manual approval racing credits once at the locked rate',async()=>{
  first=await create(ids[0],'2000');firstEvidence=await evidence(first,'a');await terms(ids[0],'109',2);
  const results=await Promise.all([auto(first,firstEvidence),human(first)]);assert.ok(results.every(r=>r.state==='confirmed'));
  const r=await flow.request(pool,first.id);assert.equal(r.credit_minor,'20330000');assert.equal(r.snapshot.rate,'107');assert.equal(r.accounting_version,1);
  assert.equal((await ledger.summary(pool,ids[0])).available,'20330000');
  assert.equal((await pool.query("SELECT 1 FROM wpay_auth.funding_events WHERE request_id=$1 AND kind='confirmed'",[r.id])).rowCount,1);
  assert.equal((await pool.query('SELECT initial_deposit_satisfied FROM wpay_auth.eligibility WHERE account_id=$1',[ids[0]])).rows[0].initial_deposit_satisfied,true);
  await auto(first,firstEvidence);await human(first);assert.equal((await ledger.summary(pool,ids[0])).available,'20330000');
 });
 await t.test('later top-up uses the new account rate without a second fee',async()=>{
  const r=await create(ids[0],'1');assert.equal(r.snapshot.minimumMinor,'1');const result=await auto(r,await evidence(r,'b'));
  assert.equal(result.setupFeeMinor,'0');assert.equal(result.creditMinor,'10900');assert.equal((await ledger.summary(pool,ids[0])).available,'20340900');
 });
 await t.test('reversal removes only net credit and repeated restoration never refunds or reapplies fee',async()=>{
  const before=await ledger.summary(pool,ids[0]);await review(first,firstEvidence,'reverse');await review(first,firstEvidence,'reverse');
  assert.equal((await ledger.summary(pool,ids[0])).available,'10900');
  const result=await review(first,firstEvidence,'restore');assert.equal(result.setupFeeMinor,'100000000');assert.equal(result.creditMinor,'20330000');
  await review(first,firstEvidence,'restore');assert.deepEqual(await ledger.summary(pool,ids[0]),before);
  assert.equal((await flow.request(pool,first.id)).accounting_version,3);
 });
 await t.test('two distinct first deposits racing charge one fee across the account',async()=>{
  const a=await create(ids[1],'2000'),b=await create(ids[1],'3000'),ea=await evidence(a,'c'),eb=await evidence(b,'d');
  const results=await Promise.all([auto(a,ea),auto(b,eb)]);assert.ok(results.every(r=>r.state==='confirmed'));
  assert.equal(results.reduce((n,r)=>n+BigInt(r.setupFeeMinor),0n),100000000n);
  assert.equal((await ledger.summary(pool,ids[1])).available,'52430000');
 });
 await t.test('Free Setup allows a smaller optional deposit with no fee and unlimited collection',async()=>{
  await transaction(pool,c=>collection.setAccess(c,admin,{userId:ids[2],freeSetup:true,unlimitedCollection:false,reason:'Synthetic free setup'}));
  const r=await create(ids[2],'1');assert.equal(r.snapshot.minimumMinor,'1');
  const result=await auto(r,await evidence(r,'e'));assert.equal(result.setupFeeMinor,'0');assert.equal(result.creditMinor,'10700');
  assert.equal((await collection.access(pool,ids[2])).unlimited_collection,true);
 });
 await t.test('historical collateral credit exempts existing funded accounts',async()=>{
  await transaction(pool,async c=>{await ledger.lock(c);await ledger.post(c,{key:'synthetic-collateral',referenceType:'collateral',referenceId:ids[3],entries:ledger.pair(ids[3],'capacity_allocated','10700')});});
  const r=await create(ids[3],'2000'),result=await auto(r,await evidence(r,'f'));
  assert.equal(result.setupFeeMinor,'0');assert.equal(result.creditMinor,'21400000');
 });
});
