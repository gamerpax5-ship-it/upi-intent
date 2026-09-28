'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../lib/wpay/db/migrations'),{Source}=require('../lib/wpay/telegram/source');
test('device ownership and UPI mapping queries execute against actual WPay schema',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const admin=new Pool({connectionString:url.toString()}),name='telegram_source_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await migrate(pool,{through:34});
 assert.equal((await pool.query("SELECT to_regclass('wpay_auth.bank_statement_credits') name")).rows[0].name,null);
 await migrate(pool);await require('../lib/wpay/db/migrations').validateMigrations(pool);
 assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='wpay_auth.bank_statement_credits'::regclass")).rows[0].relrowsecurity,true);
 const source=new Source({pool,tenantIds:[randomUUID()],legacy:{read:async()=>{throw Error('Unexpected read');}}});
 assert.deepEqual(await source.links(),[]);assert.deepEqual(await source.links(true),[]);
 assert.equal((await source.utrs('shop@bank').next()).done,true);
 const hosted=new Source({pool,tenantIds:[randomUUID()],crypto:{open:()=>assert.fail('No claims expected')}});
 assert.equal((await hosted.utrs(null).next()).done,true);
 const tenant='scope-test',verifier=randomUUID();
 await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type) VALUES($1,$2,$3,'Verifier','verifier@test.invalid','super_admin')",[verifier,randomUUID(),tenant]);
 const expected=[];
 for(const [label,type,status,approval,scope]of [['admin','admin','active',null,tenant],['super','super_admin','active',null,tenant],['user','user','active','approved',tenant],['merchant','merchant','active','approved',tenant],['pending','merchant','active','pending',tenant],['inactive','user','suspended','approved',tenant],['foreign','user','active','approved','other-tenant']]){
  const owner=randomUUID(),bank=randomUUID(),parent=randomUUID(),child=randomUUID();
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[owner,randomUUID(),scope,label,label+'@test.invalid',type,status,type==='user'?owner:null,type==='merchant'?owner:null]);
  if(approval)await pool.query('INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,$2)',[owner,approval]);
  await pool.query("INSERT INTO wpay_auth.business_bank_accounts(id,owner_id,version,status) VALUES($1,$2,1,'approved')",[bank,owner]);
  await pool.query("INSERT INTO wpay_auth.business_bank_versions(bank_id,version,details,limit_minor,actor_id) VALUES($1,1,$2,10000,$3)",[bank,{upiId:label+'@bank'},verifier]);
  for(const [id,kind,resource,parentId]of [[parent,'receiving_account',bank,null],[child,'statement_import',label,parent]])await pool.query("INSERT INTO wpay_auth.resource_links(id,account_id,resource_kind,source_id,resource_id,status,verified_at,verification_digest,verifier_id,valid_from,valid_until,parent_id) VALUES($1,$2,$3,'legacy-primary',$4,'verified',CURRENT_TIMESTAMP,$5,$6,'2020-01-01','2099-01-01',$7)",[id,owner,kind,resource,'a'.repeat(64),verifier,parentId]);
  if(['admin','super','user','merchant'].includes(label))expected.push(child);
 }
 const mixed=new Source({pool,tenantIds:[tenant],legacy:{read:async()=>({rows:[{id:'1',utr:'123456789012',amount:'10.00'}]})}}),observed=[];
 for await(const r of mixed.utrs(null))observed.push(r.id.split(':')[0]);assert.deepEqual(observed.sort(),expected.sort());
 assert.equal((await mixed.utrs('merchant@bank').next()).value.upi,'merchant@bank');assert.equal((await mixed.utrs('pending@bank').next()).done,true);
 const {LegacyUtrs}=require('../lib/wpay/operations/legacy-utrs');
 const context={principal:{id:verifier,type:'super_admin',tenantId:tenant,status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['utr_center.view'],adminScope:{tenantIds:[tenant],platform:true}};
 const listed=await new LegacyUtrs().read(pool,{id:verifier,account_type:'super_admin'},context,{});assert.deepEqual(listed.links.map(l=>l.id).sort(),expected);
});
