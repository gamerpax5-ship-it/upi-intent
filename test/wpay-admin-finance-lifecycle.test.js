'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {migrate,transaction}=require('../lib/wpay/db/migrations');
const {FundingWorkflow,retry}=require('../lib/wpay/funding/workflow');
const {manualReview}=require('../lib/wpay/funding/manual-review');
const api=require('../lib/wpay/panels/api');
test('PostgreSQL admin report includes manual receipts and reactivation leaves routes stopped',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const server=new Pool({connectionString:url.toString()}),name='admin_review_'+randomUUID().replaceAll('-','');
 await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});await migrate(pool);
 const admin=randomUUID(),user=randomUUID(),merchant=randomUUID(),tenant='admin-review';
 for(const [id,type] of [[admin,'admin'],[user,'user'],[merchant,'merchant']]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,'Synthetic',$4,$5,'active',$6,$7)",[id,randomUUID(),tenant,id+'@example.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
 }
 await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),user,{inrPerUsdt:'107',depositNetwork:'ETHEREUM-ERC20',depositAddress:'0x'+'1'.repeat(40)},admin]);
 const workflow=new FundingWorkflow(),r=await retry(pool,c=>workflow.create(c,{id:user,tenant_id:tenant},{idempotencyKey:randomUUID(),amountUsdt:'2000'}));
 await retry(pool,c=>manualReview(workflow,c,r,{requestId:r.id,action:'manual_confirm',amountUsdt:'2100',reason:'Synthetic confirmed receipt'},admin));
 const now=new Date(),row={id:admin,account_type:'admin',database_now:now,mfa_at:now,transaction_password_at:now},context={principal:{id:admin,type:'admin',tenantId:tenant,status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['reports.view','users.view','users.suspend'],adminScope:{tenantIds:[tenant]}};
 const report=await api.run(pool,row,context,'panel/admin-finance',{});
 assert.equal(report.funding.usdt,'2100000000');assert.equal(report.funding.inr,'22470000');assert.equal(report.funding.capacity,'21400000');assert.equal(report.fxProfit,'-22470000');
 const assignment=randomUUID();await pool.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,status,min_minor,max_minor,created_by) VALUES($1,$2,$3,'active',1,10000,$4)",[assignment,merchant,user,admin]);
 const body={id:user,requestId:randomUUID(),action:'suspend',reason:'Synthetic review',settings:null,expectedVersion:1};
 await transaction(pool,c=>api.run(c,row,context,'panel/directory/update',body));
 const result=await transaction(pool,c=>api.run(c,row,context,'panel/directory/update',{...body,requestId:randomUUID(),action:'reactivate'}));
 assert.equal(result.status,'active');assert.equal((await pool.query('SELECT status FROM wpay_auth.business_assignments WHERE id=$1',[assignment])).rows[0].status,'disabled');
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.commercial_versions WHERE account_id=$1',[user])).rows[0].n,1);
});
