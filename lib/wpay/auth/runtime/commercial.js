"use strict";
const { createHash, timingSafeEqual } = require("node:crypto");
const { exactFields } = require("./validation");
const { AuthError } = require("./errors");
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function decimal(value, { positive = false, percentage = false } = {}) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/.test(value)) throw new AuthError("INVALID_INPUT");
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if ((positive && units === 0n) || (percentage && units > 100000000n)) throw new AuthError("INVALID_INPUT");
  const trimmed = fraction.replace(/0+$/, "");
  return whole + (trimmed ? "." + trimmed : "");
}
function address(network, value) {
  if (typeof value !== "string") throw new AuthError("INVALID_INPUT");
  if (network === "ETHEREUM-ERC20" && /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value)) return value;
  if (network === "TRON-TRC20" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let decoded = 0n;
    for (const char of value) decoded = decoded * 58n + BigInt(alphabet.indexOf(char));
    const bytes = Buffer.from(decoded.toString(16).padStart(50, "0"), "hex");
    const sha = bytes => createHash("sha256").update(bytes).digest();
    if (bytes.length === 25 && bytes[0] === 0x41 && !bytes.subarray(1, 21).equals(Buffer.alloc(20)) &&
        timingSafeEqual(sha(sha(bytes.subarray(0, 21))).subarray(0, 4), bytes.subarray(21))) return value;
  }
  throw new AuthError("INVALID_INPUT");
}
function commercial(type, input, fixedCurrency) {
  if (type === "user") {
    exactFields(input, ["payinCommission", "payoutCommission", "inrPerUsdt", "depositNetwork", "depositAddress"]);
    return { payinCommission: decimal(input.payinCommission, { percentage: true }), payoutCommission: decimal(input.payoutCommission, { percentage: true }),
      inrPerUsdt: decimal(input.inrPerUsdt, { positive: true }), depositNetwork: input.depositNetwork, depositAddress: address(input.depositNetwork, input.depositAddress) };
  }
  if (type === "merchant") {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new AuthError("INVALID_INPUT");
    const required=["payinFee","payoutFee","fixedPayoutFee","fixedFeeCurrency"],optional=["paymentLinkTtlSeconds","inrPerUsdt"];
    if(required.some(key=>!Object.hasOwn(input,key))||Object.keys(input).some(key=>![...required,...optional].includes(key)))throw new AuthError("INVALID_INPUT");
    if (!["INR", "USD", "USDT"].includes(fixedCurrency)) throw new AuthError("UNAVAILABLE");
    if (input.fixedFeeCurrency !== fixedCurrency) throw new AuthError("INVALID_INPUT");
    const out={ payinFee: decimal(input.payinFee, { percentage: true }), payoutFee: decimal(input.payoutFee, { percentage: true }),
      fixedPayoutFee: decimal(input.fixedPayoutFee), fixedFeeCurrency: fixedCurrency };
    if(input.paymentLinkTtlSeconds!==undefined&&input.paymentLinkTtlSeconds!==""){const ttl=Number(input.paymentLinkTtlSeconds);if(!Number.isInteger(ttl)||ttl<30||ttl>900)throw new AuthError("INVALID_INPUT");out.paymentLinkTtlSeconds=ttl;}
    if(input.inrPerUsdt!==undefined&&input.inrPerUsdt!=="")out.inrPerUsdt=decimal(input.inrPerUsdt,{positive:true});
    return out;
  }
  throw new AuthError("FORBIDDEN");
}
function approvalRequest(input) {
  exactFields(input, ["requestId", "accountId", "decision", "settings", "reason"]);
  if (!uuid(input.requestId) || !uuid(input.accountId) || !["approve", "reject"].includes(input.decision) || typeof input.reason !== "string" || input.reason.length > 500 || /[\p{Cc}\p{Cf}]/u.test(input.reason)) throw new AuthError("INVALID_INPUT");
  if (input.decision === "reject" && (input.settings !== null || input.reason.trim().length < 3)) throw new AuthError("INVALID_INPUT");
  if (input.decision === "approve" && input.reason !== "") throw new AuthError("INVALID_INPUT");
  return input;
}
module.exports = { decimal, address, commercial, approvalRequest, uuid };
