"use strict";
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require("node:crypto");
const { AuthError } = require("./errors");
function readKey(env = process.env) {
  const value = env.WPAY_AUTH_DEV_MFA_KEY;
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new AuthError("UNAVAILABLE");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new AuthError("UNAVAILABLE");
  return key;
}
class MfaCrypto {
  constructor(key, { issuer = "WPay Development" } = {}) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new AuthError("UNAVAILABLE");
    this.key = Buffer.from(key);
    if (!["WPay Development","WPay"].includes(issuer)) throw new AuthError("UNAVAILABLE");
    this.issuer = issuer;
    this.keyId = createHash("sha256").update(key).digest("hex").slice(0, 24);
  }
  seal(secret, binding) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(binding));
    const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return { v: 1, keyId: this.keyId, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
  }
  open(record, binding) {
    try {
      if (record?.v !== 1 || record.keyId !== this.keyId) throw 0;
      const iv = Buffer.from(record.iv, "base64"), tag = Buffer.from(record.tag, "base64");
      if (iv.length !== 12 || tag.length !== 16) throw 0;
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(record.data, "base64")), decipher.final()]).toString("utf8");
    } catch { throw new AuthError("UNAVAILABLE"); }
  }
  libraries() { try { return require("./dependencies").load(); } catch { throw new AuthError("UNAVAILABLE"); } }
  newSecret() { return this.libraries().otp.generateSecret(); }
  async verify(secret, code, now, afterTimeStep) {
    if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) return null;
    const { otp } = this.libraries();
    const result = await otp.verify({ secret, token: code, digits: 6, period: 30, algorithm: "sha1",
      epoch: Math.floor(Number(now) / 1000), epochTolerance: [30, 0],
      ...(afterTimeStep === null || afterTimeStep === undefined ? {} : { afterTimeStep }) });
    return result.valid && Number.isSafeInteger(result.timeStep) ? result.timeStep : null;
  }
  async setup(secret, accountId) {
    const { otp, qr } = this.libraries();
    const uri = otp.generateURI({ issuer: this.issuer, label: accountId, secret, digits: 6, period: 30, algorithm: "sha1" });
    return { setupKey: secret, qrDataUrl: await qr.toDataURL(uri, { errorCorrectionLevel: "M", scale: 4, margin: 4 }) };
  }
}
const recoveryDigest = code => typeof code === "string" && /^[0-9a-f]{32}$/.test(code) ? createHash("sha256").update("wpay-recovery-v1:" + code).digest("hex") : null;
function recoveryCodes() { return Array.from({ length: 10 }, () => randomBytes(16).toString("hex")); }
function approvalAllows(row) { return row?.status === "active" && ["user", "merchant", "admin", "super_admin", "employee"].includes(row.account_type) && (!["user", "merchant"].includes(row.account_type) || row.approval_status === "approved"); }
function fullAssurance(row) {
  if (!row) return false;
  const now = +new Date(row.database_now), mfaAt = +new Date(row.mfa_at);
  return approvalAllows(row) && row.mfa_enabled === true && row.mfa_at !== null && Number.isFinite(mfaAt) && mfaAt <= now &&
    Number.isSafeInteger(row.security_version) && row.security_version > 0 && Number.isSafeInteger(row.factor_version) && row.factor_version > 0 &&
    row.session_security_version === row.security_version && row.session_factor_version === row.factor_version;
}
module.exports = { readKey, MfaCrypto, recoveryCodes, recoveryDigest, approvalAllows, fullAssurance };
