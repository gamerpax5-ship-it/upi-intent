'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID,createHash}=require('node:crypto'),{Pool}=require('pg');
const {migrate,validateMigrations,transaction}=require('../lib/wpay/db/migrations'),{AuthRepository}=require('../lib/wpay/db/auth-repository'),{hashPassword}=require('../lib/wpay/auth/runtime/passwords');
const {DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),{token,digest}=require('../lib/wpay/auth/runtime/tokens');
const {BusinessCore}=require('../lib/wpay/business/core'),ledger=require('../lib/wpay/business/ledger');
const tables=['parking_requests','parking_transitions','parking_postings','email_verification_requests','email_verifications','notification_deliveries'];
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('migration 016: actual fresh installation and 015 upgrade preserve all prior table data and security boundaries',async t=>{
 assert.equal(process.env.WPAY_9A_TEST_CONFIRM,'fresh-local-synthetic-only');const cfg=JSON.parse(fs.readFileSync(process.env.WPAY_9A_TEST_CONFIG,'utf8'));
 assert.equal(cfg.migration.host,'127.0.0.1');assert.match(cfg.migration.database,/^wpay_9a_upgradeinternal_[0-9]+$/);assert.match(cfg.upgradeDatabase,/^wpay_15_upgrade_[a-z0-9_]+$/);
 const fresh=new Pool(cfg.migration),up=new Pool({...cfg.migration,database:cfg.upgradeDatabase}),runtime=new Pool({...cfg.runtime,database:cfg.upgradeDatabase});t.after(async()=>{await Promise.all([fresh.end(),up.end(),runtime.end()]);});
 async function empty(c){assert.equal((await c.query("SELECT 1 FROM pg_tables WHERE schemaname IN('public','wpay_auth')")).rowCount,0);}
 await t.test('fresh 001 to 016, repeat migration, fingerprints and checksums',async()=>{await empty(fresh);assert.equal(await migrate(fresh),'applied');await validateMigrations(fresh);assert.equal((await fresh.query('SELECT max(version) v FROM wpay_auth.schema_migrations')).rows[0].v,16);const before=(await fresh.query('SELECT * FROM wpay_auth.schema_migrations ORDER BY version')).rows;assert.equal(await migrate(fresh),'already-applied');assert.deepEqual((await fresh.query('SELECT * FROM wpay_auth.schema_migrations ORDER BY version')).rows,before);});
 await empty(up);await migrate(up,{through:15});
 const repo=new AuthRepository(up),crypto=new MfaCrypto(Buffer.from(cfg.mfaKey,'base64')),password=await hashPassword('Synthetic 015 preservation passphrase!'),ids={};
 ids.super_admin=await repo.createAccount({name:'Preserved bootstrap',email:'bootstrap@upgrade16.example.invalid'},password,DEFAULT_GRANTS.super_admin,true);
 for(const type of ['user','merchant','admin','employee'])ids[type]=await repo.createAccount({name:'Preserved '+type,email:type+'@upgrade16.example.invalid',accountType:type},password,DEFAULT_GRANTS[type]);
 await up.query("UPDATE wpay_auth.eligibility SET approval_status='approved',operations_enabled=true,initial_deposit_satisfied=true,statement_satisfied=true");
 for(const [type,id]of Object.entries(ids)){
  const secret=crypto.newSecret();await up.query('UPDATE wpay_auth.account_security SET enabled=true,factor_version=1,encrypted_secret=$2 WHERE account_id=$1',[id,crypto.seal(secret,'wpay-factor:'+id+':1')]);
  await up.query('INSERT INTO wpay_auth.recovery_codes(account_id,code_digest,factor_version) VALUES($1,$2,1)',[id,digest(token())]);
  if(['user','merchant'].includes(type))await up.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),id,type==='user'?{payinCommission:'1',payoutCommission:'0.5',inrPerUsdt:'90',depositNetwork:'ETHEREUM-ERC20',depositAddress:'0x'+'1'.repeat(40)}:{payinFee:'1.2',payoutFee:'0',fixedPayoutFee:'0',fixedFeeCurrency:'INR'},ids.super_admin]);
 }
 const core=new BusinessCore(),tx=fn=>transaction(up,fn);
 await tx(c=>ledger.post(c,{key:'preserved-funding',referenceType:'synthetic',referenceId:'preserved-funding',actorId:ids.super_admin,entries:ledger.pair(ids.user,'capacity_allocated','100000')}));
 const bank=await tx(c=>core.saveBank(c,ids.user,{details:{upiId:'synthetic@bank',bankName:'Synthetic Bank',holderName:'Synthetic Holder',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'100000000',accountType:'personal',providerName:'',notes:'Synthetic upgrade preservation'}}));
 for(const action of ['submit','review','approve','request_verification'])await tx(c=>core.transitionBank(c,bank.id,1,action,ids.super_admin,{reason:'Synthetic lifecycle'}));
 core.verifyEvidence=async()=>({verified:true,kind:'bank_verification',evidenceId:bank.id,bankId:bank.id,version:1});await tx(c=>core.verifyBank(c,bank.id,1,bank.id));await require('./helpers/wpay-onboarding-setup').statement(tx,ids.user,bank);await tx(c=>core.transitionBank(c,bank.id,1,'enable',ids.user,{reason:'Synthetic lifecycle'}));await require('./helpers/wpay-onboarding-setup').startEnabled(tx,core,ids.user);
 await tx(c=>core.assignment(c,ids.super_admin,{id:null,merchantId:ids.merchant,userId:ids.user,priority:1,weight:1,minMinor:'1',maxMinor:'10000',enabled:true}));
 await tx(c=>core.reserve(c,ids.merchant,{orderReference:'preservation-016',idempotencyKey:'preservation-016',amountMinor:'100',ttlSeconds:900}));
 await tx(c=>core.hold(c,ids.super_admin,{id:randomUUID(),ownerId:ids.user,amountMinor:'200',reference:'preserved-hold',reason:'Synthetic preservation',release:false}));
 const oldTables=(await up.query("SELECT tablename FROM pg_tables WHERE schemaname='wpay_auth' ORDER BY tablename")).rows.map(r=>r.tablename);
 async function capture(){const out={};for(const table of oldTables){assert.match(table,/^[a-z_]+$/);out[table]=sha((await up.query(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) rows FROM wpay_auth.${table} r`)).rows[0].rows);}return out;}
 await t.test('015 to 016 preserves every existing table, account, password, factor, recovery, grant and financial row',async()=>{
  const before=await capture(),history=(await up.query('SELECT * FROM wpay_auth.schema_migrations ORDER BY version')).rows;
  for(const table of ['accounts','credentials','account_security','recovery_codes','grants','commercial_versions','business_journals','business_entries','business_holds','business_reservations'])assert.ok((await up.query('SELECT 1 FROM wpay_auth.'+table+' LIMIT 1')).rowCount,table);
  assert.equal(await migrate(up),'applied');await validateMigrations(up);const after=await capture();delete before.schema_migrations;delete after.schema_migrations;assert.deepEqual(after,before);
  assert.deepEqual((await up.query('SELECT * FROM wpay_auth.schema_migrations WHERE version<=15 ORDER BY version')).rows,history);assert.equal(await migrate(up),'already-applied');await validateMigrations(runtime);
  await assert.rejects(migrate(up,{through:15}),/WPAY_SCHEMA_INCOMPATIBLE/);
 });
 await t.test('every new table has RLS, PUBLIC revokes, exact runtime privileges and immutable write boundaries',async()=>{
  await require('../lib/wpay/db/hosted-config').verifyRuntimeRole(runtime);
  for(const table of tables){
   const relation=(await up.query("SELECT c.relrowsecurity,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='wpay_auth' AND c.relname=$1",[table])).rows[0];assert.equal(relation.relrowsecurity,true);
   assert.equal((await up.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='wpay_auth' AND c.relname=$1 AND a.grantee=0",[table])).rowCount,0);
   const policies=(await up.query("SELECT roles::text[] AS roles,cmd FROM pg_policies WHERE schemaname='wpay_auth' AND tablename=$1",[table])).rows;assert.equal(policies.length,1);assert.deepEqual(policies[0].roles,['wpay_runtime']);
   const acl=(await runtime.query("SELECT has_table_privilege(current_user,$1,'SELECT') s,has_table_privilege(current_user,$1,'INSERT') i,has_table_privilege(current_user,$1,'DELETE') d,has_table_privilege(current_user,$1,'TRUNCATE') t,has_table_privilege(current_user,$1,'UPDATE') u",['wpay_auth.'+table])).rows[0];assert.deepEqual(acl,{s:true,i:true,d:false,t:false,u:false});
   await assert.rejects(runtime.query('DELETE FROM wpay_auth.'+table));await assert.rejects(runtime.query('TRUNCATE wpay_auth.'+table));
   if(table!=='notification_deliveries')await assert.rejects(up.query('TRUNCATE wpay_auth.'+table+' CASCADE'));
  }
  const updates=(await up.query("SELECT column_name FROM information_schema.column_privileges WHERE table_schema='wpay_auth' AND table_name='notification_deliveries' AND grantee='wpay_runtime' AND privilege_type='UPDATE' ORDER BY column_name")).rows.map(r=>r.column_name);assert.deepEqual(updates,['attempts','delivered_at','lease_until','next_attempt_at','state']);
  await assert.rejects(runtime.query("UPDATE wpay_auth.notification_deliveries SET encrypted_payload='{}'"));await validateMigrations(runtime);
 });
});
