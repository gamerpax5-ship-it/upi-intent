"use strict";
const { randomUUID, createHash } = require("node:crypto");
const { isIP } = require("node:net");
const { transaction } = require("./migrations");
const { AuthError } = require("../auth/runtime/errors");
const { CSRF_MS } = require("../auth/runtime/tokens");
const TENANT = "wpay-auth-development";
const SNAPSHOT = `SELECT a.id,a.subject_id,a.tenant_id,a.account_type,a.status,a.user_id,a.merchant_id,
  a.permission_version AS current_permission_version,a.session_epoch AS current_session_epoch,
  g.permission_version AS grant_version,g.permissions,g.admin_scope,e.*,
  s.permission_version AS session_permission_version,s.session_epoch,s.created_at,s.last_seen_at,s.expires_at,s.revoked_at,
  z.enabled AS mfa_enabled,z.security_version,z.factor_version,z.encrypted_secret,z.last_used_step,z.attempts AS security_attempts,z.attempt_window,
  s.auth_method,s.password_at,s.mfa_at,s.security_version AS session_security_version,s.factor_version AS session_factor_version,
  CURRENT_TIMESTAMP AS database_now
  FROM wpay_auth.sessions s JOIN wpay_auth.accounts a ON a.id=s.account_id
  JOIN wpay_auth.grants g ON g.account_id=a.id JOIN wpay_auth.eligibility e ON e.account_id=a.id
  JOIN wpay_auth.account_security z ON z.account_id=a.id
  WHERE s.token_digest=$1 FOR UPDATE OF a,g,e,s,z`;
async function audit(client, event, accountId = null) {
  await client.query("INSERT INTO wpay_auth.audit_events(id,account_id,event) VALUES ($1,$2,$3)", [randomUUID(), accountId, event]);
}
class AuthRepository {
  constructor(pool, { throttleMode = "loopback" } = {}) {
    if (!["loopback", "hosted"].includes(throttleMode)) throw new AuthError("UNAVAILABLE");
    this.pool = pool; this.throttleMode = throttleMode;
  }
  async snapshot(client, tokenDigest) { return (await client.query(SNAPSHOT, [tokenDigest])).rows[0]; }
  async throttle(operation, ip) {
    const limits = { register: [20, 3600], login: [40, 900], csrf: [120, 900] };
    const allowedPeer = this.throttleMode === "hosted" ? typeof ip === "string" && isIP(ip) !== 0 : ["127.0.0.1", "::ffff:127.0.0.1"].includes(ip);
    if (!Object.hasOwn(limits, operation) || !allowedPeer) throw new AuthError("FORBIDDEN");
    const [limit, seconds] = limits[operation];
    // Railway peers are proxies, not end-user identities. Use one conservative
    // hosted bucket; forwarded headers never select or reset a rate limit.
    const bucket = operation + ":" + createHash("sha256").update(this.throttleMode === "hosted" ? "hosted-aggregate" : "loopback").digest("hex");
    const result = await this.pool.query(`INSERT INTO wpay_auth.throttles(bucket,window_start,attempts) VALUES ($1,CURRENT_TIMESTAMP,1)
      ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN wpay_auth.throttles.window_start <= CURRENT_TIMESTAMP-($2*interval '1 second') THEN 1 ELSE LEAST(wpay_auth.throttles.attempts+1,$3+1) END,
      window_start=CASE WHEN wpay_auth.throttles.window_start <= CURRENT_TIMESTAMP-($2*interval '1 second') THEN CURRENT_TIMESTAMP ELSE wpay_auth.throttles.window_start END
      RETURNING attempts`, [bucket, seconds, limit]);
    if (result.rows[0].attempts > limit) throw new AuthError("RATE_LIMITED");
  }
  async createAccount(input, passwordRecord, permissions, bootstrap = false) {
    return transaction(this.pool, async client => {
      if (bootstrap) {
        await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [57415906]);
        const prior = await client.query("SELECT 1 FROM wpay_auth.bootstrap_state UNION ALL SELECT 1 FROM wpay_auth.accounts WHERE account_type=$1", ["super_admin"]);
        if (prior.rowCount) throw new AuthError("REGISTRATION_FAILED");
      }
      const id = randomUUID(), subject = randomUUID();
      const type = bootstrap ? "super_admin" : input.accountType;
      await client.query(`INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,user_id,merchant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, subject, TENANT, input.name, input.email, type, type === "user" ? randomUUID() : null, type === "merchant" ? randomUUID() : null]);
      await client.query("INSERT INTO wpay_auth.credentials(account_id,password_record) VALUES ($1,$2)", [id, JSON.stringify(passwordRecord)]);
      await client.query("INSERT INTO wpay_auth.grants(account_id,permission_version,permissions,admin_scope) VALUES ($1,1,$2,$3)",
        [id, permissions, bootstrap ? JSON.stringify({ tenantIds: [TENANT], platform: true }) : null]);
      await client.query("INSERT INTO wpay_auth.eligibility(account_id) VALUES ($1)", [id]);
      await client.query("INSERT INTO wpay_auth.account_security(account_id) VALUES ($1)", [id]);
      await client.query("INSERT INTO wpay_auth.preferences(account_id) VALUES ($1)", [id]);
      if (bootstrap) await client.query("INSERT INTO wpay_auth.bootstrap_state(singleton,account_id) VALUES (true,$1)", [id]);
      await audit(client, bootstrap ? "bootstrap" : "registered", id);
      return id;
    });
  }
  async credential(email) {
    const result = await this.pool.query(`SELECT a.id,a.status,c.password_record FROM wpay_auth.accounts a
      JOIN wpay_auth.credentials c ON c.account_id=a.id WHERE a.email=$1`, [email]);
    return result.rows[0] || null;
  }
  async failedLogin() { await audit(this.pool, "login_failed"); }
  async withSession(digest, action) {
    const invoke = () => transaction(this.pool, async client => {
      // One snapshot even if a row lock waits for a concurrent grant/revocation
      // writer. Every retry obtains and validates a fresh session snapshot.
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const result = await client.query(SNAPSHOT, [digest]);
      if (!result.rows[0]) throw new AuthError("AUTH_FAILED");
      return action(client, result.rows[0]);
    });
    // The callback contains transactional writes and bounded read-only evidence
    // lookups. External delivery/execution belongs outside this boundary.
    // Retry only fully rolled-back database conflicts, never authentication or
    // provider failures, and never rerun an action with the previous principal.
    for(let attempt=0;;attempt++){
      try{return await invoke();}
      catch(error){if(!['40001','40P01'].includes(error.code)||attempt>=2)throw error;}
    }
  }
  async ownSummary(client, where) {
    if (where.ownerType !== "principal" || !where.ownerId || !where.tenantId) throw new AuthError("FORBIDDEN");
    const result = await client.query(`SELECT a.id,a.name,a.email,a.account_type AS "accountType",a.status,
      e.approval_status AS "approvalStatus", e.operations_enabled AS "operationsEnabled"
      FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id
      WHERE a.id=$1 AND a.tenant_id=$2`, [where.ownerId, where.tenantId]);
    if (result.rowCount !== 1) throw new AuthError("AUTH_FAILED");
    const locale = await client.query("SELECT locale FROM wpay_auth.preferences WHERE account_id=$1", [where.ownerId]);
    return { ...result.rows[0], emailOwnershipVerified: false, locale: locale.rows[0]?.locale || "en" };
  }
  async pending(client, where, type, offset) {
    if (!Array.isArray(where.tenantIds) || !where.tenantIds.length || !["user", "merchant"].includes(type)) throw new AuthError("FORBIDDEN");
    const result = await client.query(`SELECT a.id,a.name,a.email,a.account_type AS "accountType",a.created_at AS "createdAt",e.approval_status AS "approvalStatus"
      FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id
      WHERE a.tenant_id=ANY($1::text[]) AND a.account_type=$2 AND e.approval_status=$3
      ORDER BY a.created_at,a.id LIMIT 101 OFFSET $4`, [where.tenantIds, type, "pending", offset]);
    return { accounts: result.rows.slice(0, 100), nextOffset: result.rowCount > 100 ? offset + 100 : null };
  }
  async revoke(client, row, digest, all) {
    if (all) await client.query("UPDATE wpay_auth.accounts SET session_epoch=session_epoch+1 WHERE id=$1", [row.id]);
    else await client.query("UPDATE wpay_auth.sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_digest=$1", [digest]);
    await audit(client, all ? "logout_all" : "logout", row.id);
  }
  async touch(client, digest) { await client.query("UPDATE wpay_auth.sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_digest=$1", [digest]); }
  async issueCsrf(cookieDigest, tokenDigest, sessionDigest) {
    // Cleanup is confined to ephemeral records in this new schema, on POST only.
    await transaction(this.pool, async client => {
      await client.query("DELETE FROM wpay_auth.csrf_challenges WHERE expires_at<=CURRENT_TIMESTAMP");
      await client.query("INSERT INTO wpay_auth.csrf_challenges(cookie_digest,token_digest,session_digest,expires_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP+($4*interval '1 millisecond'))",
        [cookieDigest, tokenDigest, sessionDigest, CSRF_MS]);
    });
  }
  async checkCsrf(cookieDigest, tokenDigest, sessionDigest) {
    const result = await this.pool.query(`SELECT 1 FROM wpay_auth.csrf_challenges WHERE cookie_digest=$1 AND token_digest=$2
      AND session_digest IS NOT DISTINCT FROM $3 AND expires_at>CURRENT_TIMESTAMP`, [cookieDigest, tokenDigest, sessionDigest]);
    if (result.rowCount !== 1) throw new AuthError("CSRF_FAILED");
  }
}
module.exports = { AuthRepository, TENANT };
