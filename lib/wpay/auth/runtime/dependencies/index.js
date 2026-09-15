"use strict";
const path = require("node:path");
// Exact local package boundary: never resolve a root/transitive substitute.
function load() {
  const otp = require(path.join(__dirname, "node_modules/otplib"));
  const qr = require(path.join(__dirname, "node_modules/qrcode"));
  if (typeof otp.verify !== "function" || typeof otp.generateSecret !== "function" || typeof qr.toDataURL !== "function") throw new Error("WPAY_MFA_DEPENDENCIES_UNAVAILABLE");
  return { otp, qr };
}
module.exports = { load };
