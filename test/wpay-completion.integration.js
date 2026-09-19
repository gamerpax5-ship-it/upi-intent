"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{Pool}=require('pg');
const {fixture}=require('./helpers/wpay-9a-fixture'),reset=require('../lib/wpay/auth/runtime/password-reset');
const {migrate,validateMigrations,transaction}=require('../lib/wpay/db/migrations'),{AuthService,DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service'),{SecurityRepository}=require('../lib/wpay/db/security-repository'),{hashPassword}=require('../lib/wpay/auth/runtime/passwords');
const denied=(p,code='FORBIDDEN')=>assert.rejects(p,e=>e.code===code),sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('Completion: real PostgreSQL lifecycle, scope, reports and upgrade',async t=>{
 const f=await fixture(t),{owner,runtime,service,call,ids,sessions,crypto}=f;
 const grants=['profile.view','account_security.view','account_security.update'];
 const employee=async suffix=>call('admin','operations/employee/create',{name:'Synthetic Completion '+suffix,email:suffix+'@completion.example.invalid',permissions:grants,tenantIds:['wpay-auth-development']});
 const login=e=>service.login({email:e.email,password:e.oneTimePassword},'127.0.0.1','employee');
 let e,restricted;
 await t.test('fresh 001-015 migration and restricted runtime',async()=>{
  assert.equal((await owner.query('SELECT max(version) v FROM wpay_auth.schema_migrations')).rows[0].v,15);await validateMigrations(runtime);
  await require('../lib/wpay/db/hosted-config').verifyRuntimeRole(runtime);
  await denied(runtime.query('CREATE TABLE wpay_auth.not_allowed(id int)'),'42501');
 });
 await t.test('temporary login is expiring and restricted before mandatory MFA',async()=>{
  e=await employee('first');assert.equal(e.passwordResetRequired,true);assert.ok(+new Date(e.temporaryExpiresAt)>Date.now());restricted=await login(e);assert.equal(restricted.stage,'password-reset');assert.equal(restricted.sessionToken,undefined);
  await denied(service.authenticated(restricted.challengeToken,'navigation'),'AUTH_FAILED');await denied(service.mfa.challenge(restricted.challengeToken,'setup',{},'employee'),'MFA_FAILED');
  await denied(reset.complete(service,restricted.challengeToken,{password:'A chosen temporary replacement passphrase!'},'admin'),'AUTH_FAILED');
  await denied(reset.complete(service,restricted.challengeToken,{password:e.oneTimePassword},'employee'),'INVALID_INPUT');
 });
 await t.test('concurrent resets have one winner; old credential and token cannot replay',async()=>{
  const password='Employee chosen synthetic completion passphrase!';const results=await Promise.allSettled([reset.complete(service,restricted.challengeToken,{password},'employee'),reset.complete(service,restricted.challengeToken,{password},'employee')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const next=results.find(r=>r.status==='fulfilled').value;assert.equal(next.stage,'enroll');assert.equal(next.sessionToken,undefined);
  await denied(login(e),'AUTH_FAILED');await denied(reset.complete(service,restricted.challengeToken,{password},'employee'),'AUTH_FAILED');
  const setup=await service.mfa.challenge(next.challengeToken,'setup',{},'employee'),code=await crypto.libraries().otp.generate({secret:setup.setupKey}),verified=await service.mfa.challenge(next.challengeToken,'verify',{code},'employee');
  sessions.employee=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true},'employee')).sessionToken;assert.equal((await service.authenticated(sessions.employee,'me')).accountType,'employee');await denied(call('employee','panel/directory',{type:'user'}));await denied(call('employee','operations/otp',{}));
  const c=(await owner.query('SELECT temporary_required,temporary_expires_at FROM wpay_auth.credentials WHERE account_id=$1',[e.id])).rows[0];assert.equal(c.temporary_required,false);assert.equal(c.temporary_expires_at,null);
 });
 await t.test('expired and suspended temporary credentials fail safely',async()=>{
  const expired=await employee('expired');await owner.query("UPDATE wpay_auth.credentials SET temporary_expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE account_id=$1",[expired.id]);await denied(login(expired),'AUTH_FAILED');
  const suspended=await employee('suspended'),challenge=await login(suspended);await owner.query("UPDATE wpay_auth.accounts SET status='suspended',session_epoch=session_epoch+1 WHERE id=$1",[suspended.id]);await denied(login(suspended),'AUTH_FAILED');await denied(reset.complete(service,challenge.challengeToken,{password:'A user chosen replacement passphrase!'},'employee'),'AUTH_FAILED');
  const expiring=await employee('challenge-expiry'),second=await login(expiring);await owner.query("UPDATE wpay_auth.password_reset_challenges SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE account_id=$1",[expiring.id]);await denied(reset.complete(service,second.challengeToken,{password:'A user chosen replacement passphrase!'},'employee'),'AUTH_FAILED');
 });
 await t.test('real HTTP reset uses restricted cookies and CSRF, then mandatory MFA and role isolation',async()=>{
  const {startAuthServer,SESSION_COOKIE}=require('../lib/wpay/auth/runtime/http'),server=await startAuthServer({service,port:0}),origin='http://127.0.0.1:'+server.address().port,cookies=new Map();let csrf='';
  const request=async(route,method='GET',body)=>{const r=await fetch(origin+'/wpay-auth/roles/'+route,{method,headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-WPay-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('='),k=pair.slice(0,i),v=pair.slice(i+1);if(v)cookies.set(k,v);else cookies.delete(k);}return {status:r.status,body:await r.json()};};
  const post=async(route,body)=>{csrf=(await request('employee/csrf','POST',{})).body.csrfToken;return request(route,'POST',body);};
  try{
   const httpEmployee=await employee('http'),r=await post('employee/login',{email:httpEmployee.email,password:httpEmployee.oneTimePassword});assert.equal(r.status,200);assert.equal(r.body.stage,'password-reset');assert.equal(cookies.has(SESSION_COOKIE),false);assert.equal(r.body.challengeToken,undefined);
   assert.equal((await request('employee/navigation')).status,401);csrf='';assert.equal((await request('employee/password/reset','POST',{password:'HTTP chosen synthetic password phrase!'})).status,403);
   const next=await post('employee/password/reset',{password:'HTTP chosen synthetic password phrase!'});assert.equal(next.status,200);assert.equal(next.body.stage,'enroll');assert.equal(cookies.has(SESSION_COOKIE),false);
   const setup=(await post('employee/mfa/setup',{})).body,code=await crypto.libraries().otp.generate({secret:setup.setupKey});assert.equal((await post('employee/mfa/verify',{code})).status,200);assert.equal((await post('employee/mfa/complete',{saved:true})).status,200);assert.equal((await request('employee/me')).status,200);assert.equal((await request('admin/me')).status,401);assert.equal((await request('merchant/me')).status,401);
   assert.equal((await post('employee/logout',{})).status,200);assert.equal((await request('employee/navigation')).status,401);
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
 });
 await t.test('directory is scoped, bounded and includes approved and pending accounts',async()=>{
  const d=await call('admin','panel/directory',{type:'user',limit:1});assert.equal(d.rows.length,1);assert.ok(d.nextOffset);assert.ok(d.rows[0].commercialVersion);
  await denied(call('alice','panel/directory',{type:'user'}));await denied(call('merchant','panel/directory',{type:'user'}));await denied(call('admin','panel/directory',{type:'user',limit:1000}),'INVALID_INPUT');
  await service.register({name:'Pending Test',email:'pending@completion.example.invalid',password:'Synthetic pending completion passphrase!',accountType:'user'},'127.0.0.1');assert.equal((await call('admin','panel/directory',{type:'user',status:'pending'})).rows.length,1);
  await owner.query("UPDATE wpay_auth.accounts SET tenant_id='outside-completion-scope' WHERE id=$1",[ids.bob]);assert.equal((await call('admin','panel/directory',{type:'user',search:'bob'})).rows.length,0);
  await denied(call('admin','panel/directory/update',{requestId:randomUUID(),id:ids.bob,action:'suspend',reason:'Synthetic out of scope',settings:null,expectedVersion:1}));
  await owner.query("UPDATE wpay_auth.accounts SET tenant_id='wpay-auth-development' WHERE id=$1",[ids.bob]);
 });
 await t.test('profile cannot change identity or grants, and support is owner/tenant scoped',async()=>{
  await denied(call('merchant','panel/profile/update',{name:'New',email:'hijack@example.invalid'}),'INVALID_INPUT');
  const before=sha((await owner.query('SELECT email,account_type,permission_version FROM wpay_auth.accounts WHERE id=$1',[ids.merchant])).rows);await call('merchant','panel/profile/update',{name:'Updated synthetic Merchant'});assert.equal(sha((await owner.query('SELECT email,account_type,permission_version FROM wpay_auth.accounts WHERE id=$1',[ids.merchant])).rows),before);
  const payload={requestId:randomUUID(),subject:'Account help',message:'Synthetic support issue with no financial data'},ticket=await call('alice','panel/support/create',payload);assert.equal((await call('alice','panel/support/create',payload)).id,ticket.id);
  assert.equal((await call('bob','panel/support')).rows.length,0);assert.equal((await call('merchant','panel/support')).rows.length,0);
  await call('admin','panel/support/update',{requestId:randomUUID(),id:ticket.id,status:'resolved',message:'Synthetic resolution'});assert.equal((await call('alice','panel/support')).rows[0].status,'resolved');await denied(call('bob','panel/support/update',{requestId:randomUUID(),id:ticket.id,status:'resolved',message:'Cross owner'}));
  await denied(runtime.query("UPDATE wpay_auth.support_events SET message='rewrite'"),'42501');
 });
 await t.test('notifications are in-app only; preferences and events never escape owner',async()=>{
  const data=await call('alice','panel/notifications');assert.equal(data.emailDeliveryConfigured,false);assert.ok(data.rows.length);await call('alice','panel/preferences',{inAppNotifications:false});assert.equal((await call('alice','panel/notifications')).rows.length,0);assert.equal((await call('bob','panel/notifications')).preferences.in_app_notifications,true);
  await denied(call('alice','panel/preferences',{inAppNotifications:true,accountId:ids.bob}),'INVALID_INPUT');
 });
 await t.test('journal reports are bounded, scoped, formula-safe and do not expose private snapshots',async()=>{
  await f.funding('alice','100000');await f.funding('bob','200000');
  const report=await call('admin','panel/reports',{limit:1});assert.equal(report.rows.length,1);assert.ok(report.nextOffset);assert.equal(report.pageTotalsOnly,true);
  await denied(call('alice','panel/reports/export',{}));await denied(call('merchant','panel/reports/export',{}));
  const result=await call('merchant','panel/analytics');assert.equal(result.rows.length,0);assert.doesNotMatch(JSON.stringify(result),/accountNumber|bank_id|user_id|encrypted|snapshot/);
  const exported=await call('admin','panel/reports/export');assert.ok(exported.csv.includes('ledger_type'));assert.doesNotMatch(exported.csv,/snapshot|accountNumber|depositAddress/);
  await denied(call('admin','panel/reports',{from:'2020-01-01',to:'2026-01-01'}),'INVALID_INPUT');
 });
 await t.test('commercial changes append versions, invalidate target sessions and preserve journals',async()=>{
  const terms=(await owner.query('SELECT settings FROM wpay_auth.commercial_versions WHERE account_id=$1 ORDER BY version DESC LIMIT 1',[ids.alice])).rows[0].settings;
  const journalBefore=sha((await owner.query('SELECT * FROM wpay_auth.business_journals ORDER BY id')).rows),oldBefore=sha((await owner.query('SELECT * FROM wpay_auth.commercial_versions WHERE account_id=$1 AND version=1',[ids.alice])).rows);
  const body={requestId:randomUUID(),id:ids.alice,action:'commercial.update',reason:'Synthetic new terms',settings:{...terms,inrPerUsdt:'91.5'},expectedVersion:1};const changed=await call('admin','panel/directory/update',body);assert.equal(changed.commercialVersion,2);assert.deepEqual(await call('admin','panel/directory/update',body),changed);
  await denied(call('alice','me'),'AUTH_FAILED');assert.equal(sha((await owner.query('SELECT * FROM wpay_auth.business_journals ORDER BY id')).rows),journalBefore);assert.equal(sha((await owner.query('SELECT * FROM wpay_auth.commercial_versions WHERE account_id=$1 AND version=1',[ids.alice])).rows),oldBefore);
  await denied(call('admin','panel/directory/update',{...body,requestId:randomUUID()}),'CONFLICT');
 });
 await t.test('suspension invalidates sessions and excludes routing without rewriting financial records',async()=>{
  await f.bank('bob');await f.assign('bob');const before=await f.reserve('before-suspension','100');assert.equal((await owner.query('SELECT user_id FROM wpay_auth.business_reservations WHERE id=$1',[before.id])).rows[0].user_id,ids.bob);
  const body={requestId:randomUUID(),id:ids.bob,action:'suspend',reason:'Synthetic suspension',settings:null,expectedVersion:1};await call('admin','panel/directory/update',body);await denied(call('bob','me'),'AUTH_FAILED');assert.equal((await call('admin','panel/directory',{type:'user',status:'suspended'})).rows.length,1);
  const candidates=await f.tx(c=>f.core.candidates(c,ids.merchant));assert.ok(candidates.every(x=>x.userId!==ids.bob||x.userStatus!=='active'));
  await denied(f.reserve('after-suspension','100'),'NO_ROUTE');
 });
 await t.test('metadata APIs deny customer roles and redact credentials; stale MFA cannot mutate',async()=>{
  for(const route of ['panel/credentials','panel/devices','panel/webhooks','panel/api-logs','panel/settings']){await denied(call('merchant',route));assert.ok(await call('admin',route));}
  const create={merchantId:ids.merchant,label:'Synthetic completion key',scopes:['orders:read']};await denied(call('merchant','panel/credentials/create',create));await denied(call('employee','panel/credentials/create',create));
  const key=await call('admin','panel/credentials/create',create);const metadata=await call('admin','panel/credentials');assert.equal(metadata.rows[0].id,key.id);assert.ok(!JSON.stringify(metadata).includes(key.secret));assert.ok(!JSON.stringify(metadata).includes('digest'));
  await service.gateway.api(key.secret,'orders:read',()=>({synthetic:true}));const logs=await call('admin','panel/api-logs');assert.equal(logs.rows.length,1);assert.equal(logs.rows[0].operation,'orders:read');assert.ok(!JSON.stringify(logs).includes(key.secret));
  await call('admin','panel/credentials/revoke',{id:key.id});await denied(service.gateway.api(key.secret,'orders:read',()=>({})),'FORBIDDEN');await denied(call('merchant','me'),'AUTH_FAILED');
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE account_id=$1",[ids.admin]);await denied(call('admin','panel/directory/update',{requestId:randomUUID(),id:ids.alice,action:'suspend',reason:'Stale authentication',settings:null,expectedVersion:2}),'RECENT_MFA_REQUIRED');
 });
 await t.test('014 upgrade preserves password/MFA/recovery/journals and never broadens ordinary Admin/Employee grants',async()=>{
  assert.match(f.cfg.upgradeDatabase,/^wpay_15_upgrade_[a-z0-9_]+$/);const up=new Pool({...f.cfg.migration,database:f.cfg.upgradeDatabase});try{
   assert.equal((await up.query("SELECT 1 FROM pg_tables WHERE schemaname IN('public','wpay_auth')")).rowCount,0);await migrate(up,{through:14});
   const old=new AuthService(new SecurityRepository(up),{mfaCrypto:crypto});const password=await hashPassword('Synthetic upgrade preservation passphrase!');
   const id=await old.repository.createAccount({name:'Preserved Employee',email:'preserved@completion.example.invalid',accountType:'employee'},password,DEFAULT_GRANTS.employee);
   const factor=crypto.seal(crypto.newSecret(),'wpay-factor:'+id+':1');await up.query('UPDATE wpay_auth.account_security SET enabled=true,factor_version=1,encrypted_secret=$2 WHERE account_id=$1',[id,factor]);await up.query('INSERT INTO wpay_auth.recovery_codes(account_id,code_digest,factor_version) VALUES($1,$2,1)',[id,'a'.repeat(64)]);
   await up.query('INSERT INTO wpay_auth.employee_access_versions(id,employee_id,actor_id,version,permissions,tenant_ids,status) VALUES($1,$2,$2,1,$3,$4,$5)',[randomUUID(),id,DEFAULT_GRANTS.employee,['wpay-auth-development'],'active']);
   await transaction(up,c=>require('../lib/wpay/business/ledger').post(c,{key:'upgrade-preservation',referenceType:'synthetic',referenceId:'upgrade-preservation',actorId:id,entries:require('../lib/wpay/business/ledger').pair(id,'merchant_adjustment','100','INR','credit')}));
   const capture=async()=>({password:sha((await up.query('SELECT password_record FROM wpay_auth.credentials WHERE account_id=$1',[id])).rows),security:sha((await up.query('SELECT * FROM wpay_auth.account_security WHERE account_id=$1',[id])).rows),recovery:sha((await up.query('SELECT * FROM wpay_auth.recovery_codes WHERE account_id=$1',[id])).rows),journals:sha((await up.query('SELECT * FROM wpay_auth.business_journals ORDER BY id')).rows),entries:sha((await up.query('SELECT * FROM wpay_auth.business_entries ORDER BY id')).rows),grants:sha((await up.query('SELECT * FROM wpay_auth.grants WHERE account_id=$1',[id])).rows)});
   const before=await capture();await migrate(up);await validateMigrations(up);assert.deepEqual(await capture(),before);assert.equal((await up.query('SELECT temporary_required FROM wpay_auth.credentials WHERE account_id=$1',[id])).rows[0].temporary_required,true);assert.equal(await migrate(up),'already-applied');
  }finally{await up.end();}
 });
});
