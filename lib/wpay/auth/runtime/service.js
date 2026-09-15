"use strict";
const validation = require("./validation");
const { hashPassword, verifyPassword } = require("./passwords");
const { token, digest, liveSession } = require("./tokens");
const { AuthError } = require("./errors");
const { buildPrincipalContext } = require("../principal-context");
const { authorize, validateGrants } = require("../../authorization-policy");
const { deriveNavigation } = require("../../navigation");
const { fullAssurance, approvalAllows } = require("./mfa");
const { MfaService, factorBinding } = require("./mfa-service");
const { commercial, approvalRequest } = require("./commercial");
const { securityAudit } = require("../../db/security-repository");
const { createHash, randomUUID } = require("node:crypto");
const SELF_SECURITY = ["account_security.view", "account_security.update"];
const DEFAULT_GRANTS = Object.freeze({
  user: Object.freeze(["profile.view", "user.overview.view", "support.view", "guide.view", ...SELF_SECURITY]),
  merchant: Object.freeze(["profile.view", "profile.update", "merchant.overview.view", "support.view", "merchant.api_docs.view", ...SELF_SECURITY]),
  super_admin: Object.freeze(["profile.view", "overview.view", "users.view", "users.approve", "users.reject", "merchants.view", "merchants.approve", "merchants.reject", ...SELF_SECURITY]),
  admin: Object.freeze(["profile.view", ...SELF_SECURITY]), employee: Object.freeze(["profile.view", ...SELF_SECURITY])
});
for (const [type, grants] of Object.entries(DEFAULT_GRANTS)) if (!validateGrants(grants, type).allowed) throw new Error("WPAY_DEFAULT_GRANTS_INVALID");
function resolveContext(row) {
  if (!liveSession(row, new Date(row?.database_now).getTime()) || !fullAssurance(row)) throw new AuthError("AUTH_FAILED");
  const binding = { accountId: row.id, subjectId: row.subject_id, tenantId: row.tenant_id };
  const grantRecord = { ...binding, permissionVersion: row.grant_version, grants: row.permissions };
  if (row.admin_scope !== null) grantRecord.adminScope = row.admin_scope;
  const built = buildPrincipalContext({
    identity: { ...binding, permissionVersion: row.session_permission_version },
    account: { id: row.id, subjectId: row.subject_id, tenantId: row.tenant_id, type: row.account_type, status: row.status,
      currentPermissionVersion: row.current_permission_version, userId: row.user_id, merchantId: row.merchant_id },
    grantRecord, eligibilityRecord: { ...binding, facts: {
      approvalStatus: row.approval_status, initialDepositSatisfied: row.initial_deposit_satisfied,
      statementSatisfied: row.statement_satisfied, upiApproved: row.upi_approved, upiVerified: row.upi_verified,
      operationsEnabled: row.operations_enabled, approvedBankAccountAvailable: row.approved_bank_account_available
    } }
  });
  if (!built.ok) throw new AuthError("AUTH_FAILED");
  return built.context;
}
function policy(context, permissionId, resource = { kind: "list" }) {
  const result = authorize({ ...context, permissionId, context: resource });
  if (!result.allowed) throw new AuthError("FORBIDDEN");
  return result.constraints.where;
}
class AuthService {
  constructor(repository, options = {}) {
    this.repository = repository; this.crypto = options.mfaCrypto; this.fixedCurrency = options.fixedCurrency;
    this.mfa = new MfaService(repository, options.mfaCrypto, resolveContext);
  }
  async register(body, ip) {
    await this.repository.throttle("register", ip);
    const input = validation.registration(body);
    const record = await hashPassword(input.password);
    try { await this.repository.createAccount(input, record, DEFAULT_GRANTS[input.accountType]); }
    catch (error) { if (error.code === "23505") throw new AuthError("REGISTRATION_FAILED"); throw error; }
    return { registered: true, approvalStatus: "pending", emailOwnershipVerified: false };
  }
  async bootstrap(body) {
    validation.exactFields(body, ["name", "email", "password"]);
    const input = { name: validation.name(body.name), email: validation.email(body.email) };
    const record = await hashPassword(body.password);
    try { await this.repository.createAccount(input, record, DEFAULT_GRANTS.super_admin, true); }
    catch (error) { if (error.code === "23505") throw new AuthError("REGISTRATION_FAILED"); throw error; }
  }
  async login(body, ip) {
    await this.repository.throttle("login", ip);
    let input;
    try { input = validation.login(body); } catch { throw new AuthError("AUTH_FAILED"); }
    const account = await this.repository.credential(input.email);
    const matched = await verifyPassword(input.password, account?.password_record);
    if (!matched || account?.status !== "active") { await this.repository.failedLogin(); throw new AuthError("AUTH_FAILED"); }
    if (!approvalAllows(account)) throw new AuthError(account.approval_status === "pending" ? "APPROVAL_PENDING" : "AUTH_FAILED");
    return this.mfa.begin(account);
  }
  csrfBinding(session, restrictedChallenge) {
    return createHash("sha256").update(`${digest(session) || ""}:${digest(restrictedChallenge) || ""}`).digest("hex");
  }
  async csrf(ip, session, restrictedChallenge) {
    await this.repository.throttle("csrf", ip);
    const cookie = token(), challenge = token();
    await this.repository.issueCsrf(digest(cookie), digest(challenge), this.csrfBinding(session, restrictedChallenge));
    return { cookie, challenge };
  }
  async checkCsrf(cookie, challenge, session, restrictedChallenge) {
    if (!digest(cookie) || !digest(challenge)) throw new AuthError("CSRF_FAILED");
    await this.repository.checkCsrf(digest(cookie), digest(challenge), this.csrfBinding(session, restrictedChallenge));
  }
  async authenticated(session, operation, offset = 0, body = {}) {
    const sessionDigest = digest(session);
    if (!sessionDigest) throw new AuthError("AUTH_FAILED");
    const result = await this.repository.withSession(sessionDigest, async (client, row) => {
      const context = resolveContext(row);
      if (!this.crypto) throw new AuthError("UNAVAILABLE");
      this.crypto.open(row.encrypted_secret, factorBinding(row));
      if (operation === "security") {
        policy(context, "account_security.view");
        return this.repository.securitySummary(client,row,sessionDigest);
      }
      if (["security/replace","security/regenerate","security/stepup"].includes(operation)) {
        policy(context, "account_security.update", { kind:"record",id:row.id,tenantId:row.tenant_id,ownerType:"principal",ownerId:row.id });
        return this.mfa.fresh(client,row,body,operation.split("/")[1],sessionDigest);
      }
      if (operation === "locale") {
        validation.exactFields(body,["locale"]);
        if (row.account_type !== "merchant" || !["en","ru","zh-CN"].includes(body.locale)) throw new AuthError("INVALID_INPUT");
        const where = policy(context,"profile.update", { kind:"record",id:row.id,tenantId:row.tenant_id,ownerType:"principal",ownerId:row.id });
        await client.query("UPDATE wpay_auth.preferences p SET locale=$3 FROM wpay_auth.accounts a WHERE p.account_id=a.id AND a.id=$1 AND a.tenant_id=$2",[where.ownerId,where.tenantId,body.locale]);
        return { locale: body.locale };
      }
      if (operation === "approval-options") {
        const permission = context.grants.includes("users.view") ? "users.view" : "merchants.view";
        policy(context,permission);
        return { fixedFeeCurrency: ["INR","USD","USDT"].includes(this.fixedCurrency) ? this.fixedCurrency : null, depositNetworks: ["TRON-TRC20","ETHEREUM-ERC20"] };
      }
      if (operation === "approval") return this.approval(client,row,context,body);
      if (operation === "me") return this.repository.ownSummary(client, policy(context, "profile.view"));
      if (operation === "navigation") {
        policy(context, "profile.view");
        return { groups: deriveNavigation(context) };
      }
      if (["pending-users", "pending-merchants"].includes(operation)) {
        const user = operation === "pending-users";
        return this.repository.pending(client, policy(context, user ? "users.view" : "merchants.view"), user ? "user" : "merchant", offset);
      }
      if (["logout", "logout-all", "refresh"].includes(operation)) {
        // Owning a currently valid session authorizes its lifecycle. No profile
        // update grant or generic permission-execution endpoint is invented.
        if (operation === "refresh") await this.repository.touch(client, sessionDigest);
        else await this.repository.revoke(client, row, sessionDigest, operation === "logout-all");
        return { ok: true };
      }
      throw new AuthError("NOT_FOUND");
    });
    if (result.failure) throw new AuthError(result.failure);
    return result;
  }
  async approval(client,row,context,body) {
    const request = approvalRequest(body);
    if (+new Date(row.database_now)-+new Date(row.mfa_at) > 300000) throw new AuthError("RECENT_MFA_REQUIRED");
    const target = (await client.query("SELECT a.id,a.tenant_id,a.account_type,e.approval_status FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a,e", [request.accountId])).rows[0];
    if (!target || !["user","merchant"].includes(target.account_type) || target.id === row.id) throw new AuthError("FORBIDDEN");
    const permissionId = `${target.account_type === "user" ? "users" : "merchants"}.${request.decision}`;
    const decision = authorize({ ...context, permissionId, context: { kind: "record", id: target.id, tenantId: target.tenant_id } });
    if (!decision.allowed) throw new AuthError("FORBIDDEN");
    const settings = request.decision === "approve" ? commercial(target.account_type,request.settings,this.fixedCurrency) : null;
    const reason = request.reason.trim();
    const payload = createHash("sha256").update(JSON.stringify({ accountId:target.id,decision:request.decision,settings,reason })).digest("hex");
    const previous = (await client.query("SELECT payload_digest,result FROM wpay_auth.approval_requests WHERE actor_id=$1 AND request_id=$2",[row.id,request.requestId])).rows[0];
    if (previous) { if (previous.payload_digest !== payload) throw new AuthError("CONFLICT"); return previous.result; }
    if (target.approval_status !== "pending") throw new AuthError("CONFLICT");
    if (settings) await client.query("INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)",[randomUUID(),target.id,JSON.stringify(settings),row.id]);
    const status = request.decision === "approve" ? "approved" : "rejected";
    // Apply the actual policy's returned tenant and record constraints in SQL.
    const where = decision.constraints.where;
    const changed = await client.query("UPDATE wpay_auth.eligibility e SET approval_status=$3 FROM wpay_auth.accounts a WHERE e.account_id=a.id AND a.id=$1 AND a.tenant_id=$2 AND e.approval_status='pending'",[where.id,where.tenantId,status]);
    if (changed.rowCount !== 1) throw new AuthError("CONFLICT");
    await client.query("UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE id=$1 AND tenant_id=$2",[where.id,where.tenantId]);
    await client.query("UPDATE wpay_auth.grants SET permission_version=permission_version+1 WHERE account_id=$1",[target.id]);
    await securityAudit(client,row.id,target.id,status,reason || null);
    const result = { approvalStatus: status };
    await client.query("INSERT INTO wpay_auth.approval_requests(actor_id,request_id,payload_digest,account_id,result) VALUES($1,$2,$3,$4,$5)",[row.id,request.requestId,payload,target.id,JSON.stringify(result)]);
    return result;
  }
}
module.exports = { AuthService, DEFAULT_GRANTS, resolveContext, policy };
