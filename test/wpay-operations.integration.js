"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture}=require('./helpers/wpay-9a-fixture'),{sourceFixture}=require('./helpers/wpay-operational-source'),{startAuthServer}=require('../lib/wpay/auth/runtime/http');
const denied=(p,code='FORBIDDEN')=>assert.rejects(p,e=>e.code===code);
test('Task 12 real PostgreSQL, protected legacy pairing/OTP and scoped operational authorization',async t=>{
 const f=await fixture(t),legacy=await sourceFixture(t,f.cfg),{service,call,ids,owner,sessions}=f;service.operations.devices.source=legacy.source;service.operations.devices.bridge=legacy.bridge;
 let a,b,deviceA,employee;
 async function enroll(email,password,role){let login=await service.login({email,password},'127.0.0.1',role);if(login.stage==='password-reset')login=await require('../lib/wpay/auth/runtime/password-reset').complete(service,login.challengeToken,{password:password+' chosen by synthetic employee'},role);const setup=await service.mfa.challenge(login.challengeToken,'setup',{},role),code=await f.crypto.libraries().otp.generate({secret:setup.setupKey}),verified=await service.mfa.challenge(login.challengeToken,'verify',{code},role);return (await service.mfa.challenge(verified.challengeToken,'complete',{saved:true},role)).sessionToken;}
 await t.test('fresh migration and source role cannot read credentials or mutate legacy',async()=>{assert.equal((await owner.query('SELECT max(version) v FROM wpay_auth.schema_migrations')).rows[0].v,16);assert.equal(await legacy.source.ready(),true);await denied(legacy.reader.query('SELECT credential_hash FROM public.devices'),'42501');await denied(legacy.reader.query("UPDATE public.devices SET status='active'"),'42501');});
 await t.test('unlinked state is real and unavailable source never manufactures OTP',async()=>{assert.equal((await call('alice','operations/otp',{})).message,'No linked device');await denied(call('merchant','operations/otp',{}));await denied(call('alice','operations/otp',{device:'unowned-device'}));});
 await t.test('existing pairing code/claim resolves server ownership and real stored event',async()=>{
  a=await call('alice','operations/device/create',{requestId:randomUUID()});deviceA=await legacy.pair(a.pairingCode,'synthetic-device-alice');a.link=await call('alice','operations/device/poll',{requestId:a.id});assert.equal(a.link.state,'linked');
  b=await call('bob','operations/device/create',{requestId:randomUUID()});const deviceB=await legacy.pair(b.pairingCode,'synthetic-device-bob');b.link=await call('bob','operations/device/poll',{requestId:b.id});
  await legacy.otp(deviceA,'321654');await legacy.otp(deviceB,'987123');
  const masked=await call('alice','operations/otp',{});assert.equal(masked.events.length,1);assert.equal(masked.events[0].code,'••••••');assert.doesNotMatch(JSON.stringify(masked),/321654|987123|Synthetic banking/);
  const revealed=await call('alice','operations/otp',{reveal:true});assert.equal(revealed.events[0].code,'321654');assert.equal(Object.hasOwn(revealed.events[0],'message'),false);
  await denied(call('alice','operations/otp',{device:deviceB.deviceId,reveal:true}));await denied(call('bob','operations/device/poll',{requestId:a.id}));
  const admin=await call('admin','operations/otp',{reveal:true});assert.equal(admin.events.length,2);assert.ok(admin.events.every(e=>e.ownerName&&e.message.startsWith('Synthetic banking')));
 });
 await t.test('Employee explicit grant, immutable history and immediate revocation; no self-escalation',async()=>{
  const permissions=['profile.view','account_security.view','account_security.update','apk_otp_events.view_all'];employee=await call('admin','operations/employee/create',{name:'Synthetic Employee',email:'employee@12.example.invalid',permissions,tenantIds:['wpay-auth-development']});
  const restricted=await service.login({email:employee.email,password:employee.oneTimePassword},'127.0.0.1','employee');assert.equal(restricted.stage,'password-reset');const login=await require('../lib/wpay/auth/runtime/password-reset').complete(service,restricted.challengeToken,{password:employee.oneTimePassword+' chosen by synthetic employee'},'employee'),setup=await service.mfa.challenge(login.challengeToken,'setup',{},'employee'),code=await f.crypto.libraries().otp.generate({secret:setup.setupKey}),verified=await service.mfa.challenge(login.challengeToken,'verify',{code},'employee');sessions.employee=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true},'employee')).sessionToken;
  const events=await call('employee','operations/otp',{reveal:true});assert.equal(events.events.length,2);await denied(call('employee','operations/employee/create',{name:'Escalation'}));
  await call('admin','operations/employee/update',{id:employee.id,name:'Synthetic Employee',email:employee.email,status:'active',permissions:permissions.filter(p=>p!=='apk_otp_events.view_all'),tenantIds:['wpay-auth-development']});await denied(call('employee','operations/otp',{reveal:true}),'AUTH_FAILED');
  assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.employee_access_versions WHERE employee_id=$1',[employee.id])).rows[0].n,2);
 });
 await t.test('role routes reject wrong passwords/account role, challenge crossover and existing session crossover',async()=>{
  await denied(service.login({email:'alice@9a.example.invalid',password:'Task 9A synthetic acceptance passphrase!'},'127.0.0.1','admin'),'AUTH_FAILED');
  const login=await service.login({email:'alice@9a.example.invalid',password:'Task 9A synthetic acceptance passphrase!'},'127.0.0.1','user');await denied(service.mfa.challenge(login.challengeToken,'verify',{code:'000000'},'admin'),'AUTH_FAILED');
  const server=await startAuthServer({service,port:0});try{const origin='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(origin+'/wpay-auth/roles/admin/me',{headers:{cookie:'wpay_auth_dev_session='+sessions.alice}})).status,401);assert.equal((await fetch(origin+'/wpay-auth/roles/user/me',{headers:{cookie:'wpay_auth_dev_session='+sessions.alice}})).status,200);}finally{await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});}
 });
 await t.test('ordinary Admin can grant scoped OTP; an ungranted Employee cannot read or self-grant',async()=>{
  const {DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service'),{hashPassword}=require('../lib/wpay/auth/runtime/passwords');
  const email='ordinary-admin@12.example.invalid',password='Synthetic ordinary Admin passphrase!';
  const scopedAdminGrants=DEFAULT_GRANTS.super_admin.filter(p=>require('../lib/wpay/permission-catalog').getPermission(p).principalTypes.includes('admin'));
  ids.operator=await service.repository.createAccount({name:'Ordinary Admin',email,accountType:'admin'},await hashPassword(password),scopedAdminGrants);
  await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[ids.operator,{tenantIds:['wpay-auth-development']}]);sessions.operator=await enroll(email,password,'admin');
  assert.equal((await call('operator','operations/otp',{})).events.length,2);
  const permissions=['profile.view','account_security.view','account_security.update'],e=await call('operator','operations/employee/create',{name:'Ungrant Employee',email:'ungranted@12.example.invalid',permissions,tenantIds:['wpay-auth-development']});
  sessions.ungranted=await enroll(e.email,e.oneTimePassword,'employee');await denied(call('ungranted','operations/otp',{}));await denied(call('ungranted','operations/employee/update',{id:e.id}));
  await denied(call('operator','operations/employee/create',{name:'Scope escape',email:'escape@12.example.invalid',permissions,tenantIds:['foreign-tenant']}));
  await denied(call('operator','operations/employee/create',{name:'Grant escape',email:'grant@12.example.invalid',permissions:[...permissions,'ledger.adjust'],tenantIds:['wpay-auth-development']}));
  await call('operator','operations/employee/update',{id:e.id,name:'Ungrant Employee',email:e.email,status:'active',permissions:[...permissions,'apk_otp_events.view_all'],tenantIds:['wpay-auth-development']});await denied(call('ungranted','operations/otp',{}),'AUTH_FAILED');
  // A tenant-scoped Admin cannot read or edit another tenant, even if it knows IDs.
  await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[ids.operator,{tenantIds:['foreign-tenant']}]);
  assert.equal((await call('operator','operations/otp',{})).events.length,0);await denied(call('operator','operations/otp',{ownerId:ids.alice}));await denied(call('operator','operations/employee/update',{id:e.id,name:'Outside scope',email:e.email,status:'active',permissions,tenantIds:['foreign-tenant']}));
 });
 await t.test('recent MFA, source availability, bounded pagination, audit immutability and field projection',async()=>{
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE account_id=ANY($1::uuid[])",[[ids.admin,ids.alice]]);
  await denied(call('admin','operations/otp',{}),'RECENT_MFA_REQUIRED');await denied(call('alice','operations/otp',{reveal:true}),'RECENT_MFA_REQUIRED');assert.equal((await call('alice','operations/otp',{})).masked,true);
  await owner.query('UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP WHERE account_id=ANY($1::uuid[])',[[ids.admin,ids.alice]]);
  service.operations.devices.source=null;await denied(call('alice','operations/otp',{}),'OTP_SOURCE_UNAVAILABLE');assert.equal((await call('alice','operations/devices',{})).sourceConnected,false);service.operations.devices.source=legacy.source;
  for(let i=0;i<52;i++)await legacy.otp(deviceA,String(100000+i));
  const page=await call('alice','operations/otp',{sender:'test-bank'});assert.equal(page.events.length,50);assert.ok(page.nextCursor);const next=await call('alice','operations/otp',{before:page.nextCursor});assert.equal(next.events.length,3);assert.equal(new Set([...page.events,...next.events].map(e=>e.id)).size,53);
  assert.equal((await call('alice','operations/otp',{sender:'UNKNOWN'})).events.length,0);assert.doesNotMatch(JSON.stringify(page.events),/credential|token_hash|sim_fingerprint|message|321654|10000[0-9]/);
  await denied(f.runtime.query("DELETE FROM wpay_auth.operations_audit"),'42501');await denied(f.runtime.query("UPDATE wpay_auth.employee_access_versions SET status='active'"),'42501');
  await denied(call('alice','operations/otp',{before:'0 OR 1=1'}),'INVALID_INPUT');
 });
 await t.test('inactive legacy device and re-pairing invalidate the old ownership proof',async()=>{
  await legacy.owner.query("UPDATE public.devices SET status='revoked' WHERE id=$1",[deviceA.deviceId]);assert.equal((await call('alice','operations/otp',{})).events.length,0);
  await legacy.owner.query("UPDATE public.devices SET status='active' WHERE id=$1",[deviceA.deviceId]);assert.equal((await call('alice','operations/otp',{})).events.length,50);
  const newCode=await legacy.bridge.issue();await legacy.pair(newCode,deviceA.deviceId);assert.equal((await call('alice','operations/otp',{})).events.length,0);
  await denied(call('alice','operations/device/poll',{requestId:a.id}),'CONFLICT');
 });
 await t.test('more than 100 linked devices remain reachable through scoped device pagination',async()=>{
  // Synthetic rows in this helper's verified empty legacy database only.
  for(let i=0;i<101;i++){
   const device='zz-synthetic-'+String(i).padStart(3,'0'),requestId=randomUUID(),digest=require('node:crypto').createHash('sha256').update(requestId).digest('hex');
   await legacy.owner.query("INSERT INTO public.devices(id,credential_hash,sim_fingerprint_hash,status) VALUES($1,$2,$2,'active')",[device,digest]);
   const proof=(await legacy.owner.query("INSERT INTO public.device_pairings(token_hash,status,device_id,claimed_at) VALUES($1,'claimed',$2,CURRENT_TIMESTAMP) RETURNING id::text,claimed_at",[digest,device])).rows[0];
   await owner.query("INSERT INTO wpay_auth.legacy_pairing_requests(id,owner_id,source_id,pairing_id,token_digest,encrypted_code,expires_at) VALUES($1,$2,'legacy-primary',$3,$4,$5,CURRENT_TIMESTAMP+interval '10 minutes')",[requestId,ids.bob,proof.id,digest,f.crypto.seal('SYNTHETIC','wpay-pairing-code:'+requestId)]);
   await owner.query("INSERT INTO wpay_auth.paired_devices(id,owner_id,source_id,device_ref,pairing_id,request_id,valid_from,valid_until) VALUES($1,$2,'legacy-primary',$3,$4,$5,$6,CURRENT_TIMESTAMP+interval '1 year')",[randomUUID(),ids.bob,device,proof.id,requestId,proof.claimed_at]);
  }
  const first=await call('bob','operations/devices',{}),second=await call('bob','operations/devices',{afterDevice:first.nextDeviceCursor});assert.equal(first.devices.length,100);assert.equal(second.devices.length,2);assert.equal(new Set([...first.devices,...second.devices].map(d=>d.device)).size,102);assert.equal(second.nextDeviceCursor,null);
  const page=await call('admin','operations/otp',{});assert.ok(page.nextDeviceCursor);assert.equal((await call('admin','operations/otp',{afterDevice:page.nextDeviceCursor})).nextDeviceCursor,null);
  await denied(call('alice','operations/otp',{device:'zz-synthetic-100'}));
 });
 await t.test('OTP auditing contains no codes/messages; User revocation denies future reads',async()=>{
  const audits=(await owner.query('SELECT * FROM wpay_auth.operations_audit')).rows;assert.doesNotMatch(JSON.stringify(audits),/321654|987123|Synthetic banking/);assert.ok(audits.some(a=>a.action==='otp_content_accessed'));
  await call('alice','operations/device/revoke',{id:a.link.id});await denied(call('alice','operations/otp',{device:deviceA.deviceId,reveal:true}));await denied(call('alice','operations/device/poll',{requestId:a.id}),'CONFLICT');
 });
 await t.test('logout, expiry and suspended owner deny subsequent OTP reads',async()=>{
  await owner.query("UPDATE wpay_auth.accounts SET status='suspended' WHERE id=$1",[ids.bob]);assert.equal((await call('admin','operations/otp',{device:'synthetic-device-bob'}).catch(e=>({code:e.code}))).code,'FORBIDDEN');await denied(call('bob','operations/otp',{}),'AUTH_FAILED');
  await call('alice','logout',{});await denied(call('alice','operations/otp',{}),'AUTH_FAILED');
  await owner.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '1 hour',expires_at=CURRENT_TIMESTAMP+interval '11 hours',last_seen_at=CURRENT_TIMESTAMP-interval '31 minutes' WHERE account_id=$1",[ids.admin]);await denied(call('admin','operations/otp',{}),'AUTH_FAILED');
 });
});
