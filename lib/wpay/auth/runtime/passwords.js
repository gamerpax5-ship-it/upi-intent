"use strict";
const { scrypt, randomBytes, timingSafeEqual } = require("node:crypto");
const { password, passwordInput } = require("./validation");
const { AuthError } = require("./errors");
const PARAMETERS = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
let running = 0;
const queue = [];
async function acquire() {
  if (running < 2) { running++; return; }
  if (queue.length >= 8) throw new AuthError("RATE_LIMITED");
  await new Promise(resolve => queue.push(resolve));
}
function release() { const next = queue.shift(); if (next) next(); else running--; }
async function derive(value, salt) {
  await acquire();
  try { return await new Promise((resolve, reject) => scrypt(value, salt, 32, PARAMETERS, (error, key) => error ? reject(new AuthError("UNAVAILABLE")) : resolve(key))); }
  finally { release(); }
}
function validRecord(record) {
  return record && record.algorithm === "scrypt" && record.version === 1 && record.N === PARAMETERS.N &&
    record.r === 8 && record.p === 1 && typeof record.salt === "string" && /^[0-9a-f]{32}$/.test(record.salt) &&
    typeof record.hash === "string" && /^[0-9a-f]{64}$/.test(record.hash);
}
async function hashPassword(value, accountType) {
  password(value, accountType);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(value, Buffer.from(salt, "hex"));
  try { return { algorithm: "scrypt", version: 1, N: PARAMETERS.N, r: 8, p: 1, salt, hash: key.toString("hex") }; }
  finally { key.fill(0); }
}
async function verifyPassword(value, record) {
  passwordInput(value);
  const valid = validRecord(record);
  // Unknown accounts still incur the same expensive primitive; no reusable credential.
  const key = await derive(value, Buffer.from(valid ? record.salt : "00".repeat(16), "hex"));
  const expected = Buffer.from(valid ? record.hash : "00".repeat(32), "hex");
  try { return timingSafeEqual(key, expected) && valid; }
  finally { key.fill(0); expected.fill(0); }
}
module.exports = { PARAMETERS, validRecord, hashPassword, verifyPassword };
