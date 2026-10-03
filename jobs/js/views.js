"use strict";

/* =====================================================================
   DK Jobs - page shell, Home dashboard, Jobs list and Job page.
   ===================================================================== */

var TABS = [
  { key: "home", label: "Home", group: "Work", icon: "home" },
  { key: "jobs", label: "Jobs", group: "Work", icon: "briefcase" },
  { key: "clients", label: "Clients", group: "Work", icon: "users" },
  { key: "invoices", label: "Quotes & Invoices", group: "Money", icon: "file" },
  { key: "expenses", label: "Expenses", group: "Money", icon: "receipt" },
  { key: "mileage", label: "Mileage", group: "Money", icon: "car" },
  { key: "reports", label: "Reports", group: "Money", icon: "chart" },
  { key: "prices", label: "Price List", group: "Setup", icon: "tag" },
  { key: "settings", label: "Settings", group: "Setup", icon: "gear" }
];

/* Simple line icons (24x24, drawn with the current text colour). */
var ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pound: '<path d="M16 6.5A4 4 0 0 0 9 8.5V18M6 18h11M6 12.5h7"/>'
};
function icon(name, cls) {
  return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + '</svg>';
}

/* ---------- Routing (#/jobs/J0001 style links so Back works) ---------- */
function readRoute() {
  var parts = (location.hash || "").replace(/^#\/?/, "").split("/");
  var tab = parts[0] || "home";
  if (tab === "doc") return { tab: "doc", id: decodeURIComponent(parts[1] || "") };
  if (!TABS.some(function (t) { return t.key === tab; })) tab = "home";
  return { tab: tab, id: parts[1] ? decodeURIComponent(parts[1]) : null };
}
function go(tab, id) {
  var h = "#/" + tab + (id ? "/" + encodeURIComponent(id) : "");
  if (location.hash === h) { state.route = readRoute(); render(); }
  else location.hash = h;
}
window.addEventListener("hashchange", function () {
  state.route = readRoute();
  state.navOpen = false;
  state.expAdding = state.mileAdding = state.clientAdding = state.productAdding = false;
  state.expEditingId = state.mileEditingId = state.clientEditingId = state.productEditingId = null;
  var pending = state.pendingForm; state.pendingForm = null;
  if (pending === "expense") state.expAdding = true;
  if (pending === "mileage") state.mileAdding = true;
  render();
  window.scrollTo(0, 0);
  if (pending === "expense") focusForm("expAmount");
  if (pending === "mileage") { updateMileagePreview(); focusForm("mMiles"); }
});

/* ---------- Small builders ---------- */
function attr(s) { return escapeHtml(s === undefined || s === null ? "" : s); }
// An input that writes straight into the data as you type.
// kind: "job", "client", "product", "settings", "doc", or a sub-list
// ("job-items", "job-dates", "job-todos", "doc-items") with sub = row id.
function bound(kind, id, field, value, opts) {
  opts = opts || {};
  var type = opts.type || "text";
  var a = ' data-bind="' + kind + '" data-id="' + attr(id) + '" data-field="' + field + '"' +
    (opts.sub ? ' data-sub="' + attr(opts.sub) + '"' : "") +
    (opts.num ? ' data-num="1"' : "") + (opts.rerender ? ' data-rerender="1"' : "") +
    (opts.placeholder ? ' placeholder="' + attr(opts.placeholder) + '"' : "") +
    (opts.extra || "");
  var cls = "field-input" + (opts.cls ? " " + opts.cls : "");
  if (type === "textarea") return '<textarea class="' + cls + '"' + a + ' rows="' + (opts.rows || 3) + '">' + escapeHtml(value) + '</textarea>';
  if (type === "checkbox") return '<input type="checkbox"' + a + (value ? " checked" : "") + '>';
  if (type === "select") {
    return '<select class="' + cls + '"' + a + '>' + opts.options.map(function (o) {
      var v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o;
      return '<option value="' + attr(v) + '"' + (String(v) === String(value === undefined || value === null ? "" : value) ? " selected" : "") + '>' + escapeHtml(l) + '</option>';
    }).join("") + '</select>';
  }
  return '<input type="' + type + '" class="' + cls + '"' + a + ' value="' + attr(value) + '"' + (opts.num ? ' step="any" inputmode="decimal"' : "") + '>';
}
function field(label, inner, cls) {
  return '<div class="field' + (cls ? " " + cls : "") + '"><label>' + escapeHtml(label) + '</label>' + inner + '</div>';
}
function btn(label, action, opts) {
  opts = opts || {};
  return '<button type="button" class="btn ' + (opts.cls || "") + '" data-action="' + action + '"' +
    (opts.id ? ' data-id="' + attr(opts.id) + '"' : "") + (opts.extra || "") + (opts.disabled ? " disabled" : "") + '>' + label + '</button>';
}
function statusTag(s) {
  var cls = { "Potential": "st-potential", "Pencilled": "st-pencilled", "Confirmed": "st-confirmed", "Awaiting Payment": "st-awaiting", "Completed": "st-completed", "Cancelled": "st-cancelled" }[s] || "st-potential";
  return '<span class="tag ' + cls + '">' + escapeHtml(s || "Potential") + '</span>';
}
function docStatusTag(d) {
  if (d.kind === "quote") {
    var q = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", void: "Void" }[d.status] || d.status;
    return '<span class="tag ds-' + d.status + '">' + q + '</span>';
  }
  if (isOverdue(d)) return '<span class="tag ds-overdue">Overdue</span>';
  var l = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" }[d.status] || d.status;
  return '<span class="tag ds-' + d.status + '">' + l + '</span>';
}
function clientOptions(includeBlank) {
  var opts = includeBlank ? [{ value: "", label: "— Choose client —" }] : [];
  return opts.concat(state.data.clients.slice().sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); })
    .map(function (c) { return { value: c.id, label: c.name || "(no name)" }; }));
}
function jobOptions(blankLabel) {
  var jobs = state.data.jobs.slice().sort(function (a, b) { var x = jobStartDate(a), y = jobStartDate(b); return x < y ? 1 : x > y ? -1 : 0; });
  return [{ value: "", label: blankLabel || "— No job —" }].concat(jobs.map(function (j) {
    return { value: j.id, label: jobLabel(j) + (jobStartDate(j) ? " (" + fmtDate(jobStartDate(j)) + ")" : "") };
  }));
}
function yearSelect(id, value) {
  return '<select class="field-input year-select" id="' + id + '">' + yearsWithData().map(function (y) {
    return '<option value="' + y + '"' + (y === value ? " selected" : "") + '>Tax year ' + taxYearLabel(y) + '</option>';
  }).join("") + '</select>';
}
function emptyBlock(title, text, actionHtml) {
  return '<div class="card empty-state"><div class="big">' + escapeHtml(title) + '</div><div>' + escapeHtml(text) + '</div>' +
    (actionHtml ? '<div class="btn-row">' + actionHtml + '</div>' : "") + '</div>';
}

/* ---------- Shell ---------- */
function render() {
  var app = document.getElementById("app");
  if (!state.authed) { app.innerHTML = renderGate(); attachGateEvents(); return; }
  var r = state.route, body;
  switch (r.tab) {
    case "jobs": body = r.id ? renderJobPage(r.id) : renderJobs(); break;
    case "clients": body = renderClients(); break;
    case "invoices": body = renderInvoices(); break;
    case "doc": body = renderDocPage(r.id); break;
    case "expenses": body = renderExpenses(); break;
    case "mileage": body = renderMileage(); break;
    case "reports": body = renderReports(); break;
    case "prices": body = renderPrices(); break;
    case "settings": body = renderSettings(); break;
    default: body = renderHome();
  }
  var SUBS = { jobs: "Every booking, from pencil to paid", clients: "Who you work for", invoices: "Quotes, invoices and what you're owed",
    expenses: "Business costs and receipts", mileage: "Business journeys at HMRC rates", reports: "Figures for your tax return and MTD updates",
    prices: "Your rates, ready to drop onto a job", settings: "Your details, invoices, tax and mileage" };
  if (!r.id && SUBS[r.tab]) {
    var t = TABS.filter(function (x) { return x.key === r.tab; })[0];
    body = pageHeader(t.label, SUBS[r.tab]) + body;
  }
  app.innerHTML = '<div class="shell' + (state.navOpen ? " nav-open" : "") + '">' + renderSidebar() +
    '<div class="nav-scrim" data-action="nav-close"></div>' +
    '<main class="main">' + renderMobileBar() + '<div class="main-inner">' + body + '</div></main></div>';
}

function renderGate() {
  var busy = state.authBusy ? " disabled" : "";
  var body = state.authChecking ? '<div class="gate-sub">Loading…</div>' :
    '<div class="gate-sub">Log in with your DK Timesheet account</div>' +
    '<form id="authForm" novalidate>' +
      '<label class="auth-label" for="authEmail">Email</label>' +
      '<input type="email" id="authEmail" class="field-input auth-input" autocomplete="username" required>' +
      '<label class="auth-label" for="authPassword">Password</label>' +
      '<input type="password" id="authPassword" class="field-input auth-input" autocomplete="current-password" required>' +
      (state.authError ? '<div class="gate-error">' + escapeHtml(state.authError) + '</div>' : "") +
      '<button type="submit" class="btn btn-primary auth-submit"' + busy + '>' + (state.authBusy ? "Logging in…" : "Log in") + '</button>' +
    '</form>' +
    '<a class="link-btn" href="../">Forgot password? Reset it from the timesheet</a>';
  return '<div class="gate-wrap"><div class="card gate-card"><div class="gate-mark">DK <span>Jobs</span></div>' + body + '</div></div>';
}

function isDarkMode() {
  return document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.hasAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function renderSidebar() {
  var cur = state.route.tab === "doc" ? "invoices" : state.route.tab, group = "";
  var links = TABS.map(function (t) {
    var head = t.group !== group ? '<div class="nav-group">' + t.group + '</div>' : "";
    group = t.group;
    return head + '<a class="nav-link' + (cur === t.key ? " active" : "") + '" href="#/' + t.key + '">' + icon(t.icon) + '<span>' + t.label + '</span></a>';
  }).join("");
  return '<aside class="sidebar">' +
      '<a class="side-brand" href="#/home"><span class="brand-badge">DK</span><span class="brand-text">DK Jobs<small>v' + JOBS_VERSION + '</small></span></a>' +
      '<nav class="side-nav">' + links + '</nav>' +
      '<div class="side-foot">' +
        '<a class="switch-app" href="../" title="Go to DK Timesheet">' + icon("swap") + '<span>Open Timesheet</span></a>' +
        '<div class="foot-row">' +
          '<span class="sync-pill" id="syncStatusPill" title="' + attr(state.user ? "Signed in as " + state.user.email : "Not connected") + '"><span class="sync-dot ' + state.syncStatus + '"></span><span class="sync-label">' + syncStatusLabel() + '</span></span>' +
          '<button class="icon-only" data-action="theme" title="' + (isDarkMode() ? "Light mode" : "Dark mode") + '">' + icon(isDarkMode() ? "sun" : "moon") + '</button>' +
          '<button class="icon-only" data-action="logout" title="Log out">' + icon("logout") + '</button>' +
        '</div>' +
      '</div>' +
    '</aside>';
}
function renderMobileBar() {
  return '<div class="mobile-bar"><button class="icon-only" data-action="nav-open" aria-label="Menu">' + icon("menu") + '</button>' +
    '<span class="brand-badge sm">DK</span><span class="mobile-title">' + escapeHtml((TABS.filter(function (t) { return t.key === (state.route.tab === "doc" ? "invoices" : state.route.tab); })[0] || TABS[0]).label) + '</span>' +
    '<a class="icon-only" href="../" title="Open Timesheet">' + icon("swap") + '</a></div>';
}
function pageHeader(title, sub, actionsHtml) {
  return '<div class="page-header"><div><h1 class="page-h1">' + escapeHtml(title) + '</h1>' + (sub ? '<div class="page-sub">' + escapeHtml(sub) + '</div>' : "") + '</div>' +
    (actionsHtml ? '<div class="btn-row">' + actionsHtml + '</div>' : "") + '</div>';
}

/* ---------- Home ---------- */
function renderHome() {
  var d = state.data, today = todayIso(), y = currentTaxYear();
  var firstRun = !d.jobs.length && !d.clients.length;

  var hr = new Date().getHours();
  var hello = (hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening") +
    (d.settings.yourName ? ", " + d.settings.yourName.split(" ")[0] : "");
  var quick = '<div class="greeting"><h1 class="page-h1">' + escapeHtml(hello) + '</h1><div class="page-sub">What are we doing today?</div></div>' +
    '<div class="quick-grid">' +
    '<button class="quick t-blue" data-action="new-job">' + icon("briefcase") + '<span>New job</span></button>' +
    '<button class="quick t-amber" data-action="new-expense">' + icon("receipt") + '<span>Add expense</span></button>' +
    '<button class="quick t-teal" data-action="new-mileage">' + icon("car") + '<span>Log mileage</span></button>' +
    '<button class="quick t-rose" data-action="new-client">' + icon("users") + '<span>Add client</span></button>' +
  '</div>';

  if (firstRun) {
    return quick + '<div class="card setup-card"><div class="settings-title">Getting started</div>' +
      '<ol class="setup-list">' +
        '<li><a href="#/settings">Add your business and bank details</a> so they appear on invoices.</li>' +
        '<li><a href="#/prices">Add your day rates and per diems</a> to the price list.</li>' +
        '<li><a href="#/clients">Add the companies you work for</a>.</li>' +
        '<li>Create a job, add your costs and mileage as you go, then invoice it from the job.</li>' +
      '</ol></div>';
  }

  // Income this tax year so far vs the same point last year.
  var dayOfYear = Math.round((new Date(today + "T12:00:00") - new Date(taxYearStart(y) + "T12:00:00")) / 86400000);
  var lastSame = addDays(taxYearStart(y - 1), dayOfYear);
  var incNow = sumInvoices(incomeInRange({ from: taxYearStart(y), to: today }));
  var incLast = sumInvoices(incomeInRange({ from: taxYearStart(y - 1), to: lastSame }));
  var diffPct = incLast > 0 ? Math.round((incNow - incLast) / incLast * 100) : null;

  var unpaid = liveInvoices().filter(function (i) { return i.status === "sent"; });
  var unpaidTotal = sumInvoices(unpaid), overdue = unpaid.filter(isOverdue);

  var rep = buildReport(y, "all");
  var pipeline = d.jobs.filter(function (j) { return ["Pencilled", "Confirmed"].indexOf(j.status) !== -1; })
    .reduce(function (s, j) { return s + jobUninvoiced(j).total; }, 0);

  var stats = '<div class="stat-grid stat-grid-4">' +
    stat("Income " + taxYearLabel(y) + " so far", money(incNow), diffPct === null ? (incLast ? "" : "Nothing at this point last year") : (diffPct >= 0 ? diffPct + "% ahead of last year" : Math.abs(diffPct) + "% behind last year")) +
    stat("Unpaid invoices", money(unpaidTotal), unpaid.length ? unpaid.length + " sent" + (overdue.length ? " · " + overdue.length + " overdue" : "") : "All settled", overdue.length ? "warn" : "") +
    stat("Booked, not invoiced", money(pipeline), "Pencilled and confirmed jobs") +
    stat("Profit " + taxYearLabel(y), money(rep.profit), money(rep.allowable) + " expenses incl. mileage") +
  '</div>';

  // Jobs with work done but not invoiced.
  var action = d.jobs.filter(function (j) {
    return j.status !== "Cancelled" && j.status !== "Potential" && jobEndDate(j) && jobEndDate(j) <= today && jobUninvoiced(j).total > 0;
  }).sort(function (a, b) { return jobEndDate(a) < jobEndDate(b) ? -1 : 1; });
  var actionHtml = action.length ? action.map(function (j) {
    return '<div class="list-row link-row" data-action="open-job" data-id="' + attr(j.id) + '">' +
      '<div class="lr-main"><div class="lr-title">' + escapeHtml(j.title || "Untitled job") + '</div><div class="lr-sub">' + escapeHtml(clientName(j.clientId)) + ' · ' + jobDateText(j) + '</div></div>' +
      '<div class="lr-end"><div class="mono">' + money(jobUninvoiced(j).total) + '</div><div class="lr-sub">not invoiced</div></div></div>';
  }).join("") : '<div class="list-empty">Nothing waiting to be invoiced.</div>';

  var upcoming = d.jobs.filter(function (j) { return j.status !== "Cancelled" && (jobEndDate(j) || jobStartDate(j)) >= today; })
    .sort(function (a, b) { return jobStartDate(a) < jobStartDate(b) ? -1 : 1; }).slice(0, 6);
  var upHtml = upcoming.length ? upcoming.map(function (j) {
    var days = Math.round((new Date(jobStartDate(j) + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000);
    return '<div class="list-row link-row" data-action="open-job" data-id="' + attr(j.id) + '">' +
      '<div class="lr-main"><div class="lr-title">' + escapeHtml(j.title || "Untitled job") + '</div><div class="lr-sub">' + escapeHtml(clientName(j.clientId)) + (j.venue ? " · " + escapeHtml(j.venue) : "") + '</div></div>' +
      '<div class="lr-end"><div>' + fmtDate(jobStartDate(j)) + '</div><div class="lr-sub">' + (days <= 0 ? "On now" : days === 1 ? "Tomorrow" : days + " days away") + '</div></div></div>';
  }).join("") : '<div class="list-empty">No upcoming jobs.</div>';

  var unpaidHtml = unpaid.length ? unpaid.sort(function (a, b) { return (a.due || "") < (b.due || "") ? -1 : 1; }).map(function (i) {
    return '<div class="list-row link-row" data-action="open-doc" data-id="' + attr(i.id) + '">' +
      '<div class="lr-main"><div class="lr-title">' + escapeHtml(i.number) + ' · ' + escapeHtml(i.client.name || "") + '</div><div class="lr-sub">Due ' + fmtDate(i.due) + '</div></div>' +
      '<div class="lr-end"><div class="mono">' + money(docTotals(i).gross) + '</div>' + docStatusTag(i) + '</div></div>';
  }).join("") : '<div class="list-empty">No unpaid invoices.</div>';

  return quick + stats +
    '<div class="two-col">' +
      '<div><div class="section-title">Needs invoicing</div><div class="card list-card">' + actionHtml + '</div>' +
      '<div class="section-title">Unpaid invoices</div><div class="card list-card">' + unpaidHtml + '</div></div>' +
      '<div><div class="section-title">Coming up</div><div class="card list-card">' + upHtml + '</div>' +
      '<div class="section-title">Income by month · ' + taxYearLabel(y) + '</div>' + renderMonthBars(y) + '</div>' +
    '</div>';
}
function stat(label, value, sub, cls) {
  return '<div class="card stat-card' + (cls ? " " + cls : "") + '"><div class="stat-label">' + escapeHtml(label) + '</div><div class="stat-value">' + value + '</div>' +
    (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : "") + '</div>';
}
function sumInvoices(list) { return round2(list.reduce(function (s, i) { return s + docTotals(i).net; }, 0)); }
function renderMonthBars(y) {
  var months = [];
  for (var k = 0; k < 12; k++) {
    var m = (3 + k) % 12, yr = m < 3 ? y + 1 : y;
    var from = yr + "-" + pad2(m + 1) + "-01", to = yr + "-" + pad2(m + 1) + "-31";
    if (k === 0) from = taxYearStart(y);
    if (k === 11) to = taxYearEnd(y); // March runs to 5 April

    var paid = sumInvoices(incomeInRange({ from: from, to: to }));
    var booked = state.data.jobs.filter(function (j) {
      var s = jobStartDate(j);
      return s >= from && s <= to && ["Pencilled", "Confirmed"].indexOf(j.status) !== -1;
    }).reduce(function (s, j) { return s + jobUninvoiced(j).total; }, 0);
    months.push({ label: SHORT_MONTHS[m], paid: paid, booked: round2(booked) });
  }
  var max = Math.max.apply(null, months.map(function (x) { return x.paid + x.booked; }).concat([1]));
  return '<div class="card month-bars">' + months.map(function (x) {
    var hp = (x.paid / max * 100).toFixed(1), hb = (x.booked / max * 100).toFixed(1);
    return '<div class="mb-col" title="' + x.label + ': ' + money(x.paid) + ' income' + (x.booked ? ", " + money(x.booked) + " booked" : "") + '">' +
      '<div class="mb-stack"><div class="mb-booked" style="height:' + hb + '%"></div><div class="mb-paid" style="height:' + hp + '%"></div></div>' +
      '<div class="mb-label">' + x.label + '</div></div>';
  }).join("") + '<div class="mb-legend"><span><i class="mb-key paid"></i>Income</span><span><i class="mb-key booked"></i>Booked, not invoiced</span></div></div>';
}

/* ---------- Jobs list ---------- */
var JOB_FILTERS = [
  { key: "active", label: "Active", test: function (j) { return ["Completed", "Cancelled"].indexOf(j.status) === -1; } },
  { key: "all", label: "All", test: function () { return true; } }
].concat(JOB_STATUSES.map(function (s) { return { key: s, label: s, test: function (j) { return j.status === s; } }; }));

function renderJobs() {
  var jobs = state.data.jobs;
  if (!jobs.length) return emptyBlock("No jobs yet", "Add a job, then add costs, mileage and invoice it from there.", btn("New job", "new-job", { cls: "btn-primary" }));
  var f = JOB_FILTERS.filter(function (x) { return x.key === state.jobFilter; })[0] || JOB_FILTERS[0];
  var q = state.jobSearch.toLowerCase();
  var list = jobs.filter(f.test).filter(function (j) {
    if (!q) return true;
    return [j.title, j.venue, j.ref, j.po, clientName(j.clientId)].join(" ").toLowerCase().indexOf(q) !== -1;
  }).sort(function (a, b) {
    var x = jobStartDate(a) || "9999", y = jobStartDate(b) || "9999";
    return state.jobFilter === "active" ? (x < y ? -1 : x > y ? 1 : 0) : (x < y ? 1 : x > y ? -1 : 0);
  });
  var chips = '<div class="chips">' + JOB_FILTERS.map(function (x) {
    var n = jobs.filter(x.test).length;
    return '<button class="chip' + (x.key === f.key ? " active" : "") + '" data-action="job-filter" data-id="' + attr(x.key) + '">' + x.label + ' <span>' + n + '</span></button>';
  }).join("") + '</div>';
  var rows = list.map(function (j) {
    return '<tr class="link-row" data-action="open-job" data-id="' + attr(j.id) + '">' +
      '<td class="date-cell">' + jobDateText(j) + '</td>' +
      '<td><div class="lr-title">' + escapeHtml(j.title || "Untitled job") + '</div><div class="lr-sub">' + escapeHtml(j.ref || "") + (j.venue ? " · " + escapeHtml(j.venue) : "") + '</div></td>' +
      '<td>' + escapeHtml(clientName(j.clientId)) + '</td>' +
      '<td>' + statusTag(j.status) + '</td>' +
      '<td class="num">' + money(jobNet(j)) + '</td></tr>';
  }).join("");
  return '<div class="log-toolbar">' +
      '<input type="search" class="field-input search-input" id="jobSearch" placeholder="Search jobs, venues, clients, PO" value="' + attr(state.jobSearch) + '">' +
      '<div class="btn-row">' + btn("Export CSV", "export-jobs") + btn("＋ New job", "new-job", { cls: "btn-primary" }) + '</div>' +
    '</div>' + chips +
    '<div class="card log-table-wrap"><table class="log-table"><thead><tr><th>Date</th><th>Job</th><th>Client</th><th>Status</th><th class="num">Value</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5" class="list-empty">No jobs match.</td></tr>') + '</tbody></table></div>';
}

/* ---------- Job page ---------- */
function renderJobPage(id) {
  var j = jobById(id);
  if (!j) return emptyBlock("Job not found", "It may have been deleted on another device.", '<a class="btn" href="#/jobs">Back to jobs</a>');
  var client = byId(state.data.clients, j.clientId);
  var products = state.data.products.filter(function (p) { return p.active !== false; });
  var un = jobUninvoiced(j);

  var dates = (j.dates || []).map(function (dt, i) {
    return '<div class="date-row">' +
      field(i === 0 ? "Start" : "Start", bound("job-dates", j.id, "start", dt.start, { sub: dt.id, type: "date", rerender: true })) +
      field("End", bound("job-dates", j.id, "end", dt.end, { sub: dt.id, type: "date", rerender: true })) +
      field("From", bound("job-dates", j.id, "startTime", dt.startTime, { sub: dt.id, type: "time" })) +
      field("To", bound("job-dates", j.id, "endTime", dt.endTime, { sub: dt.id, type: "time" })) +
      field("Label", bound("job-dates", j.id, "label", dt.label, { sub: dt.id, placeholder: "e.g. Get in" })) +
      '<button class="btn btn-ghost btn-sm btn-danger row-x" data-action="job-date-del" data-id="' + attr(j.id) + '" data-sub="' + attr(dt.id) + '" title="Remove date">✕</button>' +
    '</div>';
  }).join("");

  var items = (j.items || []).map(function (it) {
    var locked = !!it.invoiceId;
    var inv = locked ? byId(state.data.invoices, it.invoiceId) : null;
    return '<tr' + (locked ? ' class="locked"' : "") + '>' +
      '<td>' + (locked ? escapeHtml(it.desc) + '<div class="lr-sub">On ' + escapeHtml(inv ? inv.number : "an invoice") + '</div>' : bound("job-items", j.id, "desc", it.desc, { sub: it.id, placeholder: "Description" })) + '</td>' +
      '<td class="qty-cell">' + (locked ? it.qty : bound("job-items", j.id, "qty", it.qty, { sub: it.id, num: true, cls: "num-input" })) + '</td>' +
      '<td class="price-cell">' + (locked ? money(it.price) : bound("job-items", j.id, "price", it.price, { sub: it.id, num: true, cls: "num-input" })) + '</td>' +
      '<td class="num" data-line-total="' + attr(it.id) + '">' + money(lineNet(it)) + '</td>' +
      '<td class="actions-cell">' + (locked ? "" : '<button class="btn btn-ghost btn-sm btn-danger" data-action="job-item-del" data-id="' + attr(j.id) + '" data-sub="' + attr(it.id) + '" title="Remove line">✕</button>') + '</td></tr>';
  }).join("");

  var todos = (j.todos || []).map(function (t) {
    return '<div class="todo-row' + (t.done ? " done" : "") + '">' + bound("job-todos", j.id, "done", t.done, { sub: t.id, type: "checkbox", rerender: true }) +
      bound("job-todos", j.id, "text", t.text, { sub: t.id, placeholder: "To-do" }) +
      '<button class="btn btn-ghost btn-sm btn-danger" data-action="job-todo-del" data-id="' + attr(j.id) + '" data-sub="' + attr(t.id) + '">✕</button></div>';
  }).join("");

  var miles = state.data.mileage.filter(function (m) { return m.jobId === j.id; });
  var exps = state.data.expenses.filter(function (e) { return e.jobId === j.id; });
  var docs = invoicesForJob(j.id).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  var main = '<div class="card job-card">' +
      '<div class="form-grid">' +
        field("Job title", bound("job", j.id, "title", j.title, { placeholder: "e.g. Fireworks - Ditton Manor" }), "span-2") +
        field("Client", bound("job", j.id, "clientId", j.clientId, { type: "select", options: clientOptions(true), rerender: true })) +
        field("Status", bound("job", j.id, "status", j.status, { type: "select", options: JOB_STATUSES, rerender: true })) +
        field("Venue / location", bound("job", j.id, "venue", j.venue), "span-2") +
        field("Purchase order", bound("job", j.id, "po", j.po)) +
        field("Payment terms (days)", bound("job", j.id, "terms", j.terms, { num: true, type: "number", placeholder: String(state.data.settings.paymentTerms) })) +
        field("Description shown on quotes and invoices", bound("job", j.id, "summary", j.summary, { type: "textarea", rows: 2 }), "full") +
        field("Private notes (never printed)", bound("job", j.id, "notes", j.notes, { type: "textarea", rows: 2 }), "full") +
      '</div>' +
    '</div>' +
    '<div class="section-title">Dates</div><div class="card job-card">' + (dates || '<div class="list-empty">No dates yet.</div>') +
      '<div class="btn-row">' + btn("＋ Add date", "job-date-add", { id: j.id, cls: "btn-sm" }) + '</div></div>' +
    '<div class="section-title">Charges</div><div class="card items-card"><div class="log-table-wrap"><table class="log-table items-table">' +
      '<thead><tr><th>Description</th><th class="qty-cell">Qty</th><th class="price-cell">Unit price</th><th class="num">Total</th><th class="actions-col"></th></tr></thead>' +
      '<tbody>' + (items || '<tr><td colspan="5" class="list-empty">No charges yet. Add a line or pick from your price list.</td></tr>') + '</tbody>' +
      '<tfoot><tr><td colspan="3" class="num">Job total' + (vatOn() ? " (net)" : "") + '</td><td class="num" id="jobTotal">' + money(jobNet(j)) + '</td><td></td></tr></tfoot></table></div>' +
      '<div class="btn-row items-actions">' + btn("＋ Add line", "job-item-add", { id: j.id, cls: "btn-sm" }) +
        (products.length ? '<select class="field-input" data-action-change="job-item-product" data-id="' + attr(j.id) + '"><option value="">＋ Add from price list…</option>' +
          products.map(function (p) { return '<option value="' + attr(p.id) + '">' + escapeHtml(p.name) + ' · ' + money(p.price) + '</option>'; }).join("") + '</select>'
          : '<a class="btn btn-ghost btn-sm" href="#/prices">Set up a price list</a>') +
      '</div></div>' +
    '<div class="section-title">To-dos</div><div class="card job-card">' + (todos || "") +
      '<div class="btn-row">' + btn("＋ Add to-do", "job-todo-add", { id: j.id, cls: "btn-sm" }) + '</div></div>';

  var side = '<div class="card side-card">' +
      '<div class="side-title">To invoice</div><div class="side-big mono">' + money(un.total) + '</div>' +
      '<div class="lr-sub">' + un.items.length + ' charge' + (un.items.length === 1 ? "" : "s") +
        (un.expenses.length ? " · " + un.expenses.length + " rechargeable expense" + (un.expenses.length === 1 ? "" : "s") : "") +
        (un.mileage.length ? " · " + un.mileage.length + " rechargeable trip" + (un.mileage.length === 1 ? "" : "s") : "") + '</div>' +
      '<div class="btn-row side-btns">' + btn("Create invoice", "job-invoice", { id: j.id, cls: "btn-primary", disabled: un.total <= 0 && !un.items.length }) + btn("Create quote", "job-quote", { id: j.id }) + '</div>' +
      (docs.length ? '<div class="side-docs">' + docs.map(function (dc) {
        return '<div class="list-row link-row compact" data-action="open-doc" data-id="' + attr(dc.id) + '"><div class="lr-main"><div class="lr-title">' + escapeHtml(dc.number) + '</div><div class="lr-sub">' + fmtDate(dc.date) + '</div></div><div class="lr-end"><div class="mono">' + money(docTotals(dc).gross) + '</div>' + docStatusTag(dc) + '</div></div>';
      }).join("") + '</div>' : "") +
    '</div>' +
    '<div class="card side-card"><div class="side-title">Client</div>' +
      (client ? '<div class="lr-title">' + escapeHtml(client.name) + '</div><div class="lr-sub pre">' + escapeHtml([client.contact, client.email, client.phone, client.address].filter(Boolean).join("\n")) + '</div>' +
        '<div class="btn-row side-btns"><a class="btn btn-sm" href="#/clients/' + encodeURIComponent(client.id) + '">Edit client</a></div>'
        : '<div class="lr-sub">No client chosen.</div><div class="btn-row side-btns">' + btn("Add a client", "new-client", { cls: "btn-sm" }) + '</div>') +
    '</div>' +
    '<div class="card side-card"><div class="side-head"><span class="side-title">Mileage</span>' + btn("＋ Add", "new-mileage", { id: j.id, cls: "btn-sm" }) + '</div>' +
      (miles.length ? miles.map(function (m) {
        return '<div class="side-line"><span>' + fmtDate(m.date) + ' · ' + escapeHtml(m.to || m.desc || "Trip") + '</span><span class="mono">' + tripMiles(m) + ' mi</span></div>';
      }).join("") : '<div class="lr-sub">No journeys linked yet.</div>') + '</div>' +
    '<div class="card side-card"><div class="side-head"><span class="side-title">Expenses</span>' + btn("＋ Add", "new-expense", { id: j.id, cls: "btn-sm" }) + '</div>' +
      (exps.length ? exps.map(function (e) {
        return '<div class="side-line"><span>' + escapeHtml(e.merchant || e.desc || e.category) + (e.billable ? ' <span class="mini-tag">' + (e.invoiceId ? "recharged" : "recharge") + '</span>' : "") + '</span><span class="mono">' + money(e.amount) + '</span></div>';
      }).join("") : '<div class="lr-sub">No expenses linked yet.</div>') + '</div>' +
    '<div class="btn-row side-btns">' + btn("Duplicate job", "job-duplicate", { id: j.id, cls: "btn-sm" }) + btn("Delete job", "job-delete", { id: j.id, cls: "btn-sm btn-danger" }) + '</div>';

  return '<div class="page-head"><a class="back-link" href="#/jobs">← Jobs</a>' +
      '<h1 class="page-title">' + escapeHtml(j.title || "Untitled job") + ' <span class="page-ref">' + escapeHtml(j.ref || "") + '</span></h1>' + statusTag(j.status) + '</div>' +
    '<div class="job-layout"><div class="job-main">' + main + '</div><div class="job-side">' + side + '</div></div>';
}
