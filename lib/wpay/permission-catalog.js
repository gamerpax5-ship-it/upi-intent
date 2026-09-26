"use strict";

// Descriptors only. No role receives implicit permissions, including Super Admin.
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const PRINCIPAL_TYPES = freeze(["user", "merchant", "admin", "super_admin", "employee"]);
const ADMIN_TYPES = ["admin", "super_admin", "employee"];
const PERMISSION_GROUPS = freeze([
  ["overview", "Overview"], ["users", "Users"], ["merchants", "Merchants"],
  ["bank_upi", "Bank & UPI"], ["routing", "Routing"], ["transactions", "Transactions"],
  ["finance", "Finance"], ["parking", "Parking"], ["apk_events", "APK & Events"],
  ["developer_api", "Developer / API"], ["employees", "Employees"], ["reports", "Reports"],
  ["support", "Support"], ["settings", "Settings"], ["collections", "Collections"],
  ["operations", "Operations"], ["trade", "Trade with WPay"]
].map(([id, label]) => ({ id, label })));

const permissions = [];
function family(prefix, group, types, scope, rows, options = {}) {
  const hasView = rows.some(row => row[0] === "view");
  for (const [action, label, overrides = {}] of rows) {
    const setting = { ...options, ...overrides };
    const read = action === "view";
    const create = /(^|\.)(create|submit)$/.test(action);
    permissions.push({
      id: `${prefix}.${action}`, label, module: prefix, group, action,
      principalTypes: [...(setting.types || types)], scope,
      employeeDelegable: types.includes("employee") && setting.restricted !== true,
      restricted: setting.restricted === true,
      highRisk: setting.highRisk || null,
      dependencies: setting.dependencies || (hasView && !read ? [`${prefix}.view`] : []),
      accessModes: setting.accessModes || (read ? ["list", "record"] : action === "export" ? ["list"] : create ? ["create"] : ["record"]),
      eligibility: setting.eligibility || "none",
      accountRequired: setting.accountRequired === true,
      descriptorOnly: setting.descriptorOnly === true,
      blockers: setting.blockers || [],
      implementation: "planned"
    });
  }
}

family("profile", "settings", PRINCIPAL_TYPES, "self", [["view", "View own profile"], ["update", "Edit own profile"]]);
family("account_security", "settings", PRINCIPAL_TYPES, "self", [["view", "View own two-factor security"], ["update", "Manage own two-factor security"]]);
family("notifications", "settings", PRINCIPAL_TYPES, "self", [["view", "View own notifications"], ["update", "Edit own notification preferences"]]);
family("support", "support", PRINCIPAL_TYPES, "self", [["view", "View own support tickets"], ["create", "Open own support ticket"]]);
family("guide", "settings", PRINCIPAL_TYPES, "self", [["view", "Read user guide"]]);

const USER = ["user"];
family('user.live_otp','apk_events',USER,'own_user',[["view","View owned real OTP events"]],{eligibility:'approved'});
family('user.device_pairing','apk_events',USER,'own_user',[["view","View owned device links"],["create","Request existing APK pairing"],["revoke","Revoke device ownership"]],{eligibility:'approved'});
family('user.transaction_history','collections',USER,'own_user',[["view","View own routed pay-in transactions"]],{eligibility:'approved'});
family("user.source_events", "apk_events", USER, "own_user", [["view", "Read verified own device and account observations"]], { eligibility: "approved" });
const operational = { eligibility: "user_operational" };
family("user.payout", "operations", USER, "own_user", [["view", "View own payout jobs and eligible queue", { eligibility: "approved" }], ["claim", "Claim or release an eligible payout"], ["submit", "Submit owned payout evidence", {accessModes:["record"]}]], {eligibility:"approved"});
family("user.commission", "finance", USER, "own_user", [["view", "View shared commission entitlement"]], { eligibility: "approved" });
family("user.commission_withdrawal", "finance", USER, "own_user", [["view", "View own INR and USDT commission withdrawals", { eligibility: "approved" }], ["create", "Reserve shared commission for withdrawal"], ["cancel", "Cancel an unprocessed commission withdrawal"]], {eligibility:"approved"});
family("user.overview", "overview", USER, "own_user", [["view", "View User dashboard"]]);
family("user.analytics", "overview", USER, "own_user", [["view", "View User analytics"]], operational);
family("user.bank_upi", "bank_upi", USER, "own_user", [
  ["view", "View own Bank / UPI records"], ["submit", "Submit own Bank / UPI", { accountRequired: false }],
  ["update", "Edit own Bank / UPI submission", { accountRequired: true }],
  ["verify", "Verify approved own UPI", { eligibility: "approved_bank", accountRequired: true }],
  ["analytics", "View own UPI analytics", { ...operational, accessModes: ["list", "record"], accountRequired: true }]
], { accountRequired: true });
family("user.statements", "bank_upi", USER, "own_user", [["view", "View own statement imports"], ["submit", "Upload own statement"]], { accountRequired: true, blockers: ["tenant_account_isolation", "trusted_evidence"] });
family("user.payin_commission", "finance", USER, "own_user", [["view", "View pay-in commission"]], { eligibility: "approved" });
family("user.payout_commission", "finance", USER, "own_user", [["view", "View payout commission"]], { eligibility: "approved" });
family("user.withdrawals", "finance", USER, "own_user", [["view", "View own withdrawals", { eligibility: "approved" }], ["inr.create", "Request INR withdrawal"], ["usdt.create", "Request USDT withdrawal"]], operational);
family("user.deposits", "finance", USER, "own_user", [["view", "View USDT funding / onboarding"], ["submit", "Submit deposit observation (not confirmation)"]]);
family("user.holds", "finance", USER, "own_user", [["view", "View own holds / frozen funds"]], { eligibility: "approved" });
family("user.payins", "operations", USER, "own_user", [["view", "View own pay-in transactions"]], { ...operational, accountRequired: true });
family("user.payouts", "operations", USER, "own_user", [["view", "View own payouts"], ["inr.create", "Request INR payout"], ["usdt.create", "Request USDT payout"]], operational);
family("user.parking_beneficiaries", "parking", USER, "own_user", [["view", "View Admin/Employee parking beneficiaries"], ["confirm", "Confirm beneficiary added in own banking app", { accessModes:["record"] }]], {eligibility:"approved"});
family("user.parking_payments", "parking", USER, "own_user", [["view", "View parking payments"], ["create", "Submit parking payment"]], {eligibility:"approved"});
family("user.transactions", "transactions", USER, "own_user", [["view", "View own transaction history"]], { ...operational, accountRequired: true });
family("user.apk", "apk_events", USER, "own_user", [["view", "View planned APK download"]]);
family("user.activation_codes", "apk_events", USER, "own_user", [["view", "View own activation code descriptors"]], { eligibility: "approved" });
family("user.devices", "apk_events", USER, "own_user", [["view", "View own linked device metadata"]], { eligibility: "approved", accountRequired: true });
family("user.otp_events", "apk_events", USER, "own_user", [["view", "OTP Events navigation descriptor"]], { eligibility: "approved", descriptorOnly: true, blockers: ["legacy_sensitive_data"] });
family("user.trade", "trade", USER, "own_user", [["view", "Trade with WPay — Coming Soon"]], { descriptorOnly: true });

const MERCHANT = ["merchant"];
family("merchant.source_events", "collections", MERCHANT, "own_merchant", [["view", "Read verified own mapped order observations"]], { eligibility: "approved" });
const merchantOperational = { eligibility: "merchant_operational" };
family("merchant.payout", "finance", MERCHANT, "own_merchant", [["view", "View own INR payout orders"], ["create", "Create and reserve own INR payout"], ["review", "Review own submitted payout or cancel an open payout"]], { eligibility: "approved" });
family("merchant.settlement", "finance", MERCHANT, "own_merchant", [["view", "View Merchant USDT settlement capability"], ["create", "Request configured Merchant USDT settlement"]], { eligibility: "approved" });
family("merchant.gateway", "collections", MERCHANT, "own_merchant", [["view", "View own gateway orders"], ["create", "Create routed gateway orders"], ["manage", "Manage own gateway credentials and webhooks"]], { eligibility: "approved" });
family("merchant.overview", "overview", MERCHANT, "own_merchant", [["view", "View Merchant dashboard"]]);
family("merchant.analytics", "overview", MERCHANT, "own_merchant", [["view", "View Merchant analytics"]], merchantOperational);
family("merchant.collections", "collections", MERCHANT, "own_merchant", [["view", "View payment orders"], ["create", "Create payment link"]], merchantOperational);
family("merchant.transactions", "collections", MERCHANT, "own_merchant", [["view", "View Merchant transactions"]], merchantOperational);
family("merchant.routing_capacity", "routing", MERCHANT, "assigned_users", [["view", "View assigned eligible User capacity projection"]], merchantOperational);
family("merchant.payouts", "finance", MERCHANT, "own_merchant", [["view", "View payout history"], ["inr.create", "Request Merchant INR payout"], ["usdt.create", "Request Merchant USDT payout"]], merchantOperational);
family("merchant.withdrawals", "finance", MERCHANT, "own_merchant", [["view", "View Merchant withdrawals"], ["usdt.create", "Request Merchant USDT withdrawal"]], merchantOperational);
for (const [name, label] of [["ledger", "Balance & ledger"], ["fees", "Platform fees"], ["holds", "Hold / frozen"]]) {
  family(`merchant.${name}`, "finance", MERCHANT, "own_merchant", [["view", label]], { eligibility: "approved" });
}
family("merchant.api_credentials", "developer_api", MERCHANT, "own_merchant", [["view", "View own API key metadata"], ["create", "Create own API credential", { highRisk: "api_credentials" }], ["revoke", "Revoke own API credential", { highRisk: "api_credentials" }]], merchantOperational);
family("merchant.api_docs", "developer_api", MERCHANT, "own_merchant", [["view", "Read Merchant API documentation"]]);
family("merchant.webhooks", "developer_api", MERCHANT, "own_merchant", [["view", "View own webhooks"], ["update", "Edit own webhooks"]], merchantOperational);
family("merchant.api_logs", "developer_api", MERCHANT, "own_merchant", [["view", "View own API logs"]], merchantOperational);
family("merchant.security", "settings", MERCHANT, "self", [["view", "View own login security"], ["update", "Edit own login security"]]);

function admin(prefix, group, rows, options) { family(prefix, group, ADMIN_TYPES, "admin_tenants", rows, options); }
admin('apk_otp_events','apk_events',[["view_all","View real OTP events in operational scope",{accessModes:['list','record']}]],{highRisk:'sensitive_otp_access'});
family('employee_management','employees',['admin','super_admin'],'admin_tenants',[["view","View scoped Employees"],["create","Create scoped Employee"],["update","Edit scoped Employee permissions"]],{restricted:true,highRisk:'employee_permissions'});
admin('utr_center','transactions',[["view","View normalized scoped UTR evidence"],["approve","Manually approve a scoped UTR claim without bank evidence",{types:["admin","super_admin"],restricted:true,accountRequired:true}]]);
admin('statement_reconciliation','transactions',[["view","View scoped statement reconciliation"],["upload","Upload statement for an authorized account"]],{accountRequired:true});
admin("payout_operations", "finance", [["view", "View scoped payouts and exceptions"], ["resolve", "Resolve a submitted payout dispute"], ["proof", "Download scoped payout proof attachments"], ["capability", "Approve or revoke bank payout capability"]]);
admin("commission_withdrawal", "finance", [["view", "View scoped commission withdrawals"], ["approve", "Review and process scoped commission withdrawals"]]);
admin("commission_hold", "finance", [["view", "View scoped commission holds"], ["manage", "Place or release scoped commission holds"]]);
admin("overview", "overview", [["view", "View administrative dashboard"]]);
admin("users", "users", [["view", "View Users"], ["approve", "Approve User"], ["reject", "Reject User"], ["commercial.update", "Update User commercial terms"], ["suspend", "Suspend User"]]);
admin("merchants", "merchants", [["view", "View Merchants"], ["approve", "Approve Merchant"], ["reject", "Reject Merchant"], ["commercial.update", "Update Merchant commercial terms"], ["suspend", "Suspend Merchant"]]);
admin("bank_upi", "bank_upi", [["view", "View Bank / UPI reviews"], ["review", "Review Bank / UPI submission"], ["approve", "Approve Bank / UPI"], ["reject", "Reject Bank / UPI"], ["freeze", "Freeze Bank / UPI"], ["release", "Release Bank / UPI freeze"]], { accountRequired: true });
admin("statements", "bank_upi", [["view", "View statement import management"], ["submit", "Submit administrative statement import", { accountRequired: true }]], { blockers: ["tenant_account_isolation", "trusted_evidence"] });
admin("routing", "routing", [["view", "View Merchant / User assignments"], ["assign", "Assign Merchant to User"], ["release", "Release routing assignment"]]);
admin("assignments", "merchants", [["view", "View business assignments"], ["update", "Manage business assignments"]]);
admin("transactions", "transactions", [["view", "View administrative transactions"], ["export", "Export transactions"]], { accountRequired: true });
admin("reconciliation", "transactions", [["view", "View reconciliation evidence"], ["review", "Review reconciliation evidence"], ["approve", "Accept reconciliation decision"], ["reject", "Reject reconciliation decision"]], { accountRequired: true, blockers: ["tenant_account_isolation", "trusted_evidence"] });
admin("deposits", "finance", [["view", "View deposit observations"], ["review", "Review deposit evidence"], ["approve", "Approve deposit decision"], ["reject", "Reject deposit decision"]]);
admin("withdrawals", "finance", [["view", "View withdrawals"], ["review", "Review withdrawal"], ["approve", "Approve withdrawal"], ["reject", "Reject withdrawal"]]);
admin("payouts", "finance", [["view", "View payouts"], ["review", "Review payout"], ["approve", "Approve payout"], ["reject", "Reject payout"]]);
admin("ledger", "finance", [["view", "View ledger"], ["export", "Export ledger"]]);
family("ledger", "finance", ["super_admin"], "admin_tenants", [["adjust", "Post ledger adjustment", { dependencies: ["ledger.view"] }]], { restricted: true, highRisk: "ledger_adjustment", accountRequired: true });
family("finance_expenses", "finance", ["admin","super_admin"], "admin_tenants", [["manage", "Record or void salary and expense records", { dependencies:["reports.view"] }]], {restricted:true});
admin("commissions", "finance", [["view", "View commission entitlements"]]);
admin("holds", "finance", [["view", "View holds"], ["freeze", "Place hold"], ["release", "Release hold"]]);
admin("holds", "finance", [["update", "Manage business holds", { dependencies: ["holds.view"] }]]);
admin("parking", "parking", [["view", "View parking"], ["create", "Create parking beneficiaries and orders", { accessModes:["create"] }], ["review", "Review parking evidence"], ["approve", "Approve parking decision"], ["reject", "Reject parking decision"]]);
admin("devices", "apk_events", [["view", "View device metadata"], ["pairing.create", "Issue an account-owned APK pairing code"], ["revoke", "Unlink a scoped device from WPay"]]);
admin("apk", "apk_events", [["view", "View APK artifact metadata"]]);
admin("otp_events", "apk_events", [["view", "OTP Events navigation descriptor"]], { descriptorOnly: true, blockers: ["legacy_sensitive_data"] });
admin("api_credentials", "developer_api", [["view", "View API credential metadata"]]);
family("api_credentials", "developer_api", ["super_admin"], "platform", [["create", "Administer API credential creation", { dependencies: ["api_credentials.view"] }], ["revoke", "Administer API credential revocation", { dependencies: ["api_credentials.view"] }]], { restricted: true, highRisk: "api_credentials" });
admin("api_docs", "developer_api", [["view", "Read administrative API documentation"]]);
admin("webhooks", "developer_api", [["view", "View webhook configuration"], ["update", "Update webhook configuration"]]);
admin("api_logs", "developer_api", [["view", "View API logs"]]);
admin("employees", "employees", [["view", "View employees"]]);
family("employees", "employees", ["super_admin"], "platform", [["create", "Create Employee", { dependencies: ["employees.view"] }], ["permissions.update", "Change Employee permissions", { dependencies: ["employees.view"] }]], { restricted: true, highRisk: "employee_permissions" });
admin("reports", "reports", [["view", "View reports"], ["export", "Export reports"]]);
admin("support_admin", "support", [["view", "View support queue"], ["update", "Update support case"]]);
admin("settings", "settings", [["view", "View platform settings"]]);
family("security", "settings", ["super_admin"], "platform", [["configure", "Configure platform security", { dependencies: ["settings.view"] }]], { restricted: true, highRisk: "security_configuration" });

family('admin_authority','employees',['super_admin'],'platform',[["manage","Manage explicitly delegated Admin authority",{accessModes:['list','record','create']}]],{restricted:true,highRisk:'employee_permissions'});
const PERMISSION_CATALOG = freeze(permissions);
const byId = new Map(PERMISSION_CATALOG.map(permission => [permission.id, permission]));
function getPermission(id) { return typeof id === "string" ? byId.get(id) || null : null; }
function getEmployeePermissionGroups() {
  return freeze(PERMISSION_GROUPS.map(group => ({ ...group,
    permissions: PERMISSION_CATALOG.filter(permission => permission.group === group.id &&
      (permission.principalTypes.includes("employee") || permission.restricted)).map(permission => ({
      ...permission, selectable: permission.employeeDelegable && !permission.restricted
    }))
  })).filter(group => group.permissions.length));
}

module.exports = Object.freeze({ PRINCIPAL_TYPES, PERMISSION_GROUPS, PERMISSION_CATALOG, getPermission, getEmployeePermissionGroups });
