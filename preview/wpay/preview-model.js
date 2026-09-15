"use strict";
const { buildPrincipalContext } = require("../../lib/wpay/auth/principal-context");
const { deriveNavigation } = require("../../lib/wpay/navigation");
const { canUsePermission } = require("../../lib/wpay/authorization-policy");
const { getPermission } = require("../../lib/wpay/permission-catalog");
const { getPersona, USER_DATA, ONBOARDING_DATA, MERCHANT_DATA, ADMIN_DATA, FINANCE_DATA } = require("./demo-fixtures");

// View dispatch only. Permission and navigation authority remain in Task 2/3.
const VIEWS = Object.freeze({
  "user.dashboard": "user-dashboard", "user.bank-upi": "user-banks", "user.upi-verification": "user-banks",
  "merchant.dashboard": "merchant-dashboard", "merchant.payment-orders": "merchant-orders", "merchant.create-payment-link": "payment-form",
  "administration.dashboard": "admin-dashboard", "administration.users": "approvals-users",
  "administration.merchants": "approvals-merchants", "administration.bank-upi": "approvals-banks"
});
function getPreviewModel(personaId) {
  const persona = getPersona(personaId);
  if (!persona) return null;
  const built = buildPrincipalContext(persona.input);
  if (!built.ok) throw new Error("Invalid synthetic preview fixture");
  const context = built.context;
  const allowed = permissionId => canUsePermission({ ...context, permissionId }).allowed;
  const navigation = deriveNavigation(context).map(group => ({ id: group.id, label: group.label,
    children: group.children.map(page => ({
      id: page.id, destinationId: page.destinationId, label: page.label, permissionId: page.permissionId,
      href: "#" + page.destinationId, view: VIEWS[page.destinationId] || (personaId === "employee" ? "finance-readonly" : "planned"),
      purpose: getPermission(page.permissionId).label, descriptorOnly: page.descriptorOnly,
      blockers: [...page.blockers], routeStatus: "preview-only"
    })) }));
  const data = personaId === "merchant" ? MERCHANT_DATA : personaId === "admin" ? ADMIN_DATA : personaId === "employee" ? FINANCE_DATA : persona.pending ? ONBOARDING_DATA : USER_DATA;
  // No identity records or grant lists cross the browser boundary. Data is selected
  // per persona; Merchant responses never include the User/Admin fixture payloads.
  return { demo: true, notice: "DEMO — No live transactions", asOf: "15 Sep 2026 · 14:40 IST",
    persona: { id: persona.id, label: persona.label, name: persona.name, initials: persona.initials, panel: persona.panel, pending: persona.pending },
    navigation, data, capabilities: {
      previewUserApproval: allowed("users.approve"), previewMerchantApproval: allowed("merchants.approve"),
      previewBankApproval: allowed("bank_upi.approve"), exportReports: allowed("reports.export"),
      previewBankVerification: allowed("user.bank_upi.verify")
    } };
}
module.exports = Object.freeze({ getPreviewModel });
