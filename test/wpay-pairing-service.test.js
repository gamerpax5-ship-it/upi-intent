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
