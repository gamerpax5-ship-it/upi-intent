'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/wpay-9a-fixture'),reset=require('../lib/wpay/auth/runtime/password-reset'),{digest}=require('../lib/wpay/auth/runtime/tokens');
const denied=(p,code='FORBIDDEN')=>assert.rejects(p,e=>e.code===code);
test('D8 durable tenant Admin authority, mandatory authentication and revocation',async t=>{
 const f=await fixture(t),{call,service,owner,runtime,ids,crypto}=f,permissions=['profile.view','account_security.view','account_security.update'],tenantIds=['wpay-auth-development'];let account,session;
 const input={requestId:randomUUID(),name:'Synthetic Delegated Admin',email:'delegated@admin.example.invalid',permissions,tenantIds};
 await t.test('only explicit bootstrap/platform authority may provision; defaults unchanged',async()=>{
  for(const role of ['alice','bob','merchant']){await denied(call(role,'operations/admins'));await denied(call(role,'operations/admin/create',input));}
  const list=await call('admin','operations/admins');assert.equal(list.admins.length,0);assert.equal(list.platformGrantEnabled,false);assert.ok(list.permissions.every(p=>!p.id.startsWith('admin_authority.')&&!['api_credentials.create','security.configure'].includes(p.id)));
  await denied(call('admin','operations/admin/create',{...input,tenantIds:['foreign']}));
  await denied(call('admin','operations/admin/create',{...input,permissions:[...permissions,'security.configure']}),'INVALID_INPUT');
  account=await call('admin','operations/admin/create',input);assert.equal(account.passwordResetRequired,true);assert.ok(account.oneTimePassword);
  const again=await call('admin','operations/admin/create',input);assert.equal(again.id,account.id);assert.equal(again.oneTimePassword,undefined);assert.equal(again.credentialShown,false);
  await denied(call('admin','operations/admin/create',{...input,name:'Changed payload'}),'CONFLICT');
  const grants=(await owner.query('SELECT * FROM wpay_auth.grants WHERE account_id=$1',[account.id])).rows[0];assert.deepEqual(grants.permissions,[...permissions].sort());assert.deepEqual(grants.admin_scope,{tenantIds});
 });
 await t.test('temporary Admin credentials cannot bypass reset, MFA or recovery acknowledgement',async()=>{
  const login=await service.login({email:account.email,password:account.oneTimePassword},'127.0.0.1','admin');assert.equal(login.stage,'password-reset');
  await denied(reset.complete(service,login.challengeToken,{password:'Synthetic administrator chosen passphrase!'},'employee'),'AUTH_FAILED');
  const enrollment=await reset.complete(service,login.challengeToken,{password:'Synthetic administrator chosen passphrase!'},'admin');assert.equal(enrollment.stage,'enroll');
  await denied(reset.complete(service,login.challengeToken,{password:'Synthetic administrator chosen passphrase!'},'admin'),'AUTH_FAILED');
  await denied(service.login({email:account.email,password:account.oneTimePassword},'127.0.0.1','admin'),'AUTH_FAILED');
  const setup=await service.mfa.challenge(enrollment.challengeToken,'setup',{},'admin'),code=await crypto.libraries().otp.generate({secret:setup.setupKey});
  const verified=await service.mfa.challenge(enrollment.challengeToken,'verify',{code},'admin');assert.equal(verified.stage,'save-recovery');assert.equal(verified.sessionToken,undefined);
  session=(await service.mfa.challenge(verified.challengeToken,'complete',{saved:true},'admin')).sessionToken;assert.equal((await service.authenticated(session,'me',0,{},'admin')).id,account.id);
 });
 await t.test('ordinary Admin cannot create peers, self-escalate, administer platform policy or see foreign directories',async()=>{
  const before=(await owner.query('SELECT count(*)::int n FROM wpay_auth.accounts')).rows[0].n;
  for(const route of ['operations/admins','operations/admin/create','operations/admin/update','panel/settings','operations/employees'])await denied(service.authenticated(session,route,0,input,'admin'));
  await denied(service.authenticated(session,'panel/directory',0,{type:'user'},'admin'));
  assert.equal((await owner.query('SELECT count(*)::int n FROM wpay_auth.accounts')).rows[0].n,before);
  const nav=await service.authenticated(session,'navigation',0,{},'admin');assert.ok(!nav.groups.flatMap(g=>g.children).some(p=>p.destinationId==='operations.admins'));
 });
 await t.test('scope and recent-MFA checks precede writes; cross-tenant and self targets deny',async()=>{
  const change={requestId:randomUUID(),id:account.id,expectedVersion:1,status:'active',permissions,tenantIds};
  await denied(call('admin','operations/admin/update',{...change,id:ids.admin}));
  await owner.query("UPDATE wpay_auth.grants SET admin_scope=jsonb_set(admin_scope,'{tenantIds}','[\"foreign\"]'::jsonb) WHERE account_id=$1",[account.id]);
  await denied(call('admin','operations/admin/update',change));await owner.query('UPDATE wpay_auth.grants SET admin_scope=$2 WHERE account_id=$1',[account.id,{tenantIds}]);
  await owner.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE token_digest=$1",[digest(f.sessions.admin)]);
  await denied(call('admin','operations/admin/update',change),'RECENT_MFA_REQUIRED');await owner.query('UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP WHERE token_digest=$1',[digest(f.sessions.admin)]);
 });
 await t.test('concurrent authority updates post one version; audit is immutable and old sessions fail',async()=>{
  const change={requestId:randomUUID(),id:account.id,expectedVersion:1,status:'suspended',permissions,tenantIds};
  const results=await Promise.all([call('admin','operations/admin/update',change),call('admin','operations/admin/update',change)]);assert.ok(results.every(x=>x.permissionVersion===2));
  await denied(service.authenticated(session,'me',0,{},'admin'),'AUTH_FAILED');
  await denied(call('admin','operations/admin/update',{...change,requestId:randomUUID(),status:'active'}),'CONFLICT');
  const events=(await owner.query("SELECT details FROM wpay_auth.panel_audit WHERE target_id=$1 AND action='admin_authority_changed' ORDER BY created_at,id",[account.id])).rows;assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.details.after.version),[1,2]);assert.equal(JSON.stringify(events).includes(account.oneTimePassword),false);
  await assert.rejects(runtime.query("UPDATE wpay_auth.panel_audit SET details='{}' WHERE target_id=$1",[account.id]));
  assert.equal((await owner.query('SELECT session_epoch FROM wpay_auth.accounts WHERE id=$1',[account.id])).rows[0].session_epoch>1,true);
 });
});
