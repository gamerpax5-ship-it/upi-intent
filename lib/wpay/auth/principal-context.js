"use strict";
const { PRINCIPAL_TYPES, getPermission } = require("../permission-catalog");
const { validateGrants } = require("../authorization-policy");

// Server-resolved data only. Matching fields cannot prove their provenance.
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
// Read only own data properties; inherited claims and accessors confer no authority.
const field = (value, key) => record(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
// Same identifier/version grammar as Task 2; no trimming, casing or coercion.
const validId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const validVersion = value => Number.isSafeInteger(value) && value >= 0;
const fail = reason => Object.freeze({ ok: false, reason });
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function boundToAccount(value, account) {
  return ["subjectId", "accountId", "tenantId"].every(key => validId(field(value, key))) &&
    field(value, "subjectId") === field(account, "subjectId") &&
    field(value, "accountId") === field(account, "id") &&
    field(value, "tenantId") === field(account, "tenantId");
}

/** Construct a policy snapshot, never an authentication or resource decision. */
function buildPrincipalContext(input) {
  if (!record(input)) return fail("INVALID_INPUT");
  const identity = field(input, "identity");
  const account = field(input, "account");
  const grantRecord = field(input, "grantRecord");
  const eligibilityRecord = field(input, "eligibilityRecord");
  if (!record(identity) || !["subjectId", "accountId", "tenantId"].every(key => validId(field(identity, key)))) return fail("INVALID_IDENTITY");
  if (!record(account) || !["subjectId", "id", "tenantId"].every(key => validId(field(account, key)))) return fail("INVALID_ACCOUNT");
  if (!boundToAccount(identity, account)) return fail("IDENTITY_ACCOUNT_MISMATCH");
  const type = field(account, "type");
  const status = field(account, "status");
  if (!PRINCIPAL_TYPES.includes(type)) return fail("UNKNOWN_PRINCIPAL_TYPE");
  // Task 2 only enables exact 'active'; retain other status identifiers unchanged.
  if (!validId(status)) return fail("INVALID_ACCOUNT_STATUS");
  const ownerKey = type === "user" ? "userId" : type === "merchant" ? "merchantId" : null;
  if (ownerKey && !validId(field(account, ownerKey))) return fail("OWNER_IDENTITY_REQUIRED");
  if (!record(grantRecord)) return fail("INVALID_GRANT_RECORD");
  if (!boundToAccount(grantRecord, account)) return fail("GRANT_ACCOUNT_MISMATCH");

  const permissionVersion = field(identity, "permissionVersion");
  const currentPermissionVersion = field(account, "currentPermissionVersion");
  const grantVersion = field(grantRecord, "permissionVersion");
  if (![permissionVersion, currentPermissionVersion, grantVersion].every(validVersion)) return fail("PERMISSION_VERSION_REQUIRED");
  if (grantVersion !== currentPermissionVersion) return fail("GRANT_VERSION_MISMATCH");
  if (permissionVersion !== currentPermissionVersion) return fail("STALE_PERMISSION_VERSION");
  const validation = validateGrants(field(grantRecord, "grants"), type);
  if (!validation.allowed) return fail(validation.reason);

  const scopes = validation.permissions.map(id => getPermission(id).scope);
  const suppliedScope = field(grantRecord, "adminScope");
  let adminScope;
  if (suppliedScope !== undefined) {
    if (!["admin", "super_admin", "employee"].includes(type) || !record(suppliedScope)) return fail("INVALID_ADMIN_SCOPE");
    const tenantIds = field(suppliedScope, "tenantIds");
    const platform = field(suppliedScope, "platform");
    // Array.from materializes holes so missing entries cannot evade validation.
    if (!Array.isArray(tenantIds) || !Array.from(tenantIds).every(validId) || new Set(tenantIds).size !== tenantIds.length) return fail("INVALID_ADMIN_SCOPE");
    if (platform !== undefined && (type !== "super_admin" || typeof platform !== "boolean")) return fail("INVALID_ADMIN_SCOPE");
    adminScope = { tenantIds: [...tenantIds] };
    if (platform !== undefined) adminScope.platform = platform;
  }
  if (scopes.includes("admin_tenants") && !adminScope?.tenantIds.length) return fail("ADMIN_SCOPE_REQUIRED");
  if (scopes.includes("platform") && adminScope?.platform !== true) return fail("PLATFORM_SCOPE_REQUIRED");

  let eligibility;
  if (eligibilityRecord !== undefined) {
    if (!record(eligibilityRecord)) return fail("INVALID_ELIGIBILITY_RECORD");
    if (!boundToAccount(eligibilityRecord, account)) return fail("ELIGIBILITY_ACCOUNT_MISMATCH");
    const facts = field(eligibilityRecord, "facts");
    if (!record(facts)) return fail("INVALID_ELIGIBILITY_FACTS");
    eligibility = {};
    const approvalStatus = field(facts, "approvalStatus");
    if (approvalStatus !== undefined) {
      if (!validId(approvalStatus)) return fail("INVALID_ELIGIBILITY_FACTS");
      eligibility.approvalStatus = approvalStatus;
    }
    for (const key of ["initialDepositSatisfied", "statementSatisfied", "upiApproved", "upiVerified", "operationsEnabled", "approvedBankAccountAvailable"]) {
      const value = field(facts, key);
      if (value !== undefined) {
        if (typeof value !== "boolean") return fail("INVALID_ELIGIBILITY_FACTS");
        eligibility[key] = value;
      }
    }
  }

  const principal = { id: field(account, "id"), type, status, tenantId: field(account, "tenantId"), permissionVersion };
  if (ownerKey) principal[ownerKey] = field(account, ownerKey);
  const context = { principal, grants: [...validation.permissions], currentPermissionVersion };
  if (adminScope) context.adminScope = adminScope;
  if (eligibility) context.eligibility = eligibility;
  return freeze({ ok: true, context });
}

module.exports = Object.freeze({ buildPrincipalContext });
