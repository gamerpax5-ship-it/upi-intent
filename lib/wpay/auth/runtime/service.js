"use strict";
const validation = require("./validation");
const { hashPassword, verifyPassword } = require("./passwords");
const { token, digest, liveSession } = require("./tokens");
const { AuthError } = require("./errors");
const { buildPrincipalContext } = require("../principal-context");
const { authorize, validateGrants } = require("../../authorization-policy");
const { deriveNavigation } = require("../../navigation");
const { approvalAllows } = require("./mfa");
const { MfaService, factorBinding } = require("./mfa-service");
const { commercial, approvalRequest } = require("./commercial");
const { securityAudit } = require("../../db/security-repository");
const { createHash, randomUUID } = require("node:crypto");
const { ApkArtifact } = require("../../integrations/apk");
const { Resources } = require("../../integrations/resources");
const { BusinessApi, businessNavigation } = require("../../business/api");
const { FundingApi } = require("../../funding/api");
const { OnboardingApi, onboardingNavigation } = require("../../onboarding/api");
const gatewayApi = require("../../gateway/api");
const { Gateway } = require("../../gateway/core");
const payoutApi = require("../../payouts/api");
const { Payouts } = require("../../payouts/core");
const parkingApi=require("../../parking/api");
const {Parking}=require("../../parking/core");
const { requireRole,registrationRole } = require('./role-entry');
const {Operations}=require('../../operations/api');
const operationNavigation=require('../../operations/access').navigation;
const USER_OPERATIONS=['user.live_otp.view','user.device_pairing.view','user.device_pairing.create','user.device_pairing.revoke','user.transaction_history.view'];
const ADMIN_OPERATIONS=['apk_otp_events.view_all','employee_management.view','employee_management.create','employee_management.update','utr_center.view','utr_center.approve','statement_reconciliation.view','statement_reconciliation.upload'];
const SELF_SECURITY = ["account_security.view", "account_security.update"];
const COMPLETION_GRANTS = require('../../panels/grants');
const DEFAULT_GRANTS = Object.freeze({
  user: Object.freeze([...COMPLETION_GRANTS.user,...USER_OPERATIONS,"profile.view", "user.overview.view", "user.deposits.view", "user.deposits.submit", "support.view", "guide.view", "user.apk.view", "user.source_events.view", "user.bank_upi.view", "user.bank_upi.submit", "user.bank_upi.update", "user.holds.view", "user.payin_commission.view", "user.parking_beneficiaries.view", "user.parking_beneficiaries.confirm", "user.parking_payments.view", "user.parking_payments.create", "user.payout.view", "user.payout.claim", "user.payout.submit", "user.commission.view", "user.commission_withdrawal.view", "user.commission_withdrawal.create", "user.commission_withdrawal.cancel", ...SELF_SECURITY]),
  merchant: Object.freeze([...COMPLETION_GRANTS.merchant,"profile.view", "profile.update", "merchant.overview.view", "support.view", "merchant.api_docs.view", "merchant.source_events.view", "merchant.ledger.view", "merchant.fees.view", "merchant.holds.view", "merchant.gateway.view", "merchant.gateway.create", "merchant.gateway.manage", "merchant.payout.view", "merchant.payout.create", "merchant.payout.review", "merchant.settlement.view", "merchant.settlement.create", ...SELF_SECURITY]),
  super_admin: Object.freeze([...COMPLETION_GRANTS.super_admin,...ADMIN_OPERATIONS,"profile.view", "overview.view", "deposits.view", "deposits.review", "deposits.approve", "deposits.reject", "users.view", "users.approve", "users.reject", "merchants.view", "merchants.approve", "merchants.reject", "apk.view", "bank_upi.view", "bank_upi.review", "bank_upi.approve", "bank_upi.reject", "bank_upi.freeze", "bank_upi.release", "assignments.view", "assignments.update", "routing.view", "ledger.view", "holds.view", "holds.update", "transactions.view", "webhooks.view", "payout_operations.view", "payout_operations.resolve","payout_operations.proof", "payout_operations.capability", "parking.view", "parking.create", "parking.review", "parking.approve", "parking.reject", "commission_withdrawal.view", "commission_withdrawal.approve", "commission_hold.view", "commission_hold.manage", ...SELF_SECURITY]),
  admin: Object.freeze(["profile.view", ...SELF_SECURITY]), employee: Object.freeze(["profile.view", ...SELF_SECURITY])
});
for (const [type, grants] of Object.entries(DEFAULT_GRANTS)) if (!validateGrants(grants, type).allowed) throw new Error("WPAY_DEFAULT_GRANTS_INVALID");
const {sessionAssurance,isAdmin,recentAuthenticationAt}=require('./session-assurance');
function resolveContext(row) {
  if (!liveSession(row, new Date(row?.database_now).getTime()) || !sessionAssurance(row)) throw new AuthError("AUTH_FAILED");
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
    this.apk = options.apk || new ApkArtifact();
    this.resources = new Resources(options.legacyReader || null);
    this.business = new BusinessApi();
    this.funding = new FundingApi({provider:options.fundingProvider});
    this.onboarding = new OnboardingApi({verify:options.verifyUpiPayment,allowSynthetic:options.syntheticUpiEvidence===true});
    this.gateway = new Gateway({pool:repository.pool,crypto:options.mfaCrypto,verifier:options.paymentEvidenceVerifier,allowSynthetic:options.syntheticGatewayEvidence===true,testCallback:options.gatewayTestCallback});
    if(options.statementEvidenceVerifier||options.authoritativeStatementSource){
      const source=options.authoritativeStatementSource;
      if(source&&!(source instanceof require('../../integrations/authoritative-statement-source').AuthoritativeStatementSource))throw Error('Invalid authoritative statement source');
      const statements=new (require('../../integrations/statement-evidence').StatementEvidence)({pool:repository.pool,lookup:source?(snapshot=>source.verify(snapshot)):options.statementEvidenceVerifier,allowSynthetic:options.syntheticGatewayEvidence===true}),normal=options.paymentEvidenceVerifier;
      this.gateway.verifier=async snapshot=>{const observed=normal?await normal(snapshot):null;return observed?.verified===true&&observed?.final===true?observed:await statements.verify(snapshot)||observed;};
      if(source)this.gateway.beforeEvidencePosting=(client,proof)=>proof.source==='statement'?source.beforePosting(client,proof):null;
    }
    this.payouts = new Payouts({gateway:this.gateway,crypto:options.mfaCrypto,scanner:options.uploadScanner});
    this.parking=new Parking({crypto:options.mfaCrypto,scanner:options.uploadScanner});
    this.operations=new Operations({source:options.operationalSource,pairingSource:options.pairingSource,bridge:options.pairingBridge,crypto:options.mfaCrypto,onboarding:this.onboarding.workflow,legacyReader:options.legacyReader});
    this.notifications=new (require('../../notifications/service').Notifications)({pool:repository.pool,crypto:options.mfaCrypto,provider:options.emailProvider});
    this.mfa = new MfaService(repository, options.mfaCrypto, resolveContext);
  }
  async register(body, ip, entryRole) {
    registrationRole(body,entryRole);
    await this.repository.throttle("register", ip);
    const input = validation.registration(body);
    const record = await hashPassword(input.password, input.accountType);
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
  async login(body, ip, entryRole) {
    await this.repository.throttle("login", ip);
    let input;
    try { input = validation.login(body); } catch { throw new AuthError("AUTH_FAILED"); }
    const account = await this.repository.credential(input.email);
    const matched = await verifyPassword(input.password, account?.password_record);
    if (!matched || account?.status !== "active") { await this.repository.failedLogin(); throw new AuthError("AUTH_FAILED"); }
    requireRole(account,entryRole);
    if(account.temporary_required&&+account.temporary_expires_at<=+account.database_now){await this.repository.failedLogin();throw new AuthError('AUTH_FAILED');}
    if (!approvalAllows(account)) throw new AuthError(account.approval_status === "pending" ? "APPROVAL_PENDING" : "AUTH_FAILED");
    return isAdmin(account)?require('./admin-account').begin(this,account,entryRole):['user','merchant'].includes(account.account_type)?require('./optional-mfa').begin(this,account,entryRole):this.mfa.begin(account,entryRole);
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
  async authenticated(session, operation, offset = 0, body = {}, entryRole) {
    const sessionDigest = digest(session);
    if (!sessionDigest) throw new AuthError("AUTH_FAILED");
    if(operation==='operations/utr/decision'){
      const review=require('../../operations/utr-review');
      const withActor=fn=>this.repository.withSession(sessionDigest,async(client,row)=>{requireRole(row,entryRole);return fn(client,row,resolveContext(row));});
      const prepared=await withActor((c,r,x)=>review.prepare(c,r,x,body,this.crypto,this.gateway));
      if(prepared.final)return prepared;
      // External lookup runs without holding the session or financial locks.
      const result=await this.gateway.verifyOrder(prepared.orderId,{expectedUtr:prepared.utr});
      return withActor((c,r,x)=>review.finish(c,r,x,body,this.crypto,result));
    }
    let prepared;
    if (["payout/bulk","payout/bulk/validate","payout/submit"].includes(operation)) {
      await this.repository.withSession(sessionDigest,async (client,row)=>{requireRole(row,entryRole);const context=resolveContext(row);payoutApi.preparation(context,row,operation);});
      prepared=await this.payouts.prepare(operation,body);
    }
    if(operation==="parking/submit"){
      await this.repository.withSession(sessionDigest,async (client,row)=>{requireRole(row,entryRole);const context=resolveContext(row);parkingApi.preparation(context,row,operation);});
      prepared=await this.parking.prepare(operation,body);
    }
    const invoke = () => this.repository.withSession(sessionDigest, async (client, row) => {
      requireRole(row,entryRole);
      const context = resolveContext(row);
      if (!this.crypto) throw new AuthError("UNAVAILABLE");
      if(row.auth_method!=='password')this.crypto.open(row.encrypted_secret, factorBinding(row));
      if(operation.startsWith('panel/')){
        const result=await require('../../panels/api').run(client,row,context,operation,body,this.fixedCurrency,this.gateway);
        if(operation==='panel/profile')result.emailVerification=await this.notifications.status(client,row);
        if(operation==='panel/notifications')result.emailDeliveryConfigured=this.notifications.configured();
        return result;
      }
      if(operation.startsWith('operations/'))return this.operations.run(client,row,context,operation,body);
      if(operation.startsWith('email/'))return this.notifications.run(client,row,context,operation,body);
      if (operation.startsWith("business/")) return this.business.run(client,row,context,operation,body);
      if (operation.startsWith("funding/")) return this.funding.run(client,row,context,operation,body);
      if (operation.startsWith("onboarding/")) return this.onboarding.run(client,row,context,operation,body);
      if (operation.startsWith("gateway/")) return gatewayApi.run(this.gateway,client,row,context,operation,body);
      if (operation.startsWith("payout/")) return payoutApi.run(this.payouts,client,row,context,operation,body,prepared);
      if(operation.startsWith("parking/"))return parkingApi.run(this.parking,client,row,context,operation,body,prepared);
      if (["resources","resources/request","resources/revoke","resources/read"].includes(operation)) {
        if (!["user","merchant"].includes(row.account_type)) throw new AuthError("FORBIDDEN");
        policy(context,`${row.account_type}.source_events.view`);
        const observed=await this.resources.run(client,row,operation,body);
        return require('../../operations/observation-privacy').forPanel(row.account_type,observed);
      }
      if (["apk","apk/download"].includes(operation)) {
        if (!["user","admin","super_admin"].includes(row.account_type)) throw new AuthError("FORBIDDEN");
        policy(context,row.account_type === "user" ? "user.apk.view" : "apk.view");
        return this.apk.inspect(operation === "apk/download");
      }
      if (['security/admin-email','security/admin-password','security/admin-reauth'].includes(operation)) {
        policy(context,'account_security.update',{kind:'record',id:row.id,tenantId:row.tenant_id,ownerType:'principal',ownerId:row.id});
        return require('./admin-account').change(this,client,row,body,operation.slice('security/admin-'.length),sessionDigest);
      }
      if (operation === "security") {
        policy(context, "account_security.view");
        return this.repository.securitySummary(client,row,sessionDigest);
      }
      if (["security/enable","security/disable","security/replace","security/regenerate","security/stepup","security/password"].includes(operation)) {
        policy(context, "account_security.update", { kind:"record",id:row.id,tenantId:row.tenant_id,ownerType:"principal",ownerId:row.id });
        if(["user","merchant"].includes(row.account_type))return require("./optional-mfa").change(this,client,row,body,operation.split("/")[1],sessionDigest);
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
      if (operation === "me") {const summary=await this.repository.ownSummary(client, policy(context, "profile.view"));const email=await this.notifications.status(client,row);return {...summary,emailOwnershipVerified:email.emailOwnershipVerified};}
      if (operation === "navigation") {
        policy(context, "profile.view");
        const groups=structuredClone(deriveNavigation(context));
        if (["user","merchant"].includes(row.account_type) && context.grants.includes(`${row.account_type}.source_events.view`)) {
          policy(context,`${row.account_type}.source_events.view`);
          const groupId=row.account_type === "user" ? "user.group.apk_events" : "merchant.group.collections";
          let group=groups.find(item=>item.id===groupId);
          if(!group){group={id:groupId,label:row.account_type === "user"?"APK & Events":"Collections",children:[]};groups.push(group);}
          group.children.push({id:`${row.account_type}.page.connected-sources`,destinationId:`${row.account_type}.connected-sources`,
            permissionId:`${row.account_type}.source_events.view`,label:row.account_type === "user"?"Linked Devices & Observations":"Mapped Orders",routeStatus:"implemented",descriptorOnly:false,blockers:[]});
        }
        const result=require('../../panels/navigation').navigation(operationNavigation(parkingApi.navigation(payoutApi.navigation(gatewayApi.navigation(onboardingNavigation(businessNavigation(groups,context),context),context),context),context),context),context);
        if(await require('../../operations/admin-authority').available(client,row,context))result.push({id:'operations.group.admin-authority',label:'Admin authority',children:[{id:'operations.page.admins',destinationId:'operations.admins',permissionId:'settings.view',label:'Admin authority',routeStatus:'implemented',descriptorOnly:false,blockers:[]}]});
        return {groups:result,...(['user','merchant'].includes(row.account_type)?{requirements:{approvalStatus:context.eligibility.approvalStatus,initialDepositSatisfied:context.eligibility.initialDepositSatisfied===true,statementSatisfied:context.eligibility.statementSatisfied===true,upiApproved:context.eligibility.upiApproved===true,upiVerified:context.eligibility.upiVerified===true,operationsEnabled:context.eligibility.operationsEnabled===true,approvedBankAccountAvailable:context.eligibility.approvedBankAccountAvailable===true}}:{})};
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
    // withSession owns the bounded whole-transaction conflict retry, including
    // internal callers such as parking. Do not multiply its retry budget here.
    const result=await invoke();
    if (result.failure) throw new AuthError(result.failure);
    return result;
  }
  async approval(client,row,context,body) {
    const request = approvalRequest(body);
    if (+new Date(row.database_now)-+new Date(recentAuthenticationAt(row)) > 300000) throw new AuthError("RECENT_MFA_REQUIRED");
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
