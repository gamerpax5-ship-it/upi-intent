"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PERMISSION_CATALOG, getPermission } = require("../lib/wpay/permission-catalog");
const { validateGrants, canUsePermission, authorize, validateEmployeeSelection } = require("../lib/wpay/authorization-policy");

function principal(type = "user") {
  return { id: `${type}-principal`, type, tenantId: "tenant-a", userId: "user-a", merchantId: "merchant-a", status: "active", permissionVersion: 7 };
}
function request(overrides = {}) {
  return { principal: principal(), grants: ["user.transactions.view"], permissionId: "user.transactions.view", currentPermissionVersion: 7,
    eligibility: { approvalStatus: "approved", initialDepositSatisfied: true, statementSatisfied: true, upiApproved: true, upiVerified: true, operationsEnabled: true, approvedBankAccountAvailable: true },
    context: { kind: "record", id: "transaction-a", tenantId: "tenant-a", ownerType: "user", ownerId: "user-a", accountId: "account-a", accountOwnerId: "user-a", accountTenantId: "tenant-a" },
    ...overrides };
}

for (const [label, change, reason] of [
  ["unauthenticated", { principal: null }, "MISSING_PRINCIPAL"],
  ["unknown role", { principal: { ...principal(), type: "root" } }, "UNKNOWN_PRINCIPAL_TYPE"],
  ["case variant is not an alias", { principal: { ...principal(), type: "Admin" } }, "UNKNOWN_PRINCIPAL_TYPE"],
  ["missing identity", { principal: { ...principal(), id: null } }, "INVALID_PRINCIPAL_IDENTITY"],
  ["missing tenant", { principal: { ...principal(), tenantId: null } }, "INVALID_PRINCIPAL_IDENTITY"],
  ["unknown requested permission", { permissionId: "no.such.permission" }, "UNKNOWN_PERMISSION"],
  ["missing grant", { grants: [] }, "MISSING_PERMISSION"],
  ["wildcard grant", { grants: ["user.*"] }, "WILDCARD_GRANT"],
  ["unknown grant beside valid grant", { grants: ["user.transactions.view", "unknown.view"] }, "UNKNOWN_PERMISSION"],
  ["duplicate grant", { grants: ["user.transactions.view", "user.transactions.view"] }, "DUPLICATE_GRANT"],
  ["missing version", { currentPermissionVersion: undefined }, "PERMISSION_VERSION_REQUIRED"],
  ["stale version", { currentPermissionVersion: 8 }, "STALE_PERMISSION_VERSION"],
  ["missing scope", { context: null }, "INVALID_ACCESS_MODE"],
  ["unknown access mode", { context: { kind: "all" } }, "INVALID_ACCESS_MODE"],
  ["missing record id", { context: { ...request().context, id: null } }, "RECORD_ID_REQUIRED"],
  ["missing owner", { context: { ...request().context, ownerId: null } }, "OWNER_CONTEXT_REQUIRED"],
  ["missing owner type", { context: { ...request().context, ownerType: undefined } }, "OWNER_CONTEXT_REQUIRED"],
  ["missing account", { context: { ...request().context, accountId: undefined } }, "ACCOUNT_CONTEXT_REQUIRED"],
  ["missing account owner", { context: { ...request().context, accountOwnerId: null } }, "ACCOUNT_CONTEXT_REQUIRED"],
  ["foreign account owner", { context: { ...request().context, accountOwnerId: "user-b" } }, "ACCOUNT_OWNERSHIP_MISMATCH"],
  ["foreign account tenant", { context: { ...request().context, accountTenantId: "tenant-b" } }, "ACCOUNT_OWNERSHIP_MISMATCH"],
  ["cross-user record", { context: { ...request().context, ownerId: "user-b" } }, "OWNERSHIP_MISMATCH"],
  ["cross-tenant record", { context: { ...request().context, tenantId: "tenant-b" } }, "OWNERSHIP_MISMATCH"],
  ["null IDs never create ownership", { principal: { ...principal(), userId: null }, context: { ...request().context, ownerId: null } }, "OWNER_IDENTITY_REQUIRED"]
]) {
  test(`WPay default deny: ${label}`, () => assert.deepEqual(authorize(request(change)), { allowed: false, reason }));
}
for (const status of ["suspended", "disabled", "pending", "", undefined]) {
  test(`WPay inactive principal denied (${String(status)})`, () => assert.equal(authorize(request({ principal: { ...principal(), status } })).reason, "PRINCIPAL_INACTIVE"));
}
test("WPay malformed top-level requests fail closed", () => {
  for (const input of [undefined, null, "browser-role"]) assert.equal(authorize(input).allowed, false);
});
test("WPay own record returns exact ownership/account constraints", () => {
  assert.deepEqual(authorize(request()), { allowed: true, reason: "ALLOWED", accessMode: "record", requiresBackendEnforcement: true,
    constraints: { where: { tenantId: "tenant-a", ownerType: "user", ownerId: "user-a", accountId: "account-a", id: "transaction-a" } } });
});
test("WPay own list requires a filter and is distinct from a record decision", () => {
  const result = authorize(request({ context: { kind: "list" } }));
  assert.equal(result.accessMode, "list");
  assert.deepEqual(result.constraints.where, { tenantId: "tenant-a", ownerType: "user", ownerId: "user-a" });
  assert.equal(result.requiresBackendEnforcement, true);
  assert.equal(authorize(request({ context: { kind: "record" } })).allowed, false);
  assert.equal(authorize(request({ context: { kind: "list", ownerId: "user-b" } })).allowed, false);
  assert.equal(authorize(request({ context: { kind: "list", accountId: "account-a" } })).reason, "ACCOUNT_CONTEXT_REQUIRED");
});
test("WPay Merchant own list and record never authorize another Merchant", () => {
  const input = request({ principal: principal("merchant"), grants: ["merchant.transactions.view"], permissionId: "merchant.transactions.view",
    context: { kind: "record", id: "order-a", tenantId: "tenant-a", ownerType: "merchant", ownerId: "merchant-a" } });
  assert.equal(authorize(input).allowed, true);
  assert.equal(authorize({ ...input, context: { ...input.context, ownerId: "merchant-b" } }).reason, "OWNERSHIP_MISMATCH");
  assert.equal(authorize({ ...input, context: { ...input.context, ownerId: undefined } }).allowed, false);
  const list = authorize({ ...input, context: { kind: "list" } });
  assert.deepEqual(list.constraints.where, { tenantId: "tenant-a", ownerType: "merchant", ownerId: "merchant-a" });
});
for (const [type, permissionId] of [["user", "users.view"], ["user", "merchant.transactions.view"], ["merchant", "users.view"], ["merchant", "user.transactions.view"]]) {
  test(`WPay role boundary: ${type} denied ${permissionId} even if supplied as a grant`, () => assert.equal(authorize(request({ principal: principal(type), permissionId, grants: [permissionId] })).reason, "PRINCIPAL_TYPE_NOT_ALLOWED"));
}
for (const [view, action] of [["users.view", "users.approve"], ["users.view", "users.commercial.update"], ["reports.view", "reports.export"], ["bank_upi.view", "bank_upi.freeze"], ["bank_upi.view", "bank_upi.release"], ["withdrawals.view", "withdrawals.reject"]]) {
  test(`WPay view does not imply ${action}`, () => {
    const input = request({ principal: principal("employee"), grants: [view], permissionId: action, adminScope: { tenantIds: ["tenant-a"] } });
    assert.equal(authorize(input).reason, "MISSING_PERMISSION");
  });
}
test("WPay Employee empty grants give no protected access", () => {
  assert.equal(validateGrants([], "employee").allowed, true);
  assert.equal(canUsePermission(request({ principal: principal("employee"), grants: [], permissionId: "users.view", adminScope: { tenantIds: ["tenant-a"] } })).reason, "MISSING_PERMISSION");
});
test("WPay dependency validation rejects rather than adding grants", () => {
  const selection = ["users.approve"];
  assert.equal(validateGrants(selection, "employee").reason, "MISSING_DEPENDENCY");
  assert.deepEqual(selection, ["users.approve"]);
  assert.equal(validateGrants(["users.view", "users.approve"], "employee").allowed, true);
  for (const id of ["employees.permissions.update", "employees.create", "ledger.adjust", "security.configure", "api_credentials.create", "api_credentials.revoke"]) assert.equal(validateGrants([id], "employee").reason, "NON_DELEGABLE_PERMISSION");
});
test("WPay administrative scope applies to both lists and records", () => {
  const input = request({ principal: principal("employee"), grants: ["users.view"], permissionId: "users.view", context: { kind: "list" }, adminScope: { tenantIds: ["tenant-a"] } });
  assert.deepEqual(authorize(input).constraints.where, { tenantIds: ["tenant-a"] });
  for (const adminScope of [undefined, {}, { tenantIds: [] }, { tenantIds: ["*"] }]) assert.equal(authorize({ ...input, adminScope }).allowed, false);
  assert.equal(authorize({ ...input, context: { kind: "record", id: "user-b", tenantId: "tenant-b" } }).reason, "OUTSIDE_ADMIN_SCOPE");
  assert.equal(authorize({ ...input, context: { kind: "record", id: "user-a", tenantId: "tenant-a" } }).allowed, true);
  assert.equal(authorize({ ...input, context: { kind: "list", tenantId: "tenant-b" } }).allowed, false);
});
test("WPay Super Admin still needs explicit grants and relevant scope", () => {
  const input = request({ principal: principal("super_admin"), permissionId: "security.configure", grants: ["settings.view", "security.configure"], adminScope: { platform: true }, context: { kind: "record", platform: true, id: "security-policy" } });
  assert.equal(authorize(input).allowed, true);
  assert.equal(authorize({ ...input, grants: [] }).reason, "MISSING_PERMISSION");
  assert.equal(authorize({ ...input, adminScope: {} }).reason, "PLATFORM_SCOPE_REQUIRED");
  const ledger = { ...input, grants: ["ledger.view", "ledger.adjust"], permissionId: "ledger.adjust", adminScope: { tenantIds: ["tenant-a"] }, context: { kind: "record", id: "ledger-account-a", tenantId: "tenant-a" } };
  assert.equal(authorize(ledger).reason, "OWNER_CONTEXT_REQUIRED");
});

for (const approvalStatus of ["pending", "approved"]) {
  for (const [permissionId, grants, ownerType, ownerId] of [
    ["user.deposits.view", ["user.deposits.view"], "user", "user-a"],
    ["user.bank_upi.submit", ["user.bank_upi.view", "user.bank_upi.submit"], "user", "user-a"],
    ["support.create", ["support.view", "support.create"], "principal", "user-principal"],
    ["profile.view", ["profile.view"], "principal", "user-principal"]
  ]) {
    test(`WPay ${approvalStatus} unfunded User retains ${permissionId}`, () => {
      const kind = getPermission(permissionId).accessModes.includes("create") ? "create" : "record";
      const input = request({ permissionId, grants, eligibility: { approvalStatus, initialDepositSatisfied: false }, context: { kind, id: "synthetic", tenantId: "tenant-a", ownerType, ownerId } });
      assert.equal(authorize(input).allowed, true);
    });
  }
}
for (const eligibility of [undefined, {}, { approvalStatus: "pending" }, { approvalStatus: "approved", initialDepositSatisfied: false }, { ...request().eligibility, initialDepositSatisfied: "true" }, { ...request().eligibility, statementSatisfied: undefined }, { ...request().eligibility, upiVerified: false }, { ...request().eligibility, operationsEnabled: false }]) {
  test(`WPay operational eligibility denies incomplete state ${JSON.stringify(eligibility)}`, () => assert.equal(authorize(request({ eligibility })).allowed, false));
}
test("WPay approved-bank verification requires global eligibility and the specific account approval", () => {
  const input = request({ permissionId: "user.bank_upi.verify", grants: ["user.bank_upi.view", "user.bank_upi.verify"], eligibility: { approvalStatus: "approved", approvedBankAccountAvailable: true }, context: { ...request().context, accountApproved: true } });
  assert.equal(authorize(input).allowed, true); // Funding is intentionally not a prerequisite.
  assert.equal(authorize({ ...input, context: { ...input.context, accountApproved: false } }).reason, "APPROVED_ACCOUNT_REQUIRED");
  assert.equal(authorize({ ...input, eligibility: { approvalStatus: "approved" } }).allowed, false);
});
test("WPay Merchant operations require explicit approved/enabled state", () => {
  const input = request({ principal: principal("merchant"), grants: ["merchant.collections.view", "merchant.collections.create"], permissionId: "merchant.collections.create", context: { kind: "create", tenantId: "tenant-a", ownerType: "merchant", ownerId: "merchant-a" } });
  assert.equal(authorize(input).allowed, true);
  for (const eligibility of [{}, { approvalStatus: "pending", operationsEnabled: true }, { approvalStatus: "approved" }]) assert.equal(authorize({ ...input, eligibility }).allowed, false);
});
test("WPay assigned capacity is a narrow projection, never general User access", () => {
  const input = request({ principal: principal("merchant"), grants: ["merchant.routing_capacity.view"], permissionId: "merchant.routing_capacity.view", context: {
    kind: "record", id: "capacity-b", ownerType: "user", ownerId: "user-b", tenantId: "tenant-b", subjectEligible: true,
    assignment: { id: "assignment-ab", active: true, merchantId: "merchant-a", merchantTenantId: "tenant-a", userId: "user-b", userTenantId: "tenant-b" }
  } });
  assert.deepEqual(authorize(input).constraints.projection, ["userId", "eligibleCapacity"]);
  for (const assignment of [null, { ...input.context.assignment, active: false }, { ...input.context.assignment, merchantId: "merchant-b" }, { ...input.context.assignment, userTenantId: "tenant-c" }]) assert.equal(authorize({ ...input, context: { ...input.context, assignment } }).reason, "ASSIGNMENT_REQUIRED");
  assert.equal(authorize({ ...input, context: { ...input.context, subjectEligible: undefined } }).allowed, false);
  const list = authorize({ ...input, context: { kind: "list" } });
  assert.equal(list.constraints.where.assignmentMerchantId, "merchant-a");
  assert.equal(list.constraints.where.assignmentActive, true);
  assert.equal(authorize({ ...input, permissionId: "user.transactions.view" }).allowed, false);
});

function delegation(overrides = {}) {
  return { principal: principal("super_admin"), grants: ["employees.view", "employees.create", "employees.permissions.update", "users.view", "users.approve", "reports.view", "reports.export"],
    currentPermissionVersion: 7, adminScope: { platform: true, tenantIds: ["tenant-a"] }, operation: "update", targetEmployeeId: "employee-b",
    selectedPermissions: ["users.view"], delegatedScope: { tenantIds: ["tenant-a"] }, ...overrides };
}
for (const [label, change, reason] of [
  ["Employee self-escalation", { principal: principal("employee"), targetEmployeeId: "employee-principal" }, "SUPER_ADMIN_REQUIRED"],
  ["Employee to Employee delegation", { principal: principal("employee") }, "SUPER_ADMIN_REQUIRED"],
  ["Admin assignment", { principal: principal("admin") }, "SUPER_ADMIN_REQUIRED"],
  ["Super Admin self-modification", { targetEmployeeId: "super_admin-principal" }, "SELF_ESCALATION"],
  ["unknown selection", { selectedPermissions: ["unknown.view"] }, "UNKNOWN_PERMISSION"],
  ["wildcard selection", { selectedPermissions: ["*"] }, "WILDCARD_GRANT"],
  ["non-delegable selection", { selectedPermissions: ["employees.create"] }, "NON_DELEGABLE_PERMISSION"],
  ["missing dependency", { selectedPermissions: ["users.approve"] }, "MISSING_DEPENDENCY"],
  ["missing selection", { selectedPermissions: undefined }, "INVALID_GRANTS"],
  ["outside delegated scope", { delegatedScope: { tenantIds: ["tenant-b"] } }, "OUTSIDE_ADMIN_SCOPE"],
  ["platform delegation", { delegatedScope: { tenantIds: ["tenant-a"], platform: true } }, "INVALID_DELEGATED_SCOPE"],
  ["actor lacks selected grant", { selectedPermissions: ["merchants.view"] }, "GRANT_NOT_HELD_BY_ACTOR"]
]) test(`WPay delegation rejects ${label}`, () => assert.equal(validateEmployeeSelection(delegation(change)).reason, reason));
test("WPay Super Admin validates explicit selection without hidden grants", () => {
  const input = delegation({ selectedPermissions: ["users.view", "users.approve"] });
  const before = JSON.stringify(input);
  const result = validateEmployeeSelection(input);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.permissions, ["users.view", "users.approve"]);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input.delegatedScope.tenantIds), false);
  const empty = validateEmployeeSelection(delegation({ operation: "create", selectedPermissions: [], delegatedScope: { tenantIds: [] } }));
  assert.equal(empty.allowed, true);
  assert.deepEqual(empty.permissions, []);
});
test("WPay direct permission update cannot conceal a self target behind another Employee ID", () => {
  const input = delegation();
  const result = authorize({ ...input, permissionId: "employees.permissions.update", context: { kind: "record", platform: true, id: input.principal.id, targetEmployeeId: "employee-b" } });
  assert.equal(result.reason, "EMPLOYEE_TARGET_MISMATCH");
});
test("WPay OTP permission is a menu descriptor, never data authorization", () => {
  const input = request({ permissionId: "user.otp_events.view", grants: ["user.otp_events.view"] });
  assert.equal(canUsePermission(input).allowed, true);
  assert.equal(authorize(input).reason, "DESCRIPTOR_ONLY");
});
test("WPay deny responses contain reason codes only, no supplied secrets or identifiers", () => {
  const result = authorize(request({ context: { ...request().context, ownerId: "sensitive-synthetic-id" } }));
  assert.deepEqual(Object.keys(result), ["allowed", "reason"]);
  assert.equal(JSON.stringify(result).includes("sensitive"), false);
});
test("WPay policy does not mutate or freeze caller-owned snapshots", () => {
  const input = request({ principal: principal("employee"), permissionId: "users.view", grants: ["users.view"], adminScope: { tenantIds: ["tenant-a"] }, context: { kind: "list" } });
  const before = JSON.stringify(input);
  const output = authorize(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input.adminScope.tenantIds), false);
  assert.throws(() => output.constraints.where.tenantIds.push("tenant-b"), TypeError);
  assert.deepEqual(authorize(input).constraints.where.tenantIds, ["tenant-a"]);
});
test("WPay module imports and decisions have no database/network/runtime side effects", () => {
  const cache = new Map();
  const blocked = () => { throw new Error("Forbidden runtime side effect"); };
  function load(name) {
    assert.ok(["permission-catalog", "authorization-policy", "navigation"].includes(name), "Only standalone modules may be imported");
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const sandbox = { module, exports: module.exports,
      require(specifier) { assert.ok(["./permission-catalog", "./authorization-policy"].includes(specifier)); return load(specifier.slice(2)); },
      process: new Proxy({}, { get: blocked }), console: new Proxy({}, { get: blocked }), fetch: blocked,
      setTimeout: blocked, setInterval: blocked, setImmediate: blocked,
      Date: new Proxy(Date, { get: blocked, construct: blocked }), Math: new Proxy(Math, { get(target, key) { return key === "random" ? blocked : Reflect.get(target, key); } }) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../lib/wpay", name + ".js"), "utf8"), sandbox, { timeout: 1000 });
    cache.set(name, module.exports);
    return module.exports;
  }
  const policy = load("authorization-policy");
  assert.equal(policy.authorize(request()).allowed, true);
  assert.equal(policy.validateEmployeeSelection(delegation()).allowed, true);
  assert.equal(load("navigation").deriveNavigation(request()).length, 1);
  assert.equal(load("permission-catalog").PERMISSION_CATALOG.length, PERMISSION_CATALOG.length);
});
