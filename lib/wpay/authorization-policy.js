"use strict";
const { PRINCIPAL_TYPES, getPermission } = require("./permission-catalog");

// Inputs MUST be server-verified snapshots. This module authenticates nothing.
const validId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const validVersion = value => Number.isSafeInteger(value) && value >= 0;
const validIds = value => Array.isArray(value) && value.every(validId) && new Set(value).size === value.length;
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const deny = reason => Object.freeze({ allowed: false, reason });
const allow = extra => freeze({ allowed: true, reason: "ALLOWED", ...extra });

function validateGrants(grants, principalType) {
  if (!PRINCIPAL_TYPES.includes(principalType)) return deny("UNKNOWN_PRINCIPAL_TYPE");
  if (!Array.isArray(grants)) return deny("INVALID_GRANTS");
  const seen = new Set();
  for (const id of grants) {
    if (typeof id !== "string") return deny("INVALID_GRANTS");
    if (id.includes("*")) return deny("WILDCARD_GRANT");
    const permission = getPermission(id);
    if (!permission) return deny("UNKNOWN_PERMISSION");
    if (seen.has(id)) return deny("DUPLICATE_GRANT");
    seen.add(id);
    if (principalType === "employee" && !permission.employeeDelegable) return deny("NON_DELEGABLE_PERMISSION");
    if (!permission.principalTypes.includes(principalType)) return deny("PRINCIPAL_TYPE_NOT_ALLOWED");
  }
  if (grants.some(id => getPermission(id).dependencies.some(required => !seen.has(required)))) return deny("MISSING_DEPENDENCY");
  return allow({ permissions: [...grants] });
}

function eligibilityDecision(permission, principal, eligibility) {
  const requirement = permission.eligibility;
  if (requirement === "none") return null;
  if (!eligibility || eligibility.approvalStatus !== "approved") return deny("APPROVAL_REQUIRED");
  if (requirement === "approved") return null;
  if (requirement === "approved_bank") return eligibility.approvedBankAccountAvailable === true ? null : deny("APPROVED_ACCOUNT_REQUIRED");
  if (requirement === "user_operational") {
    if (principal.type !== "user" || ["initialDepositSatisfied", "statementSatisfied", "upiApproved", "upiVerified", "operationsEnabled"].some(key => eligibility[key] !== true)) return deny("USER_NOT_OPERATIONALLY_ELIGIBLE");
    return null;
  }
  if (requirement === "merchant_operational") return principal.type === "merchant" && eligibility.operationsEnabled === true ? null : deny("MERCHANT_NOT_OPERATIONALLY_ELIGIBLE");
  return deny("UNKNOWN_ELIGIBILITY_REQUIREMENT");
}

// Capability/navigation check only: never authorizes a resource or an unfiltered query.
function canUsePermission(input = {}) {
  if (!input || typeof input !== "object") return deny("MISSING_PRINCIPAL");
  const { principal, permissionId, grants, currentPermissionVersion, adminScope, eligibility } = input;
  if (!principal) return deny("MISSING_PRINCIPAL");
  if (!PRINCIPAL_TYPES.includes(principal.type)) return deny("UNKNOWN_PRINCIPAL_TYPE");
  if (!validId(principal.id) || !validId(principal.tenantId)) return deny("INVALID_PRINCIPAL_IDENTITY");
  if (principal.status !== "active") return deny("PRINCIPAL_INACTIVE");
  if (!validVersion(principal.permissionVersion) || !validVersion(currentPermissionVersion)) return deny("PERMISSION_VERSION_REQUIRED");
  if (principal.permissionVersion !== currentPermissionVersion) return deny("STALE_PERMISSION_VERSION");
  const permission = getPermission(permissionId);
  if (!permission) return deny("UNKNOWN_PERMISSION");
  const validation = validateGrants(grants, principal.type);
  if (!validation.allowed) return validation;
  if (!permission.principalTypes.includes(principal.type)) return deny("PRINCIPAL_TYPE_NOT_ALLOWED");
  if (!grants.includes(permissionId)) return deny("MISSING_PERMISSION");
  if (permission.scope === "own_user" && !validId(principal.userId)) return deny("OWNER_IDENTITY_REQUIRED");
  if (["own_merchant", "assigned_users"].includes(permission.scope) && !validId(principal.merchantId)) return deny("OWNER_IDENTITY_REQUIRED");
  if (permission.scope === "admin_tenants" && (!adminScope || !validIds(adminScope.tenantIds) || !adminScope.tenantIds.length)) return deny("ADMIN_SCOPE_REQUIRED");
  if (permission.scope === "platform" && (principal.type !== "super_admin" || adminScope?.platform !== true)) return deny("PLATFORM_SCOPE_REQUIRED");
  const failure = eligibilityDecision(permission, principal, eligibility);
  return failure || allow({ requiresResourceAuthorization: true });
}

function ownedScope(permission, principal, context) {
  const ownerType = permission.scope === "self" ? "principal" : permission.scope === "own_user" ? "user" : "merchant";
  const ownerId = ownerType === "principal" ? principal.id : ownerType === "user" ? principal.userId : principal.merchantId;
  const where = { tenantId: principal.tenantId, ownerType, ownerId };
  if (context.kind === "list") {
    if ((context.tenantId !== undefined && context.tenantId !== where.tenantId) ||
        (context.ownerId !== undefined && context.ownerId !== ownerId) ||
        (context.ownerType !== undefined && context.ownerType !== ownerType)) return deny("OWNERSHIP_MISMATCH");
  } else {
    if (!validId(context.tenantId) || !validId(context.ownerId) || !context.ownerType) return deny("OWNER_CONTEXT_REQUIRED");
    if (context.tenantId !== where.tenantId || context.ownerId !== ownerId || context.ownerType !== ownerType) return deny("OWNERSHIP_MISMATCH");
  }
  return { where };
}

function accountScope(permission, context, where) {
  if (!permission.accountRequired && context.accountId === undefined) return null;
  // A list across owned accounts returns an owner constraint; an individual account must be bound.
  if (context.kind === "list" && context.accountId === undefined) return null;
  if (!validId(context.accountId) || !validId(context.accountOwnerId) || !validId(context.accountTenantId)) return deny("ACCOUNT_CONTEXT_REQUIRED");
  if (!validId(where.ownerId) || context.accountOwnerId !== where.ownerId || context.accountTenantId !== where.tenantId) return deny("ACCOUNT_OWNERSHIP_MISMATCH");
  where.accountId = context.accountId;
  return null;
}

function assignedScope(principal, context) {
  const projection = ["userId", "eligibleCapacity"];
  if (context.kind === "list") return { where: { assignmentMerchantId: principal.merchantId, assignmentMerchantTenantId: principal.tenantId, assignmentActive: true, userEligible: true }, projection };
  const assignment = context.assignment;
  if (!assignment || !validId(assignment.id) || assignment.active !== true ||
      !validId(context.tenantId) || !validId(context.ownerId) || context.ownerType !== "user" ||
      assignment.merchantId !== principal.merchantId || assignment.merchantTenantId !== principal.tenantId ||
      assignment.userId !== context.ownerId || assignment.userTenantId !== context.tenantId || context.subjectEligible !== true) return deny("ASSIGNMENT_REQUIRED");
  return { where: { tenantId: context.tenantId, ownerId: context.ownerId, ownerType: "user", assignmentId: assignment.id }, projection };
}

function authorize(input = {}) {
  const capability = canUsePermission(input);
  if (!capability.allowed) return capability;
  const { principal, context, adminScope } = input;
  const permission = getPermission(input.permissionId);
  if (permission.descriptorOnly) return deny("DESCRIPTOR_ONLY");
  if (!context || !permission.accessModes.includes(context.kind)) return deny("INVALID_ACCESS_MODE");
  if (context.kind === "record" && !validId(context.id)) return deny("RECORD_ID_REQUIRED");
  let scope;
  if (["self", "own_user", "own_merchant"].includes(permission.scope)) {
    scope = ownedScope(permission, principal, context);
  } else if (permission.scope === "admin_tenants") {
    if (context.kind === "list") {
      if (context.tenantId !== undefined && !adminScope.tenantIds.includes(context.tenantId)) return deny("OUTSIDE_ADMIN_SCOPE");
      scope = { where: { tenantIds: context.tenantId ? [context.tenantId] : [...adminScope.tenantIds] } };
      if (context.ownerId !== undefined || context.ownerType !== undefined) {
        if (!validId(context.ownerId) || !["user", "merchant", "principal"].includes(context.ownerType) || !validId(context.tenantId)) return deny("OWNER_CONTEXT_REQUIRED");
        scope.where = { tenantId: context.tenantId, ownerId: context.ownerId, ownerType: context.ownerType };
      }
    } else {
      if (!validId(context.tenantId)) return deny("TENANT_CONTEXT_REQUIRED");
      if (!adminScope.tenantIds.includes(context.tenantId)) return deny("OUTSIDE_ADMIN_SCOPE");
      scope = { where: { tenantId: context.tenantId } };
      if (permission.accountRequired || context.ownerId !== undefined || context.ownerType !== undefined) {
        if (!validId(context.ownerId) || !["user", "merchant", "principal"].includes(context.ownerType)) return deny("OWNER_CONTEXT_REQUIRED");
        Object.assign(scope.where, { ownerType: context.ownerType, ownerId: context.ownerId });
      }
    }
  } else if (permission.scope === "platform") {
    if (context.platform !== true) return deny("PLATFORM_CONTEXT_REQUIRED");
    if (permission.id === "employees.permissions.update") {
      if (!validId(context.targetEmployeeId)) return deny("EMPLOYEE_TARGET_REQUIRED");
      if (context.id !== context.targetEmployeeId) return deny("EMPLOYEE_TARGET_MISMATCH");
      if (context.targetEmployeeId === principal.id) return deny("SELF_ESCALATION");
    }
    scope = { where: { platform: true } };
  } else if (permission.scope === "assigned_users") {
    scope = assignedScope(principal, context);
  } else return deny("INVALID_SCOPE");
  if (scope.allowed === false) return scope;
  const accountFailure = accountScope(permission, context, scope.where);
  if (accountFailure) return accountFailure;
  if (permission.eligibility === "approved_bank" && context.accountApproved !== true) return deny("APPROVED_ACCOUNT_REQUIRED");
  if (context.kind === "record") scope.where.id = context.id;
  return allow({ accessMode: context.kind, constraints: scope, requiresBackendEnforcement: true });
}

// Validates checkbox selection; never adds dependencies or creates an Employee.
function validateEmployeeSelection(input = {}) {
  if (!input || !input.principal) return deny("MISSING_PRINCIPAL");
  if (input.principal.type !== "super_admin") return deny("SUPER_ADMIN_REQUIRED");
  if (!["create", "update"].includes(input.operation)) return deny("INVALID_DELEGATION_OPERATION");
  const decision = authorize({ ...input, permissionId: input.operation === "create" ? "employees.create" : "employees.permissions.update",
    context: input.operation === "create" ? { kind: "create", platform: true } : { kind: "record", platform: true, id: input.targetEmployeeId, targetEmployeeId: input.targetEmployeeId } });
  if (!decision.allowed) return decision;
  const selection = validateGrants(input.selectedPermissions, "employee");
  if (!selection.allowed) return selection;
  if (!input.delegatedScope || !validIds(input.delegatedScope.tenantIds) || input.delegatedScope.platform !== undefined) return deny("INVALID_DELEGATED_SCOPE");
  if (selection.permissions.length && !input.delegatedScope.tenantIds.length) return deny("ADMIN_SCOPE_REQUIRED");
  if (!validIds(input.adminScope?.tenantIds) || input.delegatedScope.tenantIds.some(id => !input.adminScope.tenantIds.includes(id))) return deny("OUTSIDE_ADMIN_SCOPE");
  // A Super Admin still cannot delegate an action absent from their explicit grants.
  if (selection.permissions.some(id => !input.grants.includes(id))) return deny("GRANT_NOT_HELD_BY_ACTOR");
  return allow({ permissions: [...selection.permissions], delegatedScope: { tenantIds: [...input.delegatedScope.tenantIds] } });
}

module.exports = Object.freeze({ validateGrants, canUsePermission, authorize, validateEmployeeSelection });
