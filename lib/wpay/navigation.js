"use strict";
const { getPermission } = require("./permission-catalog");
const { canUsePermission } = require("./authorization-policy");

function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const groups = [];
function section(audience, id, label, rows) {
  groups.push({ id: `${audience}.group.${id}`, label,
    principalTypes: audience === "administration" ? ["admin", "super_admin", "employee"] : [audience],
    children: rows.map(([page, title, permissionId]) => ({
      id: `${audience}.page.${page}`, destinationId: `${audience}.${page}`, label: title, permissionId,
      plannedRoute: `/panels/wpay/${audience}/${page}`, routeStatus: "planned",
      requiresResourceAuthorization: true,
      descriptorOnly: getPermission(permissionId).descriptorOnly,
      blockers: [...getPermission(permissionId).blockers]
    }))
  });
}

section("user", "overview", "Overview", [
  ["dashboard", "Dashboard", "user.overview.view"], ["analytics", "Analytics", "user.analytics.view"]
]);
section("user", "bank_upi", "Bank & UPI", [
  ["bank-upi", "Add Bank / UPI", "user.bank_upi.submit"],
  ["upi-verification", "UPI Verification", "user.bank_upi.verify"],
  ["upi-analytics", "UPI Analytics", "user.bank_upi.analytics"],
  ["statements", "Upload Statement", "user.statements.submit"]
]);
section("user", "finance", "Finance", [
  ["payin-commission", "Pay-in Commission", "user.payin_commission.view"],
  ["payout-commission", "Payout Commission", "user.payout_commission.view"],
  ["inr-withdrawal", "INR Withdrawal", "user.withdrawals.inr.create"],
  ["usdt-withdrawal", "USDT Withdrawal", "user.withdrawals.usdt.create"],
  ["usdt-deposit", "USDT Deposit", "user.deposits.view"],
  ["holds", "Holds / Frozen", "user.holds.view"]
]);
section("user", "operations", "Operations", [
  ["payin-transactions", "Pay-in Transactions", "user.payins.view"],
  ["inr-payout", "INR Payout", "user.payouts.inr.create"],
  ["usdt-payout", "USDT Payout", "user.payouts.usdt.create"],
  ["parking-beneficiary", "Parking Beneficiary", "user.parking_beneficiaries.view"],
  ["parking-payment", "Parking Payment", "user.parking_payments.view"],
  ["transactions", "Transaction History", "user.transactions.view"]
]);
section("user", "apk_events", "APK & Events", [
  ["apk-download", "Download APK", "user.apk.view"],
  ["activation-codes", "Activation Codes", "user.activation_codes.view"],
  ["linked-devices", "Linked Devices", "user.devices.view"],
  ["otp-events", "OTP Events", "user.otp_events.view"]
]);
section("user", "trade", "Trade with WPay", [["trade", "Coming Soon", "user.trade.view"]]);
section("user", "settings", "Settings", [
  ["profile", "Profile", "profile.view"], ["notifications", "Notifications", "notifications.view"],
  ["support", "Support", "support.view"], ["guide", "User Guide", "guide.view"]
]);

section("merchant", "overview", "Overview", [["dashboard", "Dashboard", "merchant.overview.view"], ["analytics", "Analytics", "merchant.analytics.view"]]);
section("merchant", "collections", "Collections", [
  ["create-payment-link", "Create Payment Link", "merchant.collections.create"],
  ["payment-orders", "Payment Orders", "merchant.collections.view"],
  ["transactions", "Total Transactions", "merchant.transactions.view"]
]);
section("merchant", "payouts_withdrawals", "Payouts & Withdrawals", [
  ["inr-payout", "INR Payout", "merchant.payouts.inr.create"],
  ["usdt-payout", "USDT Payout", "merchant.payouts.usdt.create"],
  ["usdt-withdrawal", "USDT Withdrawal", "merchant.withdrawals.usdt.create"],
  ["payout-history", "Payout History", "merchant.payouts.view"]
]);
section("merchant", "finance", "Finance", [
  ["ledger", "Balance & Ledger", "merchant.ledger.view"], ["fees", "Platform Fees", "merchant.fees.view"], ["holds", "Hold / Frozen", "merchant.holds.view"]
]);
section("merchant", "developer_api", "Developer / API", [
  ["api-credentials", "API Credentials", "merchant.api_credentials.view"], ["api-documentation", "API Documentation", "merchant.api_docs.view"],
  ["webhooks", "Webhooks", "merchant.webhooks.view"], ["api-logs", "API Logs", "merchant.api_logs.view"]
]);
section("merchant", "settings", "Settings", [
  ["profile", "Profile", "profile.view"], ["notifications", "Notifications", "notifications.view"],
  ["support", "Support", "support.view"], ["security", "Security", "merchant.security.view"]
]);

section("administration", "overview", "Overview", [["dashboard", "Dashboard", "overview.view"]]);
// Detail/approval/commercial controls share one canonical destination per entity.
// The view permission opens it; each future button still needs its own action grant.
section("administration", "users", "Users", [["users", "User Directory", "users.view"]]);
section("administration", "merchants", "Merchants", [["merchants", "Merchant Directory", "merchants.view"]]);
section("administration", "bank_upi", "Bank & UPI", [["bank-upi", "Bank / UPI Reviews", "bank_upi.view"], ["statement-imports", "Statement Import Management", "statements.view"]]);
section("administration", "routing", "Routing", [["routing", "Assignments & Eligibility", "routing.view"], ["routing-assignment", "Assign Merchant / User", "routing.assign"]]);
section("administration", "transactions", "Transactions", [["transactions", "Orders & Transactions", "transactions.view"], ["payin-disputes", "Pay-in Disputes", "payin_dispute.view"], ["reconciliation", "Reconciliation Review", "reconciliation.review"]]);
section("administration", "finance", "Finance", [
  ["deposits", "Deposit Review", "deposits.view"], ["ledger", "Ledger", "ledger.view"],
  ["ledger-adjustments", "Ledger Adjustments", "ledger.adjust"], ["commissions", "Commission Entitlements", "commissions.view"],
  ["withdrawals", "Withdrawal Review", "withdrawals.view"], ["payouts", "Payout Review", "payouts.view"], ["holds", "Holds / Frozen", "holds.view"]
]);
section("administration", "parking", "Parking", [["parking", "Parking Review & History", "parking.view"]]);
section("administration", "apk_events", "APK & Events", [["devices", "Device Inventory & Pairing", "devices.view"], ["apk", "APK Artifact", "apk.view"], ["otp-events", "OTP Events", "otp_events.view"]]);
section("administration", "developer_api", "Developer / API", [["api-credentials", "API Credential Metadata", "api_credentials.view"], ["api-administration", "API Credential Administration", "api_credentials.create"], ["api-documentation", "API Documentation", "api_docs.view"], ["webhooks", "Webhooks", "webhooks.view"], ["api-logs", "API Logs", "api_logs.view"]]);
section("administration", "employees", "Employees", [["employees", "Employee Directory", "employees.view"], ["employee-create", "Create Employee", "employees.create"], ["employee-permissions", "Employee Permissions", "employees.permissions.update"]]);
section("administration", "reports", "Reports", [["reports", "Reports", "reports.view"], ["report-exports", "Report Exports", "reports.export"]]);
section("administration", "support", "Support", [["support", "Support Queue", "support_admin.view"]]);
section("administration", "settings", "Settings", [["settings", "Platform Settings", "settings.view"], ["security", "Security Configuration", "security.configure"]]);

// Task 6: owner-scoped Security is available to every panel audience. It does
// not use platform Security configuration or delegate administrative authority.
for (const audience of ["user", "merchant", "administration"]) {
  const settings = groups.find(group => group.id === `${audience}.group.settings`);
  settings.children.push({ id: `${audience}.page.account-security`, destinationId: `${audience}.account-security`,
    label: "Security / Two-Factor Authentication", permissionId: "account_security.view",
    plannedRoute: `/panels/wpay/${audience}/account-security`, routeStatus: "planned",
    requiresResourceAuthorization: true, descriptorOnly: false, blockers: [] });
}
const NAVIGATION_DEFINITION = freeze(groups);
function deriveNavigation(input = {}) {
  return freeze(NAVIGATION_DEFINITION.filter(group => group.principalTypes.includes(input?.principal?.type))
    .map(group => ({ ...group, children: group.children.filter(page => canUsePermission({ ...input, permissionId: page.permissionId }).allowed) }))
    .filter(group => group.children.length));
}

module.exports = Object.freeze({ NAVIGATION_DEFINITION, deriveNavigation });
