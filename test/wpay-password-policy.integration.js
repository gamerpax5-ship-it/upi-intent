'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/wpay-9a-fixture'),{startAuthServer,SESSION_COOKIE}=require('../lib/wpay/auth/runtime/http');
const {hashPassword}=require('../lib/wpay/auth/runtime/passwords'),{DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service');
test('isolated short-password HTTP registration, mandatory MFA, step-up and password change',{timeout:300000},async t=>{
 const f=await fixture(t),{owner,service,crypto}=f,server=await startAuthServer({service,port:0}),origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 function client(role){const cookies=new Map();let csrf='';return {cookies,async request(route,method='GET',body){const r=await fetch(origin+'/wpay-auth/roles/'+role+'/'+route,{method,headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(method==='POST'?{Origin:origin,'Content-Type':'application/json','X-WPay-CSRF-Token':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('='),k=pair.slice(0,i),v=pair.slice(i+1);v?cookies.set(k,v):cookies.delete(k);}return {status:r.status,body:await r.json()};},async post(route,body={}){csrf=(await this.request('csrf','POST',{})).body.csrfToken;return this.request(route,'POST',body);}};}
 async function code(secret,id){let r=(await owner.query('SELECT last_used_step,CURRENT_TIMESTAMP now FROM wpay_auth.account_security WHERE account_id=$1',[id])).rows[0];const wait=(Number(r.last_used_step)+1)*30000-Number(r.now)+150;if(r.last_used_step!==null&&wait>0){assert.ok(wait<=31000);await new Promise(resolve=>setTimeout(resolve,wait));}return crypto.libraries().otp.generate({secret});}
 for(const role of ['user','merchant'])await t.test(role+' eight-character registration requires MFA and supports fresh-password security actions',async()=>{
  const c=client(role),email=role+'@short.example.invalid',password='Ab1!xyza';
  assert.equal((await c.post('register',{name:'Synthetic Short '+role,email,password,accountType:'admin'})).status,403);
  assert.equal((await c.post('register',{name:'Synthetic Short '+role,email,password:'Ab1!xyz',accountType:role})).status,400);
  assert.equal((await c.post('register',{name:'Synthetic Short '+role,email,password,accountType:role})).status,201);
  assert.equal((await c.post('login',{email,password})).status,403);assert.equal(c.cookies.has(SESSION_COOKIE),false);
  const id=(await owner.query('SELECT id FROM wpay_auth.accounts WHERE email=$1',[email])).rows[0].id;
  // Approved synthetic fixture only; this test never targets a hosted database.
  await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=$1",[id]);
  assert.equal((await c.post('login',{email,password:'Ab1!xyzb'})).status,401);
  assert.equal((await c.post('login',{email,password,role:'user'})).status,401);
  assert.equal((await c.post('login',{email,password})).body.stage,'enroll');assert.equal(c.cookies.has(SESSION_COOKIE),false);
  assert.equal((await c.request('me')).status,401);const setup=(await c.post('mfa/setup')).body;
  const verified=await c.post('mfa/verify',{code:await code(setup.setupKey,id)});assert.equal(verified.body.stage,'save-recovery');
  assert.equal((await c.request('me')).status,401);assert.equal((await c.post('mfa/complete',{saved:true})).body.stage,'authenticated');
  const oldSession=c.cookies.get(SESSION_COOKIE),securityBefore=(await owner.query('SELECT encrypted_secret,factor_version FROM wpay_auth.account_security WHERE account_id=$1',[id])).rows[0],recoveryBefore=(await owner.query('SELECT code_digest,consumed_at FROM wpay_auth.recovery_codes WHERE account_id=$1 ORDER BY code_digest',[id])).rows;
  assert.equal((await c.request('me')).body.accountType,role);
  assert.equal((await c.post('security/stepup',{password,code:await code(setup.setupKey,id)})).status,200);
  assert.equal((await c.post('security/password',{password:'Wrong1!x',code:'000000',newPassword:'Cd2!xyza'})).status,401);
  assert.equal((await c.post('security/password',{password,code:'000000',newPassword:'Cd2!xyz'})).status,400);
  assert.equal((await c.post('security/password',{password,code:'000000',newPassword:'Cd2!xyza',accountType:'user'})).status,400);
  const changed=await c.post('security/password',{password,code:await code(setup.setupKey,id),newPassword:'Cd2!xyza'});assert.equal(changed.body.stage,'authenticated');assert.notEqual(c.cookies.get(SESSION_COOKIE),oldSession);
  const stale=client(role);stale.cookies.set(SESSION_COOKIE,oldSession);assert.equal((await stale.request('me')).status,401);
  assert.deepEqual((await owner.query('SELECT encrypted_secret,factor_version FROM wpay_auth.account_security WHERE account_id=$1',[id])).rows[0],securityBefore);
  assert.deepEqual((await owner.query('SELECT code_digest,consumed_at FROM wpay_auth.recovery_codes WHERE account_id=$1 ORDER BY code_digest',[id])).rows,recoveryBefore);
  assert.equal((await owner.query("SELECT count(*)::int n FROM wpay_auth.panel_audit WHERE actor_id=$1 AND action='password_changed'",[id])).rows[0].n,1);
  await c.post('logout');assert.equal((await c.post('login',{email,password})).status,401);assert.equal((await c.post('login',{email,password:'Cd2!xyza'})).body.stage,'challenge');assert.equal((await c.request('me')).status,401);
  assert.equal((await c.post('mfa/verify',{code:await code(setup.setupKey,id)})).body.stage,'authenticated');assert.equal((await c.request('me')).status,200);
  assert.equal((await c.post('security/stepup',{password:'Cd2!xyza',code:await code(setup.setupKey,id)})).status,200);
  assert.equal((await client(role).post('security/password',{password:'Cd2!xyza',code:'000000',newPassword:'Ef3!xyza'})).status,401);
 });
 await t.test('legacy-policy User still verifies normally, and privileged change endpoint is denied',async()=>{
  const password='legacy password without digits',email='legacy@short.example.invalid';await f.service.repository.createAccount({name:'Synthetic Legacy',email,accountType:'user'},await hashPassword(password),DEFAULT_GRANTS.user);await owner.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=(SELECT id FROM wpay_auth.accounts WHERE email=$1)",[email]);
  assert.equal((await client('user').post('login',{email,password})).body.stage,'enroll');
  await assert.rejects(f.call('admin','security/password',{password:'Task 9A synthetic acceptance passphrase!',code:'000000',newPassword:'Ab1!xyza'}),{code:'FORBIDDEN'});
 });
});
