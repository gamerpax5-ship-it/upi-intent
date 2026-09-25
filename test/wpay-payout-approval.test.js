'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {Payouts}=require('../lib/wpay/payouts/core'),input=require('../lib/wpay/payouts/validation'),approval=require('../lib/wpay/payouts/approval'),uploads=require('../lib/wpay/payouts/uploads'),ledger=require('../lib/wpay/business/ledger');
const {migrate,validateMigrations,transaction}=require('../lib/wpay/db/migrations');
const base={reference:'test-payout',idempotencyKey:'test-key',beneficiaryName:'Test Receiver',amountMinor:'10000',durationMinutes:30,transferMode:'upi',upiId:'receiver@test'};
test('independent bank/UPI destinations and 15 minute routing boundary',()=>{
 assert.equal(input.order(base).accountNumber,'');assert.equal(input.order({...base,transferMode:'bank',upiId:'',accountNumber:'1234567890',ifsc:'TEST0000001'}).upiId,'');
 for(const b of [{...base,accountNumber:'1234567890'},{...base,bankName:'Test Bank'},{...base,upiId:''},{...base,durationMinutes:14},{...base,durationMinutes:30.5},{...base,transferMode:'cash'}])assert.throws(()=>input.order(b));
 const now=new Date();assert.equal(approval.routable(new Date(+now+20*60000),now),true);assert.equal(approval.routable(new Date(+now+10*60000),now),false);assert.equal(approval.routable(new Date(+now+15*60000),now),true);assert.equal(approval.routable(new Date(+now+15*60000-1),now),false);
});
test('both Excel templates accept numeric amounts and per-row durations',async()=>{
 const XLSX=require('../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js'),core=new Payouts({});
 for(const mode of ['bank','upi']){const template=uploads.template(mode),book=XLSX.read(template.data,{type:'base64'}),sheet=book.Sheets[book.SheetNames[0]],headers=XLSX.utils.sheet_to_json(sheet,{header:1})[0];
  assert.equal(headers.includes('upiId'),mode==='upi');assert.equal(headers.includes('accountNumber'),mode==='bank');
  const values={reference:'test-row',beneficiaryName:'Test Receiver',bankName:'Test Bank',accountNumber:'1234567890',ifsc:'TEST0000001',upiId:'receiver@test',amountINR:12.34,durationMinutes:30,note:''};
  XLSX.utils.sheet_add_aoa(sheet,[headers.map(h=>values[h])],{origin:'A2'});
  const file={name:template.name,data:XLSX.write(book,{type:'base64',bookType:'xlsx'})},p=await core.prepare('payout/bulk',{idempotencyKey:'test-batch',transferMode:mode,file});assert.deepEqual(p.errors,[]);assert.equal(p.orders[0].amountMinor,'1234');assert.equal(p.orders[0].durationMinutes,30);assert.equal(p.orders[0].transferMode,mode);
 }
});
function tronAddress(){const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',payload=Buffer.concat([Buffer.from([0x41]),Buffer.alloc(20,7)]),sha=b=>createHash('sha256').update(b).digest(),bytes=Buffer.concat([payload,sha(sha(payload)).subarray(0,4)]);let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=chars[Number(n%58n)]+s;n/=58n;}return s;}
test('PostgreSQL: 50-order approval, deadlines, financial replay and USDT available balance',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='payout_approval_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await migrate(pool,{through:23});await migrate(pool);await validateMigrations(pool);
 const admin=randomUUID(),merchant=randomUUID(),foreign=randomUUID();
 for(const [id,type,tenant]of [[admin,'super_admin','a'],[merchant,'merchant','a'],[foreign,'merchant','b']]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,merchant_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7)",[id,randomUUID(),tenant,type,id+'@example.invalid',type,type==='merchant'?id:null]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);await pool.query('INSERT INTO wpay_auth.account_security(account_id,enabled) VALUES($1,false)',[id]);await pool.query("INSERT INTO wpay_auth.grants(account_id,permissions,permission_version) VALUES($1,ARRAY['merchant.payout.create'],1)",[id]);
 }
 await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),merchant,{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR',inrPerUsdt:'109'},admin]);
 const {Gateway}=require('../lib/wpay/gateway/core'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),crypto=new MfaCrypto(randomBytes(32)),gateway=new Gateway({pool,crypto}),core=new Payouts({gateway,crypto}),tx=fn=>transaction(pool,fn);
 await tx(c=>ledger.post(c,{key:'test-funding',referenceType:'test',referenceId:'test',entries:ledger.pair(merchant,'merchant_gross','10000000')}));
 const request={idempotencyKey:'fifty-batch'},prepared={errors:[],orders:Array.from({length:50},(_,i)=>({...base,reference:'row-'+i,idempotencyKey:'row-'+i}))};
 const result=await tx(c=>core.bulk(c,merchant,request,prepared));assert.equal(result.orders.length,50);assert.ok(result.orders.every(r=>r.status==='pending_admin'));
 assert.equal((await ledger.summary(pool,merchant)).merchantPayoutReserved,'535000');
 const pending=await approval.list(pool,['a']);assert.equal(pending.requests.length,1);assert.equal(pending.requests[0].order_count,50);assert.equal((await approval.list(pool,['b'])).requests.length,0);
 const {run}=require('../lib/wpay/payouts/api'),context={principal:{id:admin,type:'super_admin',status:'active',tenantId:'a',permissionVersion:1},currentPermissionVersion:1,grants:['payout_operations.view','payout_operations.resolve'],adminScope:{tenantIds:['a'],platform:true}};
 const decide=(id,action='approve',ctx=context)=>tx(async c=>{const now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;return run(core,c,{id:admin,account_type:'super_admin',auth_method:'password',mfa_at:null,password_at:now,created_at:now,database_now:now,status:'active',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0},ctx,'payout/approval/decide',{id,action,reason:'Synthetic Admin review'});});
 await assert.rejects(decide(pending.requests[0].id,'approve',{...context,adminScope:{tenantIds:['b'],platform:false}}),{code:'FORBIDDEN'});
 const approved=await decide(pending.requests[0].id);assert.equal(approved.approved,50);assert.equal((await decide(pending.requests[0].id)).approved,50);assert.equal((await ledger.summary(pool,merchant)).merchantPayoutReserved,'535000');
 assert.equal((await tx(c=>core.bulk(c,merchant,request,prepared))).orders.length,50);
 // An approved bulk upload becomes 50 independent jobs, never one bulk job.
 const user=randomUUID(),bank=randomUUID();
 await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id) VALUES($1,$2,'a','Test User',$3,'user','active',$1)",[user,randomUUID(),user+'@example.invalid']);
 await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied) VALUES($1,'approved',true)",[user]);await pool.query('INSERT INTO wpay_auth.account_security(account_id,enabled) VALUES($1,false)',[user]);
 await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),user,{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107'},admin]);
 await pool.query('UPDATE wpay_auth.bank_onboarding_policy SET statement_required=false');
 await pool.query("INSERT INTO wpay_auth.business_bank_accounts(id,owner_id,version,status,approved_version,verified_version) VALUES($1,$2,1,'running',1,1)",[bank,user]);
 await pool.query('INSERT INTO wpay_auth.business_bank_versions(bank_id,version,details,limit_minor,actor_id) VALUES($1,1,$2,2000000,$3)',[bank,{holderName:'Test User',accountNumber:'1234567890',ifsc:'TEST0000001'},admin]);
 await pool.query("INSERT INTO wpay_auth.business_bank_identities(bank_id,version,account_key) VALUES($1,1,'test-bank-key')",[bank]);
 await pool.query("INSERT INTO wpay_auth.payout_capabilities(id,bank_id,bank_version,actor_id,reason) VALUES($1,$2,1,$3,'Test capability')",[randomUUID(),bank,admin]);
 await tx(c=>ledger.post(c,{key:'test-user-capacity',referenceType:'test',referenceId:'user',entries:[...ledger.pair(user,'capacity_allocated','2000000'),...ledger.pair(user,'capacity_consumed','1000000')]}));
 const jobs=await tx(c=>core.queue(c,user));assert.equal(jobs.orders.length,50);assert.equal(new Set(jobs.orders.map(r=>r.id)).size,50);
 const job=jobs.orders[0];const claim=await tx(c=>core.claim(c,user,{id:job.id,bankId:bank}));assert.equal(claim.status,'claimed');
 const detail=await tx(async c=>core.detail(c,(await c.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[job.id])).rows[0],'user'));assert.equal(detail.beneficiary.upiId,'receiver@test');assert.equal(detail.beneficiary.accountNumber,'');
 const proof=await uploads.proof({name:'test-proof.pdf',data:Buffer.from('%PDF-1.4\nTest proof\n%%EOF').toString('base64')});
 await tx(async c=>core.submit(c,(await c.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[job.id])).rows[0],user,{amountMinor:'10000',utr:'123456789012',note:''},proof));
 assert.equal((await pool.query('SELECT state FROM wpay_auth.payout_orders WHERE id=$1',[job.id])).rows[0].state,'submitted');
 const approvePayment=()=>tx(async c=>core.settle(c,(await c.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[job.id])).rows[0],merchant,'Merchant reviewed proof',false));
 assert.equal((await approvePayment()).status,'successful');await approvePayment();assert.equal((await ledger.summary(pool,merchant)).merchantPayoutPrincipal,'10000');assert.equal((await ledger.summary(pool,merchant)).payoutFees,'700');assert.equal((await ledger.summary(pool,user)).consumed,'990000');
 // Insert a synthetic already-aged request through the real schema; immutable production deadlines are never rewritten.
 async function aged(reference,remaining,state='pending_admin'){
  const original=(await pool.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[result.orders[0].id])).rows[0],id=randomUUID();
  await tx(async c=>{await c.query(`INSERT INTO wpay_auth.payout_orders(id,merchant_id,reference,idempotency_key,payload_digest,encrypted_beneficiary,amount_minor,percentage_fee_minor,fixed_fee_minor,reserve_minor,snapshot,state,transfer_mode,created_at,deadline_at) VALUES($1,$2,$3,$3,$4,$5,10000,100,600,10700,$6,$7,'upi',CURRENT_TIMESTAMP-interval '20 minutes',CURRENT_TIMESTAMP+($8*interval '1 minute'))`,[id,merchant,reference,reference,original.encrypted_beneficiary,original.snapshot,state,remaining]);await require('../lib/wpay/payouts/accounting').journal(c,id,'merchant_payout_reserve',merchant,ledger.pair(merchant,'merchant_payout_reserved','10700'),original.snapshot);});return id;
 }
 const late=await aged('late-admin',10),before=(await ledger.summary(pool,merchant)).merchantAvailable;
 assert.equal((await decide(late)).failed,1);assert.equal(BigInt((await ledger.summary(pool,merchant)).merchantAvailable),BigInt(before)+10700n);await decide(late);assert.equal(BigInt((await ledger.summary(pool,merchant)).merchantAvailable),BigInt(before)+10700n);
 const timely=await aged('timely-admin',20);assert.equal((await decide(timely)).approved,1);
 const rejected=await tx(c=>core.create(c,merchant,{...base,reference:'reject-single',idempotencyKey:'reject-single'}));assert.equal((await decide(rejected.id,'reject')).rejected,1);
 const expired=await aged('unclaimed',1,'open'),submitted=await aged('paid-await-review',-1,'submitted');await tx(c=>core.expire(c));assert.equal((await pool.query('SELECT state FROM wpay_auth.payout_orders WHERE id=$1',[expired])).rows[0].state,'failed');assert.equal((await pool.query('SELECT state FROM wpay_auth.payout_orders WHERE id=$1',[submitted])).rows[0].state,'submitted');
 await assert.rejects(pool.query("UPDATE wpay_auth.payout_orders SET state='open' WHERE id=$1",[late]));await assert.rejects(pool.query('UPDATE wpay_auth.payout_orders SET deadline_at=CURRENT_TIMESTAMP WHERE id=$1',[timely]));
 const s=await core.merchantSettlements.summary(pool,merchant),withdraw={idempotencyKey:'full-usdt',usdtMinor:s.maxUsdtMinor,rateVersion:s.rateVersion,network:'TRON-TRC20',address:tronAddress()};
 await assert.rejects(tx(c=>core.merchantSettlements.request(c,merchant,{...withdraw,rateVersion:999})),{code:'CONFLICT'});
 const w=await tx(c=>core.merchantSettlements.request(c,merchant,withdraw));assert.equal(w.usdtMinor,s.maxUsdtMinor);assert.ok(BigInt(w.inrMinor)<=BigInt(s.available));assert.equal((await core.merchantSettlements.summary(pool,merchant)).maxUsdtMinor,'0');assert.equal((await tx(c=>core.merchantSettlements.request(c,merchant,withdraw))).id,w.id);
});
