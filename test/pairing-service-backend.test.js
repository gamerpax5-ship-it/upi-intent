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
