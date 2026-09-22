# Pairing-only connection change report

Status: implementation prepared and tested locally; not deployed. This report does not claim live activation or completed user ownership mapping.

## Scope

Connect the hosted dashboard to the existing APK backend using an authenticated HTTPS pairing-only API. Existing APK pairing, owner checks, MFA, credit capture, UTR parser, deeplink and disabled OTP routes are unchanged. No database schema changes. Existing database reader restrictions are not relaxed.

Backend base: dd31f6798faa072782482f282d0586b5f940877f

Dashboard base: b60b86667b1f446202291642c5dd46f73e778daa

## Railway configuration

Added WPAY_PAIRING_SERVICE_KEY to both services and WPAY_PAIRING_SERVICE_ORIGIN=https://upi-intent-production.up.railway.app to wpay-app. A new cryptographically random 256-bit key was generated; it is not included in this report. No existing credentials were changed. skipDeploys=true: values take effect on the next deployment.

## Why these changes

The existing hosted pairing path depends on a direct database reader whose accepted hosts exclude public Supabase endpoints. The new service authenticates server-to-server requests using a dedicated credential and returns only pairing/device status metadata. It does not expose OTP, SMS, diagnostics, device credentials, or payment data. It cannot invoke arbitrary legacy admin routes.

The existing Devices.create/poll ownership checks are reused unchanged. JSON proof timestamps are converted back to Date objects so expiry and claim comparisons preserve the former pg adapter contract. Device re-pair invalidates the previous linkage. Only Devices receives the pairing source; reconciliation keeps its original operational source.

## Exact before / after replacements

### main — server-wrapper.js

Before:
```js
const { requireDashboard, loginHandler, logoutHandler } = require("./lib/dashboard-auth");
```
After:
```js
const { requireDashboard, loginHandler, logoutHandler } = require("./lib/dashboard-auth");
const { createPairingService } = require("./lib/device-pairing-service");
```

Before:
```js
    app.use("/api/devices", createDeviceRouter({ pool, env: process.env }));
```
After:
```js
    app.use("/api/pairing-service", createPairingService({ pool, env: process.env }));
    app.use("/api/devices", createDeviceRouter({ pool, env: process.env }));
```

### host — scripts/serve-wpay-hosted.js

Before:
```js
const {configuredPairingBridge}=require('../lib/wpay/integrations/pairing-bridge');
```
After:
```js
const {configuredPairingBridge}=require('../lib/wpay/integrations/pairing-bridge');
const {configuredPairingService}=require('../lib/wpay/integrations/pairing-service');
```

Before:
```js
const pairingBridge=configuredPairingBridge();
```
After:
```js
const pairingService=configuredPairingService();const pairingBridge=pairingService||configuredPairingBridge();
```

Before:
```js
operationalSource:operational.source,pairingBridge,
```
After:
```js
operationalSource:operational.source,pairingSource:pairingService,pairingBridge,
```

### host — lib/wpay/auth/runtime/service.js

Before:
```js
source:options.operationalSource,bridge:options.pairingBridge,
```
After:
```js
source:options.operationalSource,pairingSource:options.pairingSource,bridge:options.pairingBridge,
```

### host — lib/wpay/operations/api.js

Before:
```js
this.devices=new Devices(options);
```
After:
```js
this.devices=new Devices({...options,source:options.pairingSource||options.source});
```

## Validation

Eight focused Node tests passed, including actual local HTTP transport with an in-memory database double, wrong-key rejection before SQL, bounded request validation, pairing issuance/digest verification, Date conversion, re-pair invalidation, outage behavior, HTTPS configuration, and redirect rejection. Four modified existing files passed node --check. The tests do not prove production database connectivity or exercise a real user account/APK.

Full npm check/test, protected-legacy full-tree checker and PostgreSQL acceptance suite were not run in this partial checkout. Existing gateway acceptance failures are a separate issue. Live authenticated dashboard activation and APK claim still need verification after deployment.

## Deployment order

1. Review/merge backend PR, deploy upi-intent.
2. Confirm authenticated /api/pairing-service/ready returns {ready:true}; never expose the key in a browser.
3. Review/merge dashboard PR, deploy wpay-app.
4. With a freshly authenticated user session, generate a code, pair the updated APK and refresh activation status. Verify the device belongs to that user, not another user; codes expire after ten minutes. Existing recent-MFA policy still applies.

AGENTS.md on the hosted branch prohibits automatic merges/deployment; the changes are delivered for explicit review. No deployment was triggered.

## Complete new files

### lib/device-pairing-service.js

```js
"use strict";

const { createHash, randomInt, timingSafeEqual } = require("node:crypto");
const hash = value => createHash("sha256").update(value).digest("hex");
const devicePattern = /^[A-Za-z0-9._:-]{8,160}$/;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Mounted only at /api/pairing-service. This credential has no dashboard,
// SMS, diagnostics, payment, or device-token API privileges.
function createPairingService({ pool, env = process.env }) {
  return async function pairingService(req, res, next) {
    res.set("Cache-Control", "no-store");
    const key = env.WPAY_PAIRING_SERVICE_KEY;
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) {
      return res.status(503).json({ error: "Pairing service is not configured" });
    }
    const supplied = String(req.get("authorization") || "");
    if (!timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash("Bearer " + key)))) {
      return res.status(401).json({ error: "Pairing service authentication required" });
    }
    if (!pool) return res.status(503).json({ error: "Pairing database unavailable" });

    try {
      if (req.method === "GET" && req.path === "/ready") {
        await pool.query("SELECT id FROM device_pairings LIMIT 0");
        await pool.query("SELECT id, status, app_version, last_seen_at FROM devices LIMIT 0");
        return res.json({ ready: true });
      }
      if (req.method !== "POST") return res.status(404).json({ error: "Not found" });
      const body = req.body;
      const fields = allowed => body && Object.getPrototypeOf(body) === Object.prototype &&
        Object.keys(body).every(name => allowed.includes(name));

      if (req.path === "/issue") {
        if (!fields([])) return res.status(400).json({ error: "Invalid request" });
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
          const result = await pool.query(
            "INSERT INTO device_pairings(token_hash) VALUES($1) ON CONFLICT(token_hash) DO NOTHING RETURNING id",
            [hash(code)]
          );
          if (result.rowCount) return res.status(201).json({ pairingCode: code, expiresInSeconds: 600 });
        }
        return res.status(503).json({ error: "Pairing code unavailable" });
      }

      if (req.path === "/proof") {
        if (!fields(["digest"]) || typeof body.digest !== "string" || !/^[a-f0-9]{64}$/.test(body.digest)) {
          return res.status(400).json({ error: "Invalid request" });
        }
        const result = await pool.query(
          `SELECT p.id::text, p.status, p.device_id, p.created_at, p.expires_at,
             p.claimed_at, d.status AS device_status,
             (SELECT x.id::text FROM device_pairings x
              WHERE x.device_id=p.device_id AND x.status='claimed'
              ORDER BY x.claimed_at DESC,x.id DESC LIMIT 1) AS latest_pairing
           FROM device_pairings p LEFT JOIN devices d ON d.id=p.device_id
           WHERE p.token_hash=$1 LIMIT 1`, [body.digest]
        );
        // Fixed SQL projection: no credentials or SMS content.
        return res.json({ pairing: result.rows[0] || null });
      }

      if (req.path === "/devices") {
        if (!fields(["ids"]) || !Array.isArray(body.ids) || body.ids.length > 100 ||
            body.ids.some(id => typeof id !== "string" || !devicePattern.test(id))) {
          return res.status(400).json({ error: "Invalid request" });
        }
        if (!body.ids.length) return res.json({ devices: [] });
        const result = await pool.query(
          `SELECT d.id,d.status,d.app_version,d.last_seen_at,
             (SELECT p.id::text FROM device_pairings p
              WHERE p.device_id=d.id AND p.status='claimed'
              ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1) AS latest_pairing,
             (SELECT p.claimed_at FROM device_pairings p
              WHERE p.device_id=d.id AND p.status='claimed'
              ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1) AS paired_at
           FROM devices d WHERE d.id=ANY($1::text[])`, [body.ids]
        );
        return res.json({ devices: result.rows });
      }
      return res.status(404).json({ error: "Not found" });
    } catch (_error) {
      // Never echo database errors or request bodies to clients/logs.
      return res.status(503).json({ error: "Pairing service unavailable" });
    }
  };
}

module.exports = { createPairingService };

```

### lib/wpay/integrations/pairing-service.js

```js
"use strict";

// A pairing-only HTTPS adapter; it cannot read OTP/SMS events.
class PairingService {
  constructor({ origin, key, fetchImpl = fetch, allowLoopback = false }) {
    const url = new URL(origin);
    const loopback = allowLoopback && url.protocol === "http:" &&
      ["127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== origin || url.username || url.password ||
        (url.protocol !== "https:" && !loopback) ||
        typeof key !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) {
      throw new Error("Invalid pairing service configuration");
    }
    this.origin = origin;
    this.key = key;
    this.fetch = fetchImpl;
    this.sourceId = "legacy-primary";
  }

  async request(path, body) {
    try {
      const response = await this.fetch(this.origin + "/api/pairing-service/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: "Bearer " + this.key, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch (_error) {
      // Preserve the existing public error contract without exposing secrets.
      const { AuthError } = require("../auth/runtime/errors");
      throw new AuthError("OTP_SOURCE_UNAVAILABLE");
    }
  }

  async ready() {
    try { return (await this.request("ready")).ready === true; }
    catch { return false; }
  }

  async issue() {
    const body = await this.request("issue", {});
    if (!/^[A-Z2-9]{8}$/.test(body.pairingCode) || body.expiresInSeconds !== 600) {
      throw new Error("Invalid pairing service response");
    }
    return body.pairingCode;
  }

  async pairing(digest) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error("Invalid pairing digest");
    }
    const proof = (await this.request("proof", { digest })).pairing;
    if (proof === null) return null;
    if (!proof || typeof proof.id !== "string" || !/^[0-9]+$/.test(proof.id)) {
      throw new Error("Invalid pairing service response");
    }
    // The existing SQL adapter returns Date objects. Preserve that contract:
    // ownership checks use numeric comparisons on expires_at/claimed_at.
    for (const name of ["created_at", "expires_at", "claimed_at"]) {
      if (name === "claimed_at" && proof[name] === null) continue;
      const date = new Date(proof[name]);
      if (typeof proof[name] !== "string" || !Number.isFinite(+date)) {
        throw new Error("Invalid pairing service timestamp");
      }
      proof[name] = date;
    }
    return proof;
  }

  async devices(links) {
    if (!Array.isArray(links) || links.length > 100) throw new Error("Invalid device scope");
    if (!links.length) return [];
    const { devices } = await this.request("devices", { ids: links.map(link => link.device_ref) });
    if (!Array.isArray(devices)) throw new Error("Invalid pairing service response");
    return devices.map(device => ({
      ...device,
      linked: device.status === "active" && links.some(link =>
        link.device_ref === device.id && (link.pairing_id
          ? link.pairing_id === device.latest_pairing
          : device.paired_at && +new Date(device.paired_at) <= +new Date(link.authority_at))
      )
    }));
  }
}

function configuredPairingService(env = process.env) {
  if (!env.WPAY_PAIRING_SERVICE_ORIGIN && !env.WPAY_PAIRING_SERVICE_KEY) return null;
  return new PairingService({ origin: env.WPAY_PAIRING_SERVICE_ORIGIN, key: env.WPAY_PAIRING_SERVICE_KEY });
}

module.exports = { PairingService, configuredPairingService };

```

### test/pairing-service-backend.test.js

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createPairingService } = require("../lib/device-pairing-service");
const key = "b".repeat(43);
async function invoke(handler, path, body, authorization = "Bearer " + key, method = "POST") {
  const response = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; } };
  await handler({ method, path, body, get: () => authorization }, response);
  return response;
}
test("pairing backend authenticates and issues only hashed short-lived pairing tokens", async () => {
  const queries = [];
  const handler = createPairingService({ env: { WPAY_PAIRING_SERVICE_KEY: key }, pool: { async query(sql, args) {
    queries.push({ sql, args }); return { rowCount: 1, rows: [{ id: "1" }] };
  } } });
  assert.equal((await invoke(handler, "/issue", {}, "wrong")).statusCode, 401);
  assert.equal(queries.length, 0);
  const issued = await invoke(handler, "/issue", {});
  assert.equal(issued.statusCode, 201);
  assert.match(issued.body.pairingCode, /^[A-Z2-9]{8}$/);
  assert.equal(issued.body.expiresInSeconds, 600);
  assert.equal(queries[0].args[0], createHash("sha256").update(issued.body.pairingCode).digest("hex"));
  assert.doesNotMatch(queries[0].sql, /otp|sms|credential|payment/i);
});
test("pairing backend denies unconfigured, malformed and non-pairing requests", async () => {
  const unconfigured = createPairingService({ env: {}, pool: null });
  assert.equal((await invoke(unconfigured, "/issue", {})).statusCode, 503);
  const handler = createPairingService({ env: { WPAY_PAIRING_SERVICE_KEY: key }, pool: {
    query() { throw Error("Database must not be reached"); }
  } });
  assert.equal((await invoke(handler, "/issue", { deviceId: "injected" })).statusCode, 400);
  assert.equal((await invoke(handler, "/proof", { digest: "invalid" })).statusCode, 400);
  assert.equal((await invoke(handler, "/devices", { ids: Array(101).fill("device-test") })).statusCode, 400);
  assert.equal((await invoke(handler, "/otp-events", {})).statusCode, 404);
});

```

### test/wpay-pairing-service.test.js

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PairingService, configuredPairingService } = require("../lib/wpay/integrations/pairing-service");
const key = "b".repeat(43);
test("HTTPS pairing adapter preserves dates and checks current device pairing", async () => {
  const requests = [];
  const source = new PairingService({ origin: "https://pairing.example", key, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    const payload = url.endsWith("/issue") ? { pairingCode: "ABCDEFGH", expiresInSeconds: 600 }
      : url.endsWith("/proof") ? { pairing: { id: "7", status: "claimed", device_id: "device-test",
        created_at: "2026-01-01T00:00:00Z", expires_at: "2026-01-01T00:10:00Z", claimed_at: "2026-01-01T00:01:00Z" } }
      : { devices: [{ id: "device-test", status: "active", latest_pairing: "7" }] };
    return { ok: true, json: async () => payload };
  } });
  assert.equal(await source.issue(), "ABCDEFGH");
  const proof = await source.pairing("a".repeat(64));
  assert.ok(proof.expires_at instanceof Date);
  assert.ok(+proof.claimed_at <= +proof.expires_at);
  assert.equal((await source.devices([{ device_ref: "device-test", pairing_id: "7" }]))[0].linked, true);
  assert.equal((await source.devices([{ device_ref: "device-test", pairing_id: "6" }]))[0].linked, false);
  for (const { url, options } of requests) {
    assert.match(url, /^https:\/\/pairing\.example\/api\/pairing-service\//);
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer " + key);
  }
  assert.equal(source.events, undefined);
});
test("pairing adapter fails closed on bad config and unavailable backend", async () => {
  assert.equal(configuredPairingService({}), null);
  assert.throws(() => configuredPairingService({ WPAY_PAIRING_SERVICE_KEY: key }));
  assert.throws(() => new PairingService({ origin: "http://example.com", key }));
  const source = new PairingService({ origin: "https://pairing.example", key,
    fetchImpl: async () => { throw Error("secret failure"); } });
  assert.equal(await source.ready(), false);
  await assert.rejects(source.issue(), e => e.code === "OTP_SOURCE_UNAVAILABLE" && !e.message.includes("secret"));
});

```

### test/pairing-service.test.js

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { createPairingService } = require("../lib/device-pairing-service");
const { PairingService, configuredPairingService } = require("../lib/wpay/integrations/pairing-service");
const key = "a".repeat(43);

async function fixture(t) {
  const pairings = new Map();
  const queries = [];
  const device = { id: "device-test-01", status: "active", app_version: "test", last_seen_at: new Date() };
  const pool = { async query(sql, args) {
    queries.push(sql);
    assert.doesNotMatch(sql, /otp|sms|credential|diagnostic|transaction|payment/i);
    if (sql.includes("LIMIT 0")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT")) {
      if (pairings.has(args[0])) return { rows: [], rowCount: 0 };
      pairings.set(args[0], { id: "42", status: "pending", device_id: null,
        created_at: new Date(), expires_at: new Date(Date.now() + 600000),
        claimed_at: null, device_status: null, latest_pairing: null });
      return { rows: [{ id: "42" }], rowCount: 1 };
    }
    if (sql.includes("WHERE p.token_hash")) {
      const proof = pairings.get(args[0]);
      return { rows: proof ? [proof] : [], rowCount: proof ? 1 : 0 };
    }
    if (sql.includes("WHERE d.id=ANY")) {
      return { rows: args[0].includes(device.id) ? [device] : [] };
    }
    throw Error("Unexpected query");
  } };
  const middleware = createPairingService({ pool, env: { WPAY_PAIRING_SERVICE_KEY: key } });
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
    req.path = new URL(req.url, "http://localhost").pathname.replace(/^\/api\/pairing-service/, "");
    req.get = name => req.headers[name.toLowerCase()];
    res.set = (name, value) => { res.setHeader(name, value); return res; };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
    await middleware(req, res, error => { throw error; });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const adapter = new PairingService({ origin, key, allowLoopback: true });
  return { adapter, origin, queries, pairings, device };
}

test("pairing-only API: authentication, issuance, proof, claim and re-pair invalidation", async t => {
  const f = await fixture(t);
  const denied = await fetch(f.origin + "/api/pairing-service/ready");
  assert.equal(denied.status, 401);
  assert.equal(f.queries.length, 0);
  assert.equal(await f.adapter.ready(), true);
  const code = await f.adapter.issue();
  assert.match(code, /^[A-Z2-9]{8}$/);
  const digest = createHash("sha256").update(code).digest("hex");
  const pending = await f.adapter.pairing(digest);
  assert.equal(pending.status, "pending");
  assert.ok(pending.expires_at instanceof Date);
  assert.ok(+pending.expires_at > Date.now());
  assert.equal(pending.claimed_at, null);
  assert.equal(await f.adapter.pairing("0".repeat(64)), null);

  Object.assign(f.pairings.get(digest), { status: "claimed", device_id: f.device.id,
    claimed_at: new Date(), device_status: "active", latest_pairing: "42" });
  Object.assign(f.device, { latest_pairing: "42", paired_at: new Date() });
  const claimed = await f.adapter.pairing(digest);
  assert.equal(claimed.device_id, f.device.id);
  assert.ok(claimed.claimed_at instanceof Date);
  assert.equal((await f.adapter.devices([{ device_ref: f.device.id, pairing_id: "42" }]))[0].linked, true);
  f.device.latest_pairing = "43";
  assert.equal((await f.adapter.devices([{ device_ref: f.device.id, pairing_id: "42" }]))[0].linked, false);
  assert.equal(typeof f.adapter.events, "undefined");
  const notFound = await fetch(f.origin + "/api/pairing-service/otp-events", {
    headers: { authorization: "Bearer " + key }
  });
  assert.equal(notFound.status, 404);
});

test("invalid requests fail before SQL; source outage fails closed", async t => {
  const f = await fixture(t);
  for (const [path, body] of [["proof", { digest: "bad" }], ["issue", { owner: "injected" }],
    ["devices", { ids: ["x'"] }], ["devices", { ids: Array(101).fill("device-test-01") }]]) {
    const r = await fetch(f.origin + "/api/pairing-service/" + path, { method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 400);
  }
  assert.equal(f.queries.length, 0);
  const down = new PairingService({ origin: "https://example.invalid", key,
    fetchImpl: async () => { throw Error("private connection detail"); } });
  assert.equal(await down.ready(), false);
  await assert.rejects(down.issue(), error => error.code === "OTP_SOURCE_UNAVAILABLE" && !error.message.includes("private"));
});

test("configuration rejects partial credentials and insecure origins", () => {
  assert.equal(configuredPairingService({}), null);
  assert.throws(() => configuredPairingService({ WPAY_PAIRING_SERVICE_KEY: key }));
  for (const origin of ["http://remote.example", "https://example.com/path", "https://user:pass@example.com"]) {
    assert.throws(() => new PairingService({ origin, key }));
  }
  assert.throws(() => new PairingService({ origin: "https://example.com", key: "short" }));
});

test("transport uses no redirects and rejects malformed proof timestamps", async () => {
  let options;
  const service = new PairingService({ origin: "https://example.invalid", key,
    fetchImpl: async (_url, opts) => { options = opts; return { ok: true,
      json: async () => ({ pairing: { id: "42", created_at: "bad", expires_at: "bad", claimed_at: null } }) }; } });
  await assert.rejects(service.pairing("a".repeat(64)), /timestamp/);
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
});

```

## Complete modified existing files

### main — server-wrapper.js

```js
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const { createApp, initDb } = require("./server");
const { initDeviceTables, createDeviceRouter, sha256 } = require("./lib/device-pairing");
const { initDeviceCreditTables, createDeviceCreditRouter } = require("./lib/device-credit-router");
const { initPaymentVerificationTables, createPaymentVerificationRouter } = require("./lib/payment-verification");
const { initDeviceOtpTables, createDeviceOtpRouter } = require("./lib/device-otp-router");
const { initStatementTables, createStatementMatchRouter } = require("./lib/statement-match-router");
const { initDeviceLocationHistoryTables, createDeviceLocationHistoryRouter } = require("./lib/device-location-history");
const { requireDashboard, loginHandler, logoutHandler } = require("./lib/dashboard-auth");
const { createPairingService } = require("./lib/device-pairing-service");

async function start() {
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  try {
    await initDb(pool);
    await initDeviceTables(pool);
    await initDeviceLocationHistoryTables(pool);
    await initPaymentVerificationTables(pool);
    await initDeviceCreditTables(pool);
    await initDeviceOtpTables(pool);
    await initStatementTables(pool);

    const coreApp = createApp({ pool, env: process.env });
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "2mb" }));

    app.get("/login", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
    app.post("/api/dashboard/login", loginHandler(process.env));
    app.post("/api/dashboard/logout", logoutHandler(process.env));

    const dashboardAuth = requireDashboard(process.env);
    app.use((req, res, next) => {
      const dashboardPage = req.method === "GET" && (req.path === "/" || req.path === "/index.html");
      const deviceAdminApi = req.path.startsWith("/api/devices/admin/");
      const statementApi = req.path.startsWith("/api/statements/");
      const createPayment = req.method === "POST" && req.path === "/api/payments";
      const createOrder = req.method === "POST" && req.path === "/api/orders";
      if (dashboardPage || deviceAdminApi || statementApi || createPayment || createOrder) return dashboardAuth(req, res, next);
      next();
    });

    app.post("/api/devices/pairing-token/validate", async (req, res, next) => {
      try {
        if (!pool) return res.status(503).json({ error: "Database is not configured" });
        const code = String(req.body?.pairingCode || "").trim().toUpperCase();
        if (!/^[A-Z2-9]{8}$/.test(code)) return res.status(400).json({ error: "Enter a valid 8-character pairing code" });
        const result = await pool.query(
          `select expires_at from device_pairings where token_hash=$1 and status='pending' and expires_at>now() limit 1`,
          [sha256(code)]
        );
        if (!result.rowCount) return res.status(410).json({ error: "Pairing code is invalid or expired" });
        const expiresInSeconds = Math.max(0, Math.floor((new Date(result.rows[0].expires_at).getTime() - Date.now()) / 1000));
        res.json({ ok: true, status: "pending", expiresInSeconds });
      } catch (error) { next(error); }
    });

    app.use("/api/pairing-service", createPairingService({ pool, env: process.env }));
    app.use("/api/devices", createDeviceRouter({ pool, env: process.env }));
    app.use("/api/devices", createDeviceCreditRouter({ pool }));
    app.use("/api/devices", createDeviceOtpRouter({ pool }));
    app.use("/api/devices", createDeviceLocationHistoryRouter({ pool }));
    app.use("/api/statements", createStatementMatchRouter({ pool }));
    app.use("/api", createPaymentVerificationRouter({ pool }));
    app.use(coreApp);

    app.use((error, _req, res, _next) => {
      const status = [400, 401, 403, 404, 409, 410, 413, 422, 502, 503].includes(error.status) ? error.status : 500;
      if (status >= 500) console.error("Runtime API request failed", error.code || error.name || "Error", error.message || "");
      res.status(status).json({ error: status === 500 ? "Could not process request" : (error.message || "Request failed") });
    });

    const host = process.env.NODE_ENV === "development" ? "127.0.0.1" : "0.0.0.0";
    const port = process.env.PORT || 3000;
    return app.listen(port, host, () => console.log("UPI checkout + secured device verification API listening on port " + port));
  } catch (error) {
    await pool?.end();
    console.error("Startup failed:", !pool ? "DATABASE_URL is missing" : (error.code || error.name), error.message || "");
    process.exitCode = 1;
  }
}

if (require.main === module) start();
module.exports = { start };

```

### host — scripts/serve-wpay-hosted.js

```js
"use strict";
const {createHash}=require("node:crypto");
const { createHostedPool,verifyRuntimeRole } = require("../lib/wpay/db/hosted-config");
const { validateMigrations,visibilityCounts } = require("../lib/wpay/db/migrations");
const { SecurityRepository } = require("../lib/wpay/db/security-repository");
const { MfaCrypto,readKey } = require("../lib/wpay/auth/runtime/mfa");
const { fromEnvironment } = require("../lib/wpay/funding/provider");
const { openLegacySource } = require("../lib/wpay/integrations/source-config");
const {openOperationalSource}=require('../lib/wpay/integrations/operational-source');
const {configuredPairingBridge}=require('../lib/wpay/integrations/pairing-bridge');
const {configuredPairingService}=require('../lib/wpay/integrations/pairing-service');
const { AuthService } = require("../lib/wpay/auth/runtime/service");
const { startAuthServer } = require("../lib/wpay/auth/runtime/http");
const { transport } = require("../lib/wpay/auth/runtime/transport");
async function main(){
  if(process.argv.length!==2 || process.env.NODE_ENV!=="production" || !/^[1-9][0-9]{0,4}$/.test(process.env.PORT||"") || Number(process.env.PORT)>65535)throw Error();
  const policy=transport(process.env.WPAY_HOSTED_ORIGIN);if(!policy.secure)throw Error();
  const mfaCrypto=new MfaCrypto(readKey({WPAY_AUTH_DEV_MFA_KEY:process.env.WPAY_HOSTED_MFA_KEY}),{issuer:"WPay"});mfaCrypto.libraries();
  let stage="runtime_config",pool,stopping=false,source,operational;
  try {
    pool=createHostedPool();
    stage="runtime_role";await verifyRuntimeRole(pool);
    const p=(await pool.query(`SELECT current_database() AS db,
      pg_catalog.to_regclass('wpay_auth.merchant_settlement_withdrawals') IS NOT NULL AS settlement_exists,
      pg_catalog.to_regclass('wpay_auth.parking_beneficiaries') IS NOT NULL AS beneficiary_exists,
      pg_catalog.to_regclass('wpay_auth.parking_orders') IS NOT NULL AS order_exists,
      pg_catalog.to_regclass('wpay_auth.parking_locks') IS NOT NULL AS lock_exists,
      pg_catalog.to_regclass('wpay_auth.parking_submissions') IS NOT NULL AS submission_exists`)).rows[0];
    const hash=value=>createHash("sha256").update(String(value||"")).digest("hex").slice(0,16);
    console.log("WPAY_RUNTIME_TARGET_DIAGNOSTIC",JSON.stringify({...p,dbHash:hash(p.db),targetHash:hash(process.env.WPAY_HOSTED_TARGET)}));
    stage="schema_validation";await validateMigrations(pool);
    stage="mfa_factors";const factors=await pool.query("SELECT account_id,factor_version,encrypted_secret FROM wpay_auth.account_security WHERE enabled=true");
    for(const factor of factors.rows)mfaCrypto.open(factor.encrypted_secret,`wpay-factor:${factor.account_id}:${factor.factor_version}`);
    stage="source_adapters";source=openLegacySource();operational=openOperationalSource();const pairingService=configuredPairingService();const pairingBridge=pairingService||configuredPairingBridge();
    stage="server_start";const server=await startAuthServer({service:new AuthService(new SecurityRepository(pool,{throttleMode:"hosted"}),{mfaCrypto,legacyReader:source.reader,operationalSource:operational.source,pairingSource:pairingService,pairingBridge,fundingProvider:fromEnvironment(),fixedCurrency:process.env.WPAY_HOSTED_FIXED_FEE_CURRENCY}),
      port:Number(process.env.PORT),hostedOrigin:policy.origin,readiness:async()=>{
        if(stopping)return false;
        try {await pool.query("SELECT 1");return true;}catch{return false;}
      }});
    const stop=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>server.closeAllConnections(),10000);deadline.unref();server.close(()=>{clearTimeout(deadline);pool.end().catch(()=>{});source.close().catch(()=>{});operational.close().catch(()=>{});});server.closeIdleConnections();};
    process.once("SIGTERM",stop);process.once("SIGINT",stop);
    console.log("WPay hosted authentication listening; legacy observations require an independently verified owner mapping and an available read-only source.");
    return server;
  }catch(error){if(pool&&stage==="schema_validation"){try{console.error("WPAY_RUNTIME_SCHEMA_VISIBILITY",JSON.stringify(await visibilityCounts(pool)));}catch{}}if(pool)await pool.end();if(source)await source.close();if(operational)await operational.close();const code=typeof error?.code==="string"&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:"UNKNOWN";const message=String(error?.message||"").replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[redacted]").replace(/[A-Za-z0-9_%-]+:[^@\s]+@/g,"[redacted]@").slice(0,240);console.error("WPAY_HOSTED_STARTUP_DIAGNOSTIC",stage,code,message);throw error;}
}
if(require.main===module)main().catch(()=>{console.error("WPAY_HOSTED_UNAVAILABLE");process.exitCode=1;});
module.exports={main};

```

### host — lib/wpay/auth/runtime/service.js

```js
"use strict";
const validation = require("./validation");
const { hashPassword, verifyPassword } = require("./passwords");
const { token, digest, liveSession } = require("./tokens");
const { AuthError } = require("./errors");
const { buildPrincipalContext } = require("../principal-context");
const { authorize, validateGrants } = require("../../authorization-policy");
const { deriveNavigation } = require("../../navigation");
const { fullAssurance, approvalAllows } = require("./mfa");
const { MfaService, factorBinding } = require("./mfa-service");
const { commercial, approvalRequest } = require("./commercial");
const { securityAudit } = require("../../db/security-repository");
const { createHash, randomUUID } = require("node:crypto");
const { ApkArtifact } = require("../../integrations/apk");
const { Resources } = require("../../integrations/resources");
const { BusinessApi, businessNavigation } = require("../../business/api");
const { FundingApi } = require("../../funding/api");
const { OnboardingApi, onboardingNavigation } = require("../../onboarding/api");
const gatewayApi = require("../../gateway/api");
const { Gateway } = require("../../gateway/core");
const payoutApi = require("../../payouts/api");
const { Payouts } = require("../../payouts/core");
const parkingApi=require("../../parking/api");
const {Parking}=require("../../parking/core");
const { requireRole,registrationRole } = require('./role-entry');
const {Operations}=require('../../operations/api');
const operationNavigation=require('../../operations/access').navigation;
const USER_OPERATIONS=['user.live_otp.view','user.device_pairing.view','user.device_pairing.create','user.device_pairing.revoke','user.transaction_history.view'];
const ADMIN_OPERATIONS=['apk_otp_events.view_all','employee_management.view','employee_management.create','employee_management.update','utr_center.view','statement_reconciliation.view','statement_reconciliation.upload'];
const SELF_SECURITY = ["account_security.view", "account_security.update"];
const COMPLETION_GRANTS = require('../../panels/grants');
const DEFAULT_GRANTS = Object.freeze({
  user: Object.freeze([...COMPLETION_GRANTS.user,...USER_OPERATIONS,"profile.view", "user.overview.view", "user.deposits.view", "user.deposits.submit", "support.view", "guide.view", "user.apk.view", "user.source_events.view", "user.bank_upi.view", "user.bank_upi.submit", "user.bank_upi.update", "user.holds.view", "user.payin_commission.view", "user.parking_beneficiaries.view", "user.parking_beneficiaries.confirm", "user.parking_payments.view", "user.parking_payments.create", "user.payout.view", "user.payout.claim", "user.payout.submit", "user.commission.view", "user.commission_withdrawal.view", "user.commission_withdrawal.create", "user.commission_withdrawal.cancel", ...SELF_SECURITY]),
  merchant: Object.freeze([...COMPLETION_GRANTS.merchant,"profile.view", "profile.update", "merchant.overview.view", "support.view", "merchant.api_docs.view", "merchant.source_events.view", "merchant.ledger.view", "merchant.fees.view", "merchant.holds.view", "merchant.gateway.view", "merchant.gateway.create", "merchant.gateway.manage", "merchant.payout.view", "merchant.payout.create", "merchant.payout.review", "merchant.settlement.view", "merchant.settlement.create", ...SELF_SECURITY]),
  super_admin: Object.freeze([...COMPLETION_GRANTS.super_admin,...ADMIN_OPERATIONS,"profile.view", "overview.view", "deposits.view", "deposits.review", "deposits.approve", "deposits.reject", "users.view", "users.approve", "users.reject", "merchants.view", "merchants.approve", "merchants.reject", "apk.view", "bank_upi.view", "bank_upi.review", "bank_upi.approve", "bank_upi.reject", "bank_upi.freeze", "bank_upi.release", "assignments.view", "assignments.update", "routing.view", "ledger.view", "holds.view", "holds.update", "transactions.view", "webhooks.view", "payout_operations.view", "payout_operations.resolve","payout_operations.proof", "payout_operations.capability", "parking.view", "parking.create", "parking.review", "parking.approve", "parking.reject", "commission_withdrawal.view", "commission_withdrawal.approve", "commission_hold.view", "commission_hold.manage", ...SELF_SECURITY]),
  admin: Object.freeze(["profile.view", ...SELF_SECURITY]), employee: Object.freeze(["profile.view", ...SELF_SECURITY])
});
for (const [type, grants] of Object.entries(DEFAULT_GRANTS)) if (!validateGrants(grants, type).allowed) throw new Error("WPAY_DEFAULT_GRANTS_INVALID");
function resolveContext(row) {
  if (!liveSession(row, new Date(row?.database_now).getTime()) || !fullAssurance(row)) throw new AuthError("AUTH_FAILED");
  const binding = { accountId: row.id, subjectId: row.subject_id, tenantId: row.tenant_id };
  const grantRecord = { ...binding, permissionVersion: row.grant_version, grants: row.permissions };
  if (row.admin_scope !== null) grantRecord.adminScope = row.admin_scope;
  const built = buildPrincipalContext({
    identity: { ...binding, permissionVersion: row.session_permission_version },
    account: { id: row.id, subjectId: row.subject_id, tenantId: row.tenant_id, type: row.account_type, status: row.status,
      currentPermissionVersion: row.current_permission_version, userId: row.user_id, merchantId: row.merchant_id },
    grantRecord, eligibilityRecord: { ...binding, facts: {
      approvalStatus: row.approval_status, initialDepositSatisfied: row.initial_deposit_satisfied,
      statementSatisfied: row.statement_satisfied, upiApproved: row.upi_approved, upiVerified: row.upi_verified,
      operationsEnabled: row.operations_enabled, approvedBankAccountAvailable: row.approved_bank_account_available
    } }
  });
  if (!built.ok) throw new AuthError("AUTH_FAILED");
  return built.context;
}
function policy(context, permissionId, resource = { kind: "list" }) {
  const result = authorize({ ...context, permissionId, context: resource });
  if (!result.allowed) throw new AuthError("FORBIDDEN");
  return result.constraints.where;
}
class AuthService {
  constructor(repository, options = {}) {
    this.repository = repository; this.crypto = options.mfaCrypto; this.fixedCurrency = options.fixedCurrency;
    this.apk = options.apk || new ApkArtifact();
    this.resources = new Resources(options.legacyReader || null);
    this.business = new BusinessApi();
    this.funding = new FundingApi({provider:options.fundingProvider});
    this.onboarding = new OnboardingApi({verify:options.verifyUpiPayment,allowSynthetic:options.syntheticUpiEvidence===true});
    this.gateway = new Gateway({pool:repository.pool,crypto:options.mfaCrypto,verifier:options.paymentEvidenceVerifier,allowSynthetic:options.syntheticGatewayEvidence===true,testCallback:options.gatewayTestCallback});
    if(options.statementEvidenceVerifier||options.authoritativeStatementSource){
      const source=options.authoritativeStatementSource;
      if(source&&!(source instanceof require('../../integrations/authoritative-statement-source').AuthoritativeStatementSource))throw Error('Invalid authoritative statement source');
      const statements=new (require('../../integrations/statement-evidence').StatementEvidence)({pool:repository.pool,lookup:source?(snapshot=>source.verify(snapshot)):options.statementEvidenceVerifier,allowSynthetic:options.syntheticGatewayEvidence===true}),normal=options.paymentEvidenceVerifier;
      this.gateway.verifier=async snapshot=>{const observed=normal?await normal(snapshot):null;return observed?.verified===true&&observed?.final===true?observed:await statements.verify(snapshot)||observed;};
      if(source)this.gateway.beforeEvidencePosting=(client,proof)=>proof.source==='statement'?source.beforePosting(client,proof):null;
    }
    this.payouts = new Payouts({gateway:this.gateway,crypto:options.mfaCrypto,scanner:options.uploadScanner});
    this.parking=new Parking({crypto:options.mfaCrypto,scanner:options.uploadScanner});
    this.operations=new Operations({source:options.operationalSource,pairingSource:options.pairingSource,bridge:options.pairingBridge,crypto:options.mfaCrypto,onboarding:this.onboarding.workflow,legacyReader:options.legacyReader});
    this.notifications=new (require('../../notifications/service').Notifications)({pool:repository.pool,crypto:options.mfaCrypto,provider:options.emailProvider});
    this.mfa = new MfaService(repository, options.mfaCrypto, resolveContext);
  }
  async register(body, ip, entryRole) {
    registrationRole(body,entryRole);
    await this.repository.throttle("register", ip);
    const input = validation.registration(body);
    const record = await hashPassword(input.password, input.accountType);
    try { await this.repository.createAccount(input, record, DEFAULT_GRANTS[input.accountType]); }
    catch (error) { if (error.code === "23505") throw new AuthError("REGISTRATION_FAILED"); throw error; }
    return { registered: true, approvalStatus: "pending", emailOwnershipVerified: false };
  }
  async bootstrap(body) {
    validation.exactFields(body, ["name", "email", "password"]);
    const input = { name: validation.name(body.name), email: validation.email(body.email) };
    const record = await hashPassword(body.password);
    try { await this.repository.createAccount(input, record, DEFAULT_GRANTS.super_admin, true); }
    catch (error) { if (error.code === "23505") throw new AuthError("REGISTRATION_FAILED"); throw error; }
  }
  async login(body, ip, entryRole) {
    await this.repository.throttle("login", ip);
    let input;
    try { input = validation.login(body); } catch { throw new AuthError("AUTH_FAILED"); }
    const account = await this.repository.credential(input.email);
    const matched = await verifyPassword(input.password, account?.password_record);
    if (!matched || account?.status !== "active") { await this.repository.failedLogin(); throw new AuthError("AUTH_FAILED"); }
    requireRole(account,entryRole);
    if(account.temporary_required&&+account.temporary_expires_at<=+account.database_now){await this.repository.failedLogin();throw new AuthError('AUTH_FAILED');}
    if (!approvalAllows(account)) throw new AuthError(account.approval_status === "pending" ? "APPROVAL_PENDING" : "AUTH_FAILED");
    return this.mfa.begin(account,entryRole);
  }
  csrfBinding(session, restrictedChallenge) {
    return createHash("sha256").update(`${digest(session) || ""}:${digest(restrictedChallenge) || ""}`).digest("hex");
  }
  async csrf(ip, session, restrictedChallenge) {
    await this.repository.throttle("csrf", ip);
    const cookie = token(), challenge = token();
    await this.repository.issueCsrf(digest(cookie), digest(challenge), this.csrfBinding(session, restrictedChallenge));
    return { cookie, challenge };
  }
  async checkCsrf(cookie, challenge, session, restrictedChallenge) {
    if (!digest(cookie) || !digest(challenge)) throw new AuthError("CSRF_FAILED");
    await this.repository.checkCsrf(digest(cookie), digest(challenge), this.csrfBinding(session, restrictedChallenge));
  }
  async authenticated(session, operation, offset = 0, body = {}, entryRole) {
    const sessionDigest = digest(session);
    if (!sessionDigest) throw new AuthError("AUTH_FAILED");
    let prepared;
    if (["payout/bulk","payout/bulk/validate","payout/submit"].includes(operation)) {
      await this.repository.withSession(sessionDigest,async (client,row)=>{requireRole(row,entryRole);const context=resolveContext(row);payoutApi.preparation(context,row,operation);});
      prepared=await this.payouts.prepare(operation,body);
    }
    if(operation==="parking/submit"){
      await this.repository.withSession(sessionDigest,async (client,row)=>{requireRole(row,entryRole);const context=resolveContext(row);parkingApi.preparation(context,row,operation);});
      prepared=await this.parking.prepare(operation,body);
    }
    const invoke = () => this.repository.withSession(sessionDigest, async (client, row) => {
      requireRole(row,entryRole);
      const context = resolveContext(row);
      if (!this.crypto) throw new AuthError("UNAVAILABLE");
      this.crypto.open(row.encrypted_secret, factorBinding(row));
      if(operation.startsWith('panel/')){
        const result=await require('../../panels/api').run(client,row,context,operation,body,this.fixedCurrency,this.gateway);
        if(operation==='panel/profile')result.emailVerification=await this.notifications.status(client,row);
        if(operation==='panel/notifications')result.emailDeliveryConfigured=this.notifications.configured();
        return result;
      }
      if(operation.startsWith('operations/'))return this.operations.run(client,row,context,operation,body);
      if(operation.startsWith('email/'))return this.notifications.run(client,row,context,operation,body);
      if (operation.startsWith("business/")) return this.business.run(client,row,context,operation,body);
      if (operation.startsWith("funding/")) return this.funding.run(client,row,context,operation,body);
      if (operation.startsWith("onboarding/")) return this.onboarding.run(client,row,context,operation,body);
      if (operation.startsWith("gateway/")) return gatewayApi.run(this.gateway,client,row,context,operation,body);
      if (operation.startsWith("payout/")) return payoutApi.run(this.payouts,client,row,context,operation,body,prepared);
      if(operation.startsWith("parking/"))return parkingApi.run(this.parking,client,row,context,operation,body,prepared);
      if (["resources","resources/request","resources/revoke","resources/read"].includes(operation)) {
        if (!["user","merchant"].includes(row.account_type)) throw new AuthError("FORBIDDEN");
        policy(context,`${row.account_type}.source_events.view`);
        const observed=await this.resources.run(client,row,operation,body);
        return require('../../operations/observation-privacy').forPanel(row.account_type,observed);
      }
      if (["apk","apk/download"].includes(operation)) {
        if (!["user","admin","super_admin"].includes(row.account_type)) throw new AuthError("FORBIDDEN");
        policy(context,row.account_type === "user" ? "user.apk.view" : "apk.view");
        return this.apk.inspect(operation === "apk/download");
      }
      if (operation === "security") {
        policy(context, "account_security.view");
        return this.repository.securitySummary(client,row,sessionDigest);
      }
      if (["security/replace","security/regenerate","security/stepup","security/password"].includes(operation)) {
        policy(context, "account_security.update", { kind:"record",id:row.id,tenantId:row.tenant_id,ownerType:"principal",ownerId:row.id });
        return this.mfa.fresh(client,row,body,operation.split("/")[1],sessionDigest);
      }
      if (operation === "locale") {
        validation.exactFields(body,["locale"]);
        if (row.account_type !== "merchant" || !["en","ru","zh-CN"].includes(body.locale)) throw new AuthError("INVALID_INPUT");
        const where = policy(context,"profile.update", { kind:"record",id:row.id,tenantId:row.tenant_id,ownerType:"principal",ownerId:row.id });
        await client.query("UPDATE wpay_auth.preferences p SET locale=$3 FROM wpay_auth.accounts a WHERE p.account_id=a.id AND a.id=$1 AND a.tenant_id=$2",[where.ownerId,where.tenantId,body.locale]);
        return { locale: body.locale };
      }
      if (operation === "approval-options") {
        const permission = context.grants.includes("users.view") ? "users.view" : "merchants.view";
        policy(context,permission);
        return { fixedFeeCurrency: ["INR","USD","USDT"].includes(this.fixedCurrency) ? this.fixedCurrency : null, depositNetworks: ["TRON-TRC20","ETHEREUM-ERC20"] };
      }
      if (operation === "approval") return this.approval(client,row,context,body);
      if (operation === "me") {const summary=await this.repository.ownSummary(client, policy(context, "profile.view"));const email=await this.notifications.status(client,row);return {...summary,emailOwnershipVerified:email.emailOwnershipVerified};}
      if (operation === "navigation") {
        policy(context, "profile.view");
        const groups=structuredClone(deriveNavigation(context));
        if (["user","merchant"].includes(row.account_type) && context.grants.includes(`${row.account_type}.source_events.view`)) {
          policy(context,`${row.account_type}.source_events.view`);
          const groupId=row.account_type === "user" ? "user.group.apk_events" : "merchant.group.collections";
          let group=groups.find(item=>item.id===groupId);
          if(!group){group={id:groupId,label:row.account_type === "user"?"APK & Events":"Collections",children:[]};groups.push(group);}
          group.children.push({id:`${row.account_type}.page.connected-sources`,destinationId:`${row.account_type}.connected-sources`,
            permissionId:`${row.account_type}.source_events.view`,label:row.account_type === "user"?"Linked Devices & Observations":"Mapped Orders",routeStatus:"implemented",descriptorOnly:false,blockers:[]});
        }
        const result=require('../../panels/navigation').navigation(operationNavigation(parkingApi.navigation(payoutApi.navigation(gatewayApi.navigation(onboardingNavigation(businessNavigation(groups,context),context),context),context),context),context),context);
        if(await require('../../operations/admin-authority').available(client,row,context))result.push({id:'operations.group.admin-authority',label:'Admin authority',children:[{id:'operations.page.admins',destinationId:'operations.admins',permissionId:'settings.view',label:'Admin authority',routeStatus:'implemented',descriptorOnly:false,blockers:[]}]});
        return {groups:result,...(['user','merchant'].includes(row.account_type)?{requirements:{approvalStatus:context.eligibility.approvalStatus,initialDepositSatisfied:context.eligibility.initialDepositSatisfied===true,statementSatisfied:context.eligibility.statementSatisfied===true,upiApproved:context.eligibility.upiApproved===true,upiVerified:context.eligibility.upiVerified===true,operationsEnabled:context.eligibility.operationsEnabled===true,approvedBankAccountAvailable:context.eligibility.approvedBankAccountAvailable===true}}:{})};
      }
      if (["pending-users", "pending-merchants"].includes(operation)) {
        const user = operation === "pending-users";
        return this.repository.pending(client, policy(context, user ? "users.view" : "merchants.view"), user ? "user" : "merchant", offset);
      }
      if (["logout", "logout-all", "refresh"].includes(operation)) {
        // Owning a currently valid session authorizes its lifecycle. No profile
        // update grant or generic permission-execution endpoint is invented.
        if (operation === "refresh") await this.repository.touch(client, sessionDigest);
        else await this.repository.revoke(client, row, sessionDigest, operation === "logout-all");
        return { ok: true };
      }
      throw new AuthError("NOT_FOUND");
    });
    // withSession owns the bounded whole-transaction conflict retry, including
    // internal callers such as parking. Do not multiply its retry budget here.
    const result=await invoke();
    if (result.failure) throw new AuthError(result.failure);
    return result;
  }
  async approval(client,row,context,body) {
    const request = approvalRequest(body);
    if (+new Date(row.database_now)-+new Date(row.mfa_at) > 300000) throw new AuthError("RECENT_MFA_REQUIRED");
    const target = (await client.query("SELECT a.id,a.tenant_id,a.account_type,e.approval_status FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a,e", [request.accountId])).rows[0];
    if (!target || !["user","merchant"].includes(target.account_type) || target.id === row.id) throw new AuthError("FORBIDDEN");
    const permissionId = `${target.account_type === "user" ? "users" : "merchants"}.${request.decision}`;
    const decision = authorize({ ...context, permissionId, context: { kind: "record", id: target.id, tenantId: target.tenant_id } });
    if (!decision.allowed) throw new AuthError("FORBIDDEN");
    const settings = request.decision === "approve" ? commercial(target.account_type,request.settings,this.fixedCurrency) : null;
    const reason = request.reason.trim();
    const payload = createHash("sha256").update(JSON.stringify({ accountId:target.id,decision:request.decision,settings,reason })).digest("hex");
    const previous = (await client.query("SELECT payload_digest,result FROM wpay_auth.approval_requests WHERE actor_id=$1 AND request_id=$2",[row.id,request.requestId])).rows[0];
    if (previous) { if (previous.payload_digest !== payload) throw new AuthError("CONFLICT"); return previous.result; }
    if (target.approval_status !== "pending") throw new AuthError("CONFLICT");
    if (settings) await client.query("INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)",[randomUUID(),target.id,JSON.stringify(settings),row.id]);
    const status = request.decision === "approve" ? "approved" : "rejected";
    // Apply the actual policy's returned tenant and record constraints in SQL.
    const where = decision.constraints.where;
    const changed = await client.query("UPDATE wpay_auth.eligibility e SET approval_status=$3 FROM wpay_auth.accounts a WHERE e.account_id=a.id AND a.id=$1 AND a.tenant_id=$2 AND e.approval_status='pending'",[where.id,where.tenantId,status]);
    if (changed.rowCount !== 1) throw new AuthError("CONFLICT");
    await client.query("UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE id=$1 AND tenant_id=$2",[where.id,where.tenantId]);
    await client.query("UPDATE wpay_auth.grants SET permission_version=permission_version+1 WHERE account_id=$1",[target.id]);
    await securityAudit(client,row.id,target.id,status,reason || null);
    const result = { approvalStatus: status };
    await client.query("INSERT INTO wpay_auth.approval_requests(actor_id,request_id,payload_digest,account_id,result) VALUES($1,$2,$3,$4,$5)",[row.id,request.requestId,payload,target.id,JSON.stringify(result)]);
    return result;
  }
}
module.exports = { AuthService, DEFAULT_GRANTS, resolveContext, policy };

```

### host — lib/wpay/operations/api.js

```js
"use strict";
const {Devices}=require('./devices'),employees=require('./employees'),{fail}=require('./access');
const GET=['operations/devices','operations/employees','operations/transactions','operations/statements'],POST=['operations/devices','operations/device/create','operations/device/poll','operations/device/revoke','operations/otp','operations/employees','operations/employee/create','operations/employee/update','operations/transactions','operations/statements','operations/statement/upload'];
POST.push('operations/utr-source');
GET.push('operations/admins');POST.push('operations/admins','operations/admin/create','operations/admin/update');
class Operations{
 constructor(options){this.devices=new Devices({...options,source:options.pairingSource||options.source});this.reconciliation=new (require('./reconciliation').Reconciliation)(options);this.utrs=new (require('./legacy-utrs').LegacyUtrs)(options.legacyReader);}
 async run(client,row,context,operation,body){
  if(operation==='operations/admins'||operation.startsWith('operations/admin/'))return require('./admin-authority').run(client,row,context,operation,body);
  if(operation==='operations/utr-source')return this.utrs.read(client,row,context,body);
  if(operation==='operations/transactions')return this.reconciliation.observations(client,row,context,body);
  if(operation==='operations/statements'||operation==='operations/statement/upload')return this.reconciliation.statements(client,row,context,body,operation.endsWith('/upload'));
  if(operation==='operations/devices')return this.devices.list(client,row,context,body);
  if(operation==='operations/otp')return this.devices.events(client,row,context,body);
  if(operation==='operations/device/create')return this.devices.create(client,row,context,body);
  if(operation==='operations/device/poll')return this.devices.poll(client,row,context,body);
  if(operation==='operations/device/revoke')return this.devices.revoke(client,row,context,body);
  if(operation.startsWith('operations/employee'))return employees.run(client,row,context,operation,body);
  fail('NOT_FOUND');
 }
}
module.exports={Operations,GET,POST};

```

