"use strict";
// Independent unit/transport checks. These are not PostgreSQL/TOTP acceptance.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { MfaCrypto, readKey, recoveryCodes, recoveryDigest, approvalAllows, fullAssurance } = require("../lib/wpay/auth/runtime/mfa");
const { decimal, address, commercial, approvalRequest } = require("../lib/wpay/auth/runtime/commercial");
const { AuthService, DEFAULT_GRANTS, resolveContext, policy } = require("../lib/wpay/auth/runtime/service");
const { AuthRepository } = require("../lib/wpay/db/auth-repository");
const { hashPassword } = require("../lib/wpay/auth/runtime/passwords");
const { authorize } = require("../lib/wpay/authorization-policy");
const { NAVIGATION_DEFINITION, deriveNavigation } = require("../lib/wpay/navigation");
const { ABSOLUTE_MS, token } = require("../lib/wpay/auth/runtime/tokens");
const { startAuthServer, SESSION_COOKIE, CHALLENGE_COOKIE, CSRF_COOKIE } = require("../lib/wpay/auth/runtime/http");
const L = require("../dev/wpay-auth/web/locales");
function row(type="user") {
  const now = new Date();
  return { id:"principal-a",subject_id:"subject-a",tenant_id:"tenant-a",account_type:type,status:"active",
    user_id:type === "user" ? "user-a" : null,merchant_id:type === "merchant" ? "merchant-a" : null,
    current_permission_version:1,grant_version:1,session_permission_version:1,permissions:[...DEFAULT_GRANTS[type]],
    admin_scope:type === "super_admin" ? { tenantIds:["tenant-a"] } : null,
    session_epoch:0,current_session_epoch:0,created_at:now,last_seen_at:now,expires_at:new Date(+now+ABSOLUTE_MS),revoked_at:null,database_now:now,
    mfa_at:now,mfa_enabled:true,security_version:1,factor_version:1,session_security_version:1,session_factor_version:1,
    approval_status:"approved",initial_deposit_satisfied:false,statement_satisfied:false,upi_approved:false,upi_verified:false,operations_enabled:false,approved_bank_account_available:false };
}
for (const type of ["user","merchant","admin","super_admin","employee"]) {
  test(`${type}: mandatory MFA and self Security use the actual policy`, () => {
    const state = row(type), context = resolveContext(state);
    const own = policy(context,"account_security.update",{kind:"record",id:"principal-a",tenantId:"tenant-a",ownerType:"principal",ownerId:"principal-a"});
    assert.equal(own.ownerId,"principal-a"); assert.equal(own.tenantId,"tenant-a");
    assert.ok(deriveNavigation(context).flatMap(g=>g.children).some(p=>p.permissionId === "account_security.view"));
    assert.equal(authorize({...context,permissionId:"account_security.update",context:{kind:"record",id:"other",tenantId:"tenant-a",ownerType:"principal",ownerId:"other"}}).allowed,false);
    for (const change of [{mfa_enabled:false},{mfa_at:null},{session_factor_version:0},{session_security_version:0},{factor_version:undefined},{security_version:undefined},{mfa_at:new Date(+state.database_now+1000)}]) assert.throws(()=>resolveContext({...state,...change}),{code:"AUTH_FAILED"});
    if (type !== "super_admin") assert.throws(()=>policy(context,"users.approve"),{code:"FORBIDDEN"});
  });
}
for (const type of ["user","merchant"]) test(`${type}: pending/rejected/suspended state cannot pass current-request authorization`,()=>{
  for (const approval_status of ["pending","rejected",null,undefined]) assert.throws(()=>resolveContext({...row(type),approval_status}),{code:"AUTH_FAILED"});
  for (const status of ["suspended","disabled"]) assert.throws(()=>resolveContext({...row(type),status}),{code:"AUTH_FAILED"});
});
test("malformed roles and missing assurance versions fail closed",()=>{
  for (const account_type of ["owner",undefined,null]) assert.equal(approvalAllows({status:"active",account_type}),false);
  assert.equal(fullAssurance({...row(),security_version:undefined,session_security_version:undefined}),false);
  assert.equal(typeof new AuthRepository({}).createSession,"undefined","The password-only session factory is removed");
});
test("correct pending credentials deny enrollment; wrong/unknown passwords remain generic (unit repository)",async()=>{
  const password="Synthetic pending test password!", record=await hashPassword(password); let account={...row(),approval_status:"pending",password_record:record}, starts=0, failures=0;
  const repository={throttle:async()=>{},credential:async()=>account,failedLogin:async()=>{failures++;}};
  const service=new AuthService(repository); service.mfa.begin=async()=>{starts++; throw new Error("must not enroll");};
  await assert.rejects(service.login({email:"person@example.invalid",password},"127.0.0.1"),{code:"APPROVAL_PENDING"});
  await assert.rejects(service.login({email:"person@example.invalid",password:password+"wrong"},"127.0.0.1"),{code:"AUTH_FAILED"});
  account=null; await assert.rejects(service.login({email:"unknown@example.invalid",password},"127.0.0.1"),{code:"AUTH_FAILED"});
  assert.equal(starts,0); assert.equal(failures,2);
});
test("encryption key is canonical, explicit and never replaced automatically",()=>{
  const key=randomBytes(32); assert.deepEqual(readKey({WPAY_AUTH_DEV_MFA_KEY:key.toString("base64")}),key);
  for (const value of [undefined,"",randomBytes(31).toString("base64"),key.toString("hex"),key.toString("base64")+" "]) assert.throws(()=>readKey({WPAY_AUTH_DEV_MFA_KEY:value}),{code:"UNAVAILABLE"});
});
test("authenticated encryption binds principal/factor, uses fresh IVs and survives new process objects",()=>{
  const key=randomBytes(32), first=new MfaCrypto(key), secret="synthetic-secret-for-encryption-test", binding="principal-a:factor-1";
  const a=first.seal(secret,binding),b=first.seal(secret,binding);
  assert.notEqual(a.iv,b.iv); assert.notEqual(a.data,b.data); assert.equal(JSON.stringify(a).includes(secret),false);
  assert.equal(new MfaCrypto(key).open(a,binding),secret);
  for (const [crypto,record,aad] of [[new MfaCrypto(randomBytes(32)),a,binding],[first,a,"principal-b:factor-1"],[first,{...a,tag:randomBytes(16).toString("base64")},binding],[first,{...a,data:randomBytes(32).toString("base64")},binding],[first,null,binding]]) assert.throws(()=>crypto.open(record,aad),{code:"UNAVAILABLE"});
});
test("recovery material has 128 bits per random code and only domain-separated digests persist",()=>{
  const values=recoveryCodes(); assert.equal(values.length,10); assert.equal(new Set(values).size,10);
  for (const value of values) { assert.match(value,/^[a-f0-9]{32}$/); assert.match(recoveryDigest(value),/^[a-f0-9]{64}$/); assert.notEqual(recoveryDigest(value),value); }
  for (const value of [null,{},"short","f".repeat(33),"F".repeat(32)]) assert.equal(recoveryDigest(value),null);
});
test("exact decimal commercial values cannot change via locale, exponent or floating rounding",()=>{
  assert.equal(decimal("0.000001",{positive:true}),"0.000001"); assert.equal(decimal("100.000000",{percentage:true}),"100"); assert.equal(decimal("1.230000"),"1.23");
  for (const value of [1,"1,23","1e2","+1","-1","01","Infinity","NaN","١","1.0000001","1000000000"," 1"]) assert.throws(()=>decimal(value),{code:"INVALID_INPUT"});
  assert.throws(()=>decimal("100.000001",{percentage:true})); assert.throws(()=>decimal("0.000000",{positive:true}));
});
const settings={payinCommission:"1.2",payoutCommission:"0",inrPerUsdt:"85.25",depositNetwork:"ETHEREUM-ERC20",depositAddress:"0x"+"1".repeat(40)};
test("approval settings require compatible networks, addresses and all mandatory fields",()=>{
  assert.deepEqual(commercial("user",settings),settings);
  for (const change of [{depositNetwork:"SOLANA"},{depositAddress:"0x"+"0".repeat(40)},{depositAddress:"0x"+"A".repeat(40)},{inrPerUsdt:"0"},{payinCommission:"101"},{payoutCommission:undefined},{approved:true}]) assert.throws(()=>commercial("user",{...settings,...change}));
  // Public format vectors; no real transfer or address ownership is implied.
  assert.equal(address("TRON-TRC20","TJRabPrwbZy45sbavfcjinPJC18kjpRTv8"),"TJRabPrwbZy45sbavfcjinPJC18kjpRTv8");
  assert.throws(()=>address("TRON-TRC20","TJRabPrwbZy45sbavfcjinPJC18kjpRTv9"));
  assert.throws(()=>address("ETHEREUM-ERC20","TJRabPrwbZy45sbavfcjinPJC18kjpRTv8"));
});
test("Merchant fixed fee currency requires explicit server configuration and payload agreement",()=>{
  const input={payinFee:"1",payoutFee:"2",fixedPayoutFee:"0.5",fixedFeeCurrency:"INR"};
  assert.deepEqual(commercial("merchant",input,"INR"),input);
  assert.throws(()=>commercial("merchant",input),{code:"UNAVAILABLE"});
  assert.throws(()=>commercial("merchant",input,"USDT"),{code:"INVALID_INPUT"});
});
test("approval API rejects client authority and requires a reason for rejection",()=>{
  const input={requestId:randomUUID(),accountId:randomUUID(),decision:"approve",settings,reason:""};
  assert.equal(approvalRequest(input),input);
  for (const extra of [{actorId:randomUUID()},{approved:true},{tenantId:"other"},{mfaAt:Date.now()},{grants:[]},{operationsEnabled:true},{requestId:"invalid"},{decision:"reject"},{reason:"injected\nreason"}]) assert.throws(()=>approvalRequest({...input,...extra}));
  assert.equal(approvalRequest({...input,decision:"reject",settings:null,reason:"Incomplete application"}).decision,"reject");
});
test("locale dictionaries have exact key parity, UTF-8 wording and all Merchant navigation keys",()=>{
  const keys=Object.keys(L.dictionaries.en).sort();
  for (const locale of L.supported) {
    assert.deepEqual(Object.keys(L.dictionaries[locale]).sort(),keys);
    for (const key of keys) assert.ok(typeof L.dictionaries[locale][key] === "string" && L.dictionaries[locale][key].trim());
    for (const group of NAVIGATION_DEFINITION.filter(g=>g.principalTypes.includes("merchant"))) {
      assert.ok(Object.hasOwn(L.dictionaries[locale],"group."+group.id.split(".").at(-1)),group.id);
      for (const page of group.children) assert.ok(Object.hasOwn(L.dictionaries[locale],"nav."+page.permissionId),page.permissionId);
    }
  }
  assert.match(L.translate("ru","login"),/[А-Яа-я]/); assert.match(L.translate("zh-CN","login"),/[\u4e00-\u9fff]/);
});
test("locale precedence is explicit, saved, supported browser, then English; authority stays separate",()=>{
  assert.equal(L.choose("ru","zh-CN","en"),"ru"); assert.equal(L.choose(null,"ru","zh-CN"),"ru");
  assert.equal(L.choose(null,null,"zh-Hans-CN"),"zh-CN"); assert.equal(L.choose("admin",null,"ru-RU"),"ru"); assert.equal(L.choose(null,null,"zh-TW"),"en");
  const context=resolveContext(row("merchant")), before=JSON.stringify(deriveNavigation(context));
  for (const locale of L.supported) { for (const p of deriveNavigation(context).flatMap(g=>g.children)) L.translate(locale,"nav."+p.permissionId); assert.equal(JSON.stringify(deriveNavigation(context)),before); assert.deepEqual(commercial("user",settings),settings); }
});
test("CSRF binding changes on session or restricted challenge rotation",()=>{
  const service=new AuthService({}), session=token(),challenge=token();
  assert.notEqual(service.csrfBinding(session,challenge),service.csrfBinding(session,token()));
  assert.notEqual(service.csrfBinding(session,challenge),service.csrfBinding(token(),challenge));
  assert.notEqual(service.csrfBinding(undefined,undefined),service.csrfBinding(undefined,challenge));
});
test("transport-only restricted login sets HttpOnly challenge, clears application session, and strips tokens",async t=>{
  const challengeToken=token(),csrfCookie=token(),csrf=token();
  const service={csrf:async()=>({cookie:csrfCookie,challenge:csrf}),checkCsrf:async()=>{},login:async()=>({challengeToken,stage:"enroll"})};
  const server=await startAuthServer({service,port:0}); t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+"/wpay-auth/login",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",Cookie:`${CSRF_COOKIE}=${csrfCookie}`,"X-WPay-CSRF-Token":csrf},body:"{}"});
  assert.deepEqual(await response.json(),{stage:"enroll"}); const cookies=response.headers.getSetCookie();
  assert.ok(cookies.some(c=>c.startsWith(CHALLENGE_COOKIE+"=") && c.includes("HttpOnly; SameSite=Strict; Max-Age=300")));
  assert.ok(cookies.some(c=>c.startsWith(SESSION_COOKIE+"=;") && c.endsWith("Max-Age=0")));
});
