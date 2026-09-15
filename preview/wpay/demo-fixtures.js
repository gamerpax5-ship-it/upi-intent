"use strict";
const { PERMISSION_CATALOG } = require("../../lib/wpay/permission-catalog");

function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Broad grants are deliberately selected from the catalog for these demo personas
// only. This is not a default-grant provider or a production identity resolver.
function persona(id, label, type, name, initials, pending = false, selection) {
  const binding = { subjectId: `demo-subject-${id}`, accountId: `demo-principal-${id}`, tenantId: "demo-tenant" };
  const account = { subjectId: binding.subjectId, id: binding.accountId, tenantId: binding.tenantId, type, status: "active", currentPermissionVersion: 1 };
  if (type === "user") account.userId = `demo-user-${id}`;
  if (type === "merchant") account.merchantId = "demo-merchant";
  const grants = selection || PERMISSION_CATALOG.filter(permission => permission.principalTypes.includes(type)).map(permission => permission.id);
  const grantRecord = { ...binding, permissionVersion: 1, grants };
  if (["super_admin", "employee"].includes(type)) grantRecord.adminScope = { tenantIds: ["demo-tenant"] };
  if (type === "super_admin") grantRecord.adminScope.platform = true;
  return { id, label, name, initials, panel: type === "super_admin" ? "Admin" : type === "employee" ? "Employee" : type === "merchant" ? "Merchant" : "User", pending,
    input: { identity: { ...binding, permissionVersion: 1 }, account, grantRecord,
      eligibilityRecord: { ...binding, facts: { approvalStatus: pending ? "pending" : "approved", initialDepositSatisfied: !pending,
        statementSatisfied: !pending, upiApproved: !pending, upiVerified: !pending, operationsEnabled: !pending, approvedBankAccountAvailable: !pending } } } };
}
const PERSONAS = freeze([
  persona("user", "User · approved & funded", "user", "Arjun Mehta", "AM"),
  persona("merchant", "Merchant · approved", "merchant", "Northstar Commerce", "NC"),
  persona("admin", "Super Admin · all demo views", "super_admin", "WPay Operations", "WO"),
  persona("employee", "Employee · finance & reports only", "employee", "Riya Shah", "RS", false,
    ["deposits.view", "ledger.view", "withdrawals.view", "payouts.view", "reports.view"]),
  persona("onboarding", "User · pending approval", "user", "Aarav Demo", "AD", true)
]);
const metric = (label, value, note, accent = false) => ({ label, value, note, accent });
const userMetrics = [
  metric("Successful Pay-in Volume", "₹1,25,000", "7-day demo snapshot", true), metric("Returned Amount", "₹8,000", "Completed returns"),
  metric("Available Capacity", "₹1,72,000", "Ready in this demo", true), metric("Used / Reserved Capacity", "₹78,000 / ₹25,000", "Of ₹2,80,000 configured"),
  metric("Hold / Frozen", "₹5,000", "Under review"), metric("Commission Earned", "₹1,875", "Single demo entitlement"),
  metric("Pending Withdrawals", "₹750", "Included in commission entitlement"), metric("Active UPIs", "2 of 4", "Approved & verified")
];
const BANKS = freeze([
  { id: "demo-bank-1", holder: "Arjun Mehta · synthetic", upi: "arj•••@demo", bank: "Demo National Bank", account: "•••• 4821", limit: "₹1,50,000", approval: "Approved", verification: "Verified", status: "Active" },
  { id: "demo-bank-2", holder: "Arjun Mehta · synthetic", upi: "am•••@demo", bank: "Demo Union Bank", account: "•••• 9016", limit: "₹1,30,000", approval: "Approved", verification: "Verified", status: "Active" },
  { id: "demo-bank-3", holder: "Arjun Mehta · synthetic", upi: "me•••@demo", bank: "Demo City Bank", account: "•••• 7702", limit: "₹50,000", approval: "Pending Review", verification: "Verification Pending", status: "Not enabled" },
  { id: "demo-bank-4", holder: "Arjun Mehta · synthetic", upi: "ar•••@demo", bank: "Demo Trust Bank", account: "•••• 2138", limit: "₹60,000", approval: "Approved", verification: "Verification Pending", status: "Stopped" }
]);
const ORDERS = freeze([
  { id: "DEMO-1048", reference: "NS-STORE-281", amount: "₹12,500", status: "Paid", source: "API", created: "15 Sep, 14:32", paid: "15 Sep, 14:34" },
  { id: "DEMO-1047", reference: "NS-STORE-280", amount: "₹8,000", status: "Pending", source: "Manual", created: "15 Sep, 14:21", paid: "—" },
  { id: "DEMO-1046", reference: "NS-STORE-279", amount: "₹24,000", status: "Paid", source: "API", created: "15 Sep, 13:48", paid: "15 Sep, 13:50" },
  { id: "DEMO-1045", reference: "NS-STORE-278", amount: "₹6,750", status: "Expired", source: "API", created: "15 Sep, 13:10", paid: "—" },
  { id: "DEMO-1044", reference: "NS-STORE-277", amount: "₹18,000", status: "Paid", source: "Manual", created: "15 Sep, 12:56", paid: "15 Sep, 12:59" },
  { id: "DEMO-1043", reference: "NS-STORE-276", amount: "₹4,500", status: "Pending", source: "API", created: "15 Sep, 12:40", paid: "—" }
]);
const APPROVALS = freeze({
  users: [
    { id: "demo-user-201", name: "Aarav Demo", detail: "Individual account", submitted: "15 Sep, 13:40", status: "Pending Review" },
    { id: "demo-user-202", name: "Mira Demo", detail: "Individual account", submitted: "15 Sep, 12:25", status: "Pending Review" },
    { id: "demo-user-203", name: "Dev Demo", detail: "Individual account", submitted: "15 Sep, 11:12", status: "Pending Review" }
  ],
  merchants: [{ id: "demo-merchant-21", name: "Orbit Demo Store", detail: "Online retail · synthetic", submitted: "15 Sep, 12:10", status: "Pending Review" }],
  banks: [
    { id: "demo-review-1", name: "Aarav Demo", detail: "Demo National Bank", account: "•••• 8842", upi: "aa•••@demo", limit: "₹75,000", submitted: "15 Sep, 14:10", status: "Pending Review" },
    { id: "demo-review-2", name: "Mira Demo", detail: "Demo Union Bank", account: "•••• 2206", upi: "mi•••@demo", limit: "₹50,000", submitted: "15 Sep, 12:35", status: "Pending Review" },
    { id: "demo-review-3", name: "Arjun Mehta · synthetic", detail: "Demo City Bank", account: "•••• 7702", upi: "me•••@demo", limit: "₹50,000", submitted: "15 Sep, 11:30", status: "Pending Review" }
  ]
});
const USER_DATA = freeze({ metrics: userMetrics, chart: [12, 18, 14, 22, 17, 23, 19], chartTotal: "₹1,25,000", chartLabel: "Pay-in activity", chartUnit: "₹ thousands",
  banks: BANKS, activity: [
    ["Pay-in received", "DEMO-PAY-028 · synthetic", "₹12,500", "Completed", "14:34"],
    ["Withdrawal requested", "DEMO-WD-008 · synthetic", "₹750", "Pending", "13:52"],
    ["UPI review completed", "Masked demo account ••4821", "—", "Approved", "12:20"]
  ] });
const ONBOARDING_DATA = freeze({ metrics: userMetrics.map(item => metric(item.label, item.label === "Active UPIs" ? "0 of 1" : item.label === "Used / Reserved Capacity" ? "₹0 / ₹0" : "₹0", "Awaiting onboarding")),
  chart: [0, 0, 0, 0, 0, 0, 0], chartTotal: "₹0", chartLabel: "Pay-in activity", chartUnit: "₹ thousands", activity: [],
  banks: [{ id: "demo-onboarding-bank", holder: "Aarav Demo", upi: "aa•••@demo", bank: "Demo National Bank", account: "•••• 8842", limit: "₹75,000", approval: "Pending Review", verification: "Verification Pending", status: "Not enabled" }],
  checklist: [["Account created", "Complete"], ["Admin approval", "Pending"], ["Initial 2,000 USDT deposit", "Not confirmed"], ["Statement requirement", "Pending"], ["UPI approval & verification", "Pending"]] });
const MERCHANT_DATA = freeze({ metrics: [
  metric("Gross Collection", "₹4,86,000", "7-day demo snapshot", true), metric("Platform Fees", "₹7,290", "Included in collection"),
  metric("Available Balance", "₹3,38,710", "Curated demo balance", true), metric("Reserved Balance", "₹48,000", "Pending outflows"),
  metric("Hold / Frozen", "₹12,000", "Under review"), metric("Successful Orders", "42", "This demo period"),
  metric("Pending Payouts", "₹48,000", "Already included in reserved"), metric("Withdrawn Amount", "₹80,000", "Completed demo outflows")
], chart: [44, 60, 58, 85, 76, 91, 72], chartTotal: "₹4,86,000", chartLabel: "Collection volume", chartUnit: "₹ thousands", orders: ORDERS });
const FINANCE_DATA = freeze({ summary: [metric("Ledger volume", "₹24,86,000", "Synthetic reporting period"), metric("Pending outflows", "₹1,48,000", "View-only demo"), metric("Holds", "₹45,000", "Synthetic review balance")],
  rows: [["DEMO-FIN-201", "Collection summary", "₹1,25,000", "Completed"], ["DEMO-FIN-202", "Payout review", "₹48,000", "Pending"], ["DEMO-FIN-203", "Withdrawal review", "₹25,000", "Pending"]] });
const ADMIN_DATA = freeze({ metrics: [
  metric("Users", "124", "118 approved · demo"), metric("Merchants", "18", "17 approved · demo"), metric("Pending Approvals", "7", "3 users · 1 merchant · 3 banks", true),
  metric("Active UPIs", "86", "Across synthetic accounts"), metric("Routing Capacity", "₹18,40,000", "Curated available capacity", true),
  metric("Pay-in Volume", "₹24,86,000", "7-day demo snapshot"), metric("Pending Payouts", "₹1,48,000", "Awaiting review"),
  metric("Holds", "₹45,000", "Synthetic review balance"), metric("Platform Fees", "₹37,290", "Demo period"), metric("Commission Liability", "₹18,645", "Demo period")
], approvals: APPROVALS, finance: FINANCE_DATA,
  alerts: [["7 approvals need review", "Three users, one merchant and three bank submissions in this synthetic queue.", "Review queue"], ["2 capacity reviews flagged", "Demo alerts only. No live routing decision has been made.", "Synthetic alert"]],
  activity: [["User application submitted", "Aarav Demo · synthetic", "Pending", "13:40"], ["Merchant review completed", "Northstar Commerce · synthetic", "Reviewed", "12:45"], ["Finance report prepared", "Weekly summary · synthetic", "Ready", "11:20"]] });

function getPersona(id) { return typeof id === "string" ? PERSONAS.find(item => item.id === id) || null : null; }
function listPersonas() { return PERSONAS.map(({ id, label }) => ({ id, label })); }
module.exports = Object.freeze({ PERSONAS, getPersona, listPersonas, USER_DATA, ONBOARDING_DATA, MERCHANT_DATA, ADMIN_DATA, FINANCE_DATA });
