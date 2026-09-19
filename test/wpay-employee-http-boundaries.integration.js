"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const {fixture}=require('./helpers/wpay-9a-fixture');
const {startAuthServer,SESSION_COOKIE}=require('../lib/wpay/auth/runtime/http');
const deniedBody={error:'FORBIDDEN',message:'Access denied.'};

test('restricted Employee: actual HTTP denials preserve security and business records',async t=>{
 const {owner,service,call,crypto}=await fixture(t);
 const permissions=['profile.view','account_security.view','account_security.update','notifications.view','notifications.update'];
 const employee=await call('admin','operations/employee/create',{name:'Synthetic HTTP Boundary Employee',email:'boundary@employee.example.invalid',permissions,tenantIds:['wpay-auth-development']});
 const server=await startAuthServer({service,port:0}),origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const cookies=new Map();let csrf='';
 async function request(route,method='GET',body,overrides={}){
  const r=await fetch(origin+'/wpay-auth/roles/'+route,{method,headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-WPay-CSRF-Token':csrf}:{}),...overrides},...(body===undefined?{}:{body:JSON.stringify(body)})});
  for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('='),key=pair.slice(0,index),value=pair.slice(index+1);if(value)cookies.set(key,value);else cookies.delete(key);}
  return {status:r.status,body:await r.json()};
 }
 async function post(route,body={}){csrf=(await request('employee/csrf','POST',{})).body.csrfToken;return request(route,'POST',body);}
 async function state(){
  const digests={};
  // Authentication activity/audit counters may advance; authority and financial
  // records must not. Values (including encrypted security state) never leave
  // this disposable test; assertions report only one-way digests.
  for(const table of ['accounts','credentials','grants','account_security','recovery_codes','preferences','support_tickets','support_events','employee_access_versions','commercial_versions','resource_links','paired_devices','gateway_keys','business_journals','business_entries','business_holds']){
   const result=await owner.query(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) AS rows FROM wpay_auth.${table} r`);
   digests[table]=createHash('sha256').update(JSON.stringify(result.rows[0].rows)).digest('hex');
  }
  return digests;
 }
 await t.test('full supported reset, authenticator verification and recovery acknowledgment precede access',async()=>{
  assert.equal((await post('employee/login',{email:employee.email,password:employee.oneTimePassword})).body.stage,'password-reset');
  assert.equal((await request('employee/me')).status,401);assert.equal(cookies.has(SESSION_COOKIE),false);
  assert.equal((await post('employee/password/reset',{password:'Synthetic boundary Employee chosen passphrase!'})).body.stage,'enroll');
  const setup=(await post('employee/mfa/setup')).body,code=await crypto.libraries().otp.generate({secret:setup.setupKey});
  assert.equal((await post('employee/mfa/verify',{code})).body.stage,'save-recovery');
  assert.equal((await request('employee/navigation')).status,401);
  assert.equal((await post('employee/mfa/complete',{saved:true})).body.stage,'authenticated');
  assert.equal((await request('employee/me')).body.id,employee.id);
  const navigation=(await request('employee/navigation')).body.groups.flatMap(g=>g.children.map(p=>p.permissionId));
  assert.deepEqual([...new Set(navigation)].sort(),['account_security.view','notifications.view','profile.view']);
 });
 await t.test('authenticated forbidden JSON reads return FORBIDDEN and no sensitive payload',async()=>{
  const before=await state();
  for(const route of ['operations/admins','operations/employees','operations/devices','operations/transactions','operations/statements','panel/credentials','panel/api-logs','panel/devices','panel/settings','panel/reports','business/summary','business/banks']){
   const result=await request('employee/'+route);assert.equal(result.status,403,route);assert.deepEqual(result.body,deniedBody,route);
  }
  for(const reveal of [false,true]){const result=await post('employee/operations/otp',{reveal});assert.equal(result.status,403);assert.deepEqual(result.body,deniedBody);}
  assert.deepEqual(await state(),before);
 });
 await t.test('forbidden mutations, missing CSRF and foreign origin have no side effects',async()=>{
  const before=await state();
  for(const [route,body]of [
   ['operations/admin/create',{requestId:randomUUID(),name:'Must not exist',email:'denied@admin.example.invalid',permissions,tenantIds:['wpay-auth-development']}],
   ['operations/employee/create',{name:'Must not exist',email:'denied@employee.example.invalid',permissions,tenantIds:['wpay-auth-development']}],
   ['operations/device/create',{requestId:randomUUID()}],
   ['panel/credentials/revoke',{id:randomUUID()}],
   ['panel/support/create',{requestId:randomUUID(),subject:'Denied',message:'Synthetic denial only'}]
  ]){const result=await post('employee/'+route,body);assert.equal(result.status,403,route);assert.equal(result.body.error,'FORBIDDEN',route);}
  assert.equal((await request('employee/panel/preferences','POST',{securityNotifications:false},{'X-WPay-CSRF-Token':''})).status,403);
  assert.equal((await request('employee/panel/preferences','POST',{securityNotifications:false},{Origin:'https://foreign.example.invalid'})).status,403);
  assert.deepEqual(await state(),before);
 });
 await t.test('wrong-role access and copied session replay after logout cannot regain access',async()=>{
  assert.equal((await request('admin/me')).status,401);assert.equal((await request('merchant/me')).status,401);
  const copy=new Map(cookies);assert.equal((await post('employee/logout')).status,200);
  cookies.clear();for(const [key,value]of copy)cookies.set(key,value);
  assert.equal((await request('employee/me')).status,401);assert.equal((await request('employee/operations/employees')).status,401);
  assert.equal((await post('employee/login',{email:employee.email,password:employee.oneTimePassword})).status,401);
 });
});
