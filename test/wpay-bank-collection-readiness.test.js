'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {project,decorate}=require('../lib/wpay/business/bank-readiness');
const {BusinessCore}=require('../lib/wpay/business/core');
const {migrate,transaction}=require('../lib/wpay/db/migrations');
test('display status fails closed without assignment and never changes the operational switch',()=>{
 const bank={status:'running'};
 assert.equal(project(bank,[]).displayStatus,'unassigned');
 assert.deepEqual(project(bank,[]).routingReadiness.reasons,['merchant_assignment_missing']);
 assert.equal(project(bank,[{eligible:false,reasons:['bank_limit']}]).displayStatus,'blocked');
 assert.equal(project(bank,[{eligible:false,reasons:['bank_limit']},{eligible:true,reasons:[]}]).displayStatus,'running');
 assert.equal(project({...bank,frozen:true},[{eligible:true,reasons:[]}]).displayStatus,'frozen');
 assert.equal(project({...bank,deactivated:true},[{eligible:true,reasons:[]}]).routingReadiness.eligible,false);
 assert.equal(project({status:'stopped'},[{eligible:true,reasons:[]}]).displayStatus,'stopped');
 assert.equal(bank.status,'running');
});
test('real bank status follows assigned route eligibility and preserves Admin exemptions',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='bank_readiness_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});await migrate(pool);
 const ids={},core=new BusinessCore();
 await transaction(pool,async c=>{
  for(const [key,type]of [['admin','super_admin'],['owner','user'],['merchant','merchant'],['unconfigured','merchant'],['other','user']]){
   const id=ids[key]=randomUUID();
   await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,'readiness-tenant',$3,$4,$5,'active',$6,$7)",[id,randomUUID(),key,key+'@readiness.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
   await c.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status,initial_deposit_satisfied) VALUES($1,'approved',false)",[id]);
   await c.query('INSERT INTO wpay_auth.account_security(account_id,enabled) VALUES($1,false)',[id]);
  }
  for(const key of ['owner','merchant'])await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[key],key==='owner'?{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107'}:{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'},ids.admin]);
  const details={upiId:'readiness@bank',bankName:'Test Bank',holderName:'Test Owner',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'10000',accountType:'business',providerName:'',notes:''};
  ids.bank=(await core.saveBank(c,ids.owner,{details},ids.admin)).id;
  ids.otherBank=(await core.saveBank(c,ids.other,{details:{...details,upiId:'other@bank',accountNumber:'123456780002'}},ids.admin)).id;
  await c.query('INSERT INTO wpay_auth.admin_bank_approvals(bank_id,bank_version,actor_id,request_id,reason) VALUES($1,1,$2,$3,$4)',[ids.bank,ids.admin,randomUUID(),'Fixture Admin approval']);
  await c.query("UPDATE wpay_auth.business_bank_accounts SET status='running',approved_version=1 WHERE id=$1",[ids.bank]);
  await require('../lib/wpay/onboarding/state').refresh(c,ids.owner);
 });
 const read=async()=>transaction(pool,async c=>{const banks=(await c.query('SELECT * FROM wpay_auth.business_bank_accounts WHERE id=$1',[ids.bank])).rows;await decorate(c,banks,core);return banks[0];});
 const expect=async(status,reason)=>{const b=await read();assert.equal(b.displayStatus,status);if(reason)assert.ok(b.routingReadiness.reasons.includes(reason),JSON.stringify(b.routingReadiness));assert.equal(b.status,'running');return b;};
 await t.test('an enabled Admin-added UPI is not Running before merchant assignment',()=>expect('unassigned','merchant_assignment_missing'));
 ids.generic=randomUUID();await pool.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,status,priority,weight,min_minor,max_minor,created_by) VALUES($1,$2,$3,'active',10,1,'100','10000',$4)",[ids.generic,ids.merchant,ids.owner,ids.admin]);
 await t.test('generic user assignment cannot make an Admin-added UPI ready',()=>expect('unassigned','merchant_assignment_missing'));
 ids.route=randomUUID();await pool.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,bank_id,status,priority,weight,min_minor,max_minor,created_by) VALUES($1,$2,$3,$4,'active',10,1,'100','10000',$5)",[ids.route,ids.merchant,ids.owner,ids.bank,ids.admin]);
 await t.test('explicit assignment is Running with no deposit, APK or statement for Admin-added UPI',async()=>{
  const b=await expect('running');assert.equal(b.routingReadiness.eligible,true);
  const r=await transaction(pool,c=>core.reserve(c,ids.merchant,{orderReference:'readiness-fixture',idempotencyKey:'readiness-fixture',amountMinor:'100'}));
  await transaction(pool,c=>core.release(c,r.id,ids.merchant));
 });
 await t.test('disabled and future assignments are blocked',async()=>{
  await pool.query("UPDATE wpay_auth.business_assignments SET status='disabled',disabled_at=now() WHERE id=$1",[ids.route]);await expect('blocked','assignment_inactive');
  await pool.query("UPDATE wpay_auth.business_assignments SET status='active',disabled_at=NULL,effective_from=now()+interval '1 day' WHERE id=$1",[ids.route]);await expect('blocked','assignment_inactive');
  await pool.query("UPDATE wpay_auth.business_assignments SET effective_from=now()-interval '1 second' WHERE id=$1",[ids.route]);
 });
 await t.test('less remaining daily limit than minimum is blocked; exact minimum is ready',async()=>{
  await require('../lib/wpay/business/collection-policy').setLimit(pool,ids.owner,{bankId:ids.bank,limitMinor:'99'});await expect('blocked','bank_limit');
  await require('../lib/wpay/business/collection-policy').setLimit(pool,ids.owner,{bankId:ids.bank,limitMinor:'100'});await expect('running');
  await require('../lib/wpay/business/collection-policy').setLimit(pool,ids.owner,{bankId:ids.bank,limitMinor:'10000'});
 });
 await t.test('owner and merchant suspension remove Running immediately',async()=>{
  for(const [key,reason]of [['owner','account_unavailable'],['merchant','merchant_unavailable']]){
   await pool.query("UPDATE wpay_auth.accounts SET status='suspended' WHERE id=$1",[ids[key]]);await expect('blocked',reason);
   await pool.query("UPDATE wpay_auth.accounts SET status='active' WHERE id=$1",[ids[key]]);
  }
 });
 await t.test('missing effective terms are blocked rather than advertised as Running',async()=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   await c.query("UPDATE wpay_auth.business_assignments SET status='disabled',disabled_at=now() WHERE id=$1",[ids.route]);
   await c.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,bank_id,status,priority,weight,min_minor,max_minor,created_by) VALUES($1,$2,$3,$4,'active',10,1,'100','10000',$5)",[randomUUID(),ids.unconfigured,ids.owner,ids.bank,ids.admin]);
   const banks=(await c.query('SELECT * FROM wpay_auth.business_bank_accounts WHERE id=$1',[ids.bank])).rows;await decorate(c,banks,core);
   assert.equal(banks[0].displayStatus,'blocked');assert.ok(banks[0].routingReadiness.reasons.includes('commercial_terms_missing'));
  }finally{await c.query('ROLLBACK');c.release();}
 });
 await t.test('generic assignments still work for ordinary verified user UPIs with capacity',async()=>{
  const old=await core.bankRecord(pool,ids.bank);ids.bank=(await transaction(pool,c=>core.saveBank(c,ids.owner,{details:{...old.details,upiId:'ordinary@bank',accountNumber:'123456780003'}},ids.admin))).id;
  await pool.query("UPDATE wpay_auth.business_bank_accounts SET status='running',approved_version=1,verified_version=1 WHERE id=$1",[ids.bank]);
  await pool.query("UPDATE wpay_auth.business_assignments SET status='disabled',disabled_at=now() WHERE id=$1",[ids.route]);
  await pool.query('UPDATE wpay_auth.bank_onboarding_policy SET statement_required=false');
  await pool.query('UPDATE wpay_auth.eligibility SET initial_deposit_satisfied=true WHERE account_id=$1',[ids.owner]);
  await transaction(pool,c=>require('../lib/wpay/business/ledger').post(c,{key:'fixture-capacity',referenceType:'test',referenceId:'seed',entries:require('../lib/wpay/business/ledger').pair(ids.owner,'capacity_allocated','10000')}));
  await expect('running');
  await pool.query('INSERT INTO wpay_auth.business_routing_requirements(owner_id,device_required,device_eligible) VALUES($1,true,false)',[ids.owner]);await expect('blocked','device_required');
 });
 await t.test('projection exposes reasons without merchant identity and cannot decorate another bank',async()=>{
  const b=await read();assert.deepEqual(Object.keys(b.routingReadiness).sort(),['eligible','evaluatedAt','reasonText','reasons']);
  const candidates=await core.candidates(pool,ids.merchant,{bankIds:[ids.otherBank]});assert.equal(candidates.length,0);
 });
});
