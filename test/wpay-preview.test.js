"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createPreviewServer, startPreviewServer } = require("../scripts/serve-wpay-preview");
const { PERSONAS, getPersona, listPersonas } = require("../preview/wpay/demo-fixtures");
const { getPreviewModel } = require("../preview/wpay/preview-model");
const { buildPrincipalContext } = require("../lib/wpay/auth/principal-context");
const { deriveNavigation } = require("../lib/wpay/navigation");
const { canUsePermission, authorize } = require("../lib/wpay/authorization-policy");

function request(server, target, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: target, method: options.method || "GET", headers: options.headers || {}, agent: false }, res => {
      const buffers = [];
      res.on("data", data => buffers.push(data));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(buffers).toString("utf8") }));
    });
    req.on("error", reject); req.end();
  });
}
test("preview server import neither starts listeners nor reads assets/environment", () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/serve-wpay-preview.js"), "utf8");
  const module = { exports: {} };
  const blocked = () => { throw new Error("Import side effect"); };
  vm.runInNewContext(source, { module, exports: module.exports, __dirname,
    require(name) {
      if (name === "node:http") return { createServer: blocked };
      if (name === "node:fs") return { readFileSync: blocked };
      if (name === "node:path") return path;
      if (name === "../preview/wpay/demo-fixtures") return { listPersonas };
      if (name === "../preview/wpay/preview-model") return { getPreviewModel };
      throw new Error("Unexpected import");
    }, process: new Proxy({}, { get: blocked }), console: new Proxy({}, { get: blocked }) }, { timeout: 1000 });
  assert.deepEqual(Object.keys(module.exports).sort(), ["createPreviewServer", "startPreviewServer"]);
  assert.equal(createPreviewServer().listening, false);
});
for (const persona of PERSONAS) test(`preview ${persona.id} uses the actual adapter and derived navigation`, () => {
  const built = buildPrincipalContext(persona.input);
  assert.equal(built.ok, true);
  const model = getPreviewModel(persona.id);
  const expected = deriveNavigation(built.context);
  assert.deepEqual(model.navigation.map(group => [group.id, group.children.map(page => page.id)]), expected.map(group => [group.id, group.children.map(page => page.id)]));
  assert.equal(model.demo, true);
  assert.equal(Object.hasOwn(model, "principal"), false);
  assert.equal(Object.hasOwn(model, "grants"), false);
  assert.equal(Object.hasOwn(model.persona, "input"), false);
  for (const group of model.navigation) for (const page of group.children) {
    assert.equal(canUsePermission({ ...built.context, permissionId: page.permissionId }).allowed, true);
    assert.equal(page.href, "#" + page.destinationId);
    assert.equal(Object.hasOwn(page, "plannedRoute"), false);
    assert.ok(["user-dashboard", "user-banks", "merchant-dashboard", "merchant-orders", "payment-form", "admin-dashboard", "approvals-users", "approvals-merchants", "approvals-banks", "finance-readonly", "planned"].includes(page.view));
    assert.ok(page.purpose.length > 4);
    assert.equal(page.routeStatus, "preview-only");
  }
});
test("Employee gets only explicit Finance and Reports views without approval/export", () => {
  const model = getPreviewModel("employee");
  assert.deepEqual(model.navigation.map(group => [group.label, group.children.map(page => page.label)]), [["Finance", ["Deposit Review", "Ledger", "Withdrawal Review", "Payout Review"]], ["Reports", ["Reports"]]]);
  assert.equal(Object.values(model.capabilities).some(Boolean), false);
  const context = buildPrincipalContext(getPersona("employee").input).context;
  for (const permissionId of ["deposits.approve", "withdrawals.approve", "payouts.approve", "reports.export", "employees.create"]) assert.equal(canUsePermission({ ...context, permissionId }).allowed, false);
  assert.deepEqual(authorize({ ...context, permissionId: "ledger.view", context: { kind: "list" } }).constraints.where, { tenantIds: ["demo-tenant"] });
});
test("pending User retains onboarding but cannot operate", () => {
  const model = getPreviewModel("onboarding");
  const pages = model.navigation.flatMap(group => group.children).map(page => page.destinationId);
  assert.ok(pages.includes("user.dashboard")); assert.ok(pages.includes("user.bank-upi")); assert.ok(pages.includes("user.usdt-deposit"));
  assert.equal(pages.includes("user.transactions"), false); assert.equal(pages.includes("user.usdt-withdrawal"), false);
  assert.ok(model.data.checklist.some(item => item[1] === "Pending"));
  assert.equal(model.data.chartTotal, "₹0");
});
test("unknown persona and browser role objects never map to Admin", () => {
  for (const value of [undefined, null, "unknown", "super_admin", "__proto__", { persona: "admin", role: "super_admin", trusted: true }]) assert.equal(getPreviewModel(value), null);
});
function keysDeep(value) { return value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]) : []; }
test("Merchant model omits User bank/account/UPI and device records", () => {
  const model = getPreviewModel("merchant");
  for (const key of ["banks", "approvals", "upi", "account", "holder", "device", "sms", "userId", "tenantId"]) assert.equal(keysDeep(model).includes(key), false, key);
  assert.doesNotMatch(JSON.stringify(model), /4821|9016|7702|@demo|Arjun|Aarav|rawSms/);
  assert.ok(model.data.orders.length);
});
test("all synthetic payloads exclude secret and principal fields", () => {
  for (const { id } of PERSONAS) {
    const model = getPreviewModel(id);
    for (const key of keysDeep(model)) assert.ok(!/^(password|token|sessionToken|apiSecret|privateKey|seedPhrase|bankLogin|otpCode|rawSms|principal|grants|identity)$/i.test(key), key);
  }
});
test("OTP and other planned destinations retain deliberate placeholders", () => {
  for (const id of ["user", "admin"]) {
    const pages = getPreviewModel(id).navigation.flatMap(group => group.children);
    const otp = pages.find(page => page.permissionId.endsWith("otp_events.view"));
    assert.equal(otp.view, "planned"); assert.equal(otp.descriptorOnly, true);
    const context = buildPrincipalContext(getPersona(id).input).context;
    assert.equal(authorize({ ...context, permissionId: otp.permissionId, context: { kind: "list" } }).reason, "DESCRIPTOR_ONLY");
  }
  assert.equal(getPreviewModel("user").navigation.flatMap(group => group.children).find(page => page.destinationId === "user.trade").view, "planned");
});
test("fixture inputs and data are immutable; model calls are deterministic", () => {
  const before = JSON.stringify(PERSONAS);
  assert.throws(() => PERSONAS[0].input.grantRecord.grants.push("*"), TypeError);
  assert.throws(() => { getPreviewModel("merchant").data.orders[0].status = "Changed"; }, TypeError);
  assert.deepEqual(getPreviewModel("admin"), getPreviewModel("admin"));
  assert.equal(JSON.stringify(PERSONAS), before);
});
test("HTTP allowlist, loopback binding, hostile requests and clean shutdown", async t => {
  const server = await startPreviewServer({ port: 0 });
  t.after(() => { if (server.listening) server.close(); });
  assert.equal(server.address().address, "127.0.0.1");
  for (const [target, mime] of [["/", "text/html"], ["/styles.css", "text/css"], ["/app.js", "text/javascript"]]) {
    const result = await request(server, target); assert.equal(result.status, 200); assert.ok(result.headers["content-type"].startsWith(mime));
    assert.equal(result.headers["access-control-allow-origin"], undefined);
    assert.ok(result.headers["content-security-policy"].includes("form-action 'none'"));
  }
  assert.equal((await request(server, "/favicon.ico")).status, 204);
  const personas = await request(server, "/demo/personas"); assert.deepEqual(JSON.parse(personas.text).personas, listPersonas());
  for (const { id } of PERSONAS) {
    const result = await request(server, "/demo/model?persona=" + id); assert.equal(result.status, 200); assert.deepEqual(JSON.parse(result.text), getPreviewModel(id));
  }
  for (const target of ["/server-wrapper.js", "/package.json", "/AGENTS.md", "/public/index.html", "/preview/wpay/demo-fixtures.js", "/lib/wpay/authorization-policy.js", "/api/devices/admin/list", "/api/statements/match", "/api/payments", "/panels/wpay/user/dashboard", "/demo/model?persona=root"]) assert.equal((await request(server, target)).status, 404, target);
  for (const target of ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/..\\package.json", "/%252e%252e%252fpackage.json", "//package.json", "/demo/model?persona=admin&role=super_admin", "/demo/model?persona=admin&persona=user", "/demo/model", "/?role=admin", "/demo/personas?role=admin", "/demo/model?persona=%61dmin"]) assert.equal((await request(server, target)).status, 400, target);
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) { const response = await request(server, "/demo/model?persona=admin", { method }); assert.equal(response.status, 405, method); assert.equal(response.headers.allow, "GET"); }
  assert.equal((await request(server, "/", { headers: { Host: "evil.example" } })).status, 403);
  assert.equal((await request(server, "/demo/model?persona=admin", { headers: { Origin: "https://evil.example" } })).status, 403);
  assert.equal((await request(server, "/", { headers: { Origin: `http://127.0.0.1:${server.address().port}` } })).status, 200);
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert.equal(server.listening, false); assert.equal(server.address(), null);
});
test("invalid preview ports reject without starting a server", async () => {
  for (const port of [-1, 65536, "4173", 1.5]) await assert.rejects(startPreviewServer({ port }), /INVALID_PREVIEW_PORT/);
});
test("asset source checks: no legacy/external API, unsafe HTML sinks or persistence", () => {
  const app = fs.readFileSync(path.join(__dirname, "../preview/wpay/web/app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../preview/wpay/web/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../preview/wpay/web/styles.css"), "utf8");
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|\/api\/|sendBeacon|WebSocket/);
  assert.doesNotMatch(html + css, /https?:\/\/|@import|@font-face/);
  assert.match(app, /fetch\("\/demo\/personas"/); assert.match(app, /fetch\("\/demo\/model\?persona="/);
  assert.match(html, /<dialog/); assert.match(app, /aria-expanded/); assert.match(app, /dialog\.addEventListener\("close"/);
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /focus-visible/);
  // These are source/HTTP checks, not claims of browser or accessibility validation.
});
