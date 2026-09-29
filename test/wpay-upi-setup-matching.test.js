'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {inspect,paymentDigest,day}=require('../lib/wpay/onboarding/setup-evidence'),{accountDigest}=require('../lib/wpay/onboarding/evidence');
function fixture(){
 const owner=randomUUID(),bank={id:randomUUID(),owner_id:owner,version:1,details:{upiId:'synthetic@bank',mobile:'9000000001',ifsc:'TEST0000001',accountNumber:'1234567890'}};
 const c={id:randomUUID(),owner_id:owner,bank_id:bank.id,bank_version:1,expected_upi:bank.details.upiId,account_digest:accountDigest(bank.details),amount_minor:180,created_at:new Date(Date.now()-20000),expires_at:new Date(Date.now()+580000)};
 const f={row:{id:owner},bank,c,records:[],statements:[],used:[],bound:true,linked:true};
 f.setup={list:async()=>({sourceConnected:true,devices:f.linked?[{ownerId:owner,device:'synthetic-device',phone:'9000000001',linked:true,status:'offline'}]:[]}),utrs:async()=>({records:f.records})};
 f.client={query:async(sql,args)=>{
  if(sql.includes('business_audit'))return {rows:f.bound?[{device:'synthetic-device'}]:[]};
  if(sql.includes('bank_statement_credits')){assert.deepEqual(args.slice(0,3),[owner,bank.id,1]);assert.equal(args[5],180);assert.ok(sql.includes('s.created_at >= $4'));return {rows:f.statements};}
  if(sql.includes('upi_consumed_evidence'))return {rows:f.used.map(payment_digest=>({payment_digest}))};
  throw Error(sql);
 }};
 f.good={ownerId:owner,device:'synthetic-device',utr:'123456789012',amount:'1.80',status:'CREDIT_RECEIVED',capturedAt:new Date()};
 f.run=()=>inspect(f.setup,f.client,f.row,{},f.c,f.bank);return f;
}
test('APK matching requires exact amount, current owner/device/time and unused credit UTR',async()=>{
 for(const patch of [{amount:'1.81'},{status:'FAILED'},{status:'SUCCESS'},{status:'DEBIT'},{ownerId:randomUUID()},{device:'other-device'},{historical:true},{utr:'1234'},{capturedAt:new Date(Date.now()-60000)},{capturedAt:new Date(Date.now()+60000)}]){
  const f=fixture();f.records=[{...f.good,...patch}];assert.equal((await f.run()).proof,null,JSON.stringify(patch));
 }
 const f=fixture();f.records=[f.good];const r=await f.run();assert.equal(r.proof.source,'apk-utr-match');assert.equal(r.proof.digest,paymentDigest(f.good.utr));
 f.used=[r.proof.digest];assert.equal((await f.run()).state,'duplicate_evidence');
 f.used=[];f.records.push({...f.good,utr:'999999999999'});assert.equal((await f.run()).state,'ambiguous_evidence');
});
test('statement fallback works without APK events, deduplicates both sources and never certifies bank evidence',async()=>{
 const f=fixture();f.statements=[{utr:f.good.utr,amount_minor:'180',created_at:new Date(),txn_date:day(Date.now())}];
 const r=await f.run();assert.equal(r.proof.source,'statement-utr-match');assert.equal(r.proof.precision,'statement-date/import-time');
 f.records=[f.good];assert.equal((await f.run()).proof.source,'apk-utr-match');
 f.setup.utrs=async()=>{throw Error('Source offline');};assert.equal((await f.run()).proof.source,'statement-utr-match');
 f.used=[r.proof.digest];assert.equal((await f.run()).state,'duplicate_evidence');
});
test('foreign, changed, expired or unbound verification cannot accept evidence',async()=>{
 for(const mutate of [f=>f.row.id=randomUUID(),f=>f.bank.version=2,f=>f.bank.details.upiId='other@bank',f=>f.c.expires_at=new Date(Date.now()-1),f=>f.bound=false,f=>f.linked=false]){
  const f=fixture();f.records=[f.good];mutate(f);assert.equal((await f.run()).proof,null);
 }
});
test('PostgreSQL: APK and uploaded statement independently verify setup, replay is rejected, no financial credit',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),{migrate,transaction}=require('../lib/wpay/db/migrations'),{OnboardingApi}=require('../lib/wpay/onboarding/api');
 const admin=new Pool({connectionString:url.toString()}),name='upi_setup_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});await migrate(pool);
 const owner=randomUUID();await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,user_id) VALUES($1,$2,'tenant-a','Synthetic','upi-test@example.invalid','user',$1)",[owner,randomUUID()]);
 await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[owner]);
 let records=[];const deviceSetup={list:async()=>({sourceConnected:true,devices:[{ownerId:owner,device:'synthetic-device',phone:'9000000001',linked:true,status:'online'}]}),utrs:async()=>({records})};
 const api=new OnboardingApi({deviceSetup}),core=api.workflow.core,row={id:owner,user_id:owner,tenant_id:'tenant-a',account_type:'user',database_now:new Date(),transaction_password_at:new Date()},context={principal:{id:owner,userId:owner,type:'user',tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['user.bank_upi.view','user.bank_upi.update'],eligibility:{approvalStatus:'approved'}};
 const call=(op,body)=>transaction(pool,c=>api.run(c,row,context,op,body));
 const make=async index=>{
  const bank=await transaction(pool,c=>core.saveBank(c,owner,{details:{upiId:'synthetic'+index+'@bank',bankName:'Synthetic Bank',holderName:'Synthetic',accountNumber:'1234567890'+index,ifsc:'TEST0000001',mobile:'9000000001',bankLimitMinor:'1000000',accountType:'personal',providerName:'',notes:''}}));
  for(const action of ['submit','approve'])await transaction(pool,c=>core.transitionBank(c,bank.id,1,action,owner,{reason:'Synthetic setup'}));
  const challenge=await call('onboarding/create',{bankId:bank.id,version:1,requestId:randomUUID()});
  assert.equal(+new Date(challenge.expiresAt)-+new Date(challenge.createdAt),600000);return {bank,challenge};
 };
 const a=await make(1);records=[{ownerId:owner,device:'synthetic-device',utr:'123456789012',amount:(Number(a.challenge.amountMinor)/100).toFixed(2),status:'CREDIT_RECEIVED',capturedAt:new Date()}];
 const verified=await call('onboarding/poll',{challengeId:a.challenge.id});assert.equal(verified.status,'verified');assert.equal(verified.verificationMethod,'apk-utr-match');
 assert.equal((await transaction(pool,c=>core.transitionBank(c,a.bank.id,1,'enable',owner))).status,'enabled');
 records=[];
 async function upload(f,utr,date=day(Date.now())){
  const csv='Date,Narration,Debit,Credit,Balance\n'+date+',UPI/'+utr+' received,,'+(Number(f.challenge.amountMinor)/100).toFixed(2)+',100.00';
  return call('onboarding/upload',{bankId:f.bank.id,version:1,requestId:randomUUID(),format:'csv',base64:Buffer.from(csv).toString('base64')});
 }
 const b=await make(2);assert.equal((await upload(b,'223456789012')).status,'accepted');
 assert.equal((await call('onboarding/poll',{challengeId:b.challenge.id})).verificationMethod,'statement-utr-match');
 const replay=await make(3);await upload(replay,'123456789012');assert.equal((await call('onboarding/poll',{challengeId:replay.challenge.id})).verificationState,'duplicate_evidence');
 const old=await make(4);await upload(old,'323456789012',day(Date.now()-86400000));assert.equal((await call('onboarding/poll',{challengeId:old.challenge.id})).status,'waiting');
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.upi_consumed_evidence')).rows[0].n,2);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_journals')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
});
