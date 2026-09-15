"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { startAuthServer, cookie, readCookies } = require("../lib/wpay/auth/runtime/http");
const { transport } = require("../lib/wpay/auth/runtime/transport");
const { token } = require("../lib/wpay/auth/runtime/tokens");
const { AuthError } = require("../lib/wpay/auth/runtime/errors");
const origin = "https://wpay.example.invalid";
test("hosted configuration requires an exact canonical HTTPS origin", () => {
  for (const value of [null,"", "http://wpay.example.invalid",origin+"/",origin+"?x=1",origin+":8443",
    "https://user:pass@wpay.example.invalid","https://healthcheck.railway.app","https://localhost"]) assert.throws(()=>transport(value));
  assert.equal(transport(origin).bind,"0.0.0.0");
  assert.equal(transport().bind,"127.0.0.1");
});
test("hosted cookies are host-bound, Secure, HttpOnly and distinct from development/legacy",()=>{
  const policy=transport(origin),value=token();
  assert.match(cookie(policy.session,value,10,policy),/^__Host-wpay_session=.*; Path=\/; HttpOnly; SameSite=Strict; Max-Age=10; Secure$/);
  assert.deepEqual(readCookies(`wpay_auth_dev_session=${value}; wpay_dashboard_session=${value}`,policy),{});
  assert.throws(()=>readCookies(`${policy.session}=${value}; ${policy.session}=${value}`,policy));
  assert.equal(readCookies(`${policy.session}=${value}`,policy)[policy.session],value);
});
test("hosted HTTP boundary: readiness exception, CSRF, proxy spoofing and safe failures",async t=>{
  const policy=transport(origin),csrf=token(),proof=token(),session=token();
  let ready=true,csrfChecks=0,loginCalls=0,observedIp;
  const service={
    csrf:async ip=>{observedIp=ip;return {cookie:csrf,challenge:proof};},
    checkCsrf:async(c,h)=>{csrfChecks++;if(c!==csrf||h!==proof)throw new AuthError("CSRF_FAILED");},
    login:async()=>{loginCalls++;return {stage:"authenticated",sessionToken:session};},
    authenticated:async()=>({ok:true})
  };
  await assert.rejects(startAuthServer({service,port:0,hostedOrigin:origin}));
  const server=await startAuthServer({service,port:0,hostedOrigin:origin,readiness:async()=>ready});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const request=(url,method="GET",headers={},body)=>new Promise((resolve,reject)=>{
    const req=http.request({host:"127.0.0.1",port:server.address().port,path:url,method,
      headers:{Host:policy.host,...headers}},res=>{const chunks=[];res.on("data",chunk=>chunks.push(chunk));res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});
    req.on("error",reject);req.end(body);
  });
  assert.equal((await request("/readyz","GET",{Host:"healthcheck.railway.app"})).status,200);
  assert.equal((await request("/wpay-auth/me","GET",{Host:"healthcheck.railway.app"})).status,403);
  assert.equal((await request("/readyz?debug=true","GET",{Host:"healthcheck.railway.app"})).status,403);
  assert.equal((await request("/readyz","POST",{Host:"healthcheck.railway.app"})).status,403);
  assert.equal((await request("/readyz","GET",{Host:"foreign.invalid"})).status,403);
  ready=false;const down=await request("/readyz");assert.equal(down.status,503);assert.deepEqual(JSON.parse(down.body),{ready:false});
  const root=await request("/");assert.equal(root.status,303);assert.equal(root.headers.location,"/wpay-auth/");
  const page=await request("/wpay-auth/");assert.match(page.body,/<title>WPay<\/title>/);assert.match(page.body,/data-i18n="hosted"/);
  assert.equal((await request("/api/device/otp")).status,404);
  assert.equal((await request("/wpay-auth/bootstrap")).status,404);
  for(const headers of [{Origin:"https://foreign.invalid"},{Origin:"http://wpay.example.invalid"},{},
    {Host:"foreign.invalid",Origin:origin,"X-Forwarded-Host":policy.host}]){
    assert.equal((await request("/wpay-auth/login","POST",{"Content-Type":"application/json",...headers},"{}")).status,403);
  }
  assert.equal(loginCalls,0);
  const headers={Origin:origin,"Content-Type":"application/json","X-Forwarded-For":"198.51.100.1","X-Forwarded-Proto":"http",Forwarded:"for=198.51.100.2;host=foreign.invalid;proto=http"};
  const challenge=await request("/wpay-auth/csrf","POST",headers,"{}");
  assert.equal(challenge.status,200);assert.ok(["127.0.0.1","::ffff:127.0.0.1"].includes(observedIp));
  assert.match(challenge.headers["set-cookie"][0],/; Secure$/);
  assert.equal((await request("/wpay-auth/login","POST",headers,"{}")).status,403);
  const result=await request("/wpay-auth/login","POST",{...headers,Cookie:`${policy.csrf}=${csrf}`,"X-WPay-CSRF-Token":proof},"{}");
  assert.equal(result.status,200);assert.equal(loginCalls,1);assert.equal(csrfChecks,2);
  assert.equal(result.body.includes(session),false);
  for(const c of result.headers["set-cookie"]){assert.match(c,/^__Host-wpay_/);assert.match(c,/; Secure$/);assert.doesNotMatch(c,/Domain=/);}
  assert.equal(result.headers["cache-control"],"no-store");assert.ok(result.headers["strict-transport-security"]);
  const logout=await request("/wpay-auth/logout","POST",{...headers,Cookie:`${policy.csrf}=${csrf}`,"X-WPay-CSRF-Token":proof},"{}");
  for(const c of logout.headers["set-cookie"]){assert.match(c,/Max-Age=0; Secure$/);}
});
