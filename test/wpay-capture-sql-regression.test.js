'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {OperationalSource}=require('../lib/wpay/integrations/operational-source');
const {DeviceSetup}=require('../lib/wpay/operations/device-setup');
const {Devices}=require('../lib/wpay/operations/devices');

test('masked OTP query has contiguous parameters and never requests a reveal column',async()=>{
 const source=new OperationalSource(null);let query,args;
 source.withRead=fn=>fn({query:async(q,a)=>{query=q;args=a;return {rows:[],rowCount:0};}});
 await source.events([{device_ref:'synthetic-device',valid_from:new Date(),valid_until:new Date(),pairing_id:'1'}],{reveal:true});
 const slots=[...new Set([...query.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b);
 assert.deepEqual(slots,Array.from({length:args.length},(_,i)=>i+1));assert.equal(args.length,8);assert.equal(args[7],false);
 assert.match(query,/e\.code_mask AS code,e\.message_masked AS message/);assert.doesNotMatch(query,/e\.otp_code|e\.sms_body/);
});

test('historical UTR mode requires Admin role and explicit opt-in after normal permission checks',async()=>{
 const id=randomUUID(),row={id,account_type:'super_admin'},context={principal:{id,type:'super_admin',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['utr_center.view','devices.view'],adminScope:{tenantIds:['a'],platform:true}};
 let options;const setup=new DeviceSetup({source:{transactions:async(l,o)=>{options=o;return {rows:[]};}}});setup.links=async()=>[{device_ref:'synthetic-device'}];
 await setup.utrs({},row,context,{});assert.notEqual(options.includeHistory,true);
 await setup.utrs({},row,context,{includeHistory:true});assert.equal(options.includeHistory,true);
 await assert.rejects(setup.utrs({},{...row,account_type:'employee'},context,{includeHistory:true}),{code:'FORBIDDEN'});
 await assert.rejects(setup.utrs({},row,{...context,grants:[]},{includeHistory:true}),{code:'FORBIDDEN'});
 await assert.rejects(setup.utrs({},row,context,{includeHistory:'true'}),{code:'INVALID_INPUT'});
});

test('historical OTP mode stays Admin-only and projects length placeholders, not stored tokens',async()=>{
 const id=randomUUID(),link={id:randomUUID(),owner_id:id,device_ref:'synthetic-device'};let options;
 const source={devices:async()=>[{id:link.device_ref,linked:true}],events:async(l,o)=>{options=o;return {events:[{id:'1',device_id:link.device_ref,code:'876543',message:'Private token 876543',otp_length:6,historical:true}]};}};
 const devices=new Devices({source});devices.links=async()=>[link];
 const result=await devices.events({query:async()=>({rows:[]})},{id,account_type:'admin'}, {}, {includeHistory:true});
 assert.equal(options.includeHistory,true);assert.equal(options.reveal,false);assert.equal(result.events[0].code,'123456');assert.equal(result.events[0].otpLength,6);assert.equal(result.events[0].historical,true);assert.doesNotMatch(JSON.stringify(result),/876543/);
 for(const account_type of ['employee','user','merchant'])await assert.rejects(devices.events({}, {id,account_type}, {}, {includeHistory:true}),{code:'FORBIDDEN'});
});

test('PostgreSQL: OTP statement executes; UTR history stays device/pairing scoped and current reads retain intervals',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='capture_sql_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await pool.query("CREATE TABLE devices(id text,status text,app_version text); CREATE TABLE device_pairings(id bigint,device_id text,status text,claimed_at timestamptz); CREATE TABLE device_transactions(id bigint,device_id text,utr text,status text,amount numeric,created_at timestamptz); CREATE TABLE device_otp_events(id bigint,device_id text,sender text,otp_length integer,sms_received_at timestamptz,created_at timestamptz,source text,code_mask text,message_masked text)");
 await pool.query("INSERT INTO devices VALUES('synthetic-owned','active','1'),('synthetic-foreign','active','1'); INSERT INTO device_pairings VALUES(1,'synthetic-owned','claimed','2026-01-01'),(2,'synthetic-foreign','claimed','2026-01-01'); INSERT INTO device_transactions VALUES(1,'synthetic-owned','123456789012','CREDIT_RECEIVED',100,'2025-12-01'),(2,'synthetic-owned','123456789013','CREDIT_RECEIVED',100,'2026-01-02'),(3,'synthetic-foreign','123456789014','CREDIT_RECEIVED',100,'2026-01-02'); INSERT INTO device_otp_events VALUES(1,'synthetic-owned','SYNTHETIC',6,'2026-01-02','2026-01-02','sms','123456','[Masked message]'),(2,'synthetic-owned','SYNTHETIC',6,'2025-12-01','2026-01-02','sms','123456','[Masked message]')");
 const source=new OperationalSource(pool);
 // This test isolates execution of the real SQL; separate source tests cover role verification.
 source.withRead=async fn=>{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const links=[{device_ref:'synthetic-owned',pairing_id:'1',valid_from:new Date('2026-01-01Z'),valid_until:new Date('2027-01-01Z')}];
 assert.deepEqual((await source.events(links)).events.map(e=>e.id),['1']);
 const otpHistory=await source.events(links,{includeHistory:true});assert.deepEqual(otpHistory.events.map(e=>e.id),['2','1']);assert.equal(otpHistory.events[0].historical,true);assert.ok(otpHistory.events.every(e=>e.code==='123456'));
 assert.equal((await source.events([{...links[0],pairing_id:'9'}],{includeHistory:true})).events.length,0);
 assert.deepEqual((await source.transactions(links)).rows.map(e=>e.id),['2']);
 const history=await source.transactions(links,{includeHistory:true});assert.deepEqual(history.rows.map(e=>e.id),['2','1']);assert.equal(history.rows[1].historical,true);
 assert.deepEqual((await source.transactions(links,{includeHistory:true,before:'2'})).rows.map(e=>e.id),['1']);
 assert.deepEqual((await source.transactions(links,{includeHistory:true,utr:'123456789012'})).rows.map(e=>e.id),['1']);
 assert.equal((await source.transactions([{...links[0],pairing_id:'9'}],{includeHistory:true})).rows.length,0);
});
