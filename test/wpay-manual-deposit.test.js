'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {migrate,transaction}=require('../lib/wpay/db/migrations'),{FundingWorkflow}=require('../lib/wpay/funding/workflow'),{manualReview}=require('../lib/wpay/funding/manual-review');
const ledger=require('../lib/wpay/business/ledger'),net=require('../lib/wpay/funding/networks');
test('PostgreSQL: manual deposit approval preserves minimum, attribution and once-only capacity',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='manual_deposit_'+randomUUID().replaceAll('-','');
 await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});await migrate(pool);
 const admin=randomUUID(),user=randomUUID(),address='0x'+'3'.repeat(40);
 for(const [id,type]of [[admin,'super_admin'],[user,'user']]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id) VALUES($1,$2,'deposit-test','Synthetic Test',$3,$4,'active',$5)",[id,randomUUID(),id+'@example.invalid',type,type==='user'?id:null]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
 }
 await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),user,{inrPerUsdt:'107',depositNetwork:'ETHEREUM-ERC20',depositAddress:address},admin]);
 const tx=fn=>transaction(pool,fn),flow=new FundingWorkflow(),create=(key,amount)=>tx(c=>flow.create(c,{id:user,tenant_id:'deposit-test'},{idempotencyKey:key,amountUsdt:amount}));
 const approve=r=>tx(c=>manualReview(flow,c,r,{requestId:r.id,action:'manual_confirm',reason:'Funds independently checked by test administrator'},admin));
 const below=await create('below-minimum','1999');await assert.rejects(approve(below),{code:'BELOW_MINIMUM'});
 assert.equal((await ledger.summary(pool,user)).available,'0');
 const first=await create('first-deposit','2000');await approve(first);await approve(first);
 assert.equal((await ledger.summary(pool,user)).available,'21400000');
 const manual=await flow.request(pool,first.id);assert.equal(manual.source,'manual_review_no_hash');assert.equal(manual.transfer_key,null);
 const hash='0x'+'a'.repeat(64),proof={network:'ETHEREUM-ERC20',token:net.NETWORKS['ETHEREUM-ERC20'].token,recipient:address,amountMinor:'2000000000',txHash:hash,eventIndex:0,transferKey:net.transferKey('ETHEREUM-ERC20',hash,0)};
 await tx(c=>flow.credit(c,manual,proof,'blockchain_verified',null,'Synthetic subsequent verification'));
 assert.equal((await ledger.summary(pool,user)).available,'21400000');
 assert.equal((await flow.request(pool,first.id)).source,'manual_review_no_hash');
 const second=await create('next-deposit','1');assert.equal(second.snapshot.minimumMinor,'1');await approve(second);
 assert.equal((await ledger.summary(pool,user)).available,'21410700');
 const another=await create('duplicate-transfer','2000');await assert.rejects(tx(c=>flow.credit(c,another,proof,'blockchain_verified',null,'Synthetic replay')),{code:'DUPLICATE_TRANSFER'});
 assert.equal((await ledger.summary(pool,user)).available,'21410700');
 await assert.rejects(tx(c=>manualReview(flow,c,another,{requestId:another.id,action:'manual_confirm',reason:''},admin)),{code:'INVALID_INPUT'});
});
