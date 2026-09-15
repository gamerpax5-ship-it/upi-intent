"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const { registration, login, password, exactFields } = require("../lib/wpay/auth/runtime/validation");
const { hashPassword, verifyPassword, PARAMETERS } = require("../lib/wpay/auth/runtime/passwords");
const { token, digest, validToken, liveSession, ABSOLUTE_MS, IDLE_MS } = require("../lib/wpay/auth/runtime/tokens");
const { AuthError, publicError } = require("../lib/wpay/auth/runtime/errors");
const { DEFAULT_GRANTS, resolveContext, policy } = require("../lib/wpay/auth/runtime/service");
const { authorize } = require("../lib/wpay/authorization-policy");
const { deriveNavigation } = require("../lib/wpay/navigation");
const { readConfig } = require("../lib/wpay/db/config");
const { startAuthServer, readCookies, SESSION_COOKIE, CSRF_COOKIE } = require("../lib/wpay/auth/runtime/http");
const { readSecret } = require("../lib/wpay/auth/runtime/secret-input");
const syntheticPassword = "A synthetic password 2026!";
const input = () => ({ name: "Development Person", email: "Person@example.invalid", password: syntheticPassword, accountType: "user" });
function row(type = "user") {
  const now = new Date("2026-09-15T00:00:00.000Z");
  return { id: "principal-a", subject_id: "subject-a", tenant_id: "development-a", account_type: type, status: "active",
    user_id: type === "user" ? "user-a" : null, merchant_id: type === "merchant" ? "merchant-a" : null,
    current_permission_version: 1, grant_version: 1, session_permission_version: 1, permissions: [...DEFAULT_GRANTS[type]],
    admin_scope: type === "super_admin" ? { tenantIds: ["development-a"] } : null,
    session_epoch: 0, current_session_epoch: 0, created_at: now, last_seen_at: now,
    expires_at: new Date(+now + ABSOLUTE_MS), revoked_at: null, database_now: now,
    approval_status: "approved", mfa_enabled: true, mfa_at: now, security_version: 1, factor_version: 1, session_security_version: 1, session_factor_version: 1,
    initial_deposit_satisfied: false, statement_satisfied: false,
    upi_approved: false, upi_verified: false, operations_enabled: false, approved_bank_account_available: false };
}
test("registration canonicalizes identifiers but preserves exact password", () => {
  const body = input(); body.password = "  " + syntheticPassword + "  "; body.email = " PERSON@example.invalid ";
  const value = registration(body);
  assert.equal(value.email, "person@example.invalid"); assert.equal(value.password, body.password);
  assert.deepEqual(Object.keys(value).sort(), ["accountType", "email", "name", "password"]);
});
for (const field of ["role", "grants", "approved", "tenantId", "userId", "merchantId", "permissionVersion", "funded", "principal", "__proto__"]) {
  test(`registration rejects injected ${field}`, () => {
    const body = JSON.parse(JSON.stringify(input())); Object.defineProperty(body, field, { enumerable: true, value: "super_admin" });
    assert.throws(() => registration(body), { code: "INVALID_INPUT" });
  });
}
test("no Admin, Super Admin, Employee or ambiguous public type", () => {
  for (const accountType of ["admin", "super_admin", "employee", "User", " merchant", null, {}]) assert.throws(() => registration({ ...input(), accountType }));
});
test("rejects arrays, missing fields, inherited claims and getters", () => {
  for (const body of [null, [], {}, Object.create(input())]) assert.throws(() => registration(body));
  const body = input(); Object.defineProperty(body, "password", { enumerable: true, get() { throw new Error("must not read getter"); } });
  assert.throws(() => registration(body), { code: "INVALID_INPUT" });
  assert.throws(() => exactFields({ extra: true }, []));
});
test("password limits reject oversize and malformed unicode without normalization", () => {
  for (const value of ["short", "x".repeat(129), "\ud800".repeat(15), null, 111111111111111]) assert.throws(() => password(value));
  assert.equal(password("😀".repeat(128)), "😀".repeat(128));
  assert.equal(password("e\u0301".repeat(15)), "e\u0301".repeat(15));
  assert.throws(() => login({ ...input(), role: "admin" }));
});
test("async scrypt uses reviewed cost, unique salts, safe comparisons and no plaintext storage", async () => {
  assert.deepEqual(PARAMETERS, { N: 131072, r: 8, p: 1, maxmem: 201326592 });
  const [first, second] = await Promise.all([hashPassword(syntheticPassword), hashPassword(syntheticPassword)]);
  assert.notEqual(first.salt, second.salt); assert.notEqual(first.hash, second.hash);
  assert.equal(JSON.stringify(first).includes(syntheticPassword), false);
  assert.equal(await verifyPassword(syntheticPassword, first), true);
  assert.equal(await verifyPassword(syntheticPassword + " ", first), false);
  assert.equal(await verifyPassword(syntheticPassword, { ...first, N: 1 }), false);
  assert.equal(await verifyPassword(syntheticPassword, null), false);
});
test("opaque tokens validate canonical base64url and store only digests", () => {
  const values = new Set(Array.from({ length: 100 }, token)); assert.equal(values.size, 100);
  for (const value of values) { assert.equal(validToken(value), true); assert.match(digest(value), /^[a-f0-9]{64}$/); assert.notEqual(digest(value), value); }
  for (const value of [null, "admin", "x".repeat(100), "a.b.c", "A".repeat(42) + "B", "A".repeat(43) + "="]) { assert.equal(validToken(value), false); assert.equal(digest(value), null); }
});
test("password worker queue rejects excess work instead of allocating unbounded memory", async () => {
  const attempts = await Promise.allSettled(Array.from({ length: 11 }, () => hashPassword(syntheticPassword)));
  assert.equal(attempts.filter(item => item.status === "fulfilled").length, 10);
  const rejected = attempts.filter(item => item.status === "rejected");
  assert.equal(rejected.length, 1); assert.equal(rejected[0].reason.code, "RATE_LIMITED");
});
test("absolute/idle boundaries, unknown dates, revocation, epoch and status fail closed", () => {
  const state = row(), now = +state.database_now;
  assert.equal(liveSession(state, now), true);
  assert.equal(liveSession(state, now + IDLE_MS - 1), true);
  assert.equal(liveSession(state, now + IDLE_MS), false);
  assert.equal(liveSession({ ...state, last_seen_at: new Date(now + ABSOLUTE_MS - 1) }, now + ABSOLUTE_MS), false);
  for (const extra of [{ status: "disabled" }, { status: "suspended" }, { revoked_at: new Date() }, { current_session_epoch: 1 }, { expires_at: null }, { created_at: "invalid" }, { last_seen_at: new Date(now + 1) }]) assert.equal(liveSession({ ...state, ...extra }, now), false);
});
for (const type of ["user", "merchant", "super_admin"]) test(`actual adapter, policy and navigation integrate ${type} default grants`, () => {
  const context = resolveContext(row(type));
  assert.equal(context.eligibility.approvalStatus, "approved"); assert.equal(context.eligibility.operationsEnabled, false);
  assert.equal(Object.isFrozen(context), true);
  assert.deepEqual(policy(context, "profile.view"), { tenantId: "development-a", ownerType: "principal", ownerId: "principal-a" });
  assert.ok(deriveNavigation(context).length);
  if (type !== "super_admin") assert.throws(() => policy(context, "users.approve"), { code: "FORBIDDEN" });
  assert.throws(() => policy(context, "ledger.adjust"), { code: "FORBIDDEN" });
});
test("stale session, mixed grants, missing records and forged privileges reject", () => {
  for (const extra of [{ session_permission_version: 0 }, { grant_version: 2 }, { current_permission_version: 2 }, { permissions: ["*"] }, { admin_scope: { tenantIds: ["other"] } }, { upi_approved: "true" }]) assert.throws(() => resolveContext({ ...row(), ...extra }), { code: "AUTH_FAILED" });
  const state = row(); delete state.initial_deposit_satisfied;
  // Adapter intentionally allows missing optional facts; they never become true.
  assert.notEqual(resolveContext(state).eligibility.initialDepositSatisfied, true);
  assert.throws(() => policy(resolveContext(row()), "users.view"), { code: "FORBIDDEN" });
});
test("same tenant is not ownership; admin scope is explicit", () => {
  for (const type of ["user", "merchant"]) {
    const context = resolveContext(row(type));
    assert.equal(authorize({ ...context, permissionId: "profile.view", context: { kind: "record", id: "other", tenantId: "development-a", ownerType: "principal", ownerId: "other" } }).allowed, false);
  }
  assert.deepEqual(policy(resolveContext(row("super_admin")), "users.view"), { tenantIds: ["development-a"] });
});
test("database configuration has no legacy fallback and requires exact target confirmation", () => {
  const secret = "never-print-this";
  for (const env of [{ DATABASE_URL: "postgres://unsafe" }, { WPAY_AUTH_DEV_DATABASE_URL: `postgres://operator:${secret}@127.0.0.1/dev` },
    { WPAY_AUTH_DEV_DATABASE_URL: `postgres://operator:${secret}@evil.invalid/dev`, WPAY_AUTH_DEV_ISOLATED_CONFIRM: "yes" }]) {
    assert.throws(() => readConfig(env), error => error.code === "UNAVAILABLE" && !String(error).includes(secret));
  }
  const config = readConfig({ WPAY_AUTH_DEV_DATABASE_URL: `postgres://operator:${secret}@127.0.0.1/wpay_test`, WPAY_AUTH_DEV_ISOLATED_CONFIRM: "127.0.0.1:5432/wpay_test" });
  assert.equal(config.database, "wpay_test"); assert.equal(config.ssl, false); assert.equal(config.max, 4);
  assert.equal(config.options, "-c search_path=pg_catalog");
});
test("Supabase target binding enforces project match, explicit confirmation and verified TLS", () => {
  const project = "nzbuvltvqxgtbmicjxag";
  const env = { WPAY_AUTH_DEV_DATABASE_URL: `postgres://postgres:synthetic@db.${project}.supabase.co:5432/postgres`,
    WPAY_AUTH_DEV_SUPABASE_PROJECT: project, WPAY_AUTH_DEV_ISOLATED_CONFIRM: `supabase:${project}` };
  assert.deepEqual(readConfig(env).ssl, { rejectUnauthorized: true });
  for (const url of [env.WPAY_AUTH_DEV_DATABASE_URL + "?sslmode=disable", env.WPAY_AUTH_DEV_DATABASE_URL.replace(":5432", ":6543"), env.WPAY_AUTH_DEV_DATABASE_URL.replace(project, "otherproject")]) assert.throws(() => readConfig({ ...env, WPAY_AUTH_DEV_DATABASE_URL: url }));
});
test("safe errors never echo database details or secret inputs", () => {
  const error = new Error("password=secret SQL SELECT connection cookie token hash");
  assert.deepEqual(publicError(error), { status: 503, body: { error: "UNAVAILABLE", message: "Development authentication is unavailable." } });
  assert.equal(publicError(new AuthError("AUTH_FAILED")).status, 401);
});
test("cookies reject duplicates, malformed values and ignore legacy authentication", () => {
  assert.deepEqual(readCookies("wpay_dashboard_session=legacy"), {});
  const value = token(); assert.equal(readCookies(`${SESSION_COOKIE}=${value}`)[SESSION_COOKIE], value);
  assert.throws(() => readCookies(`${SESSION_COOKIE}=${value}; ${SESSION_COOKIE}=${value}`));
  assert.throws(() => readCookies(`${SESSION_COOKIE}=admin`));
});
test("bootstrap secret input does not echo and restores terminal mode", async () => {
  const inputStream = new EventEmitter(); inputStream.isTTY = true; inputStream.isRaw = false;
  inputStream.setRawMode = value => { inputStream.isRaw = value; }; inputStream.resume = () => {}; inputStream.pause = () => {};
  let outputText = ""; const output = { isTTY: true, write: value => { outputText += value; } };
  const reading = readSecret("Hidden: ", inputStream, output);
  inputStream.emit("data", Buffer.from(syntheticPassword + "\r"));
  assert.equal(await reading, syntheticPassword); assert.equal(inputStream.isRaw, false); assert.equal(outputText, "Hidden: \n");
  const cancelled = readSecret("Hidden: ", inputStream, output); inputStream.emit("data", Buffer.from("secret\u0003"));
  await assert.rejects(cancelled); assert.equal(inputStream.isRaw, false); assert.equal(outputText.includes("secret"), false);
});
test("HTTP boundary test double: exact origins, CSRF, body limits, assets and safe failure", async t => {
  // A transport-only test double, not persistence or authentication acceptance.
  let calls = 0; const session = token(), challenge = token(), csrfCookie = token();
  const service = { csrf: async () => ({ cookie: csrfCookie, challenge }),
    checkCsrf: async (value, header) => { if (value !== csrfCookie || header !== challenge) throw new AuthError("CSRF_FAILED"); },
    login: async () => { calls++; return { stage: "authenticated", sessionToken: session }; }, register: async () => { calls++; return { registered: true }; },
    authenticated: async () => { throw new Error("connection password secret"); } };
  const server = await startAuthServer({ service, port: 0 });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`, url = origin + "/wpay-auth/";
  async function post(route, body = "{}", headers = {}) { return fetch(url + route, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body }); }
  const html = await fetch(url); assert.equal(html.status, 200); assert.match(await html.text(), /data-i18n="development"/); assert.equal(html.headers.get("access-control-allow-origin"), null);
  for (const route of ["../package.json", "app.js?extra=1", "me?accountId=other", "bootstrap", "source.js"]) assert.ok((await fetch(url + route)).status >= 400);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { Host: "foreign.invalid" } }, response => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await post("csrf", "{}", { Origin: "http://127.0.0.1:1" })).status, 403);
  assert.equal((await fetch(url + "csrf", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403);
  assert.equal((await post("login")).status, 403); assert.equal(calls, 0);
  assert.equal((await post("login", "x".repeat(4097))).status, 413); assert.equal(calls, 0);
  const csrf = await post("csrf"); assert.equal(csrf.status, 200);
  assert.equal((await csrf.json()).csrfToken, challenge);
  const result = await post("login", "{}", { Cookie: `${CSRF_COOKIE}=${csrfCookie}`, "X-WPay-CSRF-Token": challenge });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { stage: "authenticated" });
  assert.equal(calls, 1); const cookies = result.headers.getSetCookie();
  assert.match(cookies[0], /HttpOnly; SameSite=Strict/); assert.match(cookies[0], /Path=\/wpay-auth\//); assert.doesNotMatch(cookies[0], /Domain=/);
  const failure = await fetch(url + "me", { headers: { Cookie: `${SESSION_COOKIE}=${session}` } });
  assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /password|secret|connection/);
});
