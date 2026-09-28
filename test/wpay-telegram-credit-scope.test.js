'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {Source}=require('../lib/wpay/telegram/source'),{credits}=require('../lib/wpay/telegram/hosted-credits');
const collect=async iterator=>{const rows=[];for await(const r of iterator)rows.push(r);return rows;};
test('all device history requires current scoped links, needs no UPI mapping, and never guesses filtered UPI',async()=>{
 const links=[{device_ref:'device-owned',owner_id:'admin',valid_until:'2099-01-01',pairing_id:'1'}],calls=[];
 const source=new Source({tenantIds:['tenant'],pool:{query:async()=>({rows:[]})},pairing:{devices:async()=>[{id:'device-owned',linked:true,phone_e164:'919876543210'}]},
 operational:{transactions:async(batch,options)=>{calls.push({batch,options});return {rows:[{id:'1',device_id:'device-owned',utr:'123456789012',amount:'100.00',created_at:'2020-01-01',historical:true},{id:'2',device_id:'foreign',utr:'123456789013',amount:'5.00',created_at:'2020-01-01'}]};}}});
 source.links=async()=>links;
 let result=await collect(source.utrs(null));assert.equal(result.length,1);assert.equal(result[0].upi,null);assert.equal(result[0].historical,true);assert.equal(result[0].apkNumber,'919876543210');assert.equal(calls[0].options.includeHistory,true);
 assert.deepEqual(await collect(source.utrs('other@bank')),[]);assert.equal(calls.length,1);
 links.length=0;assert.deepEqual(await collect(source.utrs(null)),[]);
});
test('PostgreSQL hosted credits include approved Admin-UPI payment and tenant-wide users with exact historical UPI filters',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const {Pool}=require('pg'),url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const admin=new Pool({connectionString:url.toString()}),name='hosted_credits_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await pool.query(`CREATE SCHEMA wpay_auth;
 CREATE TABLE wpay_auth.accounts(id text,tenant_id text);
 CREATE TABLE wpay_auth.business_bank_accounts(id text,owner_id text);
 CREATE TABLE wpay_auth.business_bank_versions(bank_id text,version int,details jsonb);
 CREATE TABLE wpay_auth.business_reservations(id text,user_id text,bank_id text,bank_version int);
 CREATE TABLE wpay_auth.gateway_orders(id text,reservation_id text,merchant_id text,amount_minor numeric,state text);
 CREATE TABLE wpay_auth.gateway_claims(id uuid,order_id text,utr_digest text,encrypted_utr jsonb);
 CREATE TABLE wpay_auth.business_financial_events(reservation_id text,utr_digest text,source text,created_at timestamptz);
 CREATE TABLE wpay_auth.bank_statement_credits(id uuid,owner_id text,bank_id text,bank_version int,utr text,amount_minor numeric,created_at timestamptz,txn_date text);
 INSERT INTO wpay_auth.accounts VALUES ('admin','tenant'),('user','tenant'),('merchant','tenant'),('foreign','other');
 INSERT INTO wpay_auth.business_bank_accounts VALUES ('bank','admin'),('other-bank','foreign');
 INSERT INTO wpay_auth.business_bank_versions VALUES ('bank',1,'{"upiId":"admin@bank"}'),('bank',2,'{"upiId":"changed@bank"}'),('other-bank',1,'{"upiId":"foreign@bank"}');
 INSERT INTO wpay_auth.business_reservations VALUES ('r1','user','bank',1),('r2','foreign','bank',1),('r3','user','bank',1);
 INSERT INTO wpay_auth.gateway_orders VALUES ('ok','r1','merchant',1000000,'successful'),('foreign','r2','merchant',1000000,'successful'),('pending','r3','merchant',1000000,'pending_payment');
 INSERT INTO wpay_auth.business_financial_events VALUES ('r1','accepted','admin_manual','2020-01-01'),('r2','accepted','admin_manual','2020-01-01'),('r3','accepted','normal','2020-01-01');
 INSERT INTO wpay_auth.gateway_claims SELECT lpad(to_hex(n),32,'0')::uuid,'ok','accepted','"123456789012"'::jsonb FROM generate_series(1,201) n;
 INSERT INTO wpay_auth.gateway_claims VALUES ('ffffffff-0000-4000-8000-000000000001','ok','rejected','"123456789013"'),('ffffffff-0000-4000-8000-000000000002','foreign','accepted','"123456789014"'),('ffffffff-0000-4000-8000-000000000003','pending','accepted','"123456789015"');
 INSERT INTO wpay_auth.bank_statement_credits VALUES ('ffffffff-0000-4000-8000-000000000004','admin','bank',1,'123456789016',12345,'2020-01-01','2020-01-01'),('ffffffff-0000-4000-8000-000000000005','foreign','other-bank',1,'123456789017',12345,'2020-01-01','2020-01-01');`);
 const crypto={open:(r,b)=>{assert.match(b,/claim/);return r;}},read=upi=>collect(credits(pool,crypto,['tenant'],upi));
 const rows=await read(null);assert.equal(rows.length,202);assert.equal(rows.filter(r=>r.source==='Admin approved'&&r.amount==='10000.00').length,201);assert.equal(rows.at(-1).amount,'123.45');assert.ok(rows.every(r=>r.upi==='admin@bank'));
 assert.equal((await read('admin@bank')).length,202);assert.deepEqual(await read('changed@bank'),[]);assert.deepEqual(await read('foreign@bank'),[]);
 assert.deepEqual(await collect(credits(pool,crypto,['tenant'],null,'2021-01-01')),[]);
 assert.deepEqual(await collect(credits(pool,crypto,[],null)),[]);
});
