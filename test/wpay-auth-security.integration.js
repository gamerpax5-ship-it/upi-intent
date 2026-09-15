"use strict";
// Real PostgreSQL + real HTTP + maintained TOTP. Explicit invocation only.
// Synthetic records remain for review; the suite never clears a used database.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { createPool, readConfig } = require("../lib/wpay/db/config");
const { migrate, validateMigrations, transaction } = require("../lib/wpay/db/migrations");
const { SecurityRepository } = require("../lib/wpay/db/security-repository");
const { AuthService, DEFAULT_GRANTS } = require("../lib/wpay/auth/runtime/service");
const { MfaCrypto, readKey } = require("../lib/wpay/auth/runtime/mfa");
const { startAuthServer, SESSION_COOKIE, CHALLENGE_COOKIE } = require("../lib/wpay/auth/runtime/http");
const { hashPassword } = require("../lib/wpay/auth/runtime/passwords");
const { digest, token } = require("../lib/wpay/auth/runtime/tokens");

class Client {
  constructor(origin) { this.origin=origin; this.cookies=new Map(); this.csrf=""; }
  async request(route,method="GET",body,headers={}) {
    const response=await fetch(this.origin+"/wpay-auth/"+route,{method,headers:{
      ...(method === "POST" ? {Origin:this.origin,"Content-Type":"application/json","X-WPay-CSRF-Token":this.csrf} : {}),
      Cookie:[...this.cookies].map(([key,value])=>`${key}=${value}`).join("; "),...headers
    },...(body === undefined ? {} : {body:JSON.stringify(body)})});
    for (const cookie of response.headers.getSetCookie()) { const pair=cookie.split(";",1)[0],index=pair.indexOf("="),key=pair.slice(0,index),value=pair.slice(index+1); if (value) this.cookies.set(key,value); else this.cookies.delete(key); }
    return {status:response.status,body:await response.json()};
  }
  async initCsrf() { const r=await this.request("csrf","POST",{}); assert.equal(r.status,200,"CSRF setup"); this.csrf=r.body.csrfToken; }
  async post(route,body={}) { await this.initCsrf(); return this.request(route,"POST",body); }
  copy() { const value=new Client(this.origin); value.cookies=new Map(this.cookies); value.csrf=this.csrf; return value; }
}

test("Task 6 actual PostgreSQL, HTTP and mandatory MFA acceptance",{timeout:360000},async t=>{
  let mfaCrypto,otp;
  try {
    readConfig();
    if (process.env.WPAY_AUTH_DEV_INTEGRATION_CONFIRM !== "allow-new-synthetic-records") throw new Error();
  } catch { assert.fail("BLOCKED: no explicitly confirmed isolated acceptance database. Configure the dedicated connection privately and authorize synthetic records. No database connection attempted."); }
  try { mfaCrypto=new MfaCrypto(readKey()); ({otp}=mfaCrypto.libraries()); }
  catch { assert.fail("BLOCKED: install the scoped, locked MFA dependencies and configure the persistent external test encryption key. No database connection attempted."); }
  const pool=createPool(); let closed=false,server;
  t.after(async()=>{ if (server?.listening) await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}); if (!closed) await pool.end(); });
  // Reject a manually used or populated target BEFORE applying any migration.
  try {
    const publicTables=await pool.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname='public' LIMIT 1");
    assert.equal(publicTables.rowCount,0,"Acceptance needs a separate empty target; public application tables already exist.");
    const exists=await pool.query("SELECT pg_catalog.to_regclass('wpay_auth.accounts') AS relation");
    if (exists.rows[0].relation) assert.equal((await pool.query("SELECT count(*)::integer AS count FROM wpay_auth.accounts")).rows[0].count,0,"Existing accounts must not be modified/deleted for acceptance.");
    await migrate(pool); await validateMigrations(pool);
  } catch (error) { if (error.code === "ERR_ASSERTION") throw error; assert.fail("BLOCKED: isolated database connection or migration validation failed. No fallback target used."); }
  assert.equal(await migrate(pool),"already-applied");
  const repository=new SecurityRepository(pool);
  const options={mfaCrypto,fixedCurrency:"INR"}; // Explicit synthetic acceptance configuration, not a product default.
  let service=new AuthService(repository,options);
  server=await startAuthServer({service,port:0}); const origin=`http://127.0.0.1:${server.address().port}`;
  const run=randomUUID().slice(0,8),password="Task6 synthetic acceptance passphrase!";
  const input=type=>({name:`Synthetic ${type}`,email:`${type}-${run}@example.invalid`,password,accountType:type});
  const userInput=input("user"),merchantInput=input("merchant"),user=new Client(origin),merchant=new Client(origin),admin=new Client(origin);
  let userId,merchantId,adminId,userSecret,merchantSecret,userCodes,adminSecret;
  const userSettings={payinCommission:"1.25",payoutCommission:"0.5",inrPerUsdt:"85.75",depositNetwork:"ETHEREUM-ERC20",depositAddress:"0x"+"1".repeat(40)};
  const merchantSettings={payinFee:"1.2",payoutFee:"0.7",fixedPayoutFee:"0.5",fixedFeeCurrency:"INR"};
  const application=async email=>(await pool.query("SELECT a.*,e.approval_status,e.operations_enabled,e.initial_deposit_satisfied,e.statement_satisfied,e.upi_approved,e.upi_verified FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON a.id=e.account_id WHERE a.email=$1",[email])).rows[0];
  const decision=(id,settings,extra={})=>({requestId:randomUUID(),accountId:id,decision:"approve",settings,reason:"",...extra});
  const login=async(client,email)=>{ const r=await client.post("login",{email,password}); assert.equal(r.status,200,"password phase"); assert.equal(client.cookies.has(SESSION_COOKIE),false,"No application session from password"); return r; };
  const generate=async(secret,epoch)=>otp.generate({secret,digits:6,period:30,algorithm:"sha1",epoch});
  async function freshCode(secret,id) {
    // Use the real database clock, no injected authentication clock or TOTP stub.
    let row=(await pool.query("SELECT last_used_step,CURRENT_TIMESTAMP AS now FROM wpay_auth.account_security WHERE account_id=$1",[id])).rows[0];
    const wait=(Number(row.last_used_step)+1)*30000-Number(row.now)+150;
    if (row.last_used_step !== null && wait > 0) { assert.ok(wait<=31000,"Unexpected future factor step"); await new Promise(resolve=>setTimeout(resolve,wait)); }
    row=(await pool.query("SELECT CURRENT_TIMESTAMP AS now")).rows[0];
    return generate(secret,Math.floor(Number(row.now)/1000));
  }
  async function enroll(client,id) {
    const setup=await client.post("mfa/setup"); assert.equal(setup.status,200); assert.ok(typeof setup.body.setupKey === "string","Local setup key available only in restricted owner flow"); assert.ok(setup.body.qrDataUrl.startsWith("data:image/png;base64,"),"QR is locally rendered");
    assert.equal((await client.request("me")).status,401); assert.equal((await client.request("navigation")).status,401);
    const code=await freshCode(setup.body.setupKey,id),verify=await client.post("mfa/verify",{code}); assert.equal(verify.status,200); assert.equal(verify.body.stage,"save-recovery");
    assert.equal(client.cookies.has(SESSION_COOKIE),false); assert.equal((await client.request("me")).status,401);
    assert.equal((await client.post("mfa/complete",{saved:false})).status,401);
    const complete=await client.post("mfa/complete",{saved:true}); assert.equal(complete.status,200); assert.equal(complete.body.stage,"authenticated");
    assert.equal((await client.request("me")).status,200);
    return {secret:setup.body.setupKey,codes:verify.body.recoveryCodes};
  }
  await t.test("01 User registration persists pending; no application session",async()=>{
    assert.equal((await user.post("register",userInput)).status,201); const value=await application(userInput.email); userId=value.id;
    assert.equal(value.approval_status,"pending"); assert.equal(user.cookies.has(SESSION_COOKIE),false);
    for (const key of ["operations_enabled","initial_deposit_satisfied","statement_satisfied","upi_approved","upi_verified"]) assert.equal(value[key],false);
    const credential=await repository.credential(userInput.email); assert.equal(credential.password_record.algorithm,"scrypt"); assert.equal(JSON.stringify(credential).includes(password),false);
  });
  await t.test("02 Merchant registration persists pending; duplicate registration is atomic",async()=>{
    assert.equal((await merchant.post("register",merchantInput)).status,201); const value=await application(merchantInput.email); merchantId=value.id;
    assert.equal(value.approval_status,"pending"); assert.equal(merchant.cookies.has(SESSION_COOKIE),false);
    const a=new Client(origin),b=new Client(origin); await a.initCsrf(); await b.initCsrf(); const duplicate={...userInput,email:`duplicate-${run}@example.invalid`};
    const results=await Promise.all([a.request("register","POST",duplicate),b.request("register","POST",duplicate)]); assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM wpay_auth.accounts WHERE email=$1",[duplicate.email])).rows[0].count,1);
  });
  await t.test("03 pending credentials cannot enroll/access panels; wrong and unknown are generic",async()=>{
    for (const [client,email] of [[user,userInput.email],[merchant,merchantInput.email]]) {
      assert.equal((await client.post("login",{email,password})).body.error,"APPROVAL_PENDING");
      assert.equal(client.cookies.has(CHALLENGE_COOKIE),false);
      for (const route of ["me","navigation","security","pending-users"]) assert.equal((await client.request(route)).status,401);
      assert.equal((await client.post("mfa/setup")).status,401);
    }
    const wrong=await user.post("login",{email:userInput.email,password:password+"wrong"}); const unknown=await merchant.post("login",{email:`absent-${run}@example.invalid`,password});
    assert.equal(wrong.status,401); assert.deepEqual(wrong.body,unknown.body);
  });
  await t.test("04 bootstrap Admin cannot approve before real MFA and recovery setup",async()=>{
    const body={name:"Synthetic bootstrap",email:`super-${run}@example.invalid`,password};
    const results=await Promise.allSettled([service.bootstrap(body),service.bootstrap(body)]); assert.equal(results.filter(r=>r.status === "fulfilled").length,1);
    adminId=(await application(body.email)).id; assert.equal((await login(admin,body.email)).body.stage,"enroll");
    assert.equal((await admin.post("approval",decision(userId,userSettings))).status,401);
    adminSecret=(await enroll(admin,adminId)).secret;
    const pending=await admin.request("pending-users"); assert.equal(pending.status,200); assert.ok(pending.body.accounts.some(a=>a.id === userId));
    const text=JSON.stringify(pending.body); assert.equal(text.includes("encrypted_secret"),false); assert.equal(text.includes("password_record"),false);
  });
  let approvedRequest;
  await t.test("05 approval atomically persists effective-dated commercial values without funding",async()=>{
    approvedRequest=decision(userId,userSettings); assert.equal((await admin.post("approval",approvedRequest)).status,200);
    const value=await application(userInput.email); assert.equal(value.approval_status,"approved"); assert.equal(value.operations_enabled,false); assert.equal(value.initial_deposit_satisfied,false);
    const versions=await pool.query("SELECT version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=$1",[userId]); assert.equal(versions.rowCount,1); assert.deepEqual(versions.rows[0].settings,userSettings); assert.ok(versions.rows[0].effective_at);
    assert.equal((await admin.post("approval",approvedRequest)).status,200);
    assert.equal((await admin.post("approval",{...approvedRequest,settings:{...userSettings,payinCommission:"2"}})).status,409);
  });
  await t.test("06 invalid approval and missing currency leave status/configuration unchanged",async()=>{
    assert.equal((await admin.post("approval",decision(merchantId,{...merchantSettings,payinFee:"101"}))).status,400);
    const noCurrency=new AuthService(repository,{mfaCrypto}); await assert.rejects(noCurrency.authenticated(admin.cookies.get(SESSION_COOKIE),"approval",0,decision(merchantId,merchantSettings)),{code:"UNAVAILABLE"});
    assert.equal((await application(merchantInput.email)).approval_status,"pending"); assert.equal((await pool.query("SELECT 1 FROM wpay_auth.commercial_versions WHERE account_id=$1",[merchantId])).rowCount,0);
    const rejectId=(await application(`duplicate-${run}@example.invalid`)).id;
    assert.equal((await admin.post("approval",decision(rejectId,null,{decision:"reject",reason:""}))).status,400);
    assert.equal((await admin.post("approval",decision(rejectId,null,{decision:"reject",reason:"Synthetic rejection reason"}))).status,200);
    assert.equal((await pool.query("SELECT 1 FROM wpay_auth.commercial_versions WHERE account_id=$1",[rejectId])).rowCount,0);
    assert.equal((await new Client(origin).post("login",{email:`duplicate-${run}@example.invalid`,password})).status,401);
    const foreign=await repository.createAccount({...userInput,email:`foreign-${run}@example.invalid`},await hashPassword(password),DEFAULT_GRANTS.user);
    await pool.query("UPDATE wpay_auth.accounts SET tenant_id='synthetic-foreign' WHERE id=$1",[foreign]);
    assert.equal((await admin.request("pending-users")).body.accounts.some(a=>a.id === foreign),false);
    assert.equal((await admin.post("approval",decision(foreign,userSettings))).status,403);
  });
  await t.test("07 concurrent decisions accept at most one; retries validate payload",async()=>{
    const a=admin.copy(),b=admin.copy(); await a.initCsrf(); await b.initCsrf(); const body=decision(merchantId,merchantSettings);
    const results=await Promise.all([a.request("approval","POST",body),b.request("approval","POST",{...body,requestId:randomUUID(),settings:{...merchantSettings,payinFee:"2"}})]);
    assert.equal(results.filter(r=>r.status === 200).length,1); assert.ok(results.every(r=>[200,409,503].includes(r.status)));
    assert.equal((await pool.query("SELECT 1 FROM wpay_auth.commercial_versions WHERE account_id=$1",[merchantId])).rowCount,1);
  });
  await t.test("08 approved password challenge cannot read any panel or choose assurance",async()=>{
    assert.equal((await login(user,userInput.email)).body.stage,"enroll");
    for (const route of ["me","navigation","pending-users","security"]) assert.equal((await user.request(route)).status,401);
    assert.equal((await user.post("mfa/complete",{saved:true,approved:true})).status,400);
    assert.equal((await user.post("mfa/complete",{saved:true})).status,401);
  });
  await t.test("09 first setup verifies real TOTP, recovery acknowledgement and encrypted persistence",async()=>{
    const result=await enroll(user,userId); userSecret=result.secret; userCodes=result.codes;
    const row=(await pool.query("SELECT * FROM wpay_auth.account_security WHERE account_id=$1",[userId])).rows[0];
    assert.equal(row.enabled,true); assert.equal(JSON.stringify(row).includes(userSecret),false);
    const stored=await pool.query("SELECT code_digest FROM wpay_auth.recovery_codes WHERE account_id=$1",[userId]); assert.equal(stored.rowCount,10);
    assert.equal(stored.rows.some(r=>userCodes.includes(r.code_digest)),false);
    const session=(await pool.query("SELECT * FROM wpay_auth.sessions WHERE token_digest=$1",[digest(user.cookies.get(SESSION_COOKIE))])).rows[0]; assert.ok(session.mfa_at); assert.equal(session.factor_version,row.factor_version);
    await login(merchant,merchantInput.email); merchantSecret=(await enroll(merchant,merchantId)).secret;
  });
  await t.test("10 wrong, expired and already accepted time steps fail; attempts persist",async()=>{
    const client=new Client(origin); await login(client,userInput.email);
    const now=Math.floor(Date.now()/1000);
    const expired=await generate(userSecret,now-120); assert.equal((await client.post("mfa/verify",{code:expired})).status,401);
    assert.equal((await client.post("mfa/verify",{code:"abcdef"})).status,401);
    const accepted=(await pool.query("SELECT last_used_step FROM wpay_auth.account_security WHERE account_id=$1",[userId])).rows[0].last_used_step;
    assert.equal((await client.post("mfa/verify",{code:await generate(userSecret,accepted*30)})).status,401);
    assert.ok((await pool.query("SELECT attempts FROM wpay_auth.account_security WHERE account_id=$1",[userId])).rows[0].attempts>=4);
    const expiredChallenge=new Client(origin); await login(expiredChallenge,merchantInput.email);
    await pool.query("UPDATE wpay_auth.mfa_challenges SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE token_digest=$1",[digest(expiredChallenge.cookies.get(CHALLENGE_COOKIE))]);
    assert.equal((await expiredChallenge.post("mfa/verify",{code:await generate(merchantSecret,now)})).status,401);
  });
  await t.test("11 concurrent TOTP and recovery reuse produce at most one promotion/replacement",async()=>{
    const a=new Client(origin),b=new Client(origin); await login(a,userInput.email); await login(b,userInput.email); const code=await freshCode(userSecret,userId);
    await a.initCsrf(); await b.initCsrf(); const results=await Promise.all([a.request("mfa/verify","POST",{code}),b.request("mfa/verify","POST",{code})]); assert.equal(results.filter(r=>r.status === 200).length,1);
    const c=new Client(origin),d=new Client(origin); await login(c,userInput.email); await login(d,userInput.email); await c.initCsrf(); await d.initCsrf();
    const recovered=await Promise.all([c.request("mfa/recover","POST",{recoveryCode:userCodes[0]}),d.request("mfa/recover","POST",{recoveryCode:userCodes[0]})]); assert.equal(recovered.filter(r=>r.status === 200).length,1);
    const winner=recovered[0].status === 200 ? c : d; assert.equal((await winner.request("me")).status,401); assert.equal((await user.request("me")).status,401);
    const enrolled=await enroll(winner,userId); userSecret=enrolled.secret; userCodes=enrolled.codes; user.cookies=new Map(winner.cookies);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM wpay_auth.recovery_codes WHERE account_id=$1 AND consumed_at IS NULL",[userId])).rows[0].count,10);
  });
  await t.test("12 full session still rechecks current approval and account state",async()=>{
    assert.equal((await user.request("me")).status,200);
    await pool.query("UPDATE wpay_auth.eligibility SET approval_status='rejected' WHERE account_id=$1",[userId]); assert.equal((await user.request("me")).status,401);
    await pool.query("UPDATE wpay_auth.eligibility SET approval_status='approved' WHERE account_id=$1",[userId]);
    await pool.query("UPDATE wpay_auth.accounts SET status='suspended' WHERE id=$1",[merchantId]); assert.equal((await merchant.request("navigation")).status,401);
    assert.equal((await merchant.post("login",{email:merchantInput.email,password})).status,401);
    await pool.query("UPDATE wpay_auth.accounts SET status='active' WHERE id=$1",[merchantId]);
  });
  await t.test("13 approved/unfunded onboarding grants no financial or API capability",async()=>{
    const me=await user.request("me"); assert.equal(me.status,200); assert.equal(me.body.operationsEnabled,false);
    const nav=await user.request("navigation"); const ids=nav.body.groups.flatMap(g=>g.children).map(p=>p.permissionId); assert.ok(ids.includes("profile.view")); assert.ok(ids.includes("account_security.view"));
    assert.equal(ids.some(id=>/withdraw|payout|deposit|api_credentials/.test(id)),false);
    assert.equal((await user.request("financial")).status,404);
  });
  await t.test("14 logout revokes copied cookies; logout-all revokes sessions and outstanding challenges",async()=>{
    const copied=merchant.copy(); assert.equal((await merchant.post("logout")).status,200); assert.equal((await copied.request("me")).status,401);
    const pending=new Client(origin); await login(pending,merchantInput.email);
    // Use the still-authenticated User; its replay tests already exercised multiple sessions.
    const userCopy=user.copy(); assert.equal((await user.post("logout-all")).status,200); assert.equal((await userCopy.request("me")).status,401);
    assert.equal((await repository.credential(userInput.email)).status,"active");
    await login(merchant,merchantInput.email); const code=await freshCode(merchantSecret,merchantId); assert.equal((await merchant.post("mfa/verify",{code})).status,200);
    assert.equal((await merchant.post("logout-all")).status,200); assert.equal((await pending.post("mfa/verify",{code})).status,401);
  });
  await t.test("15 pre-MFA sessions, idle/absolute expiry and mixed grant versions deny access",async()=>{
    const saved=token(); await pool.query("INSERT INTO wpay_auth.sessions(token_digest,account_id,permission_version,session_epoch,created_at,last_seen_at,expires_at) SELECT $1,id,permission_version,session_epoch,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '12 hours' FROM wpay_auth.accounts WHERE id=$2",[digest(saved),userId]);
    const client=new Client(origin); client.cookies.set(SESSION_COOKIE,saved); assert.equal((await client.request("me")).status,401);
    const duplicate=admin.copy();
    await pool.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '10 minutes',expires_at=CURRENT_TIMESTAMP+interval '11 hours 50 minutes',mfa_at=CURRENT_TIMESTAMP-interval '6 minutes' WHERE token_digest=$1",[digest(duplicate.cookies.get(SESSION_COOKIE))]);
    assert.equal((await duplicate.post("approval",approvedRequest)).status,403); // Recent MFA required even for a retry.
    await pool.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '32 minutes',expires_at=CURRENT_TIMESTAMP+interval '11 hours 28 minutes',last_seen_at=CURRENT_TIMESTAMP-interval '31 minutes' WHERE token_digest=$1",[digest(duplicate.cookies.get(SESSION_COOKIE))]); assert.equal((await duplicate.request("me")).status,401);
    // Expiry manipulation is confined to synthetic account sessions in this new acceptance target.
    await pool.query("UPDATE wpay_auth.sessions SET created_at=CURRENT_TIMESTAMP-interval '12 hours 1 second',last_seen_at=CURRENT_TIMESTAMP,expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE token_digest=$1",[digest(duplicate.cookies.get(SESSION_COOKIE))]); assert.equal((await duplicate.request("me")).status,401);
  });
  await t.test("16 real factor/session survive server and connection pool restart with the same key",async()=>{
    await login(merchant,merchantInput.email); assert.equal((await merchant.post("mfa/verify",{code:await freshCode(merchantSecret,merchantId)})).status,200);
    const port=server.address().port; await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    const restartedPool=createPool(); const restarted=new AuthService(new SecurityRepository(restartedPool),{...options,mfaCrypto:new MfaCrypto(readKey())});
    await validateMigrations(restartedPool); server=await startAuthServer({service:restarted,port}); assert.equal((await merchant.request("me")).status,200);
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}); await restartedPool.end(); server=await startAuthServer({service,port});
  });
  await t.test("17 missing/wrong external keys fail closed for valid sessions",async()=>{
    for (const crypto of [undefined,new MfaCrypto(randomBytes(32))]) {
      const unavailable=new AuthService(repository,{mfaCrypto:crypto}); await assert.rejects(unavailable.authenticated(merchant.cookies.get(SESSION_COOKIE),"me"),{code:"UNAVAILABLE"});
    }
  });
  await t.test("18 ownership, admin tenant scope, public role injection and registration rollback remain enforced",async()=>{
    for (const route of ["me?accountId="+userId,"security?accountId="+adminId]) assert.equal((await merchant.request(route)).status,400);
    assert.equal((await merchant.request("pending-users")).status,403); assert.equal((await merchant.request("pending-merchants")).status,403);
    const me=await merchant.request("me"); assert.equal(me.body.id,merchantId);
    for (const key of ["grants","password_record","token_digest","encrypted_secret","security_version"]) assert.equal(Object.hasOwn(me.body,key),false);
    const publicClient=new Client(origin);
    for (const extra of [{approved:true},{actorId:adminId},{tenantId:"foreign"},{grants:["users.view"]},{funded:true},{accountType:"admin"},{accountType:"super_admin"},{accountType:"employee"}]) assert.equal((await publicClient.post("register",{...userInput,email:`forged-${run}@example.invalid`,...extra})).status,400);
    const failedEmail=`rollback-${run}@example.invalid`; await assert.rejects(repository.createAccount({...userInput,email:failedEmail},{algorithm:"invalid"},DEFAULT_GRANTS.user)); assert.equal(await application(failedEmail),undefined);
  });
  await t.test("19 Admin and Employee provisioned internally must complete real MFA; self-service adds no administration",async()=>{
    const record=await hashPassword(password);
    for (const type of ["admin","employee"]) {
      const body=input(type),id=await repository.createAccount(body,record,DEFAULT_GRANTS[type]),client=new Client(origin);
      await login(client,body.email); assert.equal((await client.request("security")).status,401); const result=await enroll(client,id);
      assert.equal((await client.request("pending-users")).status,403); assert.equal((await client.request("security")).status,200);
      assert.equal((await client.post("security/regenerate",{password:password+"wrong",code:"000000"})).status,401);
      const preRegeneration=client.copy();
      const regeneration=await client.post("security/regenerate",{password,code:await freshCode(result.secret,id)}); assert.equal(regeneration.status,200); assert.equal(regeneration.body.stage,"recovery-codes");
      assert.equal((await preRegeneration.request("me")).status,401);
      assert.equal((await client.request("me")).status,200);
      if (type === "admin") {
        const restricted=new Client(origin); await login(restricted,body.email);
        for (let attempt=0;attempt<6;attempt++) assert.equal((await restricted.post("mfa/verify",{code:"invalid"})).status,401);
        const attempts=(await pool.query("SELECT attempts FROM wpay_auth.mfa_challenges WHERE token_digest=$1",[digest(restricted.cookies.get(CHALLENGE_COOKIE))])).rows[0].attempts; assert.equal(attempts,5);
        const second=new Client(origin); await login(second,body.email);
        let limited=false; for (let attempt=0;attempt<4;attempt++) { const response=await second.post("mfa/verify",{code:"invalid"}); assert.ok([401,429].includes(response.status)); limited ||= response.status === 429; }
        assert.equal(limited,true); assert.equal((await new SecurityRepository(pool).credential(body.email)).security_attempts,10);
      }
      if (type === "employee") {
        const old=client.copy();
        const replace=await client.post("security/replace",{password,code:await freshCode(result.secret,id)}); assert.equal(replace.status,200); assert.equal(replace.body.stage,"enroll");
        assert.equal((await old.request("me")).status,401); assert.equal((await client.request("me")).status,401);
        assert.equal((await pool.query("SELECT 1 FROM wpay_auth.recovery_codes WHERE account_id=$1 AND consumed_at IS NULL",[id])).rowCount,0);
        await enroll(client,id); assert.equal((await client.request("security")).status,200);
      }
    }
  });
  await t.test("20 Merchant locales persist across new repositories and dictionary assets serve UTF-8",async()=>{
    const asset=await fetch(origin+"/wpay-auth/locales.js"); assert.equal(asset.status,200); const text=await asset.text(); assert.ok(text.includes("Русский") || text.includes("Войти")); assert.ok(/[\u4e00-\u9fff]/.test(text));
    for (const locale of ["en","ru","zh-CN"]) {
      assert.equal((await merchant.post("locale",{locale})).status,200);
      const current=new AuthService(new SecurityRepository(pool),options); assert.equal((await current.authenticated(merchant.cookies.get(SESSION_COOKIE),"me")).locale,locale);
    }
    assert.equal((await merchant.post("locale",{locale:"zh-TW"})).status,400);
    assert.equal((await merchant.post("locale",{locale:"en",accountId:userId})).status,400);
  });
  await t.test("21 locale changes preserve grants, navigation, stable machine values and commercial amounts",async()=>{
    const before=await merchant.request("navigation"); const money=(await pool.query("SELECT settings FROM wpay_auth.commercial_versions WHERE account_id=$1",[merchantId])).rows;
    const grants=(await pool.query("SELECT permissions,permission_version FROM wpay_auth.grants WHERE account_id=$1",[merchantId])).rows;
    for (const locale of ["ru","en","zh-CN"]) { assert.equal((await merchant.post("locale",{locale})).status,200); assert.deepEqual((await merchant.request("navigation")).body,before.body); }
    assert.deepEqual((await pool.query("SELECT settings FROM wpay_auth.commercial_versions WHERE account_id=$1",[merchantId])).rows,money);
    assert.deepEqual((await pool.query("SELECT permissions,permission_version FROM wpay_auth.grants WHERE account_id=$1",[merchantId])).rows,grants);
  });
  await t.test("CSRF, exact origins, version drift, persistent throttles and database outage preserve Task 5 security",async()=>{
    const client=new Client(origin); assert.equal((await client.request("login","POST",{email:userInput.email,password})).status,403);
    for (const origin of ["null","https://foreign.invalid","http://127.0.0.1:1"]) assert.equal((await client.request("csrf","POST",{},{Origin:origin})).status,403);
    const writer=await pool.connect();
    try {
      await writer.query("BEGIN"); await writer.query("UPDATE wpay_auth.accounts SET permission_version=permission_version+1 WHERE id=$1",[merchantId]);
      await writer.query("UPDATE wpay_auth.grants SET permission_version=permission_version+1 WHERE account_id=$1",[merchantId]);
      const racing=merchant.request("navigation"); await writer.query("COMMIT"); assert.ok([401,503].includes((await racing).status));
    } finally { await writer.query("ROLLBACK").catch(()=>{}); writer.release(); }
    assert.equal((await merchant.request("navigation")).status,401);
    await assert.rejects(transaction(pool,async db=>{
      await db.query("CREATE TABLE wpay_auth.integration_drift_probe(id integer)");
      await validateMigrations({connect:async()=>({query:async(sql,args)=>["BEGIN","COMMIT","ROLLBACK"].includes(sql) ? {rows:[]} : db.query(sql,args),release(){}})});
    }),/WPAY_SCHEMA_INCOMPATIBLE/);
    for (let i=0;i<40;i++) await repository.throttle("login","127.0.0.1").catch(error=>assert.equal(error.code,"RATE_LIMITED"));
    await assert.rejects(new SecurityRepository(pool).throttle("login","127.0.0.1"),{code:"RATE_LIMITED"});
    await pool.end(); closed=true; assert.equal((await merchant.request("me")).status,503); assert.equal((await client.request("csrf","POST",{})).status,503);
  });
});
