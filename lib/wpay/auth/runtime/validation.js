"use strict";
const { AuthError } = require("./errors");
function exactFields(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !fields.includes(key)) ||
      fields.some(key => !Object.getOwnPropertyDescriptor(value, key)?.hasOwnProperty("value"))) throw new AuthError("INVALID_INPUT");
  return value;
}
function passwordInput(value) {
  if (typeof value !== "string" || !value.isWellFormed() || [...value].length < 8 ||
      [...value].length > 128 || Buffer.byteLength(value, "utf8") > 512) throw new AuthError("INVALID_INPUT");
  return value;
}
function password(value, accountType) {
  passwordInput(value);
  if (["user", "merchant"].includes(accountType)) {
    if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[\p{P}\p{S}]/u.test(value)) throw new AuthError("INVALID_INPUT");
  } else if ([...value].length < 15) throw new AuthError("INVALID_INPUT");
  return value;
}
function email(value) {
  if (typeof value !== "string" || value.length > 254) throw new AuthError("INVALID_INPUT");
  const canonical = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(canonical) ||
      canonical.split("@")[0].length > 64 || canonical.includes("..")) throw new AuthError("INVALID_INPUT");
  return canonical;
}
function name(value) {
  if (typeof value !== "string" || !value.isWellFormed() || value.trim().length < 2 ||
      [...value.trim()].length > 100 || /[\p{Cc}\p{Cf}]/u.test(value)) throw new AuthError("INVALID_INPUT");
  return value.trim();
}
function registration(value) {
  exactFields(value, ["name", "email", "password", "accountType"]);
  if (!["user", "merchant"].includes(value.accountType)) throw new AuthError("INVALID_INPUT");
  return { name: name(value.name), email: email(value.email), password: password(value.password, value.accountType), accountType: value.accountType };
}
function login(value) {
  exactFields(value, ["email", "password"]);
  return { email: email(value.email), password: passwordInput(value.password) };
}
module.exports = { exactFields, password, passwordInput, email, name, registration, login };
