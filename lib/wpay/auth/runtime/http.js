"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { AuthError, publicError } = require("./errors");
const { exactFields } = require("./validation");
const { validToken } = require("./tokens");
const PREFIX = "/wpay-auth/";
const SESSION_COOKIE = "wpay_auth_dev_session";
const CSRF_COOKIE = "wpay_auth_dev_csrf";
const CHALLENGE_COOKIE = "wpay_auth_dev_challenge";
const ASSETS = Object.freeze({ [PREFIX]: ["index.html", "text/html"],
  [PREFIX + "styles.css"]: ["styles.css", "text/css"], [PREFIX + "app.js"]: ["app.js", "text/javascript"],
  [PREFIX + "locales.js"]: ["locales.js", "text/javascript"] });
function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=${PREFIX}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
function readCookies(header = "") {
  if (header.length > 8192) throw new AuthError("AUTH_FAILED");
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim(), value = part.slice(index + 1).trim();
    if (![SESSION_COOKIE, CSRF_COOKIE, CHALLENGE_COOKIE].includes(key)) continue;
    if (Object.hasOwn(result, key) || !validToken(value)) throw new AuthError("AUTH_FAILED");
    result[key] = value;
  }
  return result;
}
async function readBody(req) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers["content-type"] || "") ||
      req.headers["content-encoding"]) throw new AuthError("INVALID_INPUT");
  if (Number(req.headers["content-length"] || 0) > 4096) throw new AuthError("BODY_TOO_LARGE");
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new AuthError("BODY_TOO_LARGE");
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
function sendAuthResult(res, result) {
  const body = { ...result };
  if (body.sessionToken) res.setHeader("Set-Cookie",[cookie(SESSION_COOKIE,body.sessionToken,43200),cookie(CHALLENGE_COOKIE,"",0),cookie(CSRF_COOKIE,"",0)]);
  else if (body.challengeToken) res.setHeader("Set-Cookie",[cookie(CHALLENGE_COOKIE,body.challengeToken,300),cookie(SESSION_COOKIE,"",0),cookie(CSRF_COOKIE,"",0)]);
  delete body.sessionToken; delete body.challengeToken;
  send(res,200,body);
}
async function startAuthServer({ service, port = 4174 }) {
  if (!service || !Number.isInteger(port) || port < 0 || port > 65535) throw new AuthError("INVALID_INPUT");
  const assets = new Map();
  for (const [url, [file, type]] of Object.entries(ASSETS)) assets.set(url, [await fs.readFile(path.join(__dirname, "../../../../dev/wpay-auth/web", file)), type]);
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expectedHost || (req.headers.origin !== undefined && req.headers.origin !== `http://${expectedHost}`)) throw new AuthError("FORBIDDEN");
      if (!["GET", "POST"].includes(req.method)) throw new AuthError("METHOD_NOT_ALLOWED");
      if (typeof req.url !== "string" || !req.url.startsWith(PREFIX) || /[%\\#]/.test(req.url)) throw new AuthError("NOT_FOUND");
      const url = new URL(req.url, `http://${expectedHost}`);
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
      const cookies = readCookies(req.headers.cookie);
      const session = cookies[SESSION_COOKIE];
      const challenge = cookies[CHALLENGE_COOKIE];
      if (req.method === "GET") {
        if (!["me", "navigation", "pending-users", "pending-merchants", "security", "approval-options"].includes(route)) throw new AuthError("NOT_FOUND");
        return send(res, 200, await service.authenticated(session, route, offset));
      }
      if (req.headers.origin !== `http://${expectedHost}`) throw new AuthError("CSRF_FAILED");
      if (!["csrf", "register", "login", "logout", "logout-all", "refresh", "approval", "locale", "security/replace", "security/regenerate", "security/stepup", "mfa/setup", "mfa/verify", "mfa/recover", "mfa/complete"].includes(route)) throw new AuthError("NOT_FOUND");
      const body = await readBody(req);
      if (route === "csrf") {
        exactFields(body, []);
        const result = await service.csrf(req.socket.remoteAddress, session, challenge);
        res.setHeader("Set-Cookie", cookie(CSRF_COOKIE, result.cookie, 900));
        return send(res, 200, { csrfToken: result.challenge });
      }
      await service.checkCsrf(cookies[CSRF_COOKIE], req.headers["x-wpay-csrf-token"], session, challenge);
      if (route === "register") return send(res, 201, await service.register(body, req.socket.remoteAddress));
      if (route === "login") {
        return sendAuthResult(res, await service.login(body, req.socket.remoteAddress));
      }
      if (route.startsWith("mfa/")) return sendAuthResult(res,await service.mfa.challenge(challenge,route.split("/")[1],body));
      if (["approval","locale","security/replace","security/regenerate","security/stepup"].includes(route)) {
        if (route.startsWith("security/")) await service.repository.throttle("login",req.socket.remoteAddress);
        return sendAuthResult(res,await service.authenticated(session,route,0,body));
      }
      exactFields(body, []);
      const result = await service.authenticated(session, route);
      if (route !== "refresh") res.setHeader("Set-Cookie", [cookie(SESSION_COOKIE, "", 0), cookie(CSRF_COOKIE, "", 0),cookie(CHALLENGE_COOKIE,"",0)]);
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
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); }); });
  return server;
}
module.exports = { startAuthServer, readCookies, cookie, PREFIX, SESSION_COOKIE, CSRF_COOKIE, CHALLENGE_COOKIE };
