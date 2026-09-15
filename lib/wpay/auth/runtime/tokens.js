"use strict";
const { randomBytes, createHash } = require("node:crypto");
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const CSRF_MS = 15 * 60 * 1000;
const token = () => randomBytes(32).toString("base64url");
const validToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
function digest(value) { return validToken(value) ? createHash("sha256").update(value).digest("hex") : null; }
function liveSession(row, now) {
  const clock = Number(now), created = Number(new Date(row?.created_at)), last = Number(new Date(row?.last_seen_at)), expires = Number(new Date(row?.expires_at));
  return !!row && [clock, created, last, expires].every(Number.isFinite) && created <= clock && last <= clock &&
    expires === created + ABSOLUTE_MS && clock < expires && clock - last < IDLE_MS &&
    row.revoked_at === null && row.status === "active" && Number.isSafeInteger(row.session_epoch) &&
    row.session_epoch === row.current_session_epoch;
}
module.exports = { token, validToken, digest, liveSession, ABSOLUTE_MS, IDLE_MS, CSRF_MS };
