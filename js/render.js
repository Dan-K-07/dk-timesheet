"use strict";

/* ============ Rendering ============ */
function render() {
  var app = document.getElementById("app");
  if (!state.authed) {
    app.innerHTML = renderGate();
    attachGateEvents();
    return;
  }
  var body = state.tab === "summary" ? renderSummary() : state.tab === "docs" ? renderDocuments() : state.tab === "calc" ? renderPayCalc() : renderLog();
  app.innerHTML = renderTopbar() + renderTabs() + body;
  attachEvents();
}

function renderGate() {
  return '' +
    '<div class="gate-wrap"><div class="card gate-card">' +
      '<div class="gate-mark">DK <span>Timesheet</span></div>' +
      '<div class="gate-sub">Enter your PIN to continue</div>' +
      '<input type="password" id="gatePin" class="field-input gate-input" placeholder="PIN" autocomplete="off" inputmode="text">' +
      (state.gateError ? '<div class="gate-error">' + escapeHtml(state.gateError) + '</div>' : '') +
      '<button class="btn btn-primary" id="gateSubmit" style="width:100%;margin-top:12px;"' + (state.pinAttempting ? " disabled" : "") + '>' + (state.pinAttempting ? "Checking\u2026" : "Unlock") + '</button>' +
    '</div></div>';
}

function renderTopbar() {
  var isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.hasAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return '' +
    '<div class="topbar">' +
      '<div class="brand"><span class="mark">DK <span>Timesheet</span></span></div>' +
      '<div class="header-actions">' +
        '<span class="app-version" title="App version">v' + APP_VERSION + '</span>' +
        '<span class="sync-btn" id="syncStatusPill" title="PIN ' + escapeHtml(maskPin(state.pin)) + '"><span class="sync-dot ' + state.syncStatus + '"></span><span class="sync-label">' + syncStatusLabel() + '</span></span>' +
        '<button class="btn btn-sm" id="logoutBtn">Log out</button>' +
        '<button class="theme-toggle" id="themeToggle">' + (isDark ? "Light mode" : "Dark mode") + '</button>' +
      '</div>' +
    '</div>';
}

function renderTabs() {
  return '' +
    '<div class="tabs">' +
      '<button class="tab' + (state.tab === "summary" ? " active" : "") + '" data-tab="summary">Summary</button>' +
      '<button class="tab' + (state.tab === "log" ? " active" : "") + '" data-tab="log">All Data</button>' +
      '<button class="tab' + (state.tab === "docs" ? " active" : "") + '" data-tab="docs">Documents</button>' +
      '<button class="tab' + (state.tab === "calc" ? " active" : "") + '" data-tab="calc">Take-Home Pay</button>' +
    '</div>';
}

function docIcon(mime, filename) {
  var m = (mime || "").toLowerCase();
  var f = (filename || "").toLowerCase();
  if (m.indexOf("pdf") !== -1 || /\.pdf$/.test(f)) return "\uD83D\uDCC4";
  if (m.indexOf("image") !== -1 || /\.(png|jpe?g|gif|webp|heic)$/.test(f)) return "\uD83D\uDDBC\uFE0F";
  return "\uD83D\uDCCE";
}
function uniqueDocDates() {
  var set = {};
  state.documents.forEach(function (d) { if (d.entry_date) set[d.entry_date] = true; });
  return Object.keys(set).sort().reverse().map(function (dt) {
    return '<option value="' + dt + '"' + (state.docFilterDate === dt ? " selected" : "") + '>' + fmtDate(dt) + "</option>";
  }).join("");
}
function renderDocRow(doc) {
  var icon = docIcon(doc.mime_type, doc.filename);
  var dateLabel = doc.entry_date ? fmtDate(doc.entry_date) : "General";
  var uploadedDate = doc.uploaded_at ? doc.uploaded_at.slice(0, 10) : "";
  var url = docPublicUrl(doc.storage_path);
  return '<div class="doc-row">' +
    '<div class="doc-icon">' + icon + '</div>' +
    '<div class="doc-main">' +
      '<div class="doc-name">' + escapeHtml(doc.filename) + '</div>' +
      '<div class="doc-meta">' + dateLabel + ' &middot; ' + formatBytes(doc.size_bytes) + ' &middot; added ' + (uploadedDate ? fmtDate(uploadedDate) : "") + '</div>' +
    '</div>' +
    '<div class="doc-actions">' +
      '<a class="icon-btn" href="' + url + '" target="_blank" rel="noopener">View</a>' +
      '<button class="icon-btn danger" data-doc-delete="' + doc.id + '">Delete</button>' +
    '</div>' +
  '</div>';
}
function renderDocuments() {
  var docs = sortedDocuments().filter(function (d) {
    if (!state.docFilterDate) return true;
    if (state.docFilterDate === "__none__") return !d.entry_date;
    return d.entry_date === state.docFilterDate;
  });

  var filterBar = '<div class="log-toolbar">' +
    '<div class="btn-row"><b>' + state.documents.length + '</b>&nbsp;file' + (state.documents.length === 1 ? "" : "s") + '</div>' +
    '<div class="filters">' +
      '<select id="docDateFilter" class="field-input">' +
        '<option value="">All dates</option>' +
        '<option value="__none__"' + (state.docFilterDate === "__none__" ? " selected" : "") + '>General (no date)</option>' +
        uniqueDocDates() +
      '</select>' +
    '</div>' +
  '</div>';

  var uploadCard = '<div class="card doc-upload">' +
    '<div class="form-grid">' +
      '<div class="field full"><label>File</label><input type="file" id="docFile"></div>' +
      '<div class="field"><label>Link to a date (optional)</label><input type="date" id="docDate"></div>' +
      '<div class="field"><label>Label (optional)</label><input type="text" id="docLabel" placeholder="e.g. Fuel receipt"></div>' +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-primary" id="docUploadBtn"' + (state.docUploading ? " disabled" : "") + '>' + (state.docUploading ? "Uploading\u2026" : "Upload") + '</button></div>' +
  '</div>';

  if (!docs.length) {
    return filterBar + uploadCard + '<div class="card empty-state"><div class="big">No documents' + (state.docFilterDate ? " match this filter" : "") + '</div>Upload receipts, call sheets, risk assessments or photos above.</div>';
  }

  var rows = docs.map(renderDocRow).join("");
  return filterBar + uploadCard + '<div class="card doc-list-wrap">' + rows + '</div>' +
    '<p class="footnote">Files are stored in your Supabase project. Anyone with a file\u2019s link can open it \u2014 avoid uploading anything you wouldn\u2019t want casually shareable.</p>';
}

function readCalcState() {
  return {
    gross: state.calcGross || 0,
    region: state.calcRegion || "ew",
    pensionPct: state.calcPensionPct || 0,
    pensionMethod: state.calcPensionMethod || "none",
    loanPlan: state.calcLoanPlan || ""
  };
}
function renderCalcResults(vals) {
  if (!vals.gross || vals.gross <= 0) {
    return '<div class="card empty-state" style="padding:30px 20px;"><div class="big">Enter a gross annual pay above</div>The breakdown will appear here.</div>';
  }
  var r = computeTakeHome(vals);
  function row(label, annual) {
    return '<tr><td>' + label + '</td><td class="num">' + fmtPay(annual) + '</td><td class="num">' + fmtPay(annual / 12) + '</td><td class="num">' + fmtPay(annual / 52) + '</td></tr>';
  }
  var effectiveRate = r.gross > 0 ? ((r.incomeTax + r.ni) / r.gross * 100) : 0;
  return '' +
    '<div class="stat-grid">' +
      '<div class="card stat-card"><div class="stat-label">Take-home (annual)</div><div class="stat-value">' + fmtPay(r.net) + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Take-home (monthly)</div><div class="stat-value" style="font-size:19px">' + fmtPay(r.net / 12) + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Tax + NI rate</div><div class="stat-value" style="font-size:19px">' + effectiveRate.toFixed(1) + '%</div></div>' +
    '</div>' +
    '<div class="card month-table"><table><thead><tr><th></th><th class="num">Annual</th><th class="num">Monthly</th><th class="num">Weekly</th></tr></thead><tbody>' +
      row("Gross pay", r.gross) +
      row("Income Tax", r.incomeTax) +
      row("National Insurance", r.ni) +
      (vals.loanPlan ? row("Student loan", r.loan) : "") +
      (vals.pensionMethod !== "none" ? row("Pension", r.pension) : "") +
    '</tbody><tfoot><tr style="font-weight:600;border-top:2px solid var(--line);"><td>Take-home pay</td><td class="num">' + fmtPay(r.net) + '</td><td class="num">' + fmtPay(r.net / 12) + '</td><td class="num">' + fmtPay(r.net / 52) + '</td></tr></tfoot></table></div>';
}
function renderRegionLoanPensionFields(vals) {
  return '' +
    '<div class="field"><label>Region</label><select id="calcRegion" class="field-input">' +
      '<option value="ew"' + (vals.region !== "scotland" ? " selected" : "") + '>England / Wales / NI</option>' +
      '<option value="scotland"' + (vals.region === "scotland" ? " selected" : "") + '>Scotland</option>' +
    '</select></div>' +
    '<div class="field"><label>Student loan</label><select id="calcLoanPlan" class="field-input">' +
      '<option value="">None</option>' +
      '<option value="plan1"' + (vals.loanPlan === "plan1" ? " selected" : "") + '>Plan 1</option>' +
      '<option value="plan2"' + (vals.loanPlan === "plan2" ? " selected" : "") + '>Plan 2</option>' +
      '<option value="plan4"' + (vals.loanPlan === "plan4" ? " selected" : "") + '>Plan 4 (Scotland)</option>' +
      '<option value="plan5"' + (vals.loanPlan === "plan5" ? " selected" : "") + '>Plan 5</option>' +
      '<option value="postgrad"' + (vals.loanPlan === "postgrad" ? " selected" : "") + '>Postgraduate</option>' +
    '</select></div>' +
    '<div class="field"><label>Pension contribution</label><select id="calcPensionMethod" class="field-input">' +
      '<option value="none"' + (vals.pensionMethod === "none" ? " selected" : "") + '>None</option>' +
      '<option value="sacrifice"' + (vals.pensionMethod === "sacrifice" ? " selected" : "") + '>Salary sacrifice (reduces tax &amp; NI)</option>' +
      '<option value="netpay"' + (vals.pensionMethod === "netpay" ? " selected" : "") + '>Net pay / relief at source (reduces tax only, approx.)</option>' +
    '</select></div>' +
    '<div class="field"><label>Pension %</label><input type="number" step="0.5" min="0" max="100" id="calcPensionPct" class="field-input" value="' + (vals.pensionPct || 0) + '"' + (vals.pensionMethod === "none" ? " disabled" : "") + '></div>';
}

function renderPayCalcAnnual() {
  var vals = readCalcState();
  var summaryTotal = summaryStats().totalPay;
  var inputs = '<div class="card calc-card">' +
    '<div class="form-grid">' +
      '<div class="field full"><label>Gross annual pay (\u00A3)</label><input type="number" step="0.01" min="0" id="calcGross" class="field-input" value="' + (vals.gross || "") + '" placeholder="e.g. 28000"></div>' +
      renderRegionLoanPensionFields(vals) +
    '</div>' +
    (summaryTotal > 0 ? '<div class="btn-row"><button class="btn btn-sm" id="calcUseSummary">Use Summary total pay (' + fmtPay(summaryTotal) + ')</button></div>' : "") +
  '</div>';

  return inputs + '<div id="calcResults">' + renderCalcResults(vals) + '</div>' +
    '<p class="footnote">Estimated using 2026/27 UK income tax, National Insurance and student loan rates. This annualises your pay, so if your hours vary month to month the actual PAYE deduction on any one payslip can differ from this. This isn\u2019t tax advice \u2014 check gov.uk or a tax professional for anything that matters financially.</p>';
}

function renderMonthlyTables(vals) {
  var rows = monthlyPayeBreakdown(vals);
  if (!rows.length) {
    return '<div class="card empty-state"><div class="big">No logged pay yet</div>Add entries in All Data first, then come back here.</div>';
  }
  var byYear = {};
  rows.forEach(function (r) { if (!byYear[r.taxYear]) byYear[r.taxYear] = []; byYear[r.taxYear].push(r); });

  var showLoan = !!vals.loanPlan;
  var showPension = vals.pensionMethod !== "none";

  var tablesHtml = Object.keys(byYear).sort().map(function (ty) {
    var yearRows = byYear[ty];
    var totalGross = 0, totalNet = 0;
    var body = yearRows.map(function (r) {
      totalGross += r.gross; totalNet += r.net;
      return '<tr><td class="m-label">' + monthLabel(r.key) + '</td>' +
        '<td class="num">' + fmtPay(r.gross) + '</td>' +
        '<td class="num">' + fmtPay(r.incomeTax) + '</td>' +
        '<td class="num">' + fmtPay(r.ni) + '</td>' +
        (showLoan ? '<td class="num">' + fmtPay(r.loan) + '</td>' : "") +
        (showPension ? '<td class="num">' + fmtPay(r.pension) + '</td>' : "") +
        '<td class="num">' + fmtPay(r.net) + '</td></tr>';
    }).join("");
    var colCount = 3 + (showLoan ? 1 : 0) + (showPension ? 1 : 0);
    return '<div class="section-title">Tax year ' + ty + '</div>' +
      '<div class="card month-table"><table><thead><tr><th>Month</th><th class="num">Gross</th><th class="num">Income Tax</th><th class="num">NI</th>' +
      (showLoan ? '<th class="num">Loan</th>' : "") + (showPension ? '<th class="num">Pension</th>' : "") +
      '<th class="num">Take-home</th></tr></thead><tbody>' + body + '</tbody>' +
      '<tfoot><tr style="font-weight:600;border-top:2px solid var(--line);"><td>Total</td><td class="num">' + fmtPay(totalGross) + '</td><td colspan="' + colCount + '"></td><td class="num">' + fmtPay(totalNet) + '</td></tr></tfoot>' +
      '</table></div>';
  }).join("");

  return tablesHtml +
    '<p class="footnote">This mimics real PAYE: Income Tax builds up against your year-to-date pay and allowance across the tax year (April\u2013March), while National Insurance and student loan are worked out fresh each month on that month\u2019s own pay \u2014 same as your actual payslips. A negative tax figure in a month is a genuine in-year refund: it happens when a quiet month follows a busy one, because your built-up tax-free allowance has outpaced what you\u2019ve earned so far that year. Still an estimate \u2014 not a substitute for your payslips or a tax professional.</p>';
}

function renderPayCalcMonthly() {
  var vals = readCalcState();
  var controls = '<div class="card calc-card"><div class="form-grid">' + renderRegionLoanPensionFields(vals) + '</div></div>';
  return controls + '<div id="monthlyResults">' + renderMonthlyTables(vals) + '</div>';
}

function renderPayCalc() {
  var mode = state.calcMode || "annual";
  var modeToggle = '<div class="log-toolbar">' +
    '<div class="btn-row">' +
      '<button class="btn btn-sm' + (mode === "annual" ? " btn-primary" : "") + '" data-calc-mode="annual">Annual estimate</button>' +
      '<button class="btn btn-sm' + (mode === "monthly" ? " btn-primary" : "") + '" data-calc-mode="monthly">Month by month (from your log)</button>' +
    '</div>' +
  '</div>';
  return modeToggle + (mode === "monthly" ? renderPayCalcMonthly() : renderPayCalcAnnual());
}

function renderSummary() {
  if (!state.entries.length) return renderEmpty();
  var s = summaryStats();
  var rangeBar = renderRangeBar();

  if (!s.entryCount) {
    return rangeBar + '<div class="card empty-state" style="padding:40px 20px;">' +
      '<div class="big">No entries in this range</div>' +
      'Try a wider date range, or clear it to see everything.' +
    '</div>';
  }

  var barColors = { "Warehouse": "var(--warehouse)", "On Site": "var(--onsite)", "Holiday": "var(--holiday)", "Sick": "var(--sick)" };

  var bars = ["Warehouse", "On Site", "Holiday", "Sick"].map(function (t) {
    var pct = Math.round(s.breakdown[t] * 1000) / 10;
    return '<div class="bar-row">' +
      '<span class="bar-tag ' + TYPE_CLASS[t] + '">' + t + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.min(pct,100) + '%;background:' + barColors[t] + '"></div></div>' +
      '<span class="bar-pct">' + pct.toFixed(1) + '%</span>' +
    '</div>';
  }).join("");

  var monthRows = s.monthKeys.filter(function (k) {
    var m = s.byMonth[k];
    return m.hours !== 0 || m.pay !== 0;
  }).map(function (k) {
    var m = s.byMonth[k];
    return '<tr class="' + (k === s.busiestKey ? "busiest" : "") + '">' +
      '<td class="m-label">' + monthLabel(k) + '</td>' +
      '<td class="num">' + fmtHoursFixed(m.hours) + '</td>' +
      '<td class="num">' + fmtPay(m.pay) + '</td>' +
    '</tr>';
  }).join("");

  return rangeBar +
    '<div class="stat-grid">' +
      '<div class="card stat-card"><div class="stat-label">Total hours logged</div><div class="stat-value">' + fmtHoursFixed(s.totalHours) + ' <small>hrs</small></div></div>' +
      '<div class="card stat-card"><div class="stat-label">Total pay</div><div class="stat-value">' + fmtPay(s.totalPay) + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Busiest month</div><div class="stat-value" style="font-size:19px">' + (s.busiestKey ? monthLabel(s.busiestKey) : "\u2014") + '</div><div class="stat-sub">' + (s.busiestKey ? fmtPay(s.busiestPay) + " earned" : "") + '</div></div>' +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="card stat-card"><div class="stat-label">Average hours / month</div><div class="stat-value" style="font-size:19px">' + fmtHoursFixed(s.avgHours) + ' hrs</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Average pay / month</div><div class="stat-value" style="font-size:19px">' + fmtPay(s.avgPay) + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Days logged</div><div class="stat-value" style="font-size:19px">' + s.entryCount + '</div></div>' +
    '</div>' +
    '<div class="section-title">Day type breakdown</div>' +
    '<div class="card breakdown">' + bars + '</div>' +
    '<div class="section-title">Month by month</div>' +
    '<div class="card month-table"><table><thead><tr><th>Month</th><th class="num">Hours worked</th><th class="num">Pay</th></tr></thead><tbody>' + monthRows + '</tbody></table></div>' +
    '<p class="footnote">Months are calendar months (1st\u2013last day), grouped from whatever dates are in All Data \u2014 add or import entries and this updates on its own.</p>';
}

function renderRangeBar() {
  var hasRange = !!(state.summaryFrom || state.summaryTo);
  var today = new Date();
  var presetValues = {
    all: { from: "", to: "" },
    year: { from: today.getFullYear() + "-01-01", to: "" },
    "3m": { from: isoDateFromParts(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())), to: "" },
    month: { from: today.getFullYear() + "-" + pad2(today.getMonth() + 1) + "-01", to: "" }
  };
  function isActive(name) {
    return presetValues[name].from === state.summaryFrom && presetValues[name].to === state.summaryTo;
  }
  function presetBtn(name, label) {
    return '<button class="btn btn-sm' + (isActive(name) ? ' btn-primary' : '') + '" data-preset="' + name + '">' + label + '</button>';
  }
  return '' +
    '<div class="log-toolbar" style="margin-bottom:18px;">' +
      '<div class="btn-row">' +
        presetBtn("all", "All time") +
        presetBtn("year", "This year") +
        presetBtn("3m", "Last 3 months") +
        presetBtn("month", "This month") +
      '</div>' +
      '<div class="filters">' +
        '<input type="date" id="sumFrom" class="field-input" value="' + escapeHtml(state.summaryFrom) + '">' +
        '<span style="color:var(--ink-dim);font-size:13px;align-self:center;">to</span>' +
        '<input type="date" id="sumTo" class="field-input" value="' + escapeHtml(state.summaryTo) + '">' +
        (hasRange ? '<button class="btn btn-sm" id="sumClear">Clear</button>' : '') +
      '</div>' +
    '</div>';
}

function renderEmpty() {
  return '<div class="card empty-state">' +
    '<div class="big">No entries logged yet</div>' +
    'Import your existing timesheet, or start logging days on the All Data tab.' +
    '<div class="btn-row">' +
      '<button class="btn btn-primary" id="emptyImport">Import spreadsheet</button>' +
      '<button class="btn" id="emptyAdd">Add first entry</button>' +
    '</div>' +
  '</div>';
}

function renderLog() {
  var entries = filteredEntries();
  var months = monthOptions();
  var monthSelect = '<option value="">All months</option>' + months.map(function (k) {
    return '<option value="' + k + '"' + (state.filterMonth === k ? " selected" : "") + '>' + monthLabel(k) + '</option>';
  }).join("");
  var typeSelect = '<option value="">All types</option>' + TYPES.map(function (t) {
    return '<option value="' + t + '"' + (state.filterType === t ? " selected" : "") + '>' + t + '</option>';
  }).join("");

  var toolbar = '' +
    '<div class="log-toolbar">' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary" id="addBtn">+ Add entry</button>' +
        '<button class="btn" id="importBtn">Import</button>' +
        '<button class="btn" id="exportCsvBtn">Export CSV</button>' +
        '<button class="btn" id="exportXlsxBtn">Export Excel</button>' +
      '</div>' +
      '<div class="filters">' +
        '<select id="filterMonth">' + monthSelect + '</select>' +
        '<select id="filterType">' + typeSelect + '</select>' +
        '<button class="btn btn-sm" id="sortBtn">Date ' + (state.sortDir === "asc" ? "\u2191" : "\u2193") + '</button>' +
      '</div>' +
    '</div>';

  var formHtml = state.adding ? renderEntryForm(null) : "";

  if (!state.entries.length && !state.adding) {
    return toolbar + renderEmpty();
  }

  var selCount = entries.filter(function (e) { return isSelected(e.id); }).length;
  var allSelected = entries.length > 0 && selCount === entries.length;
  var bulkBar = selCount > 0 ? renderBulkBar(selCount) : "";

  var rows = entries.map(function (e) {
    if (state.editingId === e.id) return renderEntryFormRow(e);
    return renderRow(e);
  }).join("");

  return toolbar + bulkBar + formHtml +
    '<div class="card log-table-wrap"><table class="log-table"><thead><tr>' +
      '<th style="width:32px;"><input type="checkbox" id="selectAllChk"' + (allSelected ? " checked" : "") + '></th>' +
      '<th>Date</th><th>Start</th><th>End</th><th class="num">Break</th>' +
      '<th class="num">Hrs</th><th class="num">Hrs worked</th><th class="num">Rate</th><th class="num">Pay</th>' +
      '<th>Type</th><th>Notes</th><th></th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="12" style="text-align:center;color:var(--ink-dim);padding:26px;">No entries match these filters.</td></tr>') + '</tbody></table></div>' +
    '<p class="footnote">' + entries.length + ' of ' + state.entries.length + ' entries shown. Data is saved in this browser only \u2014 export a copy from time to time.</p>';
}

function renderBulkBar(selCount) {
  var typeOpts = typeOptionsHtml("");
  var summaryRow = '<div class="btn-row" style="justify-content:space-between;">' +
    '<div class="btn-row"><b>' + selCount + '</b>&nbsp;selected</div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-sm" id="bulkEditToggle">' + (state.bulkEditOpen ? "Hide edit fields" : "Edit selected") + '</button>' +
      '<button class="btn btn-sm btn-danger" id="bulkDelete">Delete selected</button>' +
      '<button class="btn btn-sm btn-ghost" id="bulkClear">Clear selection</button>' +
    '</div>' +
  '</div>';

  if (!state.bulkEditOpen) {
    return '<div class="card bulk-bar">' + summaryRow + '</div>';
  }

  function fieldRow(id, label, inputHtml) {
    return '<div class="bulk-field-row">' +
      '<label class="bulk-field-check"><input type="checkbox" class="bulk-field-on" id="' + id + '_on"> ' + label + '</label>' +
      inputHtml +
    '</div>';
  }

  var fields = '' +
    fieldRow("bulkType", "Type", '<select id="bulkType" class="field-input" disabled>' + typeOpts + '<option value="__clear__">(clear type)</option></select>') +
    fieldRow("bulkRate", "Rate (\u00a3/hr)", '<input type="number" step="0.01" min="0" id="bulkRate" class="field-input" disabled>') +
    fieldRow("bulkStart", "Start", '<input type="time" id="bulkStart" class="field-input" disabled>') +
    fieldRow("bulkEnd", "End", '<input type="time" id="bulkEnd" class="field-input" disabled>') +
    fieldRow("bulkBreak", "Break (hrs)", '<input type="number" step="0.25" min="0" id="bulkBreak" class="field-input" disabled>') +
    fieldRow("bulkNotes", "Notes", '<input type="text" id="bulkNotes" class="field-input" disabled>');

  return '<div class="card bulk-bar">' + summaryRow +
    '<div class="bulk-fields">' + fields + '</div>' +
    '<div class="btn-row" style="margin-top:10px;">' +
      '<button class="btn btn-primary btn-sm" id="bulkApplyFields">Apply to ' + selCount + ' entr' + (selCount === 1 ? "y" : "ies") + '</button>' +
    '</div>' +
  '</div>';
}

function renderRow(e) {
  var hours = computeHours(e), hw = computeHoursWorked(e), pay = computePay(e);
  var typeTag = e.type ? '<span class="tag ' + (TYPE_CLASS[e.type] || "tag-none") + '">' + escapeHtml(e.type) + '</span>' : '<span class="tag tag-none">\u2014</span>';
  var docCount = docsForDate(e.date).length;
  var docBadge = docCount > 0 ? ' <button class="doc-badge" data-goto-docs="' + e.date + '">\uD83D\uDCCE ' + docCount + '</button>' : '';
  return '<tr data-id="' + e.id + '">' +
    '<td><input type="checkbox" class="row-check" data-id="' + e.id + '"' + (isSelected(e.id) ? " checked" : "") + '></td>' +
    '<td class="mono date-cell">' + fmtDate(e.date) + docBadge + '</td>' +
    '<td class="mono">' + (e.start || "\u2014") + '</td>' +
    '<td class="mono">' + (e.end || "\u2014") + '</td>' +
    '<td class="num">' + (e.breakHrs === "" || e.breakHrs === undefined || e.breakHrs === null ? "\u2014" : e.breakHrs) + '</td>' +
    '<td class="num">' + fmtHours(hours) + '</td>' +
    '<td class="num">' + fmtHours(hw) + '</td>' +
    '<td class="num">' + (e.rate === "" || e.rate === undefined || e.rate === null || e.rate === "" ? "\u2014" : "\u00A3" + parseFloat(e.rate).toFixed(2)) + '</td>' +
    '<td class="num">' + fmtPay(pay) + '</td>' +
    '<td>' + typeTag + '</td>' +
    '<td class="notes-cell" title="' + escapeHtml(e.notes || "") + '">' + escapeHtml(e.notes || "") + '</td>' +
    '<td><div class="row-actions">' +
      '<button class="icon-btn" data-edit="' + e.id + '" title="Edit">Edit</button>' +
      '<button class="icon-btn danger" data-delete="' + e.id + '" title="Delete">Delete</button>' +
    '</div></td>' +
  '</tr>';
}

function typeOptionsHtml(selected) {
  return '<option value=""' + (!selected ? " selected" : "") + '>\u2014</option>' + TYPES.map(function (t) {
    return '<option value="' + t + '"' + (selected === t ? " selected" : "") + '>' + t + '</option>';
  }).join("");
}

function renderEntryForm(existing) {
  var e = existing || { date: "", start: "", end: "", breakHrs: "0.5", rate: state.lastRate || "", type: "Off", notes: "" };
  return '<div class="card entry-form" id="entryForm">' +
    '<div class="form-grid">' +
      '<div class="field"><label>Date</label><input type="date" id="f_date" value="' + escapeHtml(e.date) + '"></div>' +
      '<div class="field"><label>Start</label><input type="time" id="f_start" value="' + escapeHtml(e.start) + '"></div>' +
      '<div class="field"><label>End</label><input type="time" id="f_end" value="' + escapeHtml(e.end) + '"></div>' +
      '<div class="field"><label>Break (hrs)</label><input type="number" step="0.25" min="0" id="f_break" value="' + escapeHtml(e.breakHrs) + '"></div>' +
      '<div class="field"><label>Rate (\u00A3/hr)</label><input type="number" step="0.01" min="0" id="f_rate" value="' + escapeHtml(e.rate) + '"></div>' +
      '<div class="field"><label>Type</label><select id="f_type">' + typeOptionsHtml(e.type) + '</select></div>' +
      '<div class="field full"><label>Notes</label><input type="text" id="f_notes" value="' + escapeHtml(e.notes) + '" placeholder="Optional"></div>' +
    '</div>' +
    '<div class="form-preview" id="formPreview">' + formPreviewText(e) + '</div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-primary" id="saveEntry" data-existing-id="' + (existing ? existing.id : "") + '">' + (existing ? "Save changes" : "Add entry") + '</button>' +
      '<button class="btn btn-ghost" id="cancelEntry">Cancel</button>' +
    '</div>' +
  '</div>';
}

function renderEntryFormRow(e) {
  return '<tr><td colspan="12" style="padding:0;border-bottom:none;">' + renderEntryForm(e) + '</td></tr>';
}

function formPreviewText(e) {
  var hours = computeHours(e), hw = computeHoursWorked(e), pay = computePay(e);
  return 'Hours: <b>' + fmtHours(hours) + '</b> &nbsp; Worked: <b>' + fmtHours(hw) + '</b> &nbsp; Pay: <b>' + fmtPay(pay) + '</b>';
}

function readFormValues() {
  return {
    date: document.getElementById("f_date").value,
    start: document.getElementById("f_start").value,
    end: document.getElementById("f_end").value,
    breakHrs: document.getElementById("f_break").value,
    rate: document.getElementById("f_rate").value,
    type: document.getElementById("f_type").value,
    notes: document.getElementById("f_notes").value.trim()
  };
}
