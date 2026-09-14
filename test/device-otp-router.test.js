const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const otpModule = require("../lib/device-otp-router");

const source = fs.readFileSync(path.join(__dirname, "..", "lib", "device-otp-router.js"), "utf8");

test("OTP router stores the full code and the raw SMS message", () => {
  assert.equal(source.includes("const otpCode = String(req.body?.otpCode || \"\")"), true);
  assert.equal(source.includes("const codeMask = otpCode || \"\""), true);
  assert.equal(source.includes("String(req.body?.messageMasked || \"\").trim().slice(0, 1000)"), true);
});

test("OTP router validates the code and the required length", () => {
  assert.equal(source.includes("req.body?.otpCode"), true);
  assert.equal(source.includes("req.body?.otpLength"), true);
  assert.equal(source.includes("OTP code is invalid"), true);
  assert.equal(source.includes("OTP length is required"), true);
});

test("OTP dashboard returns the stored full code and raw message", () => {
  assert.equal(source.includes("code_mask as otp_code"), true);
  assert.equal(source.includes("select id,sender,code_mask as otp_code"), true);
  assert.equal(source.includes("message_masked,source,sms_received_at,created_at"), true);
});

test("OTP event hash separates different codes sent by the same sender at the same time", () => {
  assert.equal(source.includes("received.toISOString(), source, otpCode].join"), true);
});

test("OTP router exports the required runtime functions without masking helpers", () => {
  assert.equal(typeof otpModule.initDeviceOtpTables, "function");
  assert.equal(typeof otpModule.createDeviceOtpRouter, "function");
  assert.equal(typeof otpModule.createDeviceOtpRouter({ pool: null }), "function");
  assert.equal(otpModule.sanitizeMaskedMessage, undefined);
});
