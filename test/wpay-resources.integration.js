"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID,createHash}=require('node:crypto');
const {Pool}=require('pg');
const {migrate,validateMigrations}=require('../lib/wpay/db/migrations');
const {verifyRuntimeRole}=require('../lib/wpay/db/hosted-config');
const {AuthService}=require('../lib/wpay/auth/runtime/service');
const {SecurityRepository}=require('../lib/wpay/db/security-repository');
const {MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
const {createLegacyReader}=require('../lib/wpay/integrations/legacy-reader');
const {startAuthServer,SESSION_COOKIE}=require('../lib/wpay/auth/runtime/http');
test('Task 7 real isolated legacy adapters, APK bytes and owner isolation',{timeout:120000},async t=>{
 assert.equal(process.env.WPAY_RESOURCE_TEST_CONFIRM,'fresh-local-synthetic-only');
 const config=JSON.parse(fs.readFileSync(process.env.WPAY_RESOURCE_TEST_CONFIG,'utf8'));
 for(const name of ['migration','runtime','legacyOwner','legacyReader']){assert.equal(config[name].host,'127.0.0.1');assert.match(config[name].database,/^wpay_(7_(resources|legacy)_[0-9]+|(resources|legacy)_ci)$/);}
 assert.notEqual(config.migration.database,config.legacyOwner.database);
 const owner=new Pool(config.migration),runtime=new Pool(config.runtime),legacyOwner=new Pool(config.legacyOwner),legacyPool=new Pool(config.legacyReader);
 let server;t.after(async()=>{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await Promise.all([owner.end(),runtime.end(),legacyOwner.end(),legacyPool.end()]);});
 for(const pool of [owner,legacyOwner])assert.equal((await pool.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname IN ('public','wpay_auth')")).rowCount,0,'Must use fresh targets; preserve previous evidence.');
 await migrate(owner);await validateMigrations(owner);await validateMigrations(runtime);await verifyRuntimeRole(runtime);
 // Reuse the real protected schema initializers ONLY on this empty synthetic DB.
 await require('../server').initDb(legacyOwner);
 await require('../lib/device-pairing').initDeviceTables(legacyOwner);
 await require('../lib/payment-verification').initPaymentVerificationTables(legacyOwner);
 await require('../lib/device-otp-router').initDeviceOtpTables(legacyOwner);
 await require('../lib/statement-match-router').initStatementTables(legacyOwner);
 for(const [table,columns] of Object.entries({
  devices:'id,status,last_seen_at',device_otp_events:'id,device_id,otp_length,source,sms_received_at,created_at',
  device_transactions:'id,device_id,utr,status,amount,created_at',statement_credit_events:'id,import_id,utr_normalized,amount,txn_date,matched_at,created_at',
  payment_links:'id,amount,status,created_at,expires_at',payment_claims:'payment_id,utr_display,submitted_at,verified_at,verification_source'
 }))await legacyOwner.query(`GRANT SELECT(${columns}) ON public.${table} TO wpay_legacy_reader`);
 const reader=await createLegacyReader(legacyPool);
 await assert.rejects(createLegacyReader(legacyOwner));
 for(const sql of ["SELECT credential_hash FROM devices","SELECT code_mask FROM device_otp_events","SELECT message_masked FROM device_otp_events","SELECT sms_body FROM device_transactions","UPDATE devices SET status=status","SELECT upi_uri FROM payment_links"])await assert.rejects(legacyPool.query(sql),{code:'42501'});
 const crypto=new MfaCrypto(Buffer.from(config.mfaKey,'base64')),service=new AuthService(new SecurityRepository(runtime),{mfaCrypto:crypto,legacyReader:reader});
 const setup=new AuthService(new SecurityRepository(owner),{mfaCrypto:crypto}),password='Synthetic adapter acceptance password!';
 await setup.bootstrap({name:'Synthetic Verifier',email:'verifier@resources.example.invalid',password});
 for(const [name,type] of [['alice','user'],['bob','user'],['merchant','merchant']])await service.register({name:'Synthetic '+name,email:name+'@resources.example.invalid',password,accountType:type},'127.0.0.1');
 // Explicit synthetic fixture approval; real Admin MFA/approval is tested in the
 // separate full PostgreSQL/HTTP acceptance suite, not claimed by this setup.
 await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved'");
 const ids=Object.fromEntries((await owner.query('SELECT id,email FROM wpay_auth.accounts')).rows.map(row=>[row.email.split('@')[0],row.id]));
 const sessions={};
 for(const name of ['verifier','alice','bob','merchant']){
  const challenge=await service.login({email:name+'@resources.example.invalid',password},'127.0.0.1');
  const enrollment=await service.mfa.challenge(challenge.challengeToken,'setup',{});
  const code=await crypto.libraries().otp.generate({secret:enrollment.setupKey});
  const verified=await service.mfa.challenge(challenge.challengeToken,'verify',{code});
  sessions[name]=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true})).sessionToken;
 }
 const call=(name,operation,body={})=>service.authenticated(sessions[name],operation,0,body);
 const link=async(name,kind,reference,parent=null)=>{
  const id=randomUUID();await call(name,'resources/request',{requestId:id,kind,reference,consent:true});
  await owner.query(`UPDATE wpay_auth.resource_links SET status='verified',verified_at=CURRENT_TIMESTAMP,
    verifier_id=$2,verification_digest=$3,valid_from=CURRENT_TIMESTAMP-interval '1 hour',valid_until=CURRENT_TIMESTAMP+interval '1 hour',parent_id=$4 WHERE id=$1`,
    [id,ids.verifier,createHash('sha256').update('synthetic verification evidence '+id).digest('hex'),parent]);return id;
 };
 const bank=await link('alice','receiving_account','synthetic-bank-a');
 const device=await link('alice','device','synthetic-device-a',bank),otherDevice=await link('bob','device','synthetic-device-b');
 const statement=await link('alice','statement_import','synthetic-statement-a',bank),order=await link('merchant','order','WPTEST000001');
 await legacyOwner.query("INSERT INTO devices(id,credential_hash,sim_fingerprint_hash) VALUES('synthetic-device-a',$1,$1),('synthetic-device-b',$1,$1)",['0'.repeat(64)]);
 await legacyOwner.query(`INSERT INTO device_otp_events(event_hash,device_id,code_mask,otp_length,message_masked,sms_received_at)
   SELECT 'synthetic-event-'||i,'synthetic-device-a','654321',6,'SYNTHETIC SMS MUST NEVER LEAVE SOURCE',CURRENT_TIMESTAMP FROM generate_series(1,55) i`);
 await legacyOwner.query("INSERT INTO device_otp_events(event_hash,device_id,code_mask,otp_length,message_masked,sms_received_at) VALUES('synthetic-other','synthetic-device-b','123456',6,'OTHER OWNER SYNTHETIC',CURRENT_TIMESTAMP)");
 await legacyOwner.query("INSERT INTO device_transactions(device_id,utr,status,amount) VALUES('synthetic-device-a','123456789012','SUCCESS',10.50),('synthetic-device-b','999999999999','SUCCESS',900.00)");
 await legacyOwner.query("INSERT INTO payment_links(id,upi_uri,amount,status) VALUES('WPTEST000001','upi://pay?pa=synthetic%40bank',10.50,'success')");
 await legacyOwner.query("INSERT INTO payment_claims(payment_id,utr_normalized,utr_display,amount,status) VALUES('WPTEST000001','123456789012','123456789012',10.50,'success')");
 await legacyOwner.query("INSERT INTO statement_imports(id,file_hash,file_name) VALUES('synthetic-statement-a',$1,'synthetic.csv')",['1'.repeat(64)]);
 await legacyOwner.query("INSERT INTO statement_credit_events(import_id,txn_date,utr_normalized,amount,matched_at) VALUES('synthetic-statement-a',CURRENT_DATE,'123456789012',10.50,CURRENT_TIMESTAMP)");
 await t.test('owner OTP metadata is bounded and masked; other User/Merchant/Admin cannot read',async()=>{
  const body={linkId:device,view:'otp',before:null},first=await call('alice','resources/read',body);
  assert.equal(first.rows.length,50);assert.ok(first.nextCursor);assert.equal((await call('alice','resources/read',{...body,before:first.nextCursor})).rows.length,5);
  const text=JSON.stringify(first);for(const forbidden of ['654321','123456','SYNTHETIC SMS','credential_hash','message_masked','code_mask'])assert.equal(text.includes(forbidden),false);
  for(const name of ['bob','merchant','verifier'])await assert.rejects(call(name,'resources/read',body),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','resources/read',{...body,before:'1 OR 1=1'}),{code:'INVALID_INPUT'});
  assert.equal((await call('alice','resources/read',{...body,view:'device'})).device.status,'active');
 });
 await t.test('pending consent never grants ownership; runtime cannot verify a mapping',async()=>{
  const id=randomUUID();await call('bob','resources/request',{requestId:id,kind:'device',reference:'synthetic-device-a',consent:true});
  await assert.rejects(call('bob','resources/read',{linkId:id,view:'otp',before:null}),{code:'FORBIDDEN'});
  await assert.rejects(runtime.query("UPDATE wpay_auth.resource_links SET status='verified' WHERE id=$1",[id]),{code:'42501'});
  await assert.rejects(runtime.query('UPDATE wpay_auth.resource_links SET verifier_id=$1 WHERE id=$2',[ids.verifier,id]),{code:'42501'});
  await assert.rejects(runtime.query('DELETE FROM wpay_auth.resource_audit'),{code:'42501'});
 });
 await t.test('captured UTR, statement matches and merchant claims never promote financial status',async()=>{
  for(const [name,id,view] of [['alice',device,'transactions'],['alice',statement,'statement'],['merchant',order,'order']]){
   const result=await call(name,'resources/read',{linkId:id,view,before:null});assert.equal(result.rows.length,1);assert.equal(result.financiallyAccounted,false);assert.equal(result.settled,false);assert.equal(result.evidenceVerified,false);assert.equal(result.ownershipVerified,true);
   assert.doesNotMatch(JSON.stringify(result),/synthetic%40bank|sms_body|credential_hash|999999999999/);
  }
  await assert.rejects(call('merchant','resources/read',{linkId:order,view:'otp',before:null}),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','resources/read',{linkId:order,view:'order',before:null}),{code:'FORBIDDEN'});
  await assert.rejects(call('bob','resources/read',{linkId:otherDevice,view:'transactions',before:null}),{code:'FORBIDDEN'});
 });
 await t.test('ownership time windows exclude historical events and expired mappings',async()=>{
  await legacyOwner.query("INSERT INTO device_otp_events(event_hash,device_id,code_mask,otp_length,message_masked,sms_received_at) VALUES('synthetic-outside-window','synthetic-device-b','123456',6,'OUTSIDE WINDOW',CURRENT_TIMESTAMP-interval '2 hours')");
  assert.equal((await call('bob','resources/read',{linkId:otherDevice,view:'otp',before:null})).rows.length,1);
  await owner.query("UPDATE wpay_auth.resource_links SET valid_until=CURRENT_TIMESTAMP-interval '1 minute' WHERE id=$1",[otherDevice]);
  await assert.rejects(call('bob','resources/read',{linkId:otherDevice,view:'otp',before:null}),{code:'FORBIDDEN'});
  await owner.query("UPDATE wpay_auth.resource_links SET valid_until=CURRENT_TIMESTAMP+interval '1 hour' WHERE id=$1",[otherDevice]);
 });
 await t.test('bank mapping revocation blocks dependent observations; device revocation blocks further reads',async()=>{
  await call('alice','resources/revoke',{linkId:bank});
  for(const [id,view] of [[device,'transactions'],[statement,'statement']])await assert.rejects(call('alice','resources/read',{linkId:id,view,before:null}),{code:'FORBIDDEN'});
  await call('alice','resources/revoke',{linkId:device});await assert.rejects(call('alice','resources/read',{linkId:device,view:'otp',before:null}),{code:'FORBIDDEN'});
  await assert.rejects(call('alice','resources/revoke',{linkId:otherDevice}),{code:'FORBIDDEN'});
 });
 await t.test('real HTTP APK download has exact content type and checksum, requires auth and denies Merchant',async()=>{
  server=await startAuthServer({service,port:0});const origin=`http://127.0.0.1:${server.address().port}`;
  const request=name=>fetch(origin+'/wpay-auth/apk/download',{headers:name?{Cookie:`${SESSION_COOKIE}=${sessions[name]}`}:{}});
  assert.equal((await request()).status,401);assert.equal((await request('merchant')).status,403);
  for(const name of ['alice','verifier']){
   const info=await call(name,'apk'),response=await request(name);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/vnd.android.package-archive');
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,info.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),info.sha256);
   assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  for(const route of ['api/device/otp-event','api/payments','wpay-auth/match','wpay-auth/payment-link'])assert.equal((await fetch(origin+'/'+route)).status,404);
 });
 await t.test('disconnected source is explicit and audit contains no event secrets',async()=>{
  const disconnected=new AuthService(new SecurityRepository(runtime),{mfaCrypto:crypto});
  assert.equal((await disconnected.authenticated(sessions.bob,'resources')).sourceConnected,false);
  const audit=JSON.stringify((await owner.query('SELECT * FROM wpay_auth.resource_audit')).rows);assert.doesNotMatch(audit,/654321|SYNTHETIC SMS|OTHER OWNER/);
 });
});
