"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildPrincipalContext } = require("../lib/wpay/auth/principal-context");
const { PRINCIPAL_TYPES } = require("../lib/wpay/permission-catalog");
const { canUsePermission, authorize } = require("../lib/wpay/authorization-policy");
const { deriveNavigation } = require("../lib/wpay/navigation");

function fixture(type = "user", grants = ["profile.view"]) {
  const binding = { subjectId: "subject-a", accountId: `${type}-principal`, tenantId: "tenant-a" };
  const account = { subjectId: binding.subjectId, id: binding.accountId, tenantId: binding.tenantId,
    type, status: "active", currentPermissionVersion: 7 };
  if (type === "user") account.userId = "user-a";
  if (type === "merchant") account.merchantId = "merchant-a";
  const grantRecord = { ...binding, permissionVersion: 7, grants: [...grants] };
  if (["admin", "super_admin", "employee"].includes(type)) grantRecord.adminScope = { tenantIds: ["tenant-a"] };
  return { identity: { ...binding, permissionVersion: 7 }, account, grantRecord,
    eligibilityRecord: { ...binding, facts: { approvalStatus: "approved", initialDepositSatisfied: true,
      statementSatisfied: true, upiApproved: true, upiVerified: true, operationsEnabled: true, approvedBankAccountAvailable: true } } };
}
function built(input) {
  const result = buildPrincipalContext(input);
  assert.equal(result.ok, true, result.reason);
  return result.context;
}
const capability = (context, permissionId) => canUsePermission({ ...context, permissionId });
const decision = (context, permissionId, resource = { kind: "list" }) => authorize({ ...context, permissionId, context: resource });
const pages = context => deriveNavigation(context).flatMap(group => group.children);

for (const type of PRINCIPAL_TYPES) test(`adapter accepts exact ${type} and integrates self authorization`, () => {
  const context = built(fixture(type));
  assert.equal(context.principal.type, type);
  assert.equal(context.principal.id, `${type}-principal`);
  assert.deepEqual(context.grants, ["profile.view"]);
  assert.equal(capability(context, "profile.view").requiresResourceAuthorization, true);
  assert.deepEqual(decision(context, "profile.view").constraints.where,
    { tenantId: "tenant-a", ownerType: "principal", ownerId: `${type}-principal` });
  // Task 2 defines a profile page only for User/Merchant audiences.
  assert.deepEqual(pages(context).map(page => page.permissionId), ["user", "merchant"].includes(type) ? ["profile.view"] : []);
});

for (const value of [undefined, null, "raw-request", [], 1, true]) test(`adapter rejects top-level ${String(value)}`, () => {
  assert.deepEqual(buildPrincipalContext(value), { ok: false, reason: "INVALID_INPUT" });
});
for (const value of [undefined, null, {}, [], "unsigned-token"]) test(`adapter rejects malformed identity ${JSON.stringify(value)}`, () => {
  const input = fixture(); input.identity = value;
  assert.deepEqual(buildPrincipalContext(input), { ok: false, reason: "INVALID_IDENTITY" });
});
for (const key of ["subjectId", "accountId", "tenantId"]) {
  test(`adapter requires identity ${key} without coercion or normalization`, () => {
    for (const value of [undefined, null, "", 1, {}, " tenant-a", "tenant/a", "a".repeat(161)]) {
      const input = fixture(); input.identity[key] = value;
      assert.equal(buildPrincipalContext(input).reason, "INVALID_IDENTITY");
    }
  });
  test(`adapter rejects different identity ${key}`, () => {
    const input = fixture(); input.identity[key] = "different-id";
    assert.equal(buildPrincipalContext(input).reason, "IDENTITY_ACCOUNT_MISMATCH");
  });
  test(`adapter binds grant ${key}, including Employee identity`, () => {
    for (const value of [undefined, null, "different-employee"]) {
      const input = fixture("employee", ["users.view"]); input.grantRecord[key] = value;
      assert.equal(buildPrincipalContext(input).reason, "GRANT_ACCOUNT_MISMATCH");
    }
  });
  test(`adapter binds eligibility ${key}`, () => {
    const input = fixture(); input.eligibilityRecord[key] = "different-id";
    assert.equal(buildPrincipalContext(input).reason, "ELIGIBILITY_ACCOUNT_MISMATCH");
  });
}
test("adapter rejects missing account or identity fields even when both sides are null", () => {
  for (const value of [undefined, null, {}, []]) {
    const input = fixture(); input.account = value;
    assert.equal(buildPrincipalContext(input).reason, "INVALID_ACCOUNT");
  }
  for (const key of ["subjectId", "id", "tenantId"]) {
    const input = fixture(); delete input.account[key];
    assert.equal(buildPrincipalContext(input).reason, "INVALID_ACCOUNT");
  }
  const input = fixture(); input.identity.accountId = null; input.account.id = null;
  assert.equal(buildPrincipalContext(input).reason, "INVALID_IDENTITY");
});
for (const type of ["user", "merchant"]) test(`adapter requires resolved ${type} owner ID`, () => {
  const input = fixture(type); delete input.account[type + "Id"];
  assert.equal(buildPrincipalContext(input).reason, "OWNER_IDENTITY_REQUIRED");
});
test("adapter accepts exact bounded IDs without changing case or punctuation", () => {
  const input = fixture();
  input.identity.subjectId = input.account.subjectId = input.grantRecord.subjectId = input.eligibilityRecord.subjectId = "A_.:-" + "x".repeat(155);
  assert.equal(buildPrincipalContext(input).ok, true);
  input.identity.subjectId = input.identity.subjectId.toLowerCase();
  assert.equal(buildPrincipalContext(input).reason, "IDENTITY_ACCOUNT_MISMATCH");
});
for (const role of ["Admin", "root", "superadmin", "USER", undefined]) test(`adapter rejects role ${String(role)}`, () => {
  const input = fixture(); input.account.type = role;
  assert.equal(buildPrincipalContext(input).reason, "UNKNOWN_PRINCIPAL_TYPE");
});
for (const [grants, reason] of [
  [undefined, "INVALID_GRANTS"], [null, "INVALID_GRANTS"], [{ "users.view": true }, "INVALID_GRANTS"],
  [[1], "INVALID_GRANTS"], [["*"], "WILDCARD_GRANT"], [["users.*"], "WILDCARD_GRANT"],
  [["made.up"], "UNKNOWN_PERMISSION"], [["users.view", "users.view"], "DUPLICATE_GRANT"],
  [["users.approve"], "MISSING_DEPENDENCY"], [["employees.create"], "NON_DELEGABLE_PERMISSION"]
]) test(`adapter reuses grant denial ${reason}: ${JSON.stringify(grants)}`, () => {
  const input = fixture("employee"); input.grantRecord.grants = grants;
  assert.deepEqual(buildPrincipalContext(input), { ok: false, reason });
});
test("adapter requires a bound grant record, even for empty selections", () => {
  for (const value of [undefined, null, [], "*"]) {
    const input = fixture(); input.grantRecord = value;
    assert.equal(buildPrincipalContext(input).reason, "INVALID_GRANT_RECORD");
  }
});
for (const [type, grants] of [["user", ["users.view"]], ["merchant", ["user.transactions.view"]], ["admin", ["employees.view", "employees.create"]]]) {
  test(`adapter preserves ${type} role boundary`, () => assert.equal(buildPrincipalContext(fixture(type, grants)).reason, "PRINCIPAL_TYPE_NOT_ALLOWED"));
}
for (const [source, key] of [["identity", "permissionVersion"], ["account", "currentPermissionVersion"], ["grantRecord", "permissionVersion"]]) {
  test(`adapter requires safe integer ${source} version`, () => {
    for (const value of [undefined, null, "7", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const input = fixture(); input[source][key] = value;
      assert.equal(buildPrincipalContext(input).reason, "PERMISSION_VERSION_REQUIRED");
    }
  });
}
test("adapter rejects stale identity and inconsistent grant reads; never repairs versions", () => {
  const stale = fixture(); stale.identity.permissionVersion = 6;
  assert.equal(buildPrincipalContext(stale).reason, "STALE_PERMISSION_VERSION");
  const mixed = fixture(); mixed.grantRecord.permissionVersion = 6;
  assert.equal(buildPrincipalContext(mixed).reason, "GRANT_VERSION_MISMATCH");
  const zero = fixture(); zero.identity.permissionVersion = zero.account.currentPermissionVersion = zero.grantRecord.permissionVersion = 0;
  assert.equal(built(zero).principal.permissionVersion, 0);
});
test("adapter rejects missing, malformed and wildcard administrative scope", () => {
  for (const adminScope of [undefined, null, {}, { tenantIds: [] }, { tenantIds: ["*"] }, { tenantIds: [null] }, { tenantIds: ["tenant-a", "tenant-a"] }, { tenantIds: new Array(1) }]) {
    const input = fixture("employee", ["users.view"]); input.grantRecord.adminScope = adminScope;
    assert.equal(buildPrincipalContext(input).ok, false);
  }
  for (const type of ["employee", "admin", "user"]) {
    const input = fixture(type); input.grantRecord.adminScope = { tenantIds: ["tenant-a"], platform: true };
    assert.equal(buildPrincipalContext(input).reason, "INVALID_ADMIN_SCOPE");
  }
});
test("adapter never supplies missing Super Admin platform authority or grants", () => {
  const input = fixture("super_admin", ["employees.view", "employees.create"]);
  assert.equal(buildPrincipalContext(input).reason, "PLATFORM_SCOPE_REQUIRED");
  input.grantRecord.adminScope.platform = true;
  const context = built(input);
  assert.equal(decision(context, "employees.create", { kind: "create", platform: true }).allowed, true);
  assert.equal(capability(context, "security.configure").reason, "MISSING_PERMISSION");
  input.grantRecord.adminScope.platform = "true";
  assert.equal(buildPrincipalContext(input).reason, "INVALID_ADMIN_SCOPE");
});
test("empty Employee grants produce no capability or navigation", () => {
  const input = fixture("employee", []); delete input.grantRecord.adminScope;
  const context = built(input);
  assert.deepEqual(context.grants, []);
  assert.deepEqual(deriveNavigation(context), []);
  for (const permission of ["users.view", "profile.view", "employees.create"]) assert.equal(capability(context, permission).allowed, false);
});
test("Employee view does not imply approval, commercial editing or export", () => {
  const context = built(fixture("employee", ["users.view", "reports.view"]));
  assert.deepEqual(pages(context).map(page => page.label), ["User Directory", "Reports"]);
  for (const permission of ["users.approve", "users.commercial.update", "reports.export"]) assert.equal(decision(context, permission).reason, "MISSING_PERMISSION");
  assert.deepEqual(decision(context, "users.view").constraints.where, { tenantIds: ["tenant-a"] });
  assert.equal(decision(context, "users.view", { kind: "record", id: "user-b", tenantId: "tenant-b" }).reason, "OUTSIDE_ADMIN_SCOPE");
});
for (const status of ["suspended", "disabled", "pending", "restricted", "pending_admin_approval", "future_status"]) test(`adapter preserves ${status} as a restricted snapshot`, () => {
  const input = fixture(); input.account.status = status;
  const context = built(input);
  assert.equal(context.principal.status, status);
  assert.equal(capability(context, "profile.view").reason, "PRINCIPAL_INACTIVE");
  assert.deepEqual(deriveNavigation(context), []);
});
test("adapter rejects malformed status rather than defaulting to active", () => {
  for (const status of [undefined, null, "", true, {}]) {
    const input = fixture(); input.account.status = status;
    assert.equal(buildPrincipalContext(input).reason, "INVALID_ACCOUNT_STATUS");
  }
});
test("missing eligibility never enables operations but preserves onboarding", () => {
  const input = fixture("user", ["user.deposits.view", "user.transactions.view"]);
  delete input.eligibilityRecord;
  const context = built(input);
  assert.equal(Object.hasOwn(context, "eligibility"), false);
  assert.equal(capability(context, "user.transactions.view").reason, "APPROVAL_REQUIRED");
  assert.equal(decision(context, "user.deposits.view").allowed, true);
  assert.deepEqual(pages(context).map(page => page.label), ["USDT Deposit"]);
});
test("pending approval and false or missing financial facts are preserved", () => {
  for (const facts of [{}, { approvalStatus: "pending", initialDepositSatisfied: false }, { approvalStatus: "approved", initialDepositSatisfied: false }, { approvalStatus: "future_status" }]) {
    const input = fixture("user", ["user.deposits.view", "user.transactions.view"]); input.eligibilityRecord.facts = facts;
    const context = built(input);
    assert.deepEqual(context.eligibility, facts);
    assert.equal(capability(context, "user.transactions.view").allowed, false);
    assert.equal(capability(context, "user.deposits.view").allowed, true);
  }
  for (const key of ["initialDepositSatisfied", "statementSatisfied", "upiApproved", "upiVerified", "operationsEnabled"]) {
    const input = fixture("user", ["user.transactions.view"]); delete input.eligibilityRecord.facts[key];
    assert.equal(capability(built(input), "user.transactions.view").reason, "USER_NOT_OPERATIONALLY_ELIGIBLE");
  }
});
test("malformed eligibility facts never become booleans", () => {
  for (const value of ["true", 1, null, {}]) {
    const input = fixture(); input.eligibilityRecord.facts.operationsEnabled = value;
    assert.equal(buildPrincipalContext(input).reason, "INVALID_ELIGIBILITY_FACTS");
  }
  const input = fixture(); input.eligibilityRecord = null;
  assert.equal(buildPrincipalContext(input).reason, "INVALID_ELIGIBILITY_RECORD");
  input.eligibilityRecord = { ...fixture().eligibilityRecord, facts: null };
  assert.equal(buildPrincipalContext(input).reason, "INVALID_ELIGIBILITY_FACTS");
});
test("approved bank capability still requires the specific approved account", () => {
  const input = fixture("user", ["user.bank_upi.view", "user.bank_upi.verify"]);
  input.eligibilityRecord.facts.initialDepositSatisfied = false;
  const context = built(input);
  const resource = { kind: "record", id: "upi-a", tenantId: "tenant-a", ownerType: "user", ownerId: "user-a", accountId: "bank-a", accountOwnerId: "user-a", accountTenantId: "tenant-a", accountApproved: true };
  assert.equal(decision(context, "user.bank_upi.verify", resource).allowed, true);
  assert.equal(decision(context, "user.bank_upi.verify", { ...resource, accountApproved: false }).reason, "APPROVED_ACCOUNT_REQUIRED");
});
for (const type of ["user", "merchant"]) test(`adapter preserves ${type} cross-owner and list constraints`, () => {
  const permission = `${type}.transactions.view`;
  const context = built(fixture(type, [permission]));
  const resource = { kind: "record", id: "transaction-a", tenantId: "tenant-a", ownerType: type, ownerId: `${type}-a` };
  if (type === "user") Object.assign(resource, { accountId: "bank-a", accountOwnerId: "user-a", accountTenantId: "tenant-a" });
  assert.equal(decision(context, permission, resource).allowed, true);
  assert.equal(decision(context, permission, { ...resource, ownerId: `${type}-b` }).reason, "OWNERSHIP_MISMATCH");
  assert.equal(decision(context, permission, { ...resource, tenantId: "tenant-b" }).reason, "OWNERSHIP_MISMATCH");
  assert.deepEqual(decision(context, permission).constraints.where, { tenantId: "tenant-a", ownerType: type, ownerId: `${type}-a` });
  assert.equal(decision(context, permission).requiresBackendEnforcement, true);
  assert.equal(pages(context).length, 1);
  if (type === "user") {
    assert.equal(decision(context, permission, { ...resource, accountId: undefined }).reason, "ACCOUNT_CONTEXT_REQUIRED");
    assert.equal(decision(context, permission, { ...resource, accountOwnerId: "user-b" }).reason, "ACCOUNT_OWNERSHIP_MISMATCH");
  }
});
test("Merchant capacity remains an assignment-filtered projection", () => {
  const context = built(fixture("merchant", ["merchant.routing_capacity.view"]));
  assert.deepEqual(decision(context, "merchant.routing_capacity.view").constraints, {
    where: { assignmentMerchantId: "merchant-a", assignmentMerchantTenantId: "tenant-a", assignmentActive: true, userEligible: true },
    projection: ["userId", "eligibleCapacity"]
  });
  assert.equal(decision(context, "merchant.routing_capacity.view", { kind: "record", id: "capacity-b", tenantId: "tenant-b", ownerType: "user", ownerId: "user-b" }).reason, "ASSIGNMENT_REQUIRED");
  const input = fixture("merchant", ["merchant.routing_capacity.view"]); delete input.eligibilityRecord.facts.operationsEnabled;
  assert.equal(capability(built(input), "merchant.routing_capacity.view").reason, "MERCHANT_NOT_OPERATIONALLY_ELIGIBLE");
});
test("transport claims and trusted tags cannot override resolved authority", () => {
  const input = fixture("employee", ["users.view"]);
  const original = built(input);
  const claims = { type: "super_admin", status: "active", grants: ["*"], permissionVersion: 900, adminScope: { tenantIds: ["tenant-b"], platform: true }, eligibility: { operationsEnabled: true }, trusted: true };
  Object.assign(input, claims, { body: claims, headers: claims, query: claims, localStorage: claims, unsignedToken: claims, principal: claims });
  Object.assign(input.identity, claims);
  input.identity.permissionVersion = 7;
  Object.assign(input.account, { role: "super_admin", grants: ["*"], trusted: true, adminScope: claims.adminScope });
  input.grantRecord.type = "super_admin";
  assert.deepEqual(built(input), original);
  assert.equal(capability(built(input), "employees.create").allowed, false);
  assert.equal(buildPrincipalContext({ body: fixture(), trusted: true }).reason, "INVALID_IDENTITY");
});
test("secret-bearing extras are not read, copied, logged or echoed on failure", () => {
  const input = fixture("employee", ["users.view"]);
  const expected = built(input);
  for (const row of [input, input.identity, input.account, input.grantRecord, input.grantRecord.adminScope, input.eligibilityRecord, input.eligibilityRecord.facts]) {
    for (const key of ["password", "sessionToken", "apiSecret", "bankLogin", "otpCode", "rawSms", "privateKey", "email", "phone"]) {
      Object.defineProperty(row, key, { enumerable: true, get() { throw new Error("Extra secret must never be accessed"); } });
    }
  }
  assert.deepEqual(built(input), expected);
  input.identity.subjectId = "different-subject";
  assert.deepEqual(buildPrincipalContext(input), { ok: false, reason: "IDENTITY_ACCOUNT_MISMATCH" });
  input.identity.subjectId = "synthetic-secret-invalid/subject";
  assert.deepEqual(buildPrincipalContext(input), { ok: false, reason: "INVALID_IDENTITY" });
});
test("inherited fields and required accessors cannot supply identity authority", () => {
  const input = fixture(); input.identity = Object.create(input.identity);
  assert.equal(buildPrincipalContext(input).reason, "INVALID_IDENTITY");
  input.identity = fixture().identity;
  Object.defineProperty(input.identity, "subjectId", { get() { throw new Error("Do not execute identity accessor"); } });
  assert.equal(buildPrincipalContext(input).reason, "INVALID_IDENTITY");
});
test("construction leaves inputs writable and unchanged; later changes cannot affect snapshot", () => {
  const input = fixture("employee", ["users.view"]);
  const before = structuredClone(input);
  const context = built(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input.account), false);
  assert.equal(Object.isFrozen(input.grantRecord.grants), false);
  input.account.status = "suspended";
  input.grantRecord.grants.push("users.approve");
  input.grantRecord.adminScope.tenantIds.push("tenant-b");
  input.eligibilityRecord.facts.operationsEnabled = false;
  assert.equal(context.principal.status, "active");
  assert.deepEqual(context.grants, ["users.view"]);
  assert.deepEqual(context.adminScope.tenantIds, ["tenant-a"]);
  assert.equal(context.eligibility.operationsEnabled, true);
  assert.equal(capability(context, "users.view").allowed, true); // Old frozen snapshot does not learn revocation.
  assert.equal(capability(built(input), "users.view").reason, "PRINCIPAL_INACTIVE");
});
test("all returned structures are frozen and cannot widen future decisions", () => {
  const result = buildPrincipalContext(fixture("super_admin", ["users.view"]));
  function assertFrozen(value) {
    if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(assertFrozen); }
  }
  assertFrozen(result);
  const context = result.context;
  for (const mutate of [
    () => { result.context = {}; }, () => { context.principal.type = "employee"; },
    () => context.grants.push("users.approve"), () => context.adminScope.tenantIds.push("tenant-b"),
    () => { context.adminScope.platform = true; }, () => { context.eligibility.operationsEnabled = false; }
  ]) assert.throws(mutate, TypeError);
  assert.equal(capability(context, "users.approve").reason, "MISSING_PERMISSION");
  assert.deepEqual(decision(context, "users.view").constraints.where, { tenantIds: ["tenant-a"] });
  assertFrozen(buildPrincipalContext(null));
  assert.equal(Object.isFrozen(require("../lib/wpay/auth/principal-context")), true);
});
test("OTP remains descriptor only for User and administrative principals", () => {
  for (const type of PRINCIPAL_TYPES.filter(type => type !== "merchant")) {
    const permission = type === "user" ? "user.otp_events.view" : "otp_events.view";
    const context = built(fixture(type, [permission]));
    assert.equal(capability(context, permission).allowed, true);
    assert.equal(pages(context)[0].descriptorOnly, true);
    assert.equal(pages(context)[0].routeStatus, "planned");
    assert.deepEqual(decision(context, permission), { allowed: false, reason: "DESCRIPTOR_ONLY" });
  }
});
test("statement permissions retain unresolved blocker metadata, not executable integrations", () => {
  const context = built(fixture("user", ["user.statements.view", "user.statements.submit"]));
  assert.deepEqual(pages(context)[0].blockers, ["tenant_account_isolation", "trusted_evidence"]);
  assert.equal(pages(context)[0].routeStatus, "planned");
  assert.equal(decision(context, "user.statements.submit", { kind: "create", tenantId: "tenant-a", ownerType: "user", ownerId: "user-a" }).reason, "ACCOUNT_CONTEXT_REQUIRED");
});
test("adapter import and calls use only the pure catalog and policy dependencies", () => {
  const cache = new Map();
  const blocked = () => { throw new Error("Forbidden runtime side effect"); };
  const sources = ["auth/principal-context", "permission-catalog", "authorization-policy", "navigation"];
  function load(name) {
    assert.ok(sources.includes(name));
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const sandbox = { module, exports: module.exports,
      require(specifier) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
        assert.ok(specifier.startsWith("."));
        return load(target);
      },
      process: new Proxy({}, { get: blocked }), console: new Proxy({}, { get: blocked }), fetch: blocked,
      setTimeout: blocked, setInterval: blocked, setImmediate: blocked,
      Date: new Proxy(Date, { get: blocked, construct: blocked }),
      Math: new Proxy(Math, { get(target, key) { return key === "random" ? blocked : Reflect.get(target, key); } }) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../lib/wpay", name + ".js"), "utf8"), sandbox, { timeout: 1000 });
    cache.set(name, module.exports);
    return module.exports;
  }
  const adapter = load("auth/principal-context");
  const input = fixture("user", ["user.transactions.view"]);
  const before = JSON.stringify(input);
  const context = adapter.buildPrincipalContext(input).context;
  assert.equal(load("authorization-policy").authorize({ ...context, permissionId: "user.transactions.view", context: { kind: "list" } }).allowed, true);
  assert.equal(load("navigation").deriveNavigation(context).length, 1);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(adapter.buildPrincipalContext(input)), JSON.stringify(adapter.buildPrincipalContext(input)));
});
