'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {migrate,transaction}=require('../lib/wpay/db/migrations'),ledger=require('../lib/wpay/business/ledger');
const disputes=require('../lib/wpay/payouts/disputes'),{Payouts}=require('../lib/wpay/payouts/core'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
const {entitlement}=require('../lib/wpay/payouts/accounting'),uploads=require('../lib/wpay/payouts/uploads');
test('48-hour dispute deadline includes only the period after approval and before the exact boundary',()=>{const approved=new Date('2026-09-25T12:00:00Z');assert.equal(disputes.withinWindow(approved,new Date(+approved+48*3600000-1)),true);for(const at of [new Date(+approved-1),new Date(+approved+48*3600000),'invalid'])assert.equal(disputes.withinWindow(approved,at),false);});
test('dispute statement coverage rejects missing payment interval, stale and future dates',()=>{
 const now=new Date('2026-09-25T12:00:00Z'),paid=new Date('2026-09-25T11:00:00Z');
 assert.doesNotThrow(()=>disputes.coverage({coverageFrom:paid.toISOString(),coverageThrough:now.toISOString()},paid,now));
 for(const body of [{coverageFrom:now.toISOString(),coverageThrough:now.toISOString()},{coverageFrom:paid.toISOString(),coverageThrough:paid.toISOString()},{coverageFrom:'invalid',coverageThrough:now.toISOString()},{coverageFrom:paid.toISOString(),coverageThrough:'2026-09-26T12:00:00Z'}])assert.throws(()=>disputes.coverage(body,paid,now),{code:'INVALID_INPUT'});
});
test('PostgreSQL: post-approval dispute holds, responses, exact reversals and immutable final decisions',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='payout_disputes_'+randomUUID().replaceAll('-','');
 await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});await migrate(pool);
 const admin=randomUUID(),merchant=randomUUID(),user=randomUUID();
 for(const [id,type]of [[admin,'super_admin'],[merchant,'merchant'],[user,'user']]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,'dispute-test','Synthetic',$3,$4,'active',$5,$6)",[id,randomUUID(),id+'@example.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);await pool.query('INSERT INTO wpay_auth.account_security(account_id,enabled) VALUES($1,false)',[id]);
 }
 for(const [id,settings]of [[merchant,{payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'}],[user,{payoutCommission:'1',inrPerUsdt:'107'}]])await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),id,settings,admin]);
 const crypto=new MfaCrypto(randomBytes(32)),core=new Payouts({crypto,gateway:{merchant:async()=>{},emit:async()=>{}}}),tx=fn=>transaction(pool,fn);
 await tx(c=>ledger.post(c,{key:'synthetic-merchant',referenceType:'test',referenceId:'test',entries:ledger.pair(merchant,'merchant_gross','1000000')}));
 let seq=0;const proof=async label=>uploads.proof({name:'synthetic.pdf',data:Buffer.from('%PDF-1.4\n'+label+'\n%%EOF').toString('base64')});
 async function paid(){
  const n=++seq,p=await tx(c=>core.create(c,merchant,{reference:'payout-'+n,idempotencyKey:'payout-'+n,transferMode:'upi',upiId:'synthetic@test',beneficiaryName:'Synthetic Recipient',amountMinor:'10000',durationMinutes:30}));
  await tx(async c=>{const rows=(await c.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[p.id])).rows;await require('../lib/wpay/payouts/approval').decide(core,c,rows,admin,'approve','Synthetic approval');});
  await tx(c=>core.claim(c,user,{id:p.id}));const evidence=await proof('payment-'+n);
  await tx(c=>core.submit(c,p,user,{amountMinor:'10000',utr:'TESTPAYMENT'+String(n).padStart(8,'0'),note:''},evidence));
  await tx(c=>core.settle(c,p,merchant,'Synthetic payment review',false));return p;
 }
 async function opening(p,label){const now=(await pool.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;return {body:{id:p.id,reason:'Synthetic missing payment',coverageFrom:new Date(+now-3600000).toISOString(),coverageThrough:now.toISOString()},proof:await proof('fresh-statement-'+label)};}
 const p=await paid(),m0=await ledger.summary(pool,merchant),s=await opening(p,'one');
 assert.equal((await ledger.summary(pool,user)).available,'10000');
 const open=()=>tx(c=>disputes.open(core,c,p,merchant,s.body,s.proof));
 const duplicate=await Promise.all([open(),open()]);assert.equal(duplicate[0].id,duplicate[1].id);
 assert.equal((await ledger.summary(pool,user)).held,'10000');assert.equal((await entitlement(pool,user)).held,'100');assert.equal((await disputes.holds(pool,{ids:[user],tenants:null}))[0].state,'active');assert.equal((await disputes.holds(pool,{ids:[merchant],tenants:null})).length,0);
 await assert.rejects(tx(c=>disputes.open(core,c,p,user,s.body,s.proof)),{code:'FORBIDDEN'});
 await assert.rejects(tx(c=>disputes.open(core,c,p,merchant,{...s.body,reason:'Another dispute'},s.proof)),{code:'CONFLICT'});
 const reply={id:p.id,reason:'Synthetic recipient payment explanation'},replyProof=await proof('extra proof');
 await tx(c=>disputes.respond(core,c,p,user,reply,replyProof));await tx(c=>disputes.respond(core,c,p,user,reply,replyProof));
 assert.equal((await disputes.detail(pool,p.id)).responses.length,1);
 const valid={id:p.id,action:'payment_valid',reason:'Reviewed statement and confirmed receipt'};
 await tx(c=>disputes.resolve(core,c,p,admin,valid));await tx(c=>disputes.resolve(core,c,p,admin,valid));
 assert.equal((await ledger.summary(pool,user)).available,'10000');assert.equal((await ledger.summary(pool,user)).held,'0');assert.equal((await entitlement(pool,user)).held,'0');assert.equal((await ledger.summary(pool,merchant)).merchantAvailable,m0.merchantAvailable);assert.equal((await disputes.holds(pool,{ids:[user],tenants:null}))[0].state,'released');
 await assert.rejects(tx(c=>disputes.resolve(core,c,p,admin,{...valid,action:'payment_invalid'})),{code:'CONFLICT'});
 await assert.rejects(pool.query('DELETE FROM wpay_auth.payout_dispute_resolutions'),/WPAY_APPEND_ONLY/);
 const second=await paid(),s2=await opening(second,'two');
 await tx(c=>ledger.post(c,{key:'synthetic-used-capacity',referenceType:'test',referenceId:'test',entries:[...ledger.pair(user,'capacity_consumed','20000'),...ledger.pair(user,'user_commission_withdrawn','200')]}));
 await tx(c=>disputes.open(core,c,second,merchant,s2.body,s2.proof));
 assert.equal((await ledger.summary(pool,user)).signedAvailable,'-10000');assert.equal((await entitlement(pool,user)).signedAvailable,'-100');
 const before=await ledger.summary(pool,merchant),invalid={id:second.id,action:'payment_invalid',reason:'Reviewed fresh statement; payment not received'};
 await tx(c=>disputes.resolve(core,c,second,admin,invalid));await tx(c=>disputes.resolve(core,c,second,admin,invalid));
 const after=await ledger.summary(pool,merchant);assert.equal(BigInt(after.merchantAvailable)-BigInt(before.merchantAvailable),10700n);assert.equal(after.merchantPayoutReserved,'0');
 assert.equal((await ledger.summary(pool,user)).held,'0');assert.equal((await ledger.summary(pool,user)).signedAvailable,'-10000');assert.equal((await entitlement(pool,user)).held,'0');assert.equal((await entitlement(pool,user)).signedAvailable,'-100');
 assert.equal((await pool.query('SELECT state FROM wpay_auth.payout_orders WHERE id=$1',[second.id])).rows[0].state,'successful');
 assert.equal((await tx(async c=>core.detail(c,(await c.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[second.id])).rows[0],'merchant'))).status,'reversed');
 // This payout reduces consumed capacity instead of allocating more: reversal
 // must restore that exact path, not debit capacity_allocated a second time.
 const third=await paid(),s3=await opening(third,'three'),allocated=(await ledger.summary(pool,user)).allocated;
 await tx(c=>disputes.open(core,c,third,merchant,s3.body,s3.proof));await tx(c=>disputes.resolve(core,c,third,admin,{...invalid,id:third.id}));
 assert.equal((await ledger.summary(pool,user)).allocated,allocated);assert.equal((await ledger.summary(pool,user)).signedAvailable,'-10000');
 const api=require('../lib/wpay/payouts/api'),context={principal:{id:admin,type:'super_admin',status:'active',tenantId:'dispute-test',permissionVersion:1},currentPermissionVersion:1,grants:['payout_operations.view','payout_operations.resolve'],adminScope:{tenantIds:['other-tenant'],platform:false}};
 await assert.rejects(tx(c=>api.run(core,c,{id:admin,account_type:'super_admin'},context,'payout/dispute/resolve',invalid)),{code:'FORBIDDEN'});
 const list=await tx(c=>api.run(core,c,{id:admin,account_type:'super_admin'},context,'payout/dispute/search',{}));assert.equal(list.orders.length,0);
});
