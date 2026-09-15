"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { AuthError, publicError } = require("./errors");
const { exactFields } = require("./validation");
const { validToken } = require("./tokens");
const { transport, DEVELOPMENT } = require("./transport");
const { GET: BUSINESS_GET, POST: BUSINESS_POST } = require("../../business/api");
const { GET: FUNDING_GET, POST: FUNDING_POST } = require("../../funding/api");
const { GET: ONBOARDING_GET, POST: ONBOARDING_POST } = require("../../onboarding/api");
const { GET: GATEWAY_GET, POST: GATEWAY_POST } = require("../../gateway/api");
const { transaction } = require("../../db/migrations");
const PREFIX = "/wpay-auth/";
const SESSION_COOKIE = "wpay_auth_dev_session";
const CSRF_COOKIE = "wpay_auth_dev_csrf";
const CHALLENGE_COOKIE = "wpay_auth_dev_challenge";
const ASSETS = Object.freeze({ [PREFIX]: ["index.html", "text/html"],
  [PREFIX + "styles.css"]: ["styles.css", "text/css"], [PREFIX + "app.js"]: ["app.js", "text/javascript"],
  [PREFIX + "locales.js"]: ["locales.js", "text/javascript"],
  [PREFIX + "funding.js"]: ["funding.js", "text/javascript"],
  [PREFIX + "onboarding.js"]: ["onboarding.js", "text/javascript"],
  [PREFIX + "gateway.js"]: ["gateway.js", "text/javascript"],
  [PREFIX + "customer.js"]: ["customer.js", "text/javascript"],
  [PREFIX + "customer.html"]: ["customer.html", "text/html"],
  [PREFIX + "funding-locales.js"]: ["funding-locales.js", "text/javascript"],
  [PREFIX + "business.js"]: ["business.js", "text/javascript"],
  [PREFIX + "business-locales.js"]: ["business-locales.js", "text/javascript"] });
function cookie(name, value, maxAge, policy = DEVELOPMENT) {
  return `${name}=${value}; Path=${policy.path}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${policy.secure ? "; Secure" : ""}`;
}
function readCookies(header = "", policy = DEVELOPMENT) {
  if (header.length > 8192) throw new AuthError("AUTH_FAILED");
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim(), value = part.slice(index + 1).trim();
    if (![policy.session, policy.csrf, policy.challenge].includes(key)) continue;
    if (Object.hasOwn(result, key) || !validToken(value)) throw new AuthError("AUTH_FAILED");
    result[key] = value;
  }
  return result;
}
async function readBody(req, limit = 4096) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers["content-type"] || "") ||
      req.headers["content-encoding"]) throw new AuthError("INVALID_INPUT");
  if (Number(req.headers["content-length"] || 0) > limit) throw new AuthError("BODY_TOO_LARGE");
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new AuthError("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new AuthError("INVALID_INPUT"); }
}
function send(res, status, value, contentType = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType + "; charset=utf-8");
  res.end(Buffer.isBuffer(value) ? value : JSON.stringify(value));
}
function sendAuthResult(res, result, policy = DEVELOPMENT) {
  const body = { ...result };
  if (body.sessionToken) res.setHeader("Set-Cookie",[cookie(policy.session,body.sessionToken,43200,policy),cookie(policy.challenge,"",0,policy),cookie(policy.csrf,"",0,policy)]);
  else if (body.challengeToken) res.setHeader("Set-Cookie",[cookie(policy.challenge,body.challengeToken,300,policy),cookie(policy.session,"",0,policy),cookie(policy.csrf,"",0,policy)]);
  delete body.sessionToken; delete body.challengeToken;
  send(res,200,body);
}
async function startAuthServer({ service, port = 4174, hostedOrigin, readiness }) {
  if (!service || !Number.isInteger(port) || port < 0 || port > 65535) throw new AuthError("INVALID_INPUT");
  const policy = transport(hostedOrigin);
  if (policy.secure && typeof readiness !== "function") throw new AuthError("UNAVAILABLE");
  const { session: SESSION_COOKIE, csrf: CSRF_COOKIE, challenge: CHALLENGE_COOKIE } = policy;
  const assets = new Map();
  for (const [url, [file, type]] of Object.entries(ASSETS)) {
    let bytes = await fs.readFile(path.join(__dirname, "../../../../dev/wpay-auth/web", file));
    if (policy.secure && file === "index.html") bytes = Buffer.from(bytes.toString("utf8")
      .replace("WPay · Development", "WPay")
      .replace('data-i18n="development">Development — payments not connected', 'data-i18n="hosted">WPay — payments not connected'));
    assets.set(url, [bytes, type]);
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (policy.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try {
      const expectedHost = policy.host || `127.0.0.1:${server.address().port}`;
      const expectedOrigin = policy.origin || `http://${expectedHost}`;
      // Railway's healthcheck Host gets exactly one non-sensitive endpoint.
      // Forwarded headers are never an authority for Host, scheme, Origin or IP.
      if (policy.secure && req.url === "/readyz" && req.method === "GET" &&
          [expectedHost,"healthcheck.railway.app"].includes(req.headers.host) && req.headers.origin === undefined) {
        const ready = await readiness();
        return send(res, ready === true ? 200 : 503, { ready: ready === true });
      }
      if (req.headers.host !== expectedHost || (req.headers.origin !== undefined && req.headers.origin !== expectedOrigin)) throw new AuthError("FORBIDDEN");
      if (!["GET", "POST"].includes(req.method)) throw new AuthError("METHOD_NOT_ALLOWED");
      if (req.url.startsWith('/wpay-api/v1/')) {
        if (req.headers.cookie || req.headers.origin || !/^Bearer wpay_mk_/.test(req.headers.authorization || '')) throw new AuthError('AUTH_FAILED');
        const secret=req.headers.authorization.slice(7),match=/^\/wpay-api\/v1\/orders\/([a-f0-9-]{36})$/.exec(req.url);
        if(req.method==='POST'&&req.url==='/wpay-api/v1/orders'){
          const body=await readBody(req);
          if(typeof req.headers['idempotency-key']!=='string'||body.idempotencyKey!==undefined)throw new AuthError('INVALID_INPUT');
          body.idempotencyKey=req.headers['idempotency-key'];
          return send(res,201,await service.gateway.api(secret,'orders:write',(c,id)=>service.gateway.create(c,id,body,'api',expectedOrigin)));
        }
        if(req.method==='GET'&&match)return send(res,200,await service.gateway.api(secret,'orders:read',(c,id)=>service.gateway.get(c,id,match[1],expectedOrigin)));
        throw new AuthError('NOT_FOUND');
      }
      const pay=/^\/wpay-pay\/([A-Za-z0-9_-]{43})(\/status|\/claim)?$/.exec(req.url);
      if(pay){
        if(req.method==='GET'&&!pay[2]){const [bytes,type]=assets.get(PREFIX+'customer.html');return send(res,200,bytes,type);}
        if(req.method==='GET'&&pay[2]==='/status')return send(res,200,await transaction(service.repository.pool,c=>service.gateway.customer(c,pay[1])));
        if(req.method==='POST'&&pay[2]==='/claim'){
          if(req.headers.origin!==expectedOrigin)throw new AuthError('CSRF_FAILED');
          const body=await readBody(req);exactFields(body,['utr']);if(body.utr===undefined)throw new AuthError('INVALID_INPUT');
          return send(res,200,await transaction(service.repository.pool,c=>service.gateway.customer(c,pay[1],body.utr)));
        }
        throw new AuthError('NOT_FOUND');
      }
      if (policy.secure && req.url === "/" && req.method === "GET") {
        res.statusCode = 303; res.setHeader("Location", PREFIX); return res.end();
      }
      if (typeof req.url !== "string" || !req.url.startsWith(PREFIX) || /[%\\#]/.test(req.url)) throw new AuthError("NOT_FOUND");
      const url = new URL(req.url, expectedOrigin);
      if (url.pathname.includes("..") || req.url.split("?")[0] !== url.pathname) throw new AuthError("NOT_FOUND");
      const route = url.pathname.slice(PREFIX.length);
      let offset = 0;
      if (url.search) {
        const entries = [...url.searchParams];
        if (!["pending-users", "pending-merchants"].includes(route) || entries.length !== 1 || entries[0][0] !== "offset" ||
            !/^(0|[1-9][0-9]{0,5})$/.test(entries[0][1])) throw new AuthError("INVALID_INPUT");
        offset = Number(entries[0][1]);
      }
      if (req.method === "GET" && assets.has(url.pathname)) {
        const [bytes, type] = assets.get(url.pathname); return send(res, 200, bytes, type);
      }
      if (req.method === "GET" && route === "favicon.ico") { res.statusCode = 204; return res.end(); }
      const cookies = readCookies(req.headers.cookie, policy);
      const session = cookies[SESSION_COOKIE];
      const challenge = cookies[CHALLENGE_COOKIE];
      if (req.method === "GET") {
        if (!["me", "navigation", "pending-users", "pending-merchants", "security", "approval-options", "apk", "apk/download", "resources", ...BUSINESS_GET, ...FUNDING_GET, ...ONBOARDING_GET, ...GATEWAY_GET].includes(route)) throw new AuthError("NOT_FOUND");
        const result = await service.authenticated(session, route, offset);
        if (route === "apk/download") {
          if (!Buffer.isBuffer(result)) throw new AuthError("UNAVAILABLE");
          res.statusCode = 200;
          res.setHeader("Content-Type","application/vnd.android.package-archive");
          res.setHeader("Content-Disposition",'attachment; filename="WPAY-Agent.apk"');
          res.setHeader("Content-Length",result.length);
          return res.end(result);
        }
        return send(res, 200, result);
      }
      if (req.headers.origin !== expectedOrigin) throw new AuthError("CSRF_FAILED");
      if (!["csrf", "register", "login", "logout", "logout-all", "refresh", "approval", "locale", "security/replace", "security/regenerate", "security/stepup", "mfa/setup", "mfa/verify", "mfa/recover", "mfa/complete", "resources/request", "resources/revoke", "resources/read", ...BUSINESS_POST, ...FUNDING_POST, ...ONBOARDING_POST, ...GATEWAY_POST].includes(route)) throw new AuthError("NOT_FOUND");
      const body = await readBody(req,route==='onboarding/upload'?1402200:4096);
      if (route === "csrf") {
        exactFields(body, []);
        const result = await service.csrf(req.socket.remoteAddress, session, challenge);
        res.setHeader("Set-Cookie", cookie(CSRF_COOKIE, result.cookie, 900, policy));
        return send(res, 200, { csrfToken: result.challenge });
      }
      await service.checkCsrf(cookies[CSRF_COOKIE], req.headers["x-wpay-csrf-token"], session, challenge);
      if (route === "register") return send(res, 201, await service.register(body, req.socket.remoteAddress));
      if (route === "login") {
        return sendAuthResult(res, await service.login(body, req.socket.remoteAddress), policy);
      }
      if (route.startsWith("mfa/")) return sendAuthResult(res,await service.mfa.challenge(challenge,route.split("/")[1],body),policy);
      if (["approval","locale","security/replace","security/regenerate","security/stepup","resources/request","resources/revoke","resources/read",...BUSINESS_POST, ...FUNDING_POST, ...ONBOARDING_POST, ...GATEWAY_POST].includes(route)) {
        if (route.startsWith("security/")) await service.repository.throttle("login",req.socket.remoteAddress);
        return sendAuthResult(res,await service.authenticated(session,route,0,body),policy);
      }
      exactFields(body, []);
      const result = await service.authenticated(session, route);
      if (route !== "refresh") res.setHeader("Set-Cookie", [cookie(SESSION_COOKIE, "", 0,policy), cookie(CSRF_COOKIE, "", 0,policy),cookie(CHALLENGE_COOKIE,"",0,policy)]);
      return send(res, 200, result);
    } catch (error) {
      const safe = publicError(error);
      if (safe.status === 429) res.setHeader("Retry-After", "900");
      if (!res.writableEnded) send(res, safe.status, safe.body);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.timeout = 15000;
  server.keepAliveTimeout = 3000;
  server.maxRequestsPerSocket = 100;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, policy.bind, () => { server.removeListener("error", reject); resolve(); }); });
  if(service.gateway){service.gateway.origin=policy.origin||`http://127.0.0.1:${server.address().port}`;let running=false;const timer=setInterval(async()=>{if(running)return;running=true;try{await service.gateway.tick();}catch{/* Durable rows retain work; no secrets in diagnostics. */}finally{running=false;}},5000);timer.unref();server.once('close',()=>clearInterval(timer));}
  return server;
}
module.exports = { startAuthServer, readCookies, cookie, PREFIX, SESSION_COOKIE, CSRF_COOKIE, CHALLENGE_COOKIE };
