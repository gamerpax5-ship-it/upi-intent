"use strict";
const { randomUUID, createHash } = require("node:crypto");
const { AuthRepository } = require("./auth-repository");
const { transaction } = require("./migrations");
const { AuthError } = require("../auth/runtime/errors");
const { approvalAllows } = require("../auth/runtime/mfa");
const { ABSOLUTE_MS } = require("../auth/runtime/tokens");
const credentialFingerprint = record => createHash("sha256").update(JSON.stringify(record)).digest("hex");
const ACCOUNT = `SELECT a.*,e.approval_status,c.password_record,z.security_version,z.factor_version,z.enabled AS mfa_enabled,
 z.encrypted_secret,z.last_used_step,z.attempts AS security_attempts,z.attempt_window,CURRENT_TIMESTAMP AS database_now
 FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id
 JOIN wpay_auth.credentials c ON c.account_id=a.id JOIN wpay_auth.account_security z ON z.account_id=a.id`;
async function securityAudit(client, actor, account, event, reason = null) {
  await client.query("INSERT INTO wpay_auth.security_audit(id,actor_id,account_id,event,reason) VALUES ($1,$2,$3,$4,$5)", [randomUUID(),actor,account,event,reason]);
}
class SecurityRepository extends AuthRepository {
  async credential(email) { return (await this.pool.query(ACCOUNT + " WHERE a.email=$1", [email])).rows[0] || null; }
  async lockedAccount(client, id) {
    const row = (await client.query(ACCOUNT + " WHERE a.id=$1 FOR UPDATE OF a,e,c,z", [id])).rows[0];
    if (!row || !approvalAllows(row)) throw new AuthError("AUTH_FAILED");
    return row;
  }
  async issueChallenge(client, row, tokenDigest, purpose, candidate = null, recoveryHashes = null, lastStep = null) {
    await client.query(`INSERT INTO wpay_auth.mfa_challenges(token_digest,account_id,purpose,session_epoch,permission_version,security_version,factor_version,candidate,recovery_hashes,last_step,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP+interval '5 minutes')`,
      [tokenDigest,row.id,purpose,row.session_epoch,row.permission_version,row.security_version,row.factor_version,candidate ? JSON.stringify(candidate) : null,recoveryHashes,lastStep]);
  }
  async startChallenge(accountId, expectedPassword, action) {
    return transaction(this.pool, async client => {
      const row = await this.lockedAccount(client, accountId);
      if (credentialFingerprint(row.password_record) !== credentialFingerprint(expectedPassword)) throw new AuthError("AUTH_FAILED");
      const count = await client.query("SELECT count(*)::integer AS count FROM wpay_auth.mfa_challenges WHERE account_id=$1 AND expires_at>CURRENT_TIMESTAMP AND consumed_at IS NULL", [row.id]);
      if (count.rows[0].count >= 5) throw new AuthError("RATE_LIMITED");
      return action(client,row);
    });
  }
  async withChallenge(tokenDigest, action) {
    return transaction(this.pool, async client => {
      const identity = (await client.query("SELECT account_id FROM wpay_auth.mfa_challenges WHERE token_digest=$1", [tokenDigest])).rows[0];
      if (!identity) throw new AuthError("MFA_FAILED");
      const row = await this.lockedAccount(client, identity.account_id);
      const challenge = (await client.query("SELECT * FROM wpay_auth.mfa_challenges WHERE token_digest=$1 FOR UPDATE", [tokenDigest])).rows[0];
      if (!challenge || challenge.consumed_at || +challenge.expires_at <= +row.database_now || challenge.attempts >= 5 ||
          challenge.session_epoch !== row.session_epoch || challenge.permission_version !== row.permission_version ||
          challenge.security_version !== row.security_version || challenge.factor_version !== row.factor_version) throw new AuthError("MFA_FAILED");
      return action(client,row,challenge);
    });
  }
  async attempt(client, row, challenge) {
    const expired = +row.database_now - +row.attempt_window >= 900000;
    if (!expired && row.security_attempts >= 10) return false;
    await client.query("UPDATE wpay_auth.account_security SET attempts=$2,attempt_window=$3 WHERE account_id=$1", [row.id,expired ? 1 : row.security_attempts+1,expired ? row.database_now : row.attempt_window]);
    if (challenge) await client.query("UPDATE wpay_auth.mfa_challenges SET attempts=attempts+1 WHERE token_digest=$1", [challenge.token_digest]);
    return true;
  }
  async consume(client, challenge) { await client.query("UPDATE wpay_auth.mfa_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE token_digest=$1 AND consumed_at IS NULL", [challenge.token_digest]); }
  async acceptStep(client, row, step) {
    const result = await client.query("UPDATE wpay_auth.account_security SET last_used_step=$2 WHERE account_id=$1 AND (last_used_step IS NULL OR last_used_step<$2)", [row.id,step]);
    if (result.rowCount !== 1) throw new AuthError("MFA_FAILED");
  }
  async promote(client, row, sessionDigest, validate, verifiedAt = row.database_now) {
    if (!approvalAllows(row) || !row.mfa_enabled || !row.factor_version) throw new AuthError("MFA_FAILED");
    await client.query(`INSERT INTO wpay_auth.sessions(token_digest,account_id,permission_version,session_epoch,created_at,last_seen_at,expires_at,mfa_at,security_version,factor_version)
      VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+($5*interval '1 millisecond'),$8,$6,$7)`,
      [sessionDigest,row.id,row.permission_version,row.session_epoch,ABSOLUTE_MS,row.security_version,row.factor_version,verifiedAt]);
    if (typeof validate !== "function") throw new AuthError("MFA_FAILED");
    validate(await this.snapshot(client, sessionDigest));
    await securityAudit(client,row.id,row.id,"mfa_session_issued");
  }
  async replaceRecovery(client, row, hashes) {
    await client.query("UPDATE wpay_auth.recovery_codes SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP) WHERE account_id=$1", [row.id]);
    for (const hash of hashes) await client.query("INSERT INTO wpay_auth.recovery_codes(account_id,code_digest,factor_version) VALUES($1,$2,$3)", [row.id,hash,row.factor_version]);
  }
  async securitySummary(client, row, currentDigest) {
    const sessions = await client.query(`SELECT created_at AS "createdAt",last_seen_at AS "lastSeenAt",expires_at AS "expiresAt",token_digest=$2 AS current
      FROM wpay_auth.sessions WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP
      AND last_seen_at>CURRENT_TIMESTAMP-interval '30 minutes' AND session_epoch=$3 AND security_version=$4 AND factor_version=$5 AND mfa_at IS NOT NULL
      ORDER BY created_at DESC LIMIT 100`, [row.id,currentDigest,row.current_session_epoch,row.security_version,row.factor_version]);
    return { enabled: row.mfa_enabled, sessions: sessions.rows };
  }
}
module.exports = { SecurityRepository, securityAudit, credentialFingerprint };
