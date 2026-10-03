"use strict";

/* =====================================================================
   DK Jobs - Expenses, Mileage, Reports, Settings.
   ===================================================================== */

/* ---------- Expenses ---------- */
function renderExpenseForm(e) {
  e = e || { date: todayIso(), category: "Other", jobId: state.expFromJob || "", billable: false };
  var cats = state.data.settings.expenseCategories.map(function (c) { return c.name; });
  if (e.category && cats.indexOf(e.category) === -1) cats.push(e.category);
  var opt = function (list, val) { return list.map(function (o) { var v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o; return '<option value="' + attr(v) + '"' + (String(v) === String(val || "") ? " selected" : "") + '>' + escapeHtml(l) + '</option>'; }).join(""); };
  return '<form class="card entry-form" id="expenseForm" data-id="' + attr(e.id || "") + '">' +
    '<div class="settings-title">' + (e.id ? "Edit expense" : "New expense") + '</div>' +
    '<div class="form-grid">' +
      field("Date", '<input type="date" class="field-input" id="expDate" value="' + attr(e.date) + '" required>') +
      field("Supplier / shop", '<input class="field-input" id="expMerchant" value="' + attr(e.merchant) + '" placeholder="e.g. Screwfix" list="merchantList">') +
      field("Category", '<select class="field-input" id="expCategory">' + opt(cats, e.category) + '</select>') +
      field("Amount paid (£)", '<input class="field-input" id="expAmount" inputmode="decimal" value="' + attr(e.amount) + '" placeholder="0.00" required>') +
      field("What was it for", '<input class="field-input" id="expDesc" value="' + attr(e.desc) + '" placeholder="e.g. Gaffer tape and cable ties">', "span-2") +
      (vatOn() ? field("VAT included (£)", '<input class="field-input" id="expVat" inputmode="decimal" value="' + attr(e.vat) + '" placeholder="0.00">') : "") +
      field("Job", '<select class="field-input" id="expJob">' + opt(jobOptions(), e.jobId) + '</select>', vatOn() ? "" : "span-2") +
      field("Receipt" + (e.receiptPath ? " (one attached — choose a file to replace it)" : ""), '<input type="file" class="field-input" id="expReceipt" accept="image/*,application/pdf" capture="environment">', "span-2") +
      '<div class="field span-2 check-field"><label class="check-label"><input type="checkbox" id="expBillable"' + (e.billable ? " checked" : "") + '> Recharge to the client on the job’s invoice</label></div>' +
    '</div>' +
    '<datalist id="merchantList">' + uniqueValues(state.data.expenses, "merchant").map(function (m) { return '<option value="' + attr(m) + '">'; }).join("") + '</datalist>' +
    '<div class="btn-row"><button type="submit" class="btn btn-primary"' + (state.receiptBusy ? " disabled" : "") + '>' + (state.receiptBusy ? "Uploading receipt…" : "Save expense") + '</button>' + btn("Cancel", "exp-cancel") +
      (e.id && e.invoiceId ? '<span class="lr-sub">Already on an invoice, so the amount is fixed there.</span>' : "") + '</div>' +
  '</form>';
}
function uniqueValues(list, key) {
  var seen = {}, out = [];
  list.forEach(function (x) { var v = (x[key] || "").trim(); if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = true; out.push(v); } });
  return out.sort();
}
function renderExpenses() {
  var y = state.expYear || currentTaxYear();
  var list = state.data.expenses.filter(function (e) { return inTaxYear(e.date, y); })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var total = round2(list.reduce(function (s, e) { return s + num(e.amount); }, 0));
  var recharge = round2(list.filter(function (e) { return e.billable && !e.invoiceId; }).reduce(function (s, e) { return s + expenseCost(e); }, 0));
  var noReceipt = list.filter(function (e) { return !e.receiptPath; }).length;
  var byCat = {};
  list.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + num(e.amount); });

  var form = state.expAdding ? renderExpenseForm() : state.expEditingId ? renderExpenseForm(byId(state.data.expenses, state.expEditingId)) : "";
  var rows = list.map(function (e) {
    var job = jobById(e.jobId);
    return '<tr>' +
      '<td class="date-cell">' + fmtDate(e.date) + '</td>' +
      '<td><div class="lr-title">' + escapeHtml(e.merchant || "—") + '</div><div class="lr-sub">' + escapeHtml(e.desc || "") + '</div></td>' +
      '<td>' + escapeHtml(e.category) + '</td>' +
      '<td>' + (job ? '<a href="#/jobs/' + encodeURIComponent(job.id) + '">' + escapeHtml(job.ref || job.title) + '</a>' : '<span class="lr-sub">—</span>') +
        (e.billable ? ' <span class="mini-tag">' + (e.invoiceId ? "recharged" : "recharge") + '</span>' : "") + '</td>' +
      '<td class="num">' + money(e.amount) + (vatOn() && num(e.vat) ? '<div class="lr-sub">VAT ' + money(e.vat) + '</div>' : "") + '</td>' +
      '<td class="center">' + (e.receiptPath ? '<button class="btn btn-ghost btn-sm" data-action="exp-receipt" data-id="' + attr(e.id) + '" title="View receipt">🧾</button>' : '<span class="lr-sub" title="No receipt">—</span>') + '</td>' +
      '<td class="actions-cell"><div class="btn-row nowrap">' +
        '<button class="btn btn-ghost btn-sm" data-action="exp-edit" data-id="' + attr(e.id) + '">Edit</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="exp-dup" data-id="' + attr(e.id) + '" title="Copy to today, e.g. a monthly subscription">Repeat</button>' +
        '<button class="btn btn-ghost btn-sm btn-danger" data-action="exp-del" data-id="' + attr(e.id) + '">✕</button></div></td></tr>';
  }).join("");

  return '<div class="log-toolbar">' + yearSelect("expYearSel", y) +
      '<div class="btn-row">' + btn("Export CSV", "export-expenses") + btn("＋ Add expense", "new-expense", { cls: "btn-primary" }) + '</div></div>' +
    form +
    '<div class="stat-grid">' +
      stat("Spent " + taxYearLabel(y), money(total), list.length + " expense" + (list.length === 1 ? "" : "s")) +
      stat("To recharge to clients", money(recharge), "Marked recharge, not yet invoiced") +
      stat("Missing receipts", String(noReceipt), noReceipt ? "Keep receipts for HMRC" : "All have receipts", noReceipt ? "warn" : "") +
    '</div>' +
    (Object.keys(byCat).length ? '<div class="card breakdown cat-breakdown">' + Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).map(function (k) {
      return '<div class="bar-row"><span class="bar-tag exp-cat">' + escapeHtml(k) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (byCat[k] / total * 100).toFixed(1) + '%;background:var(--accent)"></div></div><span class="exp-cat-amount">' + money(byCat[k]) + '</span></div>';
    }).join("") + '</div>' : "") +
    (list.length ? '<div class="card log-table-wrap"><table class="log-table"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Job</th><th class="num">Amount</th><th class="center">Receipt</th><th class="actions-col"></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : (form ? "" : emptyBlock("No expenses in " + taxYearLabel(y), "Add business costs as you go. Photograph the receipt on your phone when you add it.", btn("Add expense", "new-expense", { cls: "btn-primary" }))));
}

/* ---------- Mileage ---------- */
function renderMileageForm(m) {
  var s = state.data.settings;
  m = m || { date: todayIso(), jobId: state.mileFromJob || "", from: s.homeAddress, trip: "return" };
  if (!m.id && m.jobId && !m.to) { var j = jobById(m.jobId); if (j) { m.to = j.venue || ""; m.date = jobStartDate(j) || m.date; } }
  var places = uniqueValues(state.data.mileage, "from").concat(uniqueValues(state.data.mileage, "to"));
  if (s.homeAddress) places.unshift(s.homeAddress);
  var seen = {}; places = places.filter(function (p) { var k = p.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; });
  var jobOpts = jobOptions().map(function (o) { return '<option value="' + attr(o.value) + '"' + (o.value === (m.jobId || "") ? " selected" : "") + '>' + escapeHtml(o.label) + '</option>'; }).join("");
  return '<form class="card entry-form" id="mileageForm" data-id="' + attr(m.id || "") + '">' +
    '<div class="settings-title">' + (m.id ? "Edit journey" : "New journey") + '</div>' +
    '<div class="form-grid">' +
      field("Date", '<input type="date" class="field-input" id="mDate" value="' + attr(m.date) + '" required>') +
      field("Job", '<select class="field-input" id="mJob">' + jobOpts + '</select>', "span-3") +
      field("From", '<input class="field-input" id="mFrom" value="' + attr(m.from) + '" list="placeList" placeholder="Postcode or place">', "span-2") +
      field("To", '<input class="field-input" id="mTo" value="' + attr(m.to) + '" list="placeList" placeholder="Postcode or venue">', "span-2") +
      field("Miles (one way)", '<input class="field-input" id="mMiles" inputmode="decimal" value="' + attr(m.miles) + '" placeholder="0.0" required>') +
      field("Journey", '<select class="field-input" id="mTrip"><option value="return"' + (m.trip === "return" ? " selected" : "") + '>Return (counts twice)</option><option value="single"' + (m.trip === "single" ? " selected" : "") + '>One way</option></select>') +
      field("Note", '<input class="field-input" id="mDesc" value="' + attr(m.desc) + '" placeholder="e.g. Get out">', "span-2") +
      '<div class="field span-2 check-field"><label class="check-label"><input type="checkbox" id="mBillable"' + (m.billable ? " checked" : "") + '> Charge this mileage to the client at</label></div>' +
      field("£ per mile", '<input class="field-input" id="mBillRate" inputmode="decimal" value="' + attr(m.billRate || s.mileageBillRate || "0.45") + '">') +
    '</div>' +
    '<div class="form-preview" id="mPreview"></div>' +
    '<datalist id="placeList">' + places.map(function (p) { return '<option value="' + attr(p) + '">'; }).join("") + '</datalist>' +
    '<div class="btn-row"><button type="submit" class="btn btn-primary">Save journey</button>' + btn("Cancel", "mile-cancel") +
      '<a class="btn btn-ghost" id="mMapLink" target="_blank" rel="noopener" href="#">Check distance on Google Maps ↗</a></div>' +
  '</form>';
}
function renderMileage() {
  var y = state.mileYear || currentTaxYear();
  var info = mileageForYear(y);
  var s = state.data.settings, threshold = num(s.mileageThreshold) || 10000;
  var form = state.mileAdding ? renderMileageForm() : state.mileEditingId ? renderMileageForm(byId(state.data.mileage, state.mileEditingId)) : "";
  var rows = info.rows.slice().reverse().map(function (r) {
    var m = r.trip, job = jobById(m.jobId);
    return '<tr><td class="date-cell">' + fmtDate(m.date) + '</td>' +
      '<td>' + (job ? '<a href="#/jobs/' + encodeURIComponent(job.id) + '">' + escapeHtml(jobLabel(job)) + '</a>' : '<span class="lr-sub">No job</span>') + (m.desc ? '<div class="lr-sub">' + escapeHtml(m.desc) + '</div>' : "") + '</td>' +
      '<td><div>' + escapeHtml(m.from || "?") + ' → ' + escapeHtml(m.to || "?") + '</div><div class="lr-sub">' + (m.trip === "return" ? "Return" : "One way") + (m.billable ? ' · <span class="mini-tag">' + (m.invoiceId ? "recharged" : "recharge") + '</span>' : "") + '</div></td>' +
      '<td class="num">' + r.miles + '</td><td class="num">' + money(r.value) + '</td>' +
      '<td class="actions-cell"><div class="btn-row nowrap"><button class="btn btn-ghost btn-sm" data-action="mile-edit" data-id="' + attr(m.id) + '">Edit</button>' +
      '<button class="btn btn-ghost btn-sm btn-danger" data-action="mile-del" data-id="' + attr(m.id) + '">✕</button></div></td></tr>';
  }).join("");
  return '<div class="log-toolbar">' + yearSelect("mileYearSel", y) +
      '<div class="btn-row">' + btn("Export CSV", "export-mileage") + btn("＋ Log journey", "new-mileage", { cls: "btn-primary" }) + '</div></div>' +
    form +
    '<div class="stat-grid">' +
      stat("Business miles " + taxYearLabel(y), info.miles.toLocaleString("en-GB"), info.rows.length + " journey" + (info.rows.length === 1 ? "" : "s")) +
      stat("You can claim", money(info.value), "HMRC mileage allowance") +
      stat("Rate", Math.round(info.rateHigh * 100) + "p / mile", info.miles < threshold ? Math.round(threshold - info.miles).toLocaleString("en-GB") + " miles left at this rate, then " + Math.round(info.rateLow * 100) + "p" : "Now at " + Math.round(info.rateLow * 100) + "p (over " + threshold.toLocaleString("en-GB") + " miles)") +
    '</div>' +
    (rows ? '<div class="card log-table-wrap"><table class="log-table"><thead><tr><th>Date</th><th>Job</th><th>Route</th><th class="num">Miles</th><th class="num">Claim</th><th class="actions-col"></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : (form ? "" : emptyBlock("No journeys in " + taxYearLabel(y), "Log business trips to venues, warehouses and suppliers. Your normal commute to a permanent workplace doesn't count.", btn("Log journey", "new-mileage", { cls: "btn-primary" }))));
}

/* ---------- Reports ---------- */
function renderReports() {
  var y = state.reportYear || currentTaxYear();
  var q = state.reportQuarter || "all";
  var rep = buildReport(y, q);
  var s = state.data.settings;
  var quarters = taxQuarters(y), today = todayIso();
  var chips = '<div class="chips">' + [{ key: "all", label: "Full year" }].concat(quarters.map(function (x) { return { key: x.key, label: x.label }; })).map(function (x) {
    return '<button class="chip' + (x.key === q ? " active" : "") + '" data-action="report-q" data-id="' + x.key + '">' + x.label + '</button>';
  }).join("") + '</div>';
  var catRows = Object.keys(HMRC_CATEGORIES).filter(function (k) { return k !== "capital" && k !== "disallowable" && rep.categories[k]; }).map(function (k) {
    return '<tr><td class="m-label">' + escapeHtml(HMRC_CATEGORIES[k]) + (k === "travel" && rep.mileValue ? '<div class="lr-sub">incl. ' + money(rep.mileValue) + ' mileage allowance (' + rep.mileMiles + ' mi)</div>' : "") + '</td><td class="num">' + money(rep.categories[k]) + '</td></tr>';
  }).join("");
  var deadlines = quarters.map(function (x) {
    var passed = x.due < today, current = today >= x.from && today <= x.to;
    return '<div class="deadline' + (current ? " current" : "") + (passed ? " passed" : "") + '"><div class="lr-title">' + x.label + ' · ' + fmtDate(x.from) + ' – ' + fmtDate(x.to) + '</div><div class="lr-sub">' + (passed ? "Was due " : "Due ") + fmtDate(x.due) + (current ? " · current quarter" : "") + '</div></div>';
  }).join("");
  return '<div class="log-toolbar">' + yearSelect("reportYearSel", y) +
      '<div class="btn-row">' + btn("Summary CSV", "export-summary") + btn("Income CSV", "export-income") + btn("Expenses CSV", "export-expenses-report") + btn("Mileage CSV", "export-mileage-report") + '</div></div>' +
    chips +
    '<div class="lr-sub period-line">' + fmtDate(rep.range.from) + ' → ' + fmtDate(rep.range.to) + ' · income counted ' + (s.accountingBasis === "accruals" ? "on invoice date (accruals)" : "when paid (cash basis)") + '</div>' +
    '<div class="stat-grid">' +
      stat("Turnover" + (vatOn() ? " (excl. VAT)" : ""), money(rep.turnover), rep.invoices.length + " invoice" + (rep.invoices.length === 1 ? "" : "s")) +
      stat("Allowable expenses", money(rep.allowable), "Including mileage allowance") +
      stat("Net profit", money(rep.profit), "Turnover minus allowable expenses", rep.profit < 0 ? "warn" : "") +
    '</div>' +
    '<div class="two-col"><div>' +
      '<div class="section-title">Expenses by HMRC category</div>' +
      '<div class="card month-table"><table><thead><tr><th>Category (as on Self Assessment / MTD)</th><th class="num">Amount</th></tr></thead><tbody>' +
        (catRows || '<tr><td colspan="2" class="list-empty">No expenses in this period.</td></tr>') +
        '</tbody><tfoot><tr><td>Total allowable expenses</td><td class="num">' + money(rep.allowable) + '</td></tr></tfoot></table></div>' +
      (rep.categories.capital ? '<div class="note-card card"><b>' + money(rep.categories.capital) + ' of equipment</b> isn’t in the total above. Equipment is usually claimed through capital allowances (the Annual Investment Allowance) rather than as an expense — give this figure to your accountant or enter it in the capital allowances section.</div>' : "") +
      (rep.categories.disallowable ? '<div class="note-card card">' + money(rep.categories.disallowable) + ' marked “Not allowable” is left out.</div>' : "") +
      (vatOn() ? '<div class="section-title">VAT</div><div class="card month-table"><table><tbody>' +
        '<tr><td class="m-label">VAT charged on invoices</td><td class="num">' + money(rep.vatCharged) + '</td></tr>' +
        '<tr><td class="m-label">VAT paid on expenses</td><td class="num">' + money(rep.vatReclaim) + '</td></tr>' +
        '</tbody><tfoot><tr><td>Net VAT due</td><td class="num">' + money(rep.vatCharged - rep.vatReclaim) + '</td></tr></tfoot></table></div>' +
        '<div class="lr-sub note-line">VAT quarters can differ from the tax-year quarters above — check yours with HMRC.</div>' : "") +
    '</div><div>' +
      '<div class="section-title">MTD quarterly updates · ' + taxYearLabel(y) + '</div><div class="card list-card">' + deadlines + '</div>' +
      '<div class="note-card card"><b>Good to know</b><ul>' +
        '<li>If you claim the mileage allowance for your car, don’t also claim fuel, insurance or servicing for that car — it covers those. Parking, tolls and train fares are still claimable.</li>' +
        '<li>Making Tax Digital for Income Tax applies to sole traders with income over £50,000 from April 2026, £30,000 from April 2027 and £20,000 from April 2028. The submission itself goes through HMRC-recognised software; the CSVs here are your records for that.</li>' +
        '<li>These figures are from what you’ve entered. Check them with your accountant before you file.</li>' +
      '</ul></div>' +
    '</div></div>';
}

/* ---------- Settings ---------- */
function renderSettings() {
  var s = state.data.settings, id = "settings";
  var catRows = s.expenseCategories.map(function (c, i) {
    var used = state.data.expenses.filter(function (e) { return e.category === c.name; }).length;
    return '<div class="category-row"><input class="field-input" data-cat-index="' + i + '" data-cat-field="name" value="' + attr(c.name) + '">' +
      '<select class="field-input" data-cat-index="' + i + '" data-cat-field="hmrc">' + Object.keys(HMRC_CATEGORIES).map(function (k) {
        return '<option value="' + k + '"' + (c.hmrc === k ? " selected" : "") + '>' + escapeHtml(HMRC_CATEGORIES[k]) + '</option>';
      }).join("") + '</select>' +
      '<span class="lr-sub category-used">' + (used ? used + " used" : "") + '</span>' +
      (used ? "" : '<button class="link-btn" data-action="cat-del" data-id="' + i + '">Remove</button>') + '</div>';
  }).join("");
  var sec = function (title, help, inner) {
    return '<div class="card settings-card"><div class="settings-title">' + title + '</div>' + (help ? '<p class="settings-help">' + help + '</p>' : "") + inner + '</div>';
  };
  return '<div class="settings-grid">' +
    sec("Your business", "Shown at the top of your quotes and invoices.", '<div class="form-grid">' +
      field("Business / trading name", bound(id, id, "businessName", s.businessName, { placeholder: "e.g. DK Event Services" }), "span-2") +
      field("Your name", bound(id, id, "yourName", s.yourName)) +
      field("Phone", bound(id, id, "phone", s.phone, { type: "tel" })) +
      field("Email", bound(id, id, "email", s.email, { type: "email" }), "span-2") +
      field("Website", bound(id, id, "website", s.website), "span-2") +
      field("Business address", bound(id, id, "address", s.address, { type: "textarea", rows: 3 }), "full") +
      '<div class="field full"><label>Logo</label><div class="btn-row">' + (s.logo ? '<img class="logo-preview" src="' + attr(s.logo) + '" alt="Logo">' : "") +
        '<input type="file" accept="image/*" id="logoFile" class="field-input logo-input">' + (s.logo ? btn("Remove logo", "logo-remove", { cls: "btn-sm" }) : "") + '</div></div>' +
    '</div>') +
    sec("Bank details", "Printed on invoices so clients know where to pay.", '<div class="form-grid">' +
      field("Bank", bound(id, id, "bankName", s.bankName), "span-2") +
      field("Account name", bound(id, id, "accountName", s.accountName), "span-2") +
      field("Sort code", bound(id, id, "sortCode", s.sortCode, { placeholder: "00-00-00" })) +
      field("Account number", bound(id, id, "accountNumber", s.accountNumber)) +
      '<div class="field span-2 check-field"><label class="check-label">' + bound(id, id, "showBankOnQuotes", s.showBankOnQuotes, { type: "checkbox" }) + ' Show on quotes too</label></div>' +
    '</div>') +
    sec("Quotes & invoices", "Use {days} in the terms and it’s replaced with the job’s payment terms.", '<div class="form-grid">' +
      field("Invoice prefix", bound(id, id, "invoicePrefix", s.invoicePrefix)) +
      field("Next invoice number", bound(id, id, "nextInvoiceNo", s.nextInvoiceNo, { num: true, type: "number" })) +
      field("Quote prefix", bound(id, id, "quotePrefix", s.quotePrefix)) +
      field("Next quote number", bound(id, id, "nextQuoteNo", s.nextQuoteNo, { num: true, type: "number" })) +
      field("Default payment terms (days)", bound(id, id, "paymentTerms", s.paymentTerms, { num: true, type: "number" })) +
      field("Quotes valid for (days)", bound(id, id, "quoteValidDays", s.quoteValidDays || 30, { num: true, type: "number" })) +
      field("Terms printed at the bottom", bound(id, id, "termsText", s.termsText, { type: "textarea", rows: 3 }), "full") +
    '</div>') +
    sec("Tax", "", '<div class="form-grid">' +
      field("Count income", bound(id, id, "accountingBasis", s.accountingBasis || "cash", { type: "select", options: [{ value: "cash", label: "When paid (cash basis — most sole traders)" }, { value: "accruals", label: "On invoice date (accruals)" }] }), "span-2") +
      '<div class="field span-2 check-field"><label class="check-label">' + bound(id, id, "vatRegistered", s.vatRegistered, { type: "checkbox", rerender: true }) + ' I’m VAT registered</label></div>' +
      (s.vatRegistered ? field("VAT number", bound(id, id, "vatNumber", s.vatNumber)) + field("VAT rate %", bound(id, id, "vatRate", s.vatRate, { num: true, type: "number" })) : "") +
    '</div>') +
    sec("Mileage", "HMRC rates for cars and vans: 55p a mile for the first 10,000 business miles in a tax year from 6 April 2026 (45p before), then 25p.", '<div class="form-grid">' +
      field("Usual starting point", bound(id, id, "homeAddress", s.homeAddress, { placeholder: "Your home postcode" }), "span-2") +
      field("Rate up to threshold (£)", bound(id, id, "mileageRateHigh", s.mileageRateHigh, { num: true })) +
      field("Rate after (£)", bound(id, id, "mileageRateLow", s.mileageRateLow, { num: true })) +
      field("Threshold (miles)", bound(id, id, "mileageThreshold", s.mileageThreshold, { num: true, type: "number" })) +
      field("Default charge to clients (£/mile)", bound(id, id, "mileageBillRate", s.mileageBillRate || 0.45, { num: true })) +
    '</div>') +
    sec("Expense categories", "Each category is linked to the HMRC category it’s reported under.", catRows +
      '<div class="btn-row category-add">' + btn("＋ Add category", "cat-add", { cls: "btn-sm" }) + '</div>') +
    sec("Backup", "Download everything as a file you can keep, or restore from one. Receipts stay in your online storage.",
      '<div class="btn-row">' + btn("Download backup", "backup-export") + btn("Restore from backup…", "backup-import") + '<input type="file" id="backupFile" accept=".json,application/json" hidden></div>') +
  '</div>';
}
