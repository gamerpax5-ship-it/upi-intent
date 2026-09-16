"use strict";
const { token, digest } = require("./tokens");
const { AuthError } = require("./errors");
const { exactFields, password } = require("./validation");
const { verifyPassword } = require("./passwords");
const { recoveryCodes, recoveryDigest } = require("./mfa");
const { securityAudit } = require("../../db/security-repository");
const { requireRole } = require('./role-entry');
const candidateBinding = (row, tokenDigest) => `wpay-candidate:${row.id}:${tokenDigest}`;
const factorBinding = row => `wpay-factor:${row.id}:${row.factor_version}`;
class MfaService {
  constructor(repository, crypto, validate) { this.repository = repository; this.crypto = crypto; this.validate = validate; }
  ready() { if (!this.crypto) throw new AuthError("UNAVAILABLE"); this.crypto.libraries(); }
  async newChallenge(client, row, purpose) {
    this.ready();
    const challengeToken = token(), tokenDigest = digest(challengeToken);
    const candidate = purpose === "login" ? null : this.crypto.seal(this.crypto.newSecret(), candidateBinding(row, tokenDigest));
    await this.repository.issueChallenge(client,row,tokenDigest,purpose,candidate);
    return { challengeToken, stage: purpose === "login" ? "challenge" : "enroll" };
  }
  async begin(account,entryRole) {
    this.ready();
    return this.repository.startChallenge(account.id, account.password_record, (client,row) => {requireRole(row,entryRole);return this.newChallenge(client,row,row.mfa_enabled ? "login" : "enroll");});
  }
  async challenge(rawToken, operation, body, entryRole) {
    this.ready();
    const tokenDigest = digest(rawToken); if (!tokenDigest) throw new AuthError("MFA_FAILED");
    const result = await this.repository.withChallenge(tokenDigest, async (client,row,challenge) => {
      requireRole(row,entryRole);
      if (operation === "setup") {
        exactFields(body, []);
        if (!["enroll","replace","recovery"].includes(challenge.purpose)) throw new AuthError("MFA_FAILED");
        return { stage: "enroll", ...await this.crypto.setup(this.crypto.open(challenge.candidate,candidateBinding(row,tokenDigest)),row.id) };
      }
      if (operation === "complete") {
        exactFields(body, ["saved"]);
        if (body.saved !== true || challenge.purpose !== "complete" || !challenge.recovery_hashes?.length || !challenge.verified_at) throw new AuthError("MFA_FAILED");
        const secret = this.crypto.open(challenge.candidate,candidateBinding(row,tokenDigest));
        const next = { ...row, factor_version: row.factor_version+1, security_version: row.security_version+1, session_epoch: row.session_epoch+1, mfa_enabled: true };
        const sealed = this.crypto.seal(secret,factorBinding(next));
        await client.query("UPDATE wpay_auth.account_security SET enabled=true,encrypted_secret=$2,factor_version=$3,security_version=$4,last_used_step=$5 WHERE account_id=$1",
          [row.id,JSON.stringify(sealed),next.factor_version,next.security_version,challenge.last_step]);
        await client.query("UPDATE wpay_auth.accounts SET session_epoch=$2 WHERE id=$1", [row.id,next.session_epoch]);
        await this.repository.replaceRecovery(client,next,challenge.recovery_hashes);
        await this.repository.consume(client,challenge);
        const sessionToken = token(); await this.repository.promote(client,next,digest(sessionToken),this.validate,challenge.verified_at);
        await securityAudit(client,row.id,row.id,"factor_confirmed");
        return { stage: "authenticated", sessionToken };
      }
      if (operation === "recover") {
        exactFields(body, ["recoveryCode"]);
        if (challenge.purpose !== "login" || !row.mfa_enabled) throw new AuthError("MFA_FAILED");
        if (!await this.repository.attempt(client,row,challenge)) return { failure: "RATE_LIMITED" };
        const codeDigest = recoveryDigest(body.recoveryCode);
        const used = await client.query("UPDATE wpay_auth.recovery_codes SET consumed_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND code_digest=$2 AND factor_version=$3 AND consumed_at IS NULL RETURNING account_id", [row.id,codeDigest,row.factor_version]);
        if (used.rowCount !== 1) return { failure: "MFA_FAILED" };
        const next = await this.revokeEpoch(client,row);
        await client.query("UPDATE wpay_auth.recovery_codes SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP) WHERE account_id=$1", [row.id]);
        await this.repository.consume(client,challenge);
        await securityAudit(client,row.id,row.id,"recovery_started");
        return this.newChallenge(client,next,"recovery");
      }
      if (operation !== "verify") throw new AuthError("NOT_FOUND");
      exactFields(body, ["code"]);
      if (challenge.purpose === "complete") throw new AuthError("MFA_FAILED");
      if (!await this.repository.attempt(client,row,challenge)) return { failure: "RATE_LIMITED" };
      const login = challenge.purpose === "login";
      const secret = login ? this.crypto.open(row.encrypted_secret,factorBinding(row)) : this.crypto.open(challenge.candidate,candidateBinding(row,tokenDigest));
      const step = await this.crypto.verify(secret,body.code,row.database_now,login ? row.last_used_step : challenge.last_step);
      if (step === null) return { failure: "MFA_FAILED" };
      await this.repository.consume(client,challenge);
      if (login) {
        await this.repository.acceptStep(client,row,step);
        const sessionToken = token(); await this.repository.promote(client,row,digest(sessionToken),this.validate);
        return { stage: "authenticated", sessionToken };
      }
      const codes = recoveryCodes(), nextToken = token(), nextDigest = digest(nextToken);
      await this.repository.issueChallenge(client,row,nextDigest,"complete",this.crypto.seal(secret,candidateBinding(row,nextDigest)),codes.map(recoveryDigest),step);
      await client.query("UPDATE wpay_auth.mfa_challenges SET verified_at=CURRENT_TIMESTAMP WHERE token_digest=$1", [nextDigest]);
      return { stage: "save-recovery", challengeToken: nextToken, recoveryCodes: codes };
    });
    // Failed attempts return through COMMIT before becoming public errors.
    if (result.failure) throw new AuthError(result.failure);
    return result;
  }
  async revokeEpoch(client,row) {
    const next = { ...row, session_epoch: row.session_epoch+1, security_version: row.security_version+1 };
    await client.query("UPDATE wpay_auth.accounts SET session_epoch=$2 WHERE id=$1", [row.id,next.session_epoch]);
    await client.query("UPDATE wpay_auth.account_security SET security_version=$2 WHERE account_id=$1", [row.id,next.security_version]);
    return next;
  }
  async fresh(client, row, body, action, sessionDigest) {
    exactFields(body,["password","code"]); password(body.password); this.ready();
    const current = await this.repository.lockedAccount(client,row.id);
    if (!await this.repository.attempt(client,current,null)) return { failure: "RATE_LIMITED" };
    if (!await verifyPassword(body.password,current.password_record)) return { failure: "MFA_FAILED" };
    const step = await this.crypto.verify(this.crypto.open(current.encrypted_secret,factorBinding(current)),body.code,current.database_now,current.last_used_step);
    if (step === null) return { failure: "MFA_FAILED" };
    await this.repository.acceptStep(client,current,step);
    if (action === "stepup") {
      await client.query("UPDATE wpay_auth.sessions SET mfa_at=CURRENT_TIMESTAMP WHERE token_digest=$1",[sessionDigest]);
      return { ok: true };
    }
    const next = await this.revokeEpoch(client,current);
    if (action === "replace") {
      await client.query("UPDATE wpay_auth.recovery_codes SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP) WHERE account_id=$1", [row.id]);
      await securityAudit(client,row.id,row.id,"factor_replacement_started"); return this.newChallenge(client,next,"replace");
    }
    if (action === "regenerate") {
      const codes = recoveryCodes(); await this.repository.replaceRecovery(client,next,codes.map(recoveryDigest));
      const sessionToken = token(); await this.repository.promote(client,next,digest(sessionToken),this.validate);
      await securityAudit(client,row.id,row.id,"recovery_codes_regenerated");
      return { stage: "recovery-codes", recoveryCodes: codes, sessionToken };
    }
    throw new AuthError("NOT_FOUND");
  }
}
module.exports = { MfaService, factorBinding };
