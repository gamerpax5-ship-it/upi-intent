"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID,createHash}=require('node:crypto'),{Pool}=require('pg');
const {migrate,validateMigrations}=require('../lib/wpay/db/migrations');
const {verifyRuntimeRole}=require('../lib/wpay/db/hosted-config');
const {AuthService,DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service');
const {SecurityRepository}=require('../lib/wpay/db/security-repository');
const {hashPassword}=require('../lib/wpay/auth/runtime/passwords');
const {MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
const {digest}=require('../lib/wpay/auth/runtime/tokens');
const {startAuthServer,SESSION_COOKIE,CSRF_COOKIE}=require('../lib/wpay/auth/runtime/http');
const {openLegacySource}=require('../lib/wpay/integrations/source-config');
test('isolated PostgreSQL and HTTP adapter boundary acceptance',{timeout:120000},async t=>{
  assert.equal(process.env.WPAY_ADAPTER_TEST_CONFIRM,'fresh-local-synthetic-only');
  const cfg=JSON.parse(fs.readFileSync(process.env.WPAY_ADAPTER_TEST_CONFIG,'utf8'));
  for(const key of ['migration','runtime','legacyOwner','legacyReader']){assert.equal(cfg[key].host,'127.0.0.1');assert.match(cfg[key].database,/^wpay_(adapters|adapter_legacy)_(\d+|ci)$/);}
  assert.notEqual(cfg.migration.database,cfg.legacyOwner.database);
  const owner=new Pool(cfg.migration),runtime=new Pool(cfg.runtime),legacy=new Pool(cfg.legacyOwner);
  let source,server;
  t.after(async()=>{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if(source)await source.close();await Promise.all([owner.end(),runtime.end(),legacy.end()]);});
  for(const pool of [owner,legacy])assert.equal((await pool.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname IN ('public','wpay_auth')")).rowCount,0,'Fresh isolated targets only; never clear an existing database.');
  await migrate(owner);await validateMigrations(runtime);await verifyRuntimeRole(runtime);
  // Protected initializers run unchanged, only in this fresh synthetic source.
  await require('../server').initDb(legacy);
  await require('../lib/device-pairing').initDeviceTables(legacy);
  await require('../lib/payment-verification').initPaymentVerificationTables(legacy);
  await require('../lib/device-otp-router').initDeviceOtpTables(legacy);
  await require('../lib/statement-match-router').initStatementTables(legacy);
  for(const [table,columns]of Object.entries({devices:'id,status,last_seen_at',device_otp_events:'id,device_id,otp_length,source,sms_received_at,created_at',device_transactions:'id,device_id,utr,status,amount,created_at',statement_credit_events:'id,import_id,utr_normalized,amount,txn_date,matched_at,created_at',payment_links:'id,amount,status,created_at,expires_at',payment_claims:'payment_id,utr_display,submitted_at,verified_at,verification_source'}))await legacy.query(`GRANT SELECT(${columns}) ON public.${table} TO wpay_legacy_reader`);
  const c=cfg.legacyReader,sourceEnv={WPAY_LEGACY_READER_DATABASE_URL:`postgresql://wpay_legacy_reader:${encodeURIComponent(c.password)}@127.0.0.1:${c.port}/${c.database}`,WPAY_LEGACY_READER_TARGET:`127.0.0.1:${c.port}/${c.database}`};
  source=openLegacySource(sourceEnv);assert.equal(await source.reader.ready(),true);
  const crypto=new MfaCrypto(Buffer.from(cfg.mfaKey,'base64')),repository=new SecurityRepository(runtime),service=new AuthService(repository,{mfaCrypto:crypto,legacyReader:source.reader}),setup=new AuthService(new SecurityRepository(owner),{mfaCrypto:crypto});
  const password='Synthetic adapter checkpoint password 1!';
  await setup.bootstrap({name:'Synthetic Admin',email:'admin@adapters.example.invalid',password});
  for(const [name,accountType]of [['alice','user'],['bob','user'],['merchant','merchant'],['merchant2','merchant']])await service.register({name:'Synthetic '+name,email:name+'@adapters.example.invalid',password,accountType},'127.0.0.1');
  await new SecurityRepository(owner).createAccount({name:'Synthetic Employee',email:'employee@adapters.example.invalid',accountType:'employee'},await hashPassword(password),DEFAULT_GRANTS.employee);
  await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved'");
  const ids=Object.fromEntries((await owner.query('SELECT id,email FROM wpay_auth.accounts')).rows.map(r=>[r.email.split('@')[0],r.id])),sessions={};
  for(const name of Object.keys(ids)){const login=await service.login({email:name+'@adapters.example.invalid',password},'127.0.0.1'),setup=await service.mfa.challenge(login.challengeToken,'setup',{}),code=await crypto.libraries().otp.generate({secret:setup.setupKey}),verified=await service.mfa.challenge(login.challengeToken,'verify',{code});sessions[name]=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true})).sessionToken;}
  const call=(name,route,body={})=>service.authenticated(sessions[name],route,0,body);
  async function link(name,kind,reference,parent=null,verified=true){const id=randomUUID();await call(name,'resources/request',{requestId:id,kind,reference,consent:true});if(verified)await owner.query(`UPDATE wpay_auth.resource_links SET status='verified',verified_at=CURRENT_TIMESTAMP,verifier_id=$2,verification_digest=$3,valid_from=CURRENT_TIMESTAMP-interval '1 hour',valid_until=CURRENT_TIMESTAMP+interval '1 hour',parent_id=$4 WHERE id=$1`,[id,ids.admin,'0'.repeat(64),parent]);return id;}
  server=await startAuthServer({service,port:0});const origin=`http://127.0.0.1:${server.address().port}`;
  async function http(name,route,body){let cookie=name?`${SESSION_COOKIE}=${sessions[name]}`:'';const headers={Origin:origin,Cookie:cookie};
    if(body!==undefined){const csrf=await fetch(origin+'/wpay-auth/csrf',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'}),token=await csrf.json();const part=csrf.headers.getSetCookie().find(value=>value.startsWith(CSRF_COOKIE+'='));assert.ok(part);cookie+='; '+part.split(';')[0];headers.Cookie=cookie;headers['X-WPay-CSRF-Token']=token.csrfToken;headers['Content-Type']='application/json';}
    const response=await fetch(origin+'/wpay-auth/'+route,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,headers:response.headers,text:await response.text()};
  }
  await t.test('unlinked and pending devices return no linked device and cannot read by browser deviceId',async()=>{
    assert.equal((await call('alice','resources')).message,'No linked device');
    const pending=await link('bob','device','synthetic-alice-device',null,false);
    assert.equal((await call('bob','resources')).otpState,'no_linked_device');
    assert.equal((await http('bob','resources/read',{linkId:pending,view:'otp',before:null})).status,403);
    assert.equal((await http('alice','resources/read',{linkId:randomUUID(),view:'otp',before:null})).status,403);
    assert.equal((await http('alice','resources/read',{deviceId:'synthetic-alice-device',view:'otp',before:null})).status,400);
  });
  const bankA=await link('alice','receiving_account','synthetic-bank-a'),bankB=await link('bob','receiving_account','synthetic-bank-b');
  const deviceA=await link('alice','device','synthetic-alice-device',bankA),deviceB=await link('bob','device','synthetic-bob-device',bankB);
  const statement=await link('alice','statement_import','synthetic-statement-a',bankA),order=await link('merchant','order','WPADAPTER001'),checkout=await link('merchant','payment_link','WPADAPTER002');
  await legacy.query("INSERT INTO devices(id,credential_hash,sim_fingerprint_hash) VALUES('synthetic-alice-device',$1,$1),('synthetic-bob-device',$1,$1)",['f'.repeat(64)]);
  await legacy.query("INSERT INTO device_otp_events(event_hash,device_id,code_mask,otp_length,message_masked,sms_received_at) VALUES('adapter-a','synthetic-alice-device','314159',6,'SYNTHETIC PRIVATE ALICE SMS',CURRENT_TIMESTAMP),('adapter-b','synthetic-bob-device','271828',6,'SYNTHETIC PRIVATE BOB SMS',CURRENT_TIMESTAMP)");
  await legacy.query("INSERT INTO device_transactions(device_id,utr,status,amount) VALUES('synthetic-alice-device','111111111111','SUCCESS',20.50),('synthetic-bob-device','222222222222','SUCCESS',999.00)");
  await legacy.query("INSERT INTO statement_imports(id,file_hash,file_name) VALUES('synthetic-statement-a',$1,'synthetic.csv')",['a'.repeat(64)]);
  await legacy.query("INSERT INTO statement_credit_events(import_id,txn_date,utr_normalized,amount) VALUES('synthetic-statement-a',CURRENT_DATE,'111111111111',20.50)");
  await legacy.query("INSERT INTO payment_links(id,upi_uri,amount,status) VALUES('WPADAPTER001','upi://pay?pa=private-synthetic%40bank',20.50,'success'),('WPADAPTER002','upi://pay?pa=private-synthetic%40bank',30.00,'pending')");
  const otp={linkId:deviceA,view:'otp',before:null};
  await t.test('User A receives only masked metadata; User B, Merchant, Admin and default Employee deny over HTTP',async()=>{
    const own=await http('alice','resources/read',otp);assert.equal(own.status,200);assert.equal(JSON.parse(own.text).rows.length,1);assert.doesNotMatch(own.text,/314159|271828|SYNTHETIC PRIVATE|credential|message_masked|code_mask/);assert.equal(own.headers.get('cache-control'),'no-store');
    for(const name of ['bob','merchant','employee','admin'])assert.equal((await http(name,'resources/read',otp)).status,403);
    assert.equal((await http(null,'resources/read',otp)).status,401);
    assert.equal((await http('alice','resources/read',{...otp,deviceId:'synthetic-bob-device'})).status,400);
    assert.equal((await http('alice','resources/read',{...otp,view:'reveal'})).status,403);
    assert.equal((await call('alice','resources')).revealAvailable,false);
  });
  await t.test('UTR, statement and checkout observations require owner/parent scope and never expose credentials or settle',async()=>{
    for(const [name,id,view]of [['alice',deviceA,'transactions'],['alice',statement,'statement'],['merchant',order,'order'],['merchant',checkout,'order']]){
      const data=await call(name,'resources/read',{linkId:id,view,before:null});assert.equal(data.rows.length,1);assert.equal(data.financiallyAccounted,false);assert.equal(data.settled,false);assert.equal(data.evidenceVerified,false);assert.doesNotMatch(JSON.stringify(data),/222222222222|upi_uri|private-synthetic|credential|sms_body|raw_result/);
      for(const other of ['bob','employee','merchant2',name==='alice'?'merchant':'alice'])assert.equal((await http(other,'resources/read',{linkId:id,view,before:null})).status,403);
    }
    await owner.query('UPDATE wpay_auth.resource_links SET parent_id=$2 WHERE id=$1',[deviceA,bankB]);
    assert.equal((await http('alice','resources/read',{linkId:deviceA,view:'transactions',before:null})).status,403);
    await owner.query('UPDATE wpay_auth.resource_links SET parent_id=$2 WHERE id=$1',[deviceA,bankA]);
    assert.equal((await owner.query('SELECT 1 FROM wpay_auth.business_journals')).rowCount,0);
  });
  await t.test('source disconnection and privilege drift report unavailable without exposing source credentials',async()=>{
    const disconnected=new AuthService(repository,{mfaCrypto:crypto});assert.equal((await disconnected.authenticated(sessions.alice,'resources')).message,'OTP source unavailable');
    await assert.rejects(disconnected.authenticated(sessions.alice,'resources/read',0,otp),{code:'OTP_SOURCE_UNAVAILABLE'});
    await legacy.query('GRANT SELECT(code_mask) ON public.device_otp_events TO wpay_legacy_reader');
    try{assert.equal((await call('alice','resources')).otpState,'source_unavailable');const response=await http('alice','resources/read',otp);assert.equal(response.status,503);assert.equal(JSON.parse(response.text).message,'OTP source unavailable');assert.doesNotMatch(response.text,/password|postgres|314159/);}finally{await legacy.query('REVOKE SELECT(code_mask) ON public.device_otp_events FROM wpay_legacy_reader');}
    assert.equal((await call('alice','resources')).otpState,'ready');
  });
  await t.test('mapping expiry and revocation deny future OTP and dependent statement reads',async()=>{
    await owner.query("UPDATE wpay_auth.resource_links SET valid_until=CURRENT_TIMESTAMP-interval '1 minute' WHERE id=$1",[deviceA]);assert.equal((await http('alice','resources/read',otp)).status,403);assert.equal((await call('alice','resources')).message,'No linked device');
    await owner.query("UPDATE wpay_auth.resource_links SET valid_until=CURRENT_TIMESTAMP+interval '1 hour' WHERE id=$1",[deviceA]);
    await call('alice','resources/revoke',{linkId:bankA});assert.equal((await http('alice','resources/read',{linkId:statement,view:'statement',before:null})).status,403);
    await call('alice','resources/revoke',{linkId:deviceA});assert.equal((await http('alice','resources/read',otp)).status,403);assert.equal((await call('alice','resources')).message,'No linked device');
  });
  await t.test('APK permissions bind metadata and exact artifact download; legacy routes stay unmounted',async()=>{
    const info=await call('bob','apk'),apk=await fetch(origin+'/wpay-auth/apk/download',{headers:{Cookie:`${SESSION_COOKIE}=${sessions.bob}`}});assert.equal(apk.status,200);assert.equal(createHash('sha256').update(Buffer.from(await apk.arrayBuffer())).digest('hex'),info.sha256);
    assert.doesNotMatch(JSON.stringify(info),/credential_hash|password|sms_body|sessionToken/);
    for(const name of ['merchant','employee',null])for(const route of ['apk','apk/download'])assert.equal((await http(name,route)).status,name?403:401);
    for(const route of ['api/device/otp-event','api/device/otp-events','api/payments','api/statements/match','wpay-auth/payment-link'])assert.equal((await fetch(origin+'/'+route)).status,404);
  });
  await t.test('expired and logged-out sessions cannot read OTP, resources, statements, orders or APK',async()=>{
    await owner.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '12 hours 1 second',last_seen_at=CURRENT_TIMESTAMP,expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE token_digest=$1",[digest(sessions.bob)]);
    assert.equal((await http('bob','resources/read',{linkId:deviceB,view:'otp',before:null})).status,401);assert.equal((await http('bob','apk')).status,401);
    await call('alice','logout');assert.equal((await http('alice','resources/read',otp)).status,401);assert.equal((await http('alice','resources')).status,401);assert.equal((await http('alice','resources/read',{linkId:statement,view:'statement',before:null})).status,401);
    await call('merchant','logout');assert.equal((await http('merchant','resources/read',{linkId:order,view:'order',before:null})).status,401);
  });
  await t.test('audits contain metadata only and original source events remain intact',async()=>{
    const audit=JSON.stringify((await owner.query('SELECT * FROM wpay_auth.resource_audit')).rows);assert.doesNotMatch(audit,/314159|271828|SYNTHETIC PRIVATE|password|credential/);
    assert.equal((await legacy.query("SELECT 1 FROM device_otp_events WHERE event_hash='adapter-a' AND code_mask='314159' AND message_masked='SYNTHETIC PRIVATE ALICE SMS'")).rowCount,1);
    assert.equal((await legacy.query("SELECT count(*)::integer AS n FROM device_otp_events")).rows[0].n,2);
  });
});
