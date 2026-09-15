"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const content = $("content");
  const sidebar = $("sidebar");
  const dialog = $("approval-dialog");
  const mobile = window.matchMedia("(max-width: 760px)");
  let model, activePage, expandedGroup, modalTrigger, loadSequence = 0;
  const element = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) if (child !== undefined && child !== null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  };
  const iconPaths = {
    grid: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z",
    bank: "m3 9 9-6 9 6M4 10h16M6 10v9m6-9v9m6-9v9M3 21h18",
    wallet: "M3 6h16v14H3zM3 6V3h14v3M15 11h6v5h-6z",
    arrows: "M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4",
    device: "M7 2h10v20H7zM10 18h4", chart: "M4 3v17h17M8 14l4-5 4 3 5-8",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
    users: "M8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-4a6 6 0 0 1 12 0v4M16 4a4 4 0 0 1 0 8m1 3a5 5 0 0 1 5 5",
    code: "m8 5-6 7 6 7m8-14 6 7-6 7m-3-17-2 20", folder: "M3 5h7l2 3h9v12H3z",
    calendar: "M4 5h16v16H4zM4 10h16M8 2v6m8-6v6", plus: "M12 4v16M4 12h16"
  };
  function icon(name = "grid") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", iconPaths[name] || iconPaths.grid); svg.append(path); return svg;
  }
  const groupIcon = label => ({ Overview: "grid", "Bank & UPI": "bank", Finance: "wallet", Operations: "arrows", "APK & Events": "device", Settings: "settings", Users: "users", Merchants: "users", Employees: "users", Reports: "chart", "Developer / API": "code", Collections: "wallet", Routing: "arrows", Transactions: "arrows", "Payouts & Withdrawals": "arrows" }[label] || "folder");
  const button = (text, action, style = "secondary") => element("button", { type: "button", class: "button " + style, onclick: action }, text);
  function badge(text) {
    const tone = ["Paid", "Completed", "Approved", "Verified", "Active", "Ready", "Reviewed", "Complete"].includes(text) ? "good" : /Pending|Review|Not confirmed/.test(text) ? "pending" : /Stopped|Expired/.test(text) ? "stopped" : "neutral";
    return element("span", { class: "badge " + tone }, text);
  }
  function link(text, destination, className = "inline-link") { return element("a", { class: className, href: "#" + destination }, text); }
  function closeDrawer(returnFocus = true) {
    sidebar.classList.remove("drawer-open"); $("drawer-backdrop").hidden = true;
    $("open-drawer").setAttribute("aria-expanded", "false"); document.body.classList.remove("no-scroll");
    document.querySelector(".workspace").inert = false; document.querySelector(".preview-toolbar").inert = false;
    if (returnFocus && mobile.matches) $("open-drawer").focus();
  }
  function openDrawer() {
    sidebar.classList.add("drawer-open"); $("drawer-backdrop").hidden = false;
    $("open-drawer").setAttribute("aria-expanded", "true"); document.body.classList.add("no-scroll");
    document.querySelector(".workspace").inert = true; document.querySelector(".preview-toolbar").inert = true;
    $("close-drawer").focus();
  }
  $("open-drawer").addEventListener("click", openDrawer);
  $("close-drawer").addEventListener("click", () => closeDrawer());
  $("drawer-backdrop").addEventListener("click", () => closeDrawer());
  mobile.addEventListener("change", () => closeDrawer(false));
  document.addEventListener("keydown", event => {
    if (!sidebar.classList.contains("drawer-open")) return;
    if (event.key === "Escape") { event.preventDefault(); closeDrawer(); }
    if (event.key === "Tab") {
      const targets = [...sidebar.querySelectorAll("button,a")].filter(node => node.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function renderNavigation() {
    const nav = $("navigation"); nav.replaceChildren();
    for (const group of model.navigation) {
      const current = group.children.some(page => page.destinationId === activePage?.destinationId);
      const childId = "children-" + group.id;
      const parent = element("button", { type: "button", class: "nav-parent" + (current ? " current" : ""), "aria-expanded": String(expandedGroup === group.id), "aria-controls": childId }, icon(groupIcon(group.label)), element("span", {}, group.label), element("span", { class: "chevron", "aria-hidden": "true" }, "›"));
      const children = element("div", { class: "nav-children", id: childId }); children.hidden = expandedGroup !== group.id;
      for (const page of group.children) children.append(element("a", { href: page.href, class: "nav-link", "aria-current": activePage?.destinationId === page.destinationId ? "page" : undefined,
        onclick: () => { if (mobile.matches) closeDrawer(false); if (location.hash === page.href) { route(); content.focus(); } }
      }, page.label));
      parent.addEventListener("click", () => {
        expandedGroup = expandedGroup === group.id ? null : group.id;
        for (const item of nav.querySelectorAll(".nav-parent")) {
          const open = item === parent && expandedGroup !== null;
          item.setAttribute("aria-expanded", String(open)); document.getElementById(item.getAttribute("aria-controls")).hidden = !open;
        }
      });
      nav.append(element("div", { class: "nav-group" }, parent, children));
    }
  }
  function heading(title, subtitle, actions) {
    return element("div", { class: "page-heading" }, element("div", {}, element("div", { class: "eyebrow" }, model.persona.panel.toUpperCase() + " WORKSPACE"), element("h1", {}, title), element("p", { class: "subtitle" }, subtitle)),
      element("div", { class: "heading-actions" }, actions || element("div", { class: "date-chip" }, icon("calendar"), "09 – 15 Sep 2026")));
  }
  function metrics(items, admin = false) {
    return element("section", { class: "metrics" + (admin ? " admin-metrics" : ""), "aria-label": "Synthetic overview metrics" }, items.map((item, index) => element("article", { class: "metric-card" + (item.accent ? " accent" : "") },
      element("div", { class: "metric-top" }, element("span", {}, item.label), element("span", { class: "metric-icon" }, icon(["chart", "arrows", "wallet", "grid"][index % 4]))),
      element("div", { class: "metric-value" + (item.value.length > 15 ? " compact" : "") }, item.value), element("p", { class: "metric-note" }, item.note))));
  }
  function cardHead(title, subtitle, action) { return element("div", { class: "card-head" }, element("div", {}, element("h2", {}, title), subtitle ? element("p", {}, subtitle) : null), action); }
  function table(headers, rows, caption) {
    return element("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": caption }, element("table", { "aria-label": caption },
      element("thead", {}, element("tr", {}, headers.map(text => element("th", { scope: "col" }, text)))),
      element("tbody", {}, rows.length ? rows.map(row => element("tr", {}, row.map(cell => element("td", {}, cell)))) : element("tr", {}, element("td", { colspan: headers.length, class: "empty-state" }, "No synthetic records match this view.")))));
  }
  function activityCard(title, headers, rows, action) {
    return element("section", { class: "card" }, cardHead(title, "Latest entries in the synthetic snapshot", action), table(headers, rows, title), element("div", { class: "table-footer" }, "Demo records only · nothing is processed", model.asOf));
  }
  function chart() {
    const chartBox = element("div", { class: "chart" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 165"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${model.data.chartLabel}, seven synthetic daily values in ${model.data.chartUnit}: ${model.data.chart.join(", ")}`);
    function shape(name, attributes, text) { const node = document.createElementNS(svg.namespaceURI, name); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text) node.textContent = text; svg.append(node); }
    const max = Math.max(...model.data.chart, 1);
    for (let index = 0; index < 4; index++) { const y = 15 + index * 44; shape("line", { x1: 40, y1: y, x2: 586, y2: y, class: "chart-grid" }); shape("text", { x: 2, y: y + 4 }, String(Math.round(max * (1 - index / 3)))); }
    const points = model.data.chart.map((value, index) => [40 + index * 91, 147 - value / max * 130]);
    shape("polygon", { points: [[40, 147], ...points, [586, 147]].map(point => point.join(",")).join(" "), class: "chart-area" });
    shape("polyline", { points: points.map(point => point.join(",")).join(" "), class: "chart-line" });
    for (const [cx, cy] of points) shape("circle", { cx, cy, r: 4, class: "chart-dot" });
    chartBox.append(svg, element("div", { class: "chart-labels" }, ["09 Sep", "10 Sep", "11 Sep", "12 Sep", "13 Sep", "14 Sep", "15 Sep"].map(day => element("span", {}, day))));
    return element("section", { class: "card" }, cardHead(model.data.chartLabel, "Curated daily demo volume · " + model.data.chartUnit, element("span", { class: "date-chip" }, "Last 7 days")),
      element("div", { class: "chart-summary" }, element("strong", {}, model.data.chartTotal), element("span", {}, "● Demo period")), chartBox);
  }
  function capacityCard(merchant = false) {
    const values = merchant ? [["Available", "₹3,38,710"], ["Reserved", "₹48,000"], ["Hold / Frozen", "₹12,000"], ["Withdrawn", "₹80,000"]] : [["Available", "₹1,72,000"], ["Used", "₹78,000"], ["Reserved", "₹25,000"], ["Hold / Frozen", "₹5,000"]];
    return element("section", { class: "card" }, cardHead(merchant ? "Balance at a glance" : "Capacity at a glance", "Synthetic allocation snapshot"),
      element("div", { class: "capacity-body" }, element("div", { class: "capacity-number" }, model.persona.pending ? "₹0" : merchant ? "₹3,38,710" : "₹1,72,000"),
        element("p", { class: "capacity-caption" }, model.persona.pending ? "Complete onboarding to become operational" : merchant ? "Available balance · demo" : "Available of ₹2,80,000 configured"),
        !merchant && !model.persona.pending ? element("div", { class: "capacity-bar", "aria-hidden": "true" }, ["available", "used", "reserved", "held"].map(name => element("span", { class: name }))) : null,
        element("div", { class: "capacity-legend" }, values.map(([label, value]) => element("div", { class: "legend-item" }, element("span", { class: "dot", "aria-hidden": "true" }), label, element("strong", {}, model.persona.pending ? "₹0" : value))))));
  }
  function userDashboard() {
    content.append(heading(model.persona.pending ? "Welcome to WPay, Aarav" : "Your money, at a glance", model.persona.pending ? "A few steps remain before your demo account is operational." : "Welcome back, Arjun. Here’s your workspace overview."));
    if (model.persona.pending) content.append(element("section", { class: "card onboarding-card" }, element("h2", {}, "Finish setting up your account"), element("p", {}, "Pending approval · Financial operations remain unavailable. No deposit is requested in this preview."),
      element("ul", { class: "checklist" }, model.data.checklist.map(([label, status]) => element("li", { class: status === "Complete" ? "complete" : "" }, label, element("span", {}, status))))));
    content.append(metrics(model.data.metrics), element("div", { class: "card-grid" }, chart(), capacityCard()), activityCard("Recent activity", ["ACTIVITY", "AMOUNT", "STATUS", "TIME"], model.data.activity.map(([title, detail, amount, status, time]) => [element("div", {}, element("strong", {}, title), element("small", {}, detail)), amount, badge(status), time])));
  }
  function bankScreen() {
    content.append(heading("Bank & UPI accounts", "Review your synthetic accounts, approval stages and operational status."),
      element("div", { class: "intro-banner" }, element("span", { "aria-hidden": "true" }, "◇"), element("div", {}, element("strong", {}, "Approval comes before verification"), element("p", {}, "Demo workflow only. Verification, account submission and statement processing are not connected."))));
    const rows = model.data.banks.map(row => [element("strong", {}, row.upi), row.bank, row.account, row.limit, badge(row.approval), badge(row.verification), badge(row.status),
      element("button", { type: "button", class: "button secondary", disabled: true }, row.approval !== "Approved" ? "Awaiting review" : row.verification === "Verified" ? "Verified · demo" : model.capabilities.previewBankVerification ? "Verification planned" : "Verification unavailable")]);
    content.append(element("section", { class: "card" }, cardHead("Linked accounts", "Masked synthetic data · no real account access", element("button", { class: "button secondary", disabled: true }, "Add account · planned")),
      table(["MASKED UPI", "BANK", "MASKED ACCOUNT", "CONFIGURED LIMIT", "ADMIN APPROVAL", "VERIFICATION", "OPERATIONAL STATUS", "WORKFLOW"], rows, "Synthetic Bank and UPI accounts"), element("div", { class: "table-footer" }, `${rows.length} demo accounts`, "Verification never calls a live endpoint")));
  }
  const orderRow = row => [element("strong", {}, row.id), row.reference, row.amount, badge(row.status), row.source, row.created, row.paid];
  const orderHeaders = ["ORDER ID", "MERCHANT REFERENCE", "AMOUNT", "STATUS", "SOURCE", "CREATED", "PAID"];
  function merchantDashboard() {
    content.append(heading("Collections, without the clutter", "Northstar Commerce · Your synthetic business snapshot."), metrics(model.data.metrics), element("div", { class: "card-grid" }, chart(), capacityCard(true)),
      activityCard("Recent payment orders", orderHeaders, model.data.orders.slice(0, 4).map(orderRow), link("View all orders →", "merchant.payment-orders")));
  }
  function merchantOrders() {
    content.append(heading("Payment orders", "Search and filter the local demo snapshot. No payment is created or updated.", link("+ Create link preview", "merchant.create-payment-link", "button secondary")));
    const search = element("input", { id: "order-search", type: "search", placeholder: "Search order or merchant reference", autocomplete: "off" });
    const status = element("select", { id: "order-status" }, ["All statuses", "Paid", "Pending", "Expired"].map(value => element("option", { value }, value)));
    const count = element("span", { class: "result-count", role: "status" });
    const tableHost = element("div");
    const refresh = () => {
      const term = search.value.trim().toLowerCase();
      const rows = model.data.orders.filter(row => (status.value === "All statuses" || row.status === status.value) && (row.id + " " + row.reference).toLowerCase().includes(term));
      count.textContent = `${rows.length} of ${model.data.orders.length} demo orders`;
      tableHost.replaceChildren(table(orderHeaders, rows.map(orderRow), "Filtered synthetic payment orders"));
    };
    search.addEventListener("input", refresh); status.addEventListener("change", refresh);
    content.append(element("section", { class: "card" }, cardHead("All orders", "15 September 2026 · curated demo records"),
      element("div", { class: "filter-bar" }, element("div", { class: "field search-field" }, element("label", { for: "order-search" }, "Search orders"), search), element("div", { class: "field" }, element("label", { for: "order-status" }, "Status"), status), count), tableHost,
      element("div", { class: "table-footer" }, "Showing synthetic records only", "Filtering stays in this browser")));
    refresh();
  }
  function adminDashboard() {
    content.append(heading("The whole workspace. One view.", "A clear picture of your synthetic operations and review queues.", link("Review approvals · 7", "administration.users", "button primary")), metrics(model.data.metrics, true));
    const alerts = element("section", { class: "card" }, cardHead("Attention required", "Synthetic preview alerts", badge("7 Pending")), element("div", { class: "alerts" }, model.data.alerts.map(([title, description, action], index) => element("div", { class: "alert-row" }, element("span", { class: "alert-symbol", "aria-hidden": "true" }, "◇"), element("div", {}, element("h3", {}, title), element("p", {}, description), index === 0 ? link(action + " →", "administration.users") : element("small", {}, action))))));
    content.append(element("div", { class: "admin-bottom" }, alerts, activityCard("Administrative activity", ["ACTIVITY", "STATUS", "TIME"], model.data.activity.map(([title, detail, status, time]) => [element("div", {}, element("strong", {}, title), element("small", {}, detail)), badge(status), time]))));
  }
  function approvalScreen(kind) {
    const rows = model.data.approvals[kind];
    const labels = { users: "Users", merchants: "Merchants", banks: "Bank / UPI" };
    const canReview = model.capabilities[{ users: "previewUserApproval", merchants: "previewMerchantApproval", banks: "previewBankApproval" }[kind]];
    content.append(heading("Pending approvals", "Review synthetic applications. Approval previews never save or change a record."));
    const tabs = element("nav", { class: "tabs", "aria-label": "Approval categories" }, Object.entries(labels).map(([key, label]) => element("a", { href: "#administration." + (key === "banks" ? "bank-upi" : key), "aria-current": key === kind ? "page" : undefined }, `${label} · ${model.data.approvals[key].length}`)));
    const dataRows = rows.map(row => {
      const review = canReview ? button("Review preview", event => openApproval(kind, row, event.currentTarget)) : element("span", { class: "badge neutral" }, "View only");
      return kind === "banks" ? [element("div", {}, element("strong", {}, row.name), element("small", {}, row.detail)), row.account, row.upi, row.limit, badge(row.status), review] : [element("div", {}, element("strong", {}, row.name), element("small", {}, row.id)), row.detail, row.submitted, badge(row.status), review];
    });
    content.append(element("section", { class: "card" }, tabs, cardHead(labels[kind] + " awaiting review", "All applications below are synthetic"),
      table(kind === "banks" ? ["ACCOUNT HOLDER", "MASKED ACCOUNT", "MASKED UPI", "SUBMITTED LIMIT", "STATUS", "ACTION"] : ["APPLICANT", "ACCOUNT TYPE", "SUBMITTED", "STATUS", "ACTION"], dataRows, "Synthetic pending " + labels[kind]),
      element("div", { class: "table-footer" }, `${rows.length} synthetic applications`, "Preview approval — not saved")));
  }
  function openApproval(kind, row, trigger) {
    modalTrigger = trigger;
    $("approval-form").reset(); $("modal-result").textContent = "";
    $("modal-title").textContent = { users: "Review User application", merchants: "Review Merchant application", banks: "Review Bank / UPI" }[kind];
    $("modal-description").textContent = row.name + " · Synthetic application. Values are not saved or sent.";
    const fields = $("modal-fields"); fields.replaceChildren();
    if (kind === "banks") {
      const details = [["Account holder", row.name], ["Bank", row.detail], ["Masked account", row.account], ["Masked UPI", row.upi], ["Submitted limit", row.limit], ["Review status", row.status]];
      fields.append(element("dl", { class: "review-details" }, details.map(([label, value]) => element("div", {}, element("dt", {}, label), element("dd", {}, value)))));
    } else {
      const definitions = kind === "users" ? [["Pay-in Commission %", "1.50", "percent"], ["Payout Commission %", "0.50", "percent"], ["Fixed USDT Rate", "84.00", "rate"], ["Deposit Network", "DEMO NETWORK — NOT CONFIGURED", "network"], ["Assigned Deposit Address", "DEMO-ADDRESS-NOT-VALID-FOR-PAYMENT", "address"]] : [["Pay-in Fee %", "1.50", "percent"], ["Payout Fee %", "1.00", "percent"], ["Fixed Fee Per Payout", "5.00", "fee"]];
      definitions.forEach(([label, value, type], index) => {
        const id = "approval-field-" + index;
        const numeric = ["percent", "rate", "fee"].includes(type);
        const input = type === "network" ? element("select", { id, required: true }, element("option", { value: "demo" }, value)) : element("input", { id, value, type: numeric ? "number" : "text", required: true, min: type === "rate" ? "0.01" : numeric ? "0" : undefined, max: type === "percent" ? "100" : undefined, step: numeric ? "0.01" : undefined, maxlength: numeric ? undefined : "100", autocomplete: "off" });
        fields.append(element("div", { class: "field" + (type === "address" || type === "fee" ? " wide" : "") }, element("label", { for: id }, label), input,
          type === "fee" ? element("small", {}, "Currency requires a future policy decision. This value is not applied.") : type === "address" ? element("small", {}, "Synthetic placeholder only. Never send funds to a preview address.") : null));
      });
    }
    dialog.showModal(); $("close-modal").focus();
  }
  $("approval-form").addEventListener("submit", event => { event.preventDefault(); $("modal-result").textContent = "Preview checked — nothing was saved. The application remains pending."; });
  $("close-modal").addEventListener("click", () => dialog.close()); $("cancel-modal").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { $("approval-form").reset(); $("modal-fields").replaceChildren(); $("modal-result").textContent = ""; modalTrigger?.focus(); });
  function financeReadonly() {
    content.append(heading(activePage.label, "A restricted Employee view of synthetic finance and reporting data."), element("div", { class: "readonly-banner" }, "View-only workspace · Approval, editing, export and Employee administration are unavailable to this demo persona."),
      metrics(model.data.summary), activityCard("Preview report entries", ["REFERENCE", "DESCRIPTION", "AMOUNT", "STATUS"], model.data.rows.map(([id, title, amount, status]) => [id, title, amount, badge(status)])));
  }
  function paymentForm() {
    content.append(heading("Create Payment Link", "Planned form preview. Link generation and callbacks are not connected."));
    const form = element("form", { class: "card planned-form", onsubmit: event => event.preventDefault() }, element("h2", {}, "Payment link details"), element("p", {}, "Explore the proposed form. No link, QR, order or payment will be generated."));
    for (const [id, label, value] of [["payment-reference", "Merchant reference", "DEMO-REFERENCE"], ["payment-amount", "Amount (INR)", "0.00"], ["payment-description", "Description", "Synthetic preview only"]]) form.append(element("div", { class: "field" }, element("label", { for: id }, label), element("input", { id, value, disabled: true })));
    form.append(element("button", { type: "button", class: "button primary", disabled: true }, "Link generation — not connected")); content.append(form);
  }
  function planned() {
    const trade = activePage.destinationId === "user.trade";
    content.append(heading(activePage.label, "This destination is part of the proposed WPay workspace."), element("section", { class: "card planned-card" }, element("div", { class: "planned-symbol", "aria-hidden": "true" }, "◇"),
      element("div", { class: "eyebrow" }, trade ? "TRADE WITH WPAY" : "WORKSPACE ROADMAP"), element("h2", {}, trade ? "Coming Soon" : "Planned — not connected"),
      element("p", {}, activePage.purpose + ". This preview does not perform this operation or access live records."), badge(activePage.descriptorOnly ? "Navigation descriptor only" : "Preview destination"),
      element("small", {}, "No transactions, uploads, credentials or device messages are processed.")));
  }
  function route(focus = false) {
    if (!model) return;
    let destination; try { destination = decodeURIComponent(location.hash.slice(1)); } catch { destination = "invalid"; }
    const available = model.navigation.flatMap(group => group.children);
    activePage = available.find(page => page.destinationId === destination);
    if (!destination || destination === "content") activePage = available[0];
    content.replaceChildren();
    if (!activePage) { content.append(heading("Page unavailable", "This page is not available to the selected demo persona."), link("Return to workspace", available[0].destinationId, "button secondary")); renderNavigation(); return; }
    const group = model.navigation.find(item => item.children.includes(activePage));
    expandedGroup = group.id; $("breadcrumb").textContent = model.persona.panel + " workspace / " + group.label + " / " + activePage.label;
    document.title = `WPay · ${model.persona.panel} · ${activePage.label} · Demo`;
    renderNavigation();
    const renderers = { "user-dashboard": userDashboard, "user-banks": bankScreen, "merchant-dashboard": merchantDashboard, "merchant-orders": merchantOrders, "admin-dashboard": adminDashboard,
      "approvals-users": () => approvalScreen("users"), "approvals-merchants": () => approvalScreen("merchants"), "approvals-banks": () => approvalScreen("banks"), "finance-readonly": financeReadonly, "payment-form": paymentForm, planned };
    (renderers[activePage.view] || planned)();
    if (focus) content.focus();
  }
  window.addEventListener("hashchange", () => { closeDrawer(false); route(true); });
  async function selectPersona(id) {
    const sequence = ++loadSequence;
    content.replaceChildren(element("div", { class: "loading-state", role: "status" }, "Loading demo persona…"));
    try {
      const response = await fetch("/demo/model?persona=" + encodeURIComponent(id), { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("Preview unavailable");
      const next = await response.json(); if (sequence !== loadSequence) return;
      model = next; $("panel-label").textContent = model.persona.panel + " panel"; $("persona-name").textContent = model.persona.name;
      $("persona-role").textContent = model.persona.pending ? "Pending approval · demo" : model.persona.panel + " · demo"; $("avatar").textContent = model.persona.initials;
      if (dialog.open) dialog.close(); closeDrawer(false);
      const first = model.navigation[0]?.children[0];
      history.replaceState(null, "", "#" + first.destinationId); route();
    } catch {
      if (sequence !== loadSequence) return;
      model = null; $("navigation").replaceChildren();
      content.replaceChildren(element("section", { class: "card planned-card", role: "alert" }, element("h1", {}, "Preview unavailable"), element("p", {}, "The isolated preview server could not load this persona."), button("Retry demo", () => selectPersona(id))));
    }
  }
  $("persona-select").addEventListener("change", event => selectPersona(event.target.value));
  async function init() {
    try {
      const response = await fetch("/demo/personas", { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("Preview unavailable");
      const data = await response.json();
      $("persona-select").replaceChildren(...data.personas.map(persona => element("option", { value: persona.id }, persona.label)));
      await selectPersona("user");
    } catch { content.replaceChildren(element("div", { class: "empty-state", role: "alert" }, "Preview unavailable. Start the isolated loopback server and reload this page.")); }
  }
  init();
})();
