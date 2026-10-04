"use strict";

/* =====================================================================
   DK Jobs - Expenses, Mileage, Reports, Settings.
   ===================================================================== */

/* ---------- Expenses ---------- */
function uniqueValues(list, key) {
  var seen = {}, out = [];
  list.forEach(function (x) { var v = (x[key] || "").trim(); if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = true; out.push(v); } });
  return out.sort();
}
function renderExpenses() {
  var d = state.data, cur = currentTaxYear(), subs = d.subscriptions || [];
  var q = (state.expSearch || "").toLowerCase(), cat = state.expCat || "";
  var match = function (e) {
    if (cat && e.category !== cat) return false;
    if (!q) return true;
    var j = jobById(e.jobId);
    return [e.merchant, e.desc, e.notes, e.category, j && j.title, j && j.ref].join(" ").toLowerCase().indexOf(q) !== -1;
  };
  var yearList = d.expenses.filter(function (e) { return inTaxYear(e.date, cur); });
  var total = round2(yearList.reduce(function (s, e) { return s + num(e.amount); }, 0));
  var toBill = round2(d.expenses.filter(function (e) { return e.billable && !e.invoiceId; }).reduce(function (s, e) { return s + expenseCost(e); }, 0));
  var active = subs.filter(subActive);
  var monthly = round2(active.reduce(function (s, x) { return s + subMonthly(x); }, 0));
  var annual = round2(active.filter(function (x) { return x.frequency === "annual"; }).reduce(function (s, x) { return s + num(x.amount); }, 0));
  state.subsOpen = state.subsOpen === undefined ? false : state.subsOpen;

  var subsCard = '<div class="card subs-card"><div class="subs-head" data-action="subs-toggle">' +
      '<div><span class="cap-title">Subscriptions</span> <span class="tag ds-sent">' + active.length + ' active</span><div class="lr-sub">Regular costs that log themselves each month or year</div></div>' +
      '<div class="btn-row">' + icon("chevron", "chev" + (state.subsOpen ? " open" : "")) + btn("＋ Add", "sub-add", { cls: "btn-sm btn-primary" }) + '</div></div>' +
    (state.subsOpen ? (subs.length ? subs.map(function (x) {
      var next = subActive(x) ? subNext(x) : "";
      return '<div class="sub-row' + (subActive(x) ? "" : " ended") + '"><div><b>' + escapeHtml(x.name) + '</b> <span class="tag cat-pill">' + escapeHtml(x.category || "") + '</span>' +
        '<div class="lr-sub">' + money(x.amount) + ' · ' + (x.frequency === "annual" ? "Annual" : "Monthly") + (subActive(x) ? (next ? ' · Next: ' + fmtDate(next) : "") : ' · Ended ' + fmtDate(x.end)) + '</div></div>' +
        '<div class="btn-row">' + (subActive(x) ? btn("Edit", "sub-edit", { id: x.id, cls: "btn-sm" }) + btn("End", "sub-end", { id: x.id, cls: "btn-sm btn-danger" }) : btn("Delete", "sub-del", { id: x.id, cls: "btn-sm btn-ghost" })) + '</div></div>';
    }).join("") : '<div class="lr-sub sub-empty">Add things you pay for regularly — software, phone, insurance — and each payment is logged for you.</div>') : "") +
  '</div>';

  var head = '<div class="exp-actions btn-row">' + btn("Export CSV", "export-expenses", { id: String(cur) }) + btn("Export Receipts", "export-receipts", { id: String(cur) }) +
      btn("Import CSV", "import-expenses") + btn(icon("camera") + " Scan Receipt", "scan-receipt") + btn("＋ Add Expense", "new-expense", { cls: "btn-primary" }) +
      '<input type="file" id="expImportFile" accept=".csv,text/csv" hidden></div>';
  var stats = '<div class="card exp-stats">' +
      '<div><div class="stat-label">Total business costs ' + taxYearLabel(cur) + '</div><div class="mile-big">' + money(total) + '</div><div class="lr-sub">incl. subscriptions</div></div>' +
      '<div><div class="stat-label">Not yet invoiced</div><div class="mile-big accent">' + money(toBill) + '</div><div class="lr-sub">billable to clients</div></div>' +
      '<div><div class="stat-label">Monthly subs</div><div class="mile-big accent">' + money(monthly) + '<small>/mo</small></div></div>' +
      '<div><div class="stat-label">Annual subs</div><div class="mile-big accent">' + money(annual) + '<small>/yr</small></div></div>' +
    '</div>';
  var usedCats = uniqueValues(d.expenses, "category");
  var filters = '<div class="card exp-filter"><input type="search" class="field-input search-input" id="expSearch" placeholder="Search by merchant, description or notes…" value="' + attr(state.expSearch || "") + '">' +
    '<div class="chips">' + [""].concat(usedCats).map(function (c) {
      return '<button class="chip' + (c === cat ? " active" : "") + '" data-action="exp-cat" data-id="' + attr(c) + '">' + escapeHtml(c || "All") + '</button>';
    }).join("") + '</div></div>';

  if (!d.expenses.length) return subsCard + head + stats + emptyBlock("No expenses yet", "Add business costs as you go — snap the receipt and it's read for you. Moving from another system? Import its expenses CSV.", btn("Add Expense", "new-expense", { cls: "btn-primary" }) + btn("Scan Receipt", "scan-receipt"));
  var years = {}; d.expenses.forEach(function (e) { if (e.date) years[taxYearOf(e.date)] = true; }); years[cur] = true;
  state.expOpen = state.expOpen || {};
  var groups = Object.keys(years).map(Number).sort(function (a, b) { return b - a; }).map(function (y) {
    var all = d.expenses.filter(function (e) { return inTaxYear(e.date, y); }), list = all.filter(match)
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if ((!all.length && y !== cur) || ((q || cat) && !list.length)) return "";
    var open = state.expOpen[y] !== undefined ? state.expOpen[y] : y === cur || !!q || !!cat;
    var yTotal = round2(list.reduce(function (s, e) { return s + num(e.amount); }, 0));
    var yBill = round2(list.filter(function (e) { return e.billable && !e.invoiceId; }).reduce(function (s, e) { return s + expenseCost(e); }, 0));
    var rows = !open ? "" : list.map(function (e) {
      var job = jobById(e.jobId);
      var inv = e.invoiceId ? '<span class="tag ds-paid">Invoiced</span>' : e.billable ? '<span class="tag ds-sent">To bill</span>' : '<span class="tag ds-draft">Non-billable</span>';
      return '<tr><td class="date-cell">' + fmtDate(e.date) + '</td>' +
        '<td class="exp-merchant">' + escapeHtml(e.merchant || "—") + (e.subId ? '<div class="lr-sub">' + icon("refresh") + ' subscription</div>' : "") + '</td>' +
        '<td class="exp-desc">' + escapeHtml(e.desc || "") + (e.notes ? '<div class="lr-sub">' + escapeHtml(e.notes) + '</div>' : "") + '</td>' +
        '<td><span class="tag cat-pill">' + escapeHtml(e.category || "") + '</span></td>' +
        '<td>' + (job ? '<a class="ref-link" href="#/jobs/' + encodeURIComponent(job.id) + '">' + escapeHtml(job.ref || job.title) + '</a>' : '<span class="lr-sub">—</span>') + '</td>' +
        '<td class="num"><b>' + money(e.amount) + '</b>' + (vatOn() && num(e.vat) ? '<div class="lr-sub">VAT ' + money(e.vat) + '</div>' : "") +
          (e.receiptPath || e.receiptUrl ? '<div><button class="link-add rcpt-link" data-action="exp-receipt" data-id="' + attr(e.id) + '">' + icon("file") + ' Receipt</button></div>' : '<div class="lr-sub no-rcpt">no receipt</div>') + '</td>' +
        '<td>' + inv + '</td>' +
        '<td class="actions-cell"><div class="btn-row nowrap">' + btn("Amend", "exp-edit", { id: e.id, cls: "btn-sm" }) +
          '<button class="icon-only btn-danger" data-action="exp-del" data-id="' + attr(e.id) + '" title="Delete">' + icon("bin") + '</button></div></td></tr>';
    }).join("") || (open ? '<tr><td colspan="8" class="list-empty">No expenses match.</td></tr>' : "");
    return '<tbody><tr class="fy-row" data-action="exp-year" data-id="' + y + '"><td colspan="5">' + icon("chevron", "chev" + (open ? " open" : "")) + ' <b>FY ' + taxYearLabel(y) + '</b>' + (y === cur ? ' <span class="tag ds-sent">Current</span>' : "") +
      ' <span class="lr-sub">' + list.length + ' expense' + (list.length === 1 ? "" : "s") + '</span></td><td class="num"><b>' + money(yTotal) + '</b></td><td colspan="2" class="lr-sub">' + (yBill ? money(yBill) + " to bill" : "") + '</td></tr>' + rows + '</tbody>';
  }).join("");
  return subsCard + head + stats + filters +
    '<div class="card log-table-wrap"><div class="table-scroll"><table class="log-table exp-table"><thead><tr><th>Date</th><th>Merchant</th><th>Description</th><th>Category</th><th>Job</th><th class="num">Total</th><th>Inv?</th><th class="actions-col">Actions</th></tr></thead>' + groups + '</table></div></div>';
}

/* ---------- Mileage ---------- */
// Journeys grouped by tax year (current year open), HMRC value for each.
function renderMileage() {
  var years = {}, cur = currentTaxYear();
  state.data.mileage.forEach(function (m) { if (m.date) years[taxYearOf(m.date)] = true; });
  years[cur] = true;
  var list = Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
  var now = mileageForYear(cur), s = state.data.settings, threshold = num(s.mileageThreshold) || 10000;
  var head = '<div class="mile-head">' +
      '<div class="mile-totals card"><div><div class="stat-label">Fiscal total ' + taxYearLabel(cur) + '</div><div class="mile-big">' + now.miles.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' <small>mi</small></div></div>' +
        '<div><div class="stat-label">Reclaim value</div><div class="mile-big accent">' + money(now.value) + '</div></div>' +
        '<div class="mile-rate lr-sub">' + Math.round(now.rateHigh * 100) + 'p a mile' + (now.miles < threshold ? " for the next " + Math.round(threshold - now.miles).toLocaleString("en-GB") + " miles, then " : " — now at ") + Math.round(now.rateLow * 100) + 'p</div></div>' +
      '<div class="btn-row">' + btn("＋ Log Journey", "new-mileage", { cls: "btn-primary" }) + '</div></div>';
  if (!state.data.mileage.length) return head + emptyBlock("No journeys yet", "Log business trips to venues, warehouses and suppliers — the miles are worked out for you. Your normal commute to a permanent workplace doesn't count.", btn("Log Journey", "new-mileage", { cls: "btn-primary" }));
  state.mileOpen = state.mileOpen || {};
  var groups = list.map(function (y) {
    var info = mileageForYear(y), open = state.mileOpen[y] !== undefined ? state.mileOpen[y] : y === cur;
    if (!info.rows.length && y !== cur) return "";
    var rows = !open ? "" : info.rows.slice().reverse().map(function (r) {
      var m = r.trip, job = jobById(m.jobId);
      return '<tr><td class="date-cell">' + journeyDates(m) + '</td>' +
        '<td>' + (job ? '<a class="ref-link" href="#/jobs/' + encodeURIComponent(job.id) + '">' + escapeHtml(jobLabel(job)) + '</a>' : "") +
          (m.desc && (!job || m.desc !== [job.ref, job.title].filter(Boolean).join(" - ")) ? '<div class="' + (job ? "lr-sub" : "") + '">' + escapeHtml(m.desc) + '</div>' : (job ? "" : '<span class="lr-sub">No job</span>')) + '</td>' +
        '<td class="route-cell">' + escapeHtml(m.from || "?") + ' <span class="arrow">→</span> ' + escapeHtml(m.to || "?") + '</td>' +
        '<td><span class="tag leg">' + (m.trip === "return" ? "Return" : "One way") + (num(m.trips) > 1 ? " ×" + m.trips : "") + '</span>' + (m.invoiceId ? ' <span class="mini-tag">invoiced</span>' : "") + '</td>' +
        '<td class="num mile-num">' + r.miles.toFixed(1) + '</td><td class="num mile-val">' + money(r.value) + '</td>' +
        '<td class="actions-cell"><div class="btn-row nowrap">' + btn("Amend", "mile-edit", { id: m.id, cls: "btn-sm" }) +
          '<button class="icon-only btn-danger" data-action="mile-del" data-id="' + attr(m.id) + '" title="Delete">' + icon("bin") + '</button></div></td></tr>';
    }).join("");
    return '<tbody class="fy-group"><tr class="fy-row" data-action="mile-year" data-id="' + y + '"><td colspan="4">' + icon("chevron", "chev" + (open ? " open" : "")) + ' <b>FY ' + taxYearLabel(y) + '</b>' + (y === cur ? ' <span class="tag ds-sent">Current</span>' : "") +
      ' <span class="lr-sub">' + info.rows.length + ' journey' + (info.rows.length === 1 ? "" : "s") + '</span></td><td class="num mile-num">' + info.miles.toFixed(1) + '</td><td class="num mile-val">' + money(info.value) + '</td>' +
      '<td class="actions-cell">' + (info.rows.length ? btn("Export CSV", "export-mileage", { id: String(y), cls: "btn-sm btn-ghost" }) : "") + '</td></tr>' + rows + '</tbody>';
  }).join("");
  return head + '<div class="card log-table-wrap"><div class="table-scroll"><table class="log-table mile-table"><thead><tr><th>Date</th><th>Description</th><th>Route</th><th>Leg</th><th class="num">Total mi</th><th class="num">Valuation</th><th class="actions-col">Actions</th></tr></thead>' + groups + '</table></div></div>';
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
  var business = sec("Your business", "Shown at the top of your quotes and invoices.", '<div class="form-grid">' +
      field("Business / trading name", bound(id, id, "businessName", s.businessName, { placeholder: "e.g. DK Event Services" }), "span-2") +
      field("Your name", bound(id, id, "yourName", s.yourName)) +
      field("Phone", bound(id, id, "phone", s.phone, { type: "tel" })) +
      field("Email", bound(id, id, "email", s.email, { type: "email" }), "span-2") +
      field("Website", bound(id, id, "website", s.website), "span-2") +
      field("Business address", bound(id, id, "address", s.address, { type: "textarea", rows: 3 }), "full") +
      '<div class="field full"><label>Logo</label><div class="btn-row">' + (s.logo ? '<img class="logo-preview" src="' + attr(s.logo) + '" alt="Logo">' : "") +
        '<input type="file" accept="image/*" id="logoFile" class="field-input logo-input">' + (s.logo ? btn("Remove logo", "logo-remove", { cls: "btn-sm" }) : "") + '</div></div>' +
    '</div>');
  var bank = sec("Bank details", "Printed on invoices so clients know where to pay.", '<div class="form-grid">' +
      field("Bank", bound(id, id, "bankName", s.bankName), "span-2") +
      field("Account name", bound(id, id, "accountName", s.accountName), "span-2") +
      field("Sort code", bound(id, id, "sortCode", s.sortCode, { placeholder: "00-00-00" })) +
      field("Account number", bound(id, id, "accountNumber", s.accountNumber)) +
      '<div class="field span-2 check-field"><label class="check-label">' + bound(id, id, "showBankOnQuotes", s.showBankOnQuotes, { type: "checkbox" }) + ' Show on quotes too</label></div>' +
    '</div>');
  var quotes = sec("Quotes & invoices", "Use {days} in the terms and it’s replaced with the job’s payment terms.", '<div class="form-grid">' +
      field("Invoice prefix", bound(id, id, "invoicePrefix", s.invoicePrefix)) +
      field("Next invoice number", bound(id, id, "nextInvoiceNo", s.nextInvoiceNo, { num: true, type: "number" })) +
      field("Quote prefix", bound(id, id, "quotePrefix", s.quotePrefix)) +
      field("Next quote number", bound(id, id, "nextQuoteNo", s.nextQuoteNo, { num: true, type: "number" })) +
      field("Default payment terms (days)", bound(id, id, "paymentTerms", s.paymentTerms, { num: true, type: "number" })) +
      field("Quotes valid for (days)", bound(id, id, "quoteValidDays", s.quoteValidDays || 30, { num: true, type: "number" })) +
      field("Terms printed at the bottom", bound(id, id, "termsText", s.termsText, { type: "textarea", rows: 3 }), "full") +
    '</div>');
  var tax = sec("Tax", "", '<div class="form-grid">' +
      field("Count income", bound(id, id, "accountingBasis", s.accountingBasis || "cash", { type: "select", options: [{ value: "cash", label: "When paid (cash basis — most sole traders)" }, { value: "accruals", label: "On invoice date (accruals)" }] }), "span-2") +
      '<div class="field span-2 check-field"><label class="check-label">' + bound(id, id, "vatRegistered", s.vatRegistered, { type: "checkbox", rerender: true }) + ' I’m VAT registered</label></div>' +
      (s.vatRegistered ? field("VAT number", bound(id, id, "vatNumber", s.vatNumber)) + field("VAT rate %", bound(id, id, "vatRate", s.vatRate, { num: true, type: "number" })) : "") +
    '</div>');
  var mileage = sec("Mileage", "HMRC rates for cars and vans: 55p a mile for the first 10,000 business miles in a tax year from 6 April 2026 (45p before), then 25p.", '<div class="form-grid">' +
      field("Usual starting point", bound(id, id, "homeAddress", s.homeAddress, { placeholder: "Your home postcode" }), "span-2") +
      field("Threshold (miles a tax year)", bound(id, id, "mileageThreshold", s.mileageThreshold, { num: true, type: "number" }), "span-2") +
      field("Rate up to threshold (£/mile)", bound(id, id, "mileageRateHigh", s.mileageRateHigh, { num: true })) +
      field("Rate after threshold (£/mile)", bound(id, id, "mileageRateLow", s.mileageRateLow, { num: true })) +
      field("Charge clients per mile (£) — leave blank to use the HMRC rate", bound(id, id, "mileageBillRate", s.mileageBillRate || "", { num: true, placeholder: "HMRC rate (" + Math.round(rateHighFor(currentTaxYear()) * 100) + "p)" }), "span-2") +
    '</div>');
  var aiScan = sec("Receipt scanning (AI)", "When you upload a receipt it's read for you, and the date, supplier, total, category and description are filled in. Uses Claude through your own Supabase function — about 1–3p per receipt. Setup steps are at the top of supabase/functions/scan-receipt/index.ts.",
    '<div class="form-grid"><div class="field span-2 check-field"><label class="check-label">' + bound(id, id, "aiScan", s.aiScan !== false, { type: "checkbox" }) + ' Scan receipts automatically when I upload them</label></div></div>');
  var categories = sec("Expense categories", "Each category is linked to the HMRC category it’s reported under.", catRows +
      '<div class="btn-row category-add">' + btn("＋ Add category", "cat-add", { cls: "btn-sm" }) + '</div>');
  var backup = '<div class="card settings-card backup-card"><div><div class="settings-title">Backup</div>' +
      '<p class="settings-help">Download everything as a file you can keep, or restore from one. Receipts stay in your online storage.</p></div>' +
      '<div class="btn-row">' + btn("Download backup", "backup-export") + btn("Restore from backup…", "backup-import") + '<input type="file" id="backupFile" accept=".json,application/json" hidden></div></div>';
  // Two columns that stack on their own (no gaps under short cards), with
  // Backup across the bottom.
  return '<div class="settings-grid">' +
      '<div class="settings-col">' + business + quotes + tax + mileage + '</div>' +
      '<div class="settings-col">' + bank + aiScan + categories + '</div>' +
    '</div>' + backup;
}
