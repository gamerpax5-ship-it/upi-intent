"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PRINCIPAL_TYPES, PERMISSION_GROUPS, PERMISSION_CATALOG, getPermission, getEmployeePermissionGroups } = require("../lib/wpay/permission-catalog");
const { canUsePermission, authorize, validateGrants } = require("../lib/wpay/authorization-policy");
const { NAVIGATION_DEFINITION, deriveNavigation } = require("../lib/wpay/navigation");

function input(type, grants) {
  return { principal: { id: `${type}-principal`, type, status: "active", tenantId: "tenant-a", userId: "user-a", merchantId: "merchant-a", permissionVersion: 1 },
    grants: grants || PERMISSION_CATALOG.filter(permission => permission.principalTypes.includes(type) && (type !== "employee" || permission.employeeDelegable)).map(permission => permission.id),
    currentPermissionVersion: 1, adminScope: { tenantIds: ["tenant-a"], platform: type === "super_admin" },
    eligibility: { approvalStatus: "approved", initialDepositSatisfied: true, statementSatisfied: true, upiApproved: true, upiVerified: true, operationsEnabled: true, approvedBankAccountAvailable: true } };
}
const expectedUser = [
  ["Overview", ["Dashboard", "Analytics"]],
  ["Bank & UPI", ["Add Bank / UPI", "UPI Verification", "UPI Analytics", "Upload Statement"]],
  ["Finance", ["Pay-in Commission", "Payout Commission", "INR Withdrawal", "USDT Withdrawal", "USDT Deposit", "Holds / Frozen"]],
  ["Operations", ["Pay-in Transactions", "INR Payout", "USDT Payout", "Parking Beneficiary", "Parking Payment", "Transaction History"]],
  ["APK & Events", ["Download APK", "Activation Codes", "Linked Devices", "OTP Events"]],
  ["Trade with WPay", ["Coming Soon"]],
  ["Settings", ["Profile", "Notifications", "Support", "User Guide", "Security / Two-Factor Authentication"]]
];
const expectedMerchant = [
  ["Overview", ["Dashboard", "Analytics"]],
  ["Collections", ["Create Payment Link", "Payment Orders", "Total Transactions"]],
  ["Payouts & Withdrawals", ["INR Payout", "USDT Payout", "USDT Withdrawal", "Payout History"]],
  ["Finance", ["Balance & Ledger", "Platform Fees", "Hold / Frozen"]],
  ["Developer / API", ["API Credentials", "API Documentation", "Webhooks", "API Logs"]],
  ["Settings", ["Profile", "Notifications", "Support", "Security", "Security / Two-Factor Authentication"]]
];
for (const [type, expected] of [["user", expectedUser], ["merchant", expectedMerchant]]) {
  test(`WPay ${type} hierarchy matches approved ordering and labels`, () => {
    assert.deepEqual(deriveNavigation(input(type)).map(group => [group.label, group.children.map(page => page.label)]), expected);
  });
}
test("WPay administration preserves the 14 agreed parent groups", () => {
  assert.deepEqual(deriveNavigation(input("super_admin")).map(group => group.label), ["Overview", "Users", "Merchants", "Bank & UPI", "Routing", "Transactions", "Finance", "Parking", "APK & Events", "Developer / API", "Employees", "Reports", "Support", "Settings"]);
});
for (const type of PRINCIPAL_TYPES) {
  test(`WPay ${type} navigation contains only its allowed children and is deterministic`, () => {
    const request = input(type);
    assert.equal(validateGrants(request.grants, type).allowed, true);
    const result = deriveNavigation(request);
    assert.ok(result.length);
    for (const group of result) {
      assert.ok(group.children.length);
      assert.ok(group.principalTypes.includes(type));
      for (const page of group.children) {
        assert.equal(canUsePermission({ ...request, permissionId: page.permissionId }).allowed, true);
        assert.equal(page.routeStatus, "planned");
        assert.equal(page.requiresResourceAuthorization, true);
      }
    }
    assert.deepEqual(deriveNavigation(request), result);
    assert.deepEqual(deriveNavigation({ ...request, grants: [...request.grants].reverse() }), result);
  });
}
for (const request of [undefined, null, input("employee", []), input("user", []), input("unknown", []), { ...input("user"), principal: { ...input("user").principal, status: "suspended" } }, input("employee", ["users.*"]), input("employee", ["users.approve"]), { ...input("employee", ["users.view"]), adminScope: {} }]) {
  test(`WPay navigation fails closed for invalid/empty snapshot ${JSON.stringify(request?.grants?.slice(0, 2))}`, () => assert.deepEqual(deriveNavigation(request), []));
}
test("WPay limited Employee only sees explicitly granted pages; empty parents disappear", () => {
  const request = input("employee", ["users.view", "reports.view"]);
  assert.deepEqual(deriveNavigation(request).map(group => [group.label, group.children.map(page => page.label)]), [["Users", ["User Directory"]], ["Reports", ["Reports"]]]);
  assert.equal(deriveNavigation(request).flatMap(group => group.children).some(page => /approve|terms|export/i.test(page.id)), false);
});
test("WPay approval uses the canonical User destination with separate action checks", () => {
  const request = input("employee", ["users.view", "users.approve"]);
  const result = deriveNavigation(request);
  assert.deepEqual(result[0].children.map(page => page.label), ["User Directory"]);
  assert.equal(canUsePermission({ ...request, permissionId: "users.approve" }).allowed, true);
  assert.equal(canUsePermission({ ...request, permissionId: "users.commercial.update" }).allowed, false);
});
test("WPay Admin and Employee cannot see Super Admin-only pages", () => {
  for (const type of ["admin", "employee"]) {
    const pages = deriveNavigation(input(type)).flatMap(group => group.children);
    for (const page of pages) assert.equal(getPermission(page.permissionId).restricted, false);
    assert.equal(pages.some(page => page.permissionId === "employees.create"), false);
    assert.equal(pages.some(page => page.permissionId === "employees.permissions.update"), false);
  }
});
test("WPay User/Merchant do not receive administrative destinations", () => {
  for (const type of ["user", "merchant"]) {
    const pages = deriveNavigation(input(type)).flatMap(group => group.children);
    assert.ok(pages.every(page => page.destinationId.startsWith(type + ".")));
    assert.equal(pages.some(page => page.destinationId.startsWith("administration.")), false);
  }
});
test("WPay onboarding menus remain available without operation eligibility", () => {
  const request = { ...input("user"), eligibility: { approvalStatus: "pending", initialDepositSatisfied: false } };
  const pages = deriveNavigation(request).flatMap(group => group.children);
  for (const destination of ["user.dashboard", "user.bank-upi", "user.statements", "user.usdt-deposit", "user.profile", "user.support"]) assert.ok(pages.some(page => page.destinationId === destination));
  for (const destination of ["user.transactions", "user.inr-payout", "user.usdt-withdrawal", "user.upi-verification"]) assert.equal(pages.some(page => page.destinationId === destination), false);
});
test("WPay navigation presence cannot authorize a cross-owner record", () => {
  const request = input("user", ["user.transactions.view"]);
  assert.equal(deriveNavigation(request)[0].children[0].destinationId, "user.transactions");
  assert.equal(authorize({ ...request, permissionId: "user.transactions.view", context: { kind: "record", id: "other-transaction", tenantId: "tenant-b", ownerId: "user-b", ownerType: "user", accountId: "account-b", accountOwnerId: "user-b", accountTenantId: "tenant-b" } }).allowed, false);
});
test("WPay all navigation/group/destination IDs and planned paths are unique", () => {
  const pages = NAVIGATION_DEFINITION.flatMap(group => group.children);
  const ids = [...NAVIGATION_DEFINITION.map(group => group.id), ...pages.map(page => page.id)];
  assert.equal(new Set(ids).size, ids.length);
  for (const key of ["destinationId", "plannedRoute"]) assert.equal(new Set(pages.map(page => page[key])).size, pages.length);
  assert.ok(pages.every(page => /^\/panels\/wpay\/(user|merchant|administration)\/[a-z0-9-]+$/.test(page.plannedRoute)));
});
test("WPay APK and Bank/UPI configuration remain in their canonical groups", () => {
  for (const group of NAVIGATION_DEFINITION) {
    for (const page of group.children) {
      if (getPermission(page.permissionId).group === "apk_events") assert.equal(group.label, "APK & Events");
      if (getPermission(page.permissionId).group === "bank_upi") assert.equal(group.label, "Bank & UPI");
    }
  }
  const imports = NAVIGATION_DEFINITION.flatMap(group => group.children.map(page => ({ group: group.label, ...page }))).filter(page => page.destinationId === "administration.statement-imports");
  assert.equal(imports.length, 1);
  assert.equal(imports[0].group, "Bank & UPI");
  const reconciliation = NAVIGATION_DEFINITION.find(group => group.id === "administration.group.transactions").children.filter(page => page.permissionId === "reconciliation.review");
  assert.equal(reconciliation.length, 1);
});
test("WPay catalog metadata, dependencies and navigation references are complete", () => {
  const ids = PERMISSION_CATALOG.map(permission => permission.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(PERMISSION_GROUPS.map(group => group.id));
  for (const permission of PERMISSION_CATALOG) {
    assert.equal(permission.id, `${permission.module}.${permission.action}`);
    assert.ok(permission.label.length);
    assert.ok(groups.has(permission.group));
    assert.ok(permission.principalTypes.length);
    assert.ok(permission.principalTypes.every(type => PRINCIPAL_TYPES.includes(type)));
    assert.ok(["self", "own_user", "own_merchant", "admin_tenants", "platform", "assigned_users"].includes(permission.scope));
    assert.ok(permission.accessModes.every(mode => ["list", "record", "create"].includes(mode)));
    assert.equal(permission.implementation, "planned");
    for (const dependency of permission.dependencies) {
      assert.ok(getPermission(dependency));
      for (const type of permission.principalTypes) assert.ok(getPermission(dependency).principalTypes.includes(type));
    }
    if (permission.restricted) assert.equal(permission.employeeDelegable, false);
    const visited = new Set();
    function walk(id) {
      assert.equal(visited.has(id), false, "Permission dependencies must be acyclic");
      visited.add(id);
      getPermission(id).dependencies.forEach(walk);
      visited.delete(id);
    }
    walk(permission.id);
  }
  for (const group of NAVIGATION_DEFINITION) for (const page of group.children) {
    const permission = getPermission(page.permissionId);
    assert.ok(permission, "No orphan menu permission");
    assert.ok(group.principalTypes.some(type => permission.principalTypes.includes(type)));
  }
  assert.equal(getPermission("__proto__"), null);
  assert.equal(getPermission("*"), null);
});
test("WPay grouped checkbox model explicitly marks restricted actions", () => {
  const groups = getEmployeePermissionGroups();
  assert.ok(groups.every(group => group.permissions.length));
  const choices = groups.flatMap(group => group.permissions);
  for (const id of ["employees.permissions.update", "ledger.adjust", "security.configure", "api_credentials.create"]) {
    const choice = choices.find(permission => permission.id === id);
    assert.ok(choice.highRisk);
    assert.equal(choice.selectable, false);
  }
  assert.equal(choices.find(permission => permission.id === "users.approve").selectable, true);
  assert.deepEqual(choices.find(permission => permission.id === "users.approve").dependencies, ["users.view"]);
});
test("WPay catalog, navigation and checkbox mutations cannot affect later decisions", () => {
  const request = input("employee", ["users.view"]);
  const before = JSON.stringify(deriveNavigation(request));
  assert.throws(() => PERMISSION_CATALOG.push({ id: "*" }), TypeError);
  assert.throws(() => getPermission("users.approve").dependencies.pop(), TypeError);
  assert.throws(() => getPermission("users.approve").principalTypes.push("user"), TypeError);
  assert.throws(() => { getPermission("users.approve").employeeDelegable = false; }, TypeError);
  assert.throws(() => NAVIGATION_DEFINITION[0].children.push({}), TypeError);
  assert.throws(() => { deriveNavigation(request)[0].children[0].permissionId = "users.approve"; }, TypeError);
  assert.throws(() => getEmployeePermissionGroups()[0].permissions.pop(), TypeError);
  assert.equal(JSON.stringify(deriveNavigation(request)), before);
  assert.equal(Object.isFrozen(request.grants), false);
  assert.equal(canUsePermission({ ...request, permissionId: "users.approve" }).allowed, false);
});
