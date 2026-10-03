"use strict";

/* =====================================================================
   DK Jobs - everything that happens when you click or type.
   One set of listeners on the page handles every screen.
   ===================================================================== */

/* ---------- Creating things ---------- */
function newJob(clientId) {
  var s = state.data.settings;
  var j = {
    id: uid("j"), ref: nextJobRef(), title: "", clientId: clientId || "", venue: "", po: "",
    status: "Confirmed", terms: "", summary: "", notes: "",
    dates: [{ id: uid("d"), start: todayIso(), end: "", startTime: "", endTime: "", label: "" }],
    items: [], todos: [], created: new Date().toISOString()
  };
  // Start with your first day rate on the price list, if you have one.
  var first = state.data.products.filter(function (p) { return p.active !== false; })[0];
  if (first) j.items.push({ id: uid("i"), desc: first.name, qty: num(first.qty) || 1, price: num(first.price) });
  state.data.jobs.push(j);
  save();
  go("jobs", j.id);
  setTimeout(function () { var el = document.querySelector('[data-bind="job"][data-field="title"]'); if (el) el.focus(); }, 30);
}
function newClient() {
  var c = { id: uid("c"), name: "", contact: "", email: "", phone: "", address: "", terms: "", notes: "", supplierRef: "" };
  state.data.clients.push(c);
  save();
  go("clients", c.id);
  setTimeout(function () { var el = document.querySelector('[data-bind="client"][data-field="name"]'); if (el) el.focus(); }, 30);
}
function addProduct(p) {
  state.data.products.push(Object.assign({ id: uid("p"), name: "", desc: "", qty: 1, price: 0, active: true }, p || {}));
}

/* Build a quote or invoice from a job. Invoices take everything not yet
   invoiced (charges, recharge expenses and mileage) and mark it so it
   can't be billed twice. Quotes take all the job's charges. */
function createDocFromJob(jobId, kind) {
  var j = jobById(jobId); if (!j) return;
  var client = byId(state.data.clients, j.clientId);
  if (!client) { toast("Choose a client for this job first."); return; }
  var s = state.data.settings;
  var terms = num(j.terms) || num(client.terms) || num(s.paymentTerms) || 30;
  var date = todayIso();
  var d = {
    id: uid("v"), kind: kind, number: nextDocNumber(kind), status: "draft",
    jobId: j.id, clientId: client.id,
    client: { name: client.name, contact: client.contact, address: client.address, email: client.email, supplierRef: client.supplierRef },
    title: j.title, venue: j.venue, jobDates: jobDateText(j) === "No date" ? "" : jobDateText(j),
    po: j.po, summary: j.summary, date: date,
    due: addDays(date, kind === "invoice" ? terms : (num(s.quoteValidDays) || 30)),
    termsDays: terms, terms: s.termsText, vatRate: vatOn() ? num(s.vatRate) : 0, items: []
  };
  if (kind === "quote") {
    d.items = (j.items || []).map(function (it) { return { id: uid("i"), desc: it.desc, qty: num(it.qty), price: num(it.price) }; });
  } else {
    var un = jobUninvoiced(j);
    un.items.forEach(function (it) { d.items.push({ id: uid("i"), desc: it.desc, qty: num(it.qty), price: num(it.price), src: { type: "item", id: it.id } }); it.invoiceId = d.id; });
    un.expenses.forEach(function (e) {
      d.items.push({ id: uid("i"), desc: "Expense: " + [e.merchant, e.desc].filter(Boolean).join(" – ") + " (" + fmtDate(e.date) + ")", qty: 1, price: expenseCost(e), src: { type: "expense", id: e.id } });
      e.invoiceId = d.id;
    });
    un.mileage.forEach(function (m) {
      d.items.push({ id: uid("i"), desc: "Mileage: " + [m.from, m.to].filter(Boolean).join(" → ") + (m.trip === "return" ? " (return)" : "") + " " + fmtDate(m.date), qty: tripMiles(m), price: num(m.billRate), src: { type: "mileage", id: m.id } });
      m.invoiceId = d.id;
    });
    if (!d.items.length) d.items.push({ id: uid("i"), desc: j.title || "Services", qty: 1, price: 0 });
  }
  state.data.invoices.push(d);
  save();
  go("doc", d.id);
}
// Undo the "already invoiced" marks when an invoice is deleted or voided.
function releaseDocSources(d) {
  if (d.kind !== "invoice") return;
  state.data.jobs.forEach(function (j) { (j.items || []).forEach(function (it) { if (it.invoiceId === d.id) delete it.invoiceId; }); });
  state.data.expenses.forEach(function (e) { if (e.invoiceId === d.id) delete e.invoiceId; });
  state.data.mileage.forEach(function (m) { if (m.invoiceId === d.id) delete m.invoiceId; });
}

/* ---------- Email an invoice ---------- */
function emailDoc(d) {
  var s = state.data.settings, t = docTotals(d), isInv = d.kind === "invoice";
  var subject = (isInv ? "Invoice " : "Quote ") + d.number + (d.title ? " – " + d.title : "") + (s.businessName ? " – " + s.businessName : "");
  var body = "Hi" + (d.client.contact ? " " + d.client.contact.split(" ")[0] : "") + ",\n\n" +
    (isInv ? "Please find attached invoice " + d.number : "Please find attached my quote " + d.number) +
    (d.title ? " for " + d.title : "") + (d.jobDates ? " (" + d.jobDates + ")" : "") + ".\n\n" +
    (isInv ? "Amount due: " + money(t.gross) + "\nDue by: " + fmtDate(d.due) + "\n" +
      (s.accountNumber ? "\nBank: " + [s.accountName, s.sortCode, s.accountNumber].filter(Boolean).join(" / ") + "\nReference: " + d.number + "\n" : "")
      : "Total: " + money(t.gross) + "\nValid until: " + fmtDate(d.due) + "\n") +
    "\nThanks,\n" + (s.yourName || s.businessName || "");
  location.href = "mailto:" + encodeURIComponent(d.client.email || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  toast("Save the PDF first (Print / Save PDF), then attach it to the email.");
}
function printDoc(d) {
  var old = document.title;
  document.title = (d.kind === "invoice" ? "Invoice " : "Quote ") + d.number + (d.client.name ? " - " + d.client.name : "");
  window.print();
  setTimeout(function () { document.title = old; }, 500);
}

/* ---------- CSV exports ---------- */
function csvCell(v) { var s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function downloadCsv(name, header, rows) {
  var text = [header].concat(rows).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
  var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}
function exportJobs() {
  downloadCsv("jobs.csv", ["Ref", "Title", "Client", "Venue", "Start", "End", "Status", "PO", "Value (net)", "Not invoiced"],
    state.data.jobs.map(function (j) { return [j.ref, j.title, clientName(j.clientId), j.venue, jobStartDate(j), jobEndDate(j), j.status, j.po, jobNet(j).toFixed(2), jobUninvoiced(j).total.toFixed(2)]; }));
}
function exportExpenses(y, r) {
  var list = state.data.expenses.filter(function (e) { return r ? inRange(e.date, r) : inTaxYear(e.date, y); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  downloadCsv("expenses-" + taxYearLabel(y).replace("/", "-") + ".csv", ["Date", "Supplier", "Description", "Category", "HMRC category", "Amount", "VAT", "Job", "Recharged", "Receipt"],
    list.map(function (e) { var j = jobById(e.jobId); return [e.date, e.merchant, e.desc, e.category, HMRC_CATEGORIES[categoryHmrc(e.category)], num(e.amount).toFixed(2), num(e.vat).toFixed(2), j ? jobLabel(j) : "", e.billable ? "Yes" : "No", e.receiptPath ? "Yes" : "No"]; }));
}
function exportMileage(y, r) {
  var rows = mileageForYear(y).rows.filter(function (x) { return !r || inRange(x.trip.date, r); });
  downloadCsv("mileage-" + taxYearLabel(y).replace("/", "-") + ".csv", ["Date", "From", "To", "Journey", "Miles", "Claim", "Job", "Note"],
    rows.map(function (x) { var m = x.trip, j = jobById(m.jobId); return [m.date, m.from, m.to, m.trip === "return" ? "Return" : "One way", x.miles, x.value.toFixed(2), j ? jobLabel(j) : "", m.desc]; }));
}
function exportIncome(r, y) {
  var list = incomeInRange(r).sort(function (a, b) { return (incomeDate(a) || "") < (incomeDate(b) || "") ? -1 : 1; });
  downloadCsv("income-" + taxYearLabel(y).replace("/", "-") + ".csv", ["Invoice", "Invoice date", "Paid date", "Client", "Job", "Net", "VAT", "Total"],
    list.map(function (i) { var t = docTotals(i); return [i.number, i.date, i.paidDate || "", i.client.name, i.title, t.net.toFixed(2), t.vat.toFixed(2), t.gross.toFixed(2)]; }));
}
function exportSummary(y, q) {
  var rep = buildReport(y, q);
  var rows = [["Period", rep.range.from + " to " + rep.range.to], ["Turnover", rep.turnover.toFixed(2)]];
  Object.keys(HMRC_CATEGORIES).forEach(function (k) { if (k !== "capital" && k !== "disallowable") rows.push([HMRC_CATEGORIES[k], rep.categories[k].toFixed(2)]); });
  rows.push(["Total allowable expenses", rep.allowable.toFixed(2)], ["Net profit", rep.profit.toFixed(2)], ["Mileage included in travel", rep.mileValue.toFixed(2)], ["Business miles", rep.mileMiles], ["Equipment (capital allowances)", rep.categories.capital.toFixed(2)]);
  if (vatOn()) rows.push(["VAT charged", rep.vatCharged.toFixed(2)], ["VAT on expenses", rep.vatReclaim.toFixed(2)]);
  downloadCsv("summary-" + taxYearLabel(y).replace("/", "-") + (q !== "all" ? "-" + q : "") + ".csv", ["Item", "Amount"], rows);
}

/* ---------- Typing into bound fields ---------- */
function findBoundTarget(el) {
  var kind = el.getAttribute("data-bind"), id = el.getAttribute("data-id"), sub = el.getAttribute("data-sub");
  var d = state.data;
  if (kind === "settings") return d.settings;
  if (kind === "job") return jobById(id);
  if (kind === "client") return byId(d.clients, id);
  if (kind === "product") return byId(d.products, id);
  if (kind === "doc") return byId(d.invoices, id);
  var parent = kind.indexOf("doc-") === 0 ? byId(d.invoices, id) : jobById(id);
  if (!parent) return null;
  var listName = { "job-items": "items", "job-dates": "dates", "job-todos": "todos", "doc-items": "items" }[kind];
  return byId(parent[listName] || [], sub);
}
function readBoundValue(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.getAttribute("data-num")) { var v = el.value.trim(); return v === "" ? "" : num(v); }
  return el.value;
}
function onBoundInput(el, final) {
  var target = findBoundTarget(el);
  if (!target) return;
  var f = el.getAttribute("data-field");
  target[f] = readBoundValue(el);
  if (f === "start" && el.getAttribute("data-bind") === "job-dates" && target.end && target.end < target.start) target.end = "";
  // Keep totals on the job page up to date without redrawing as you type.
  if (el.getAttribute("data-bind") === "job-items") {
    var cell = document.querySelector('[data-line-total="' + target.id + '"]');
    if (cell) cell.textContent = money(lineNet(target));
    var j = jobById(el.getAttribute("data-id")), tot = document.getElementById("jobTotal");
    if (j && tot) tot.textContent = money(jobNet(j));
  }
  save();
  if (final && el.getAttribute("data-rerender")) render();
}

/* ---------- Clicks ---------- */
var ACTIONS = {
  "logout": function () {
    var msg = "Log out? This also logs you out of DK Timesheet on this device.";
    if (hasUnsynced()) msg += "\n\nSome changes haven't synced yet. They're kept here and sent next time you log in.";
    if (confirm(msg)) logout();
  },
  "theme": toggleTheme,
  "nav-open": function () { state.navOpen = true; render(); },
  "nav-close": function () { state.navOpen = false; render(); },
  "new-job": function (id, el) {
    var clientId = state.route.tab === "clients" && id ? id : "";
    newJob(clientId);
  },
  "new-client": newClient,
  "new-expense": function (id) {
    state.expEditingId = null; state.expFromJob = id || "";
    if (state.route.tab !== "expenses") { state.pendingForm = "expense"; go("expenses"); return; }
    state.expAdding = true; render(); focusForm("expAmount");
  },
  "new-mileage": function (id) {
    state.mileEditingId = null; state.mileFromJob = id || "";
    if (state.route.tab !== "mileage") { state.pendingForm = "mileage"; go("mileage"); return; }
    state.mileAdding = true; render(); focusForm("mMiles");
  },
  "open-job": function (id) { go("jobs", id); },
  "open-client": function (id) { go("clients", id); },
  "open-doc": function (id) { go("doc", id); },
  "job-filter": function (id) { state.jobFilter = id; render(); },
  "inv-filter": function (id) { state.invFilter = id; render(); },
  "report-q": function (id) { state.reportQuarter = id; render(); },
  "export-jobs": exportJobs,

  /* Job page */
  "job-date-add": function (id) {
    var j = jobById(id); var last = (j.dates || [])[j.dates.length - 1];
    j.dates.push({ id: uid("d"), start: last ? addDays(last.end || last.start || todayIso(), 1) : todayIso(), end: "", startTime: "", endTime: "", label: "" });
    save(); render();
  },
  "job-date-del": function (id, el) { var j = jobById(id); j.dates = j.dates.filter(function (d) { return d.id !== el.getAttribute("data-sub"); }); save(); render(); },
  "job-item-add": function (id) {
    var j = jobById(id); j.items.push({ id: uid("i"), desc: "", qty: 1, price: 0 }); save(); render();
    var inputs = document.querySelectorAll('[data-bind="job-items"][data-field="desc"]'); if (inputs.length) inputs[inputs.length - 1].focus();
  },
  "job-item-del": function (id, el) { var j = jobById(id); j.items = j.items.filter(function (i) { return i.id !== el.getAttribute("data-sub"); }); save(); render(); },
  "job-todo-add": function (id) {
    var j = jobById(id); j.todos = j.todos || []; j.todos.push({ id: uid("t"), text: "", done: false }); save(); render();
    var inputs = document.querySelectorAll('[data-bind="job-todos"][data-field="text"]'); if (inputs.length) inputs[inputs.length - 1].focus();
  },
  "job-todo-del": function (id, el) { var j = jobById(id); j.todos = j.todos.filter(function (t) { return t.id !== el.getAttribute("data-sub"); }); save(); render(); },
  "job-invoice": function (id) { createDocFromJob(id, "invoice"); },
  "job-quote": function (id) { createDocFromJob(id, "quote"); },
  "job-duplicate": function (id) {
    var j = jobById(id);
    var copy = JSON.parse(JSON.stringify(j));
    copy.id = uid("j"); copy.ref = nextJobRef(); copy.title = (j.title || "") + " (copy)"; copy.status = "Potential"; copy.po = "";
    copy.created = new Date().toISOString();
    copy.dates.forEach(function (d) { d.id = uid("d"); });
    copy.items.forEach(function (i) { i.id = uid("i"); delete i.invoiceId; });
    (copy.todos || []).forEach(function (t) { t.id = uid("t"); t.done = false; });
    state.data.jobs.push(copy); save(); go("jobs", copy.id); toast("Job copied — set the new dates.");
  },
  "job-delete": function (id) {
    var j = jobById(id);
    var docs = invoicesForJob(id).filter(function (d) { return d.status !== "draft" && d.status !== "void"; });
    if (docs.length) { alert("This job has issued quotes or invoices (" + docs.map(function (d) { return d.number; }).join(", ") + "). Set its status to Cancelled instead, so your records stay complete."); return; }
    if (!confirm("Delete “" + (j.title || "this job") + "”? Linked expenses and mileage are kept but unlinked.")) return;
    state.data.invoices = state.data.invoices.filter(function (d) { return d.jobId !== id; });
    state.data.expenses.forEach(function (e) { if (e.jobId === id) e.jobId = ""; });
    state.data.mileage.forEach(function (m) { if (m.jobId === id) m.jobId = ""; });
    state.data.jobs = state.data.jobs.filter(function (x) { return x.id !== id; });
    save(); go("jobs");
  },

  /* Clients */
  "client-delete": function (id) {
    var c = byId(state.data.clients, id);
    if (state.data.jobs.some(function (j) { return j.clientId === id; })) { alert("This client has jobs. Delete or move those jobs first."); return; }
    if (!confirm("Delete " + (c.name || "this client") + "?")) return;
    state.data.clients = state.data.clients.filter(function (x) { return x.id !== id; }); save(); go("clients");
  },

  /* Price list */
  "product-add": function () { addProduct(); save(); render(); var inputs = document.querySelectorAll('[data-bind="product"][data-field="name"]'); if (inputs.length) inputs[inputs.length - 1].focus(); },
  "product-delete": function (id) { state.data.products = state.data.products.filter(function (p) { return p.id !== id; }); save(); render(); },
  "products-starter": function () {
    [{ name: "Day rate", desc: "Up to 10 hours", price: 0 }, { name: "Half day", desc: "Up to 5 hours", price: 0 },
     { name: "Overtime (per hour)", desc: "", price: 0 }, { name: "Travel day", desc: "", price: 0 }, { name: "Per diem", desc: "Meals while away", price: 0 }]
      .forEach(addProduct);
    save(); render(); toast("Added — now fill in your prices.");
  },

  /* Quotes & invoices */
  "doc-print": function (id) { printDoc(byId(state.data.invoices, id)); },
  "doc-email": function (id) { emailDoc(byId(state.data.invoices, id)); },
  "doc-sent": function (id) { var d = byId(state.data.invoices, id); d.status = "sent"; d.sentDate = todayIso(); refreshJobStatus(jobById(d.jobId)); save(); render(); },
  "doc-paid": function (id) {
    var d = byId(state.data.invoices, id);
    var when = prompt("Date paid (YYYY-MM-DD)", todayIso());
    if (when === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when.trim())) { toast("Use the format YYYY-MM-DD."); return; }
    d.status = "paid"; d.paidDate = when.trim(); refreshJobStatus(jobById(d.jobId)); save(); render(); toast("Marked as paid.");
  },
  "doc-unpaid": function (id) { var d = byId(state.data.invoices, id); d.status = "sent"; delete d.paidDate; refreshJobStatus(jobById(d.jobId)); save(); render(); },
  "doc-accept": function (id) {
    var d = byId(state.data.invoices, id); d.status = "accepted";
    var j = jobById(d.jobId); if (j && (j.status === "Potential" || j.status === "Pencilled")) j.status = "Confirmed";
    save(); render(); toast("Quote accepted" + (j ? " — job marked Confirmed." : "."));
  },
  "doc-decline": function (id) { var d = byId(state.data.invoices, id); d.status = "declined"; save(); render(); },
  "doc-convert": function (id) {
    var q = byId(state.data.invoices, id);
    if (q.jobId && jobById(q.jobId)) { if (q.status === "draft" || q.status === "sent") q.status = "accepted"; createDocFromJob(q.jobId, "invoice"); return; }
    var s = state.data.settings, date = todayIso();
    var d = JSON.parse(JSON.stringify(q));
    d.id = uid("v"); d.kind = "invoice"; d.number = nextDocNumber("invoice"); d.status = "draft"; d.date = date;
    d.due = addDays(date, num(d.termsDays) || num(s.paymentTerms) || 30);
    d.items.forEach(function (i) { i.id = uid("i"); delete i.src; });
    q.status = "accepted";
    state.data.invoices.push(d); save(); go("doc", d.id);
  },
  "doc-redraft": function (id) {
    var d = byId(state.data.invoices, id);
    if (!confirm("Edit " + d.number + " again? If you've already sent it, send the client the updated copy.")) return;
    d.status = "draft"; save(); render();
  },
  "doc-void": function (id) {
    var d = byId(state.data.invoices, id);
    if (!confirm("Void " + d.number + "? It stays on record but no longer counts, and its charges become available to invoice again.")) return;
    d.status = "void"; releaseDocSources(d);
    var j = jobById(d.jobId); if (j && j.status === "Awaiting Payment") j.status = "Confirmed";
    save(); render();
  },
  "doc-delete": function (id) {
    var d = byId(state.data.invoices, id);
    if (!confirm("Delete draft " + d.number + "?")) return;
    releaseDocSources(d);
    state.data.invoices = state.data.invoices.filter(function (x) { return x.id !== id; });
    // Give the number back if it was the last one issued.
    var s = state.data.settings, key = d.kind === "quote" ? "nextQuoteNo" : "nextInvoiceNo", prefix = d.kind === "quote" ? s.quotePrefix : s.invoicePrefix;
    if (d.number === prefix + String(num(s[key]) - 1).padStart(4, "0")) s[key] = num(s[key]) - 1;
    save(); history.length > 1 ? history.back() : go("invoices");
  },
  "doc-item-add": function (id) { var d = byId(state.data.invoices, id); d.items.push({ id: uid("i"), desc: "", qty: 1, price: 0 }); save(); render(); },
  "doc-item-del": function (id, el) {
    var d = byId(state.data.invoices, id), sub = el.getAttribute("data-sub");
    var it = byId(d.items, sub);
    if (it && it.src) {
      // Free up the job charge / expense / mileage it came from.
      var list = it.src.type === "expense" ? state.data.expenses : it.src.type === "mileage" ? state.data.mileage : [];
      if (it.src.type === "item") state.data.jobs.forEach(function (j) { (j.items || []).forEach(function (x) { if (x.id === it.src.id) delete x.invoiceId; }); });
      list.forEach(function (x) { if (x.id === it.src.id) delete x.invoiceId; });
    }
    d.items = d.items.filter(function (i) { return i.id !== sub; }); save(); render();
  },

  /* Expenses */
  "exp-cancel": function () { state.expAdding = false; state.expEditingId = null; render(); },
  "exp-edit": function (id) { state.expEditingId = id; state.expAdding = false; render(); focusForm("expAmount"); },
  "exp-dup": function (id) {
    var e = byId(state.data.expenses, id);
    var copy = Object.assign({}, e, { id: uid("e"), date: todayIso(), receiptPath: "" });
    delete copy.invoiceId;
    state.data.expenses.push(copy); save(); state.expEditingId = copy.id; render(); focusForm("expAmount");
    toast("Copied to today — check the amount and add the new receipt.");
  },
  "exp-del": function (id) {
    var e = byId(state.data.expenses, id);
    if (e.invoiceId) { alert("This expense is on an invoice. Remove it from the invoice (or void the invoice) first."); return; }
    if (!confirm("Delete this expense" + (e.receiptPath ? " and its receipt" : "") + "?")) return;
    deleteReceipt(e.receiptPath);
    state.data.expenses = state.data.expenses.filter(function (x) { return x.id !== id; }); save(); render();
  },
  "exp-receipt": function (id) { openReceipt(byId(state.data.expenses, id).receiptPath); },
  "export-expenses": function () { exportExpenses(state.expYear || currentTaxYear()); },

  /* Mileage */
  "mile-cancel": function () { state.mileAdding = false; state.mileEditingId = null; render(); },
  "mile-edit": function (id) { state.mileEditingId = id; state.mileAdding = false; render(); focusForm("mMiles"); },
  "mile-del": function (id) {
    var m = byId(state.data.mileage, id);
    if (m.invoiceId) { alert("This journey is on an invoice. Remove it from the invoice first."); return; }
    if (!confirm("Delete this journey?")) return;
    state.data.mileage = state.data.mileage.filter(function (x) { return x.id !== id; }); save(); render();
  },
  "export-mileage": function () { exportMileage(state.mileYear || currentTaxYear()); },

  /* Reports */
  "export-summary": function () { exportSummary(state.reportYear || currentTaxYear(), state.reportQuarter || "all"); },
  "export-income": function () { var y = state.reportYear || currentTaxYear(); exportIncome(periodRange(y, state.reportQuarter), y); },
  "export-expenses-report": function () { var y = state.reportYear || currentTaxYear(); exportExpenses(y, periodRange(y, state.reportQuarter)); },
  "export-mileage-report": function () { var y = state.reportYear || currentTaxYear(); exportMileage(y, periodRange(y, state.reportQuarter)); },

  /* Settings */
  "cat-add": function () { state.data.settings.expenseCategories.push({ name: "New category", hmrc: "other" }); save(); render(); },
  "cat-del": function (id) { state.data.settings.expenseCategories.splice(parseInt(id, 10), 1); save(); render(); },
  "logo-remove": function () { state.data.settings.logo = ""; save(); render(); },
  "backup-export": function () {
    var blob = new Blob([JSON.stringify({ app: "dk-jobs", version: JOBS_VERSION, exported: new Date().toISOString(), data: state.data }, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "dk-jobs-backup-" + todayIso() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
  },
  "backup-import": function () { document.getElementById("backupFile").click(); }
};
function focusForm(id) { setTimeout(function () { var el = document.getElementById(id); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); } }, 30); }

/* ---------- Forms ---------- */
async function submitExpense(form) {
  var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
  var amount = num(g("expAmount"));
  if (!g("expDate")) { toast("Add the date."); return; }
  if (amount <= 0) { toast("Add the amount."); return; }
  var id = form.getAttribute("data-id");
  var e = id ? byId(state.data.expenses, id) : { id: uid("e"), created: new Date().toISOString() };
  if (e.invoiceId && round2(num(e.amount)) !== round2(amount)) { toast("This expense is on an invoice — the amount can't change."); return; }
  Object.assign(e, {
    date: g("expDate"), merchant: g("expMerchant"), category: g("expCategory"), amount: round2(amount),
    desc: g("expDesc"), vat: vatOn() ? round2(num(g("expVat"))) : (e.vat || 0), jobId: g("expJob"),
    billable: document.getElementById("expBillable").checked
  });
  var file = document.getElementById("expReceipt").files[0];
  if (file) {
    state.receiptBusy = true; render();
    try {
      var old = e.receiptPath;
      e.receiptPath = await uploadReceipt(file, e.id);
      if (old) deleteReceipt(old);
    } catch (err) {
      state.receiptBusy = false; render();
      toast("Receipt upload failed (" + errMessage(err) + "). The expense wasn't saved — try again.");
      return;
    }
    state.receiptBusy = false;
  }
  if (!id) state.data.expenses.push(e);
  state.expAdding = false; state.expEditingId = null;
  save(); render(); toast("Expense saved.");
}
function submitMileage(form) {
  var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
  var miles = num(g("mMiles"));
  if (!g("mDate")) { toast("Add the date."); return; }
  if (miles <= 0) { toast("Add the miles."); return; }
  var id = form.getAttribute("data-id");
  var m = id ? byId(state.data.mileage, id) : { id: uid("m"), created: new Date().toISOString() };
  if (m.invoiceId && (round2(num(m.miles)) !== round2(miles))) { toast("This journey is on an invoice — the miles can't change."); return; }
  Object.assign(m, {
    date: g("mDate"), jobId: g("mJob"), from: g("mFrom"), to: g("mTo"), miles: round2(miles), trip: g("mTrip"),
    desc: g("mDesc"), billable: document.getElementById("mBillable").checked, billRate: round2(num(g("mBillRate")))
  });
  if (!id) state.data.mileage.push(m);
  state.mileAdding = false; state.mileEditingId = null;
  save(); render(); toast("Journey saved.");
}
function updateMileagePreview() {
  var p = document.getElementById("mPreview"); if (!p) return;
  var miles = num((document.getElementById("mMiles") || {}).value) * ((document.getElementById("mTrip") || {}).value === "return" ? 2 : 1);
  var date = (document.getElementById("mDate") || {}).value || todayIso();
  p.innerHTML = miles ? "<b>" + round2(miles) + " miles</b> · about <b>" + money(miles * rateHighFor(taxYearOf(date))) + "</b> claimable" : "";
  var link = document.getElementById("mMapLink");
  var from = (document.getElementById("mFrom") || {}).value, to = (document.getElementById("mTo") || {}).value;
  if (link) {
    link.href = "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(from || "") + "&destination=" + encodeURIComponent(to || "") + "&travelmode=driving";
    link.style.visibility = from && to ? "visible" : "hidden";
  }
}

/* ---------- Wiring ---------- */
function attachGateEvents() {
  var form = document.getElementById("authForm");
  if (!form) return;
  var first = form.querySelector("input"); if (first) first.focus();
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!state.authBusy) signIn(document.getElementById("authEmail").value, document.getElementById("authPassword").value);
  });
}
document.addEventListener("click", function (ev) {
  var el = ev.target.closest("[data-action]");
  if (!el || el.tagName === "SELECT") return;
  if (ev.target.closest("a[href]") && !el.matches("a")) return; // real links inside clickable rows
  var fn = ACTIONS[el.getAttribute("data-action")];
  if (fn) { ev.preventDefault(); fn(el.getAttribute("data-id"), el); }
});
document.addEventListener("input", function (ev) {
  var el = ev.target;
  if (el.hasAttribute("data-bind") && el.type !== "checkbox" && el.tagName !== "SELECT") onBoundInput(el, false);
  if (el.id === "jobSearch") {
    state.jobSearch = el.value;
    var pos = el.selectionStart; render();
    var s = document.getElementById("jobSearch"); if (s) { s.focus(); s.setSelectionRange(pos, pos); }
  }
  if (el.hasAttribute("data-cat-index")) {
    var c = state.data.settings.expenseCategories[parseInt(el.getAttribute("data-cat-index"), 10)];
    var old = c.name; c[el.getAttribute("data-cat-field")] = el.value;
    if (el.getAttribute("data-cat-field") === "name") state.data.expenses.forEach(function (e) { if (e.category === old) e.category = el.value; });
    save();
  }
  if (/^m(Miles|Trip|Date|From|To)$/.test(el.id)) updateMileagePreview();
});
document.addEventListener("change", function (ev) {
  var el = ev.target;
  if (el.hasAttribute("data-bind")) { onBoundInput(el, true); return; }
  if (el.getAttribute("data-action-change") === "job-item-product") {
    var p = byId(state.data.products, el.value), j = jobById(el.getAttribute("data-id"));
    if (p && j) { j.items.push({ id: uid("i"), desc: p.name, qty: num(p.qty) || 1, price: num(p.price) }); save(); render(); }
    return;
  }
  if (el.hasAttribute("data-cat-index")) { save(); return; }
  if (el.id === "mJob") {
    var jj = jobById(el.value), to = document.getElementById("mTo"), dt = document.getElementById("mDate");
    if (jj && to && !to.value) to.value = jj.venue || "";
    if (jj && dt && jobStartDate(jj)) dt.value = jobStartDate(jj);
    updateMileagePreview();
  }
  if (el.id === "expYearSel") { state.expYear = parseInt(el.value, 10); render(); }
  if (el.id === "mileYearSel") { state.mileYear = parseInt(el.value, 10); render(); }
  if (el.id === "reportYearSel") { state.reportYear = parseInt(el.value, 10); render(); }
  if (el.id === "logoFile" && el.files[0]) readLogo(el.files[0]);
  if (el.id === "backupFile" && el.files[0]) restoreBackup(el.files[0]);
});
document.addEventListener("submit", function (ev) {
  if (ev.target.id === "expenseForm") { ev.preventDefault(); submitExpense(ev.target); }
  if (ev.target.id === "mileageForm") { ev.preventDefault(); submitMileage(ev.target); }
});
document.addEventListener("keydown", function (ev) {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("tr.link-row, div.link-row")) { ev.preventDefault(); ev.target.click(); }
});

/* Logo: shrunk to fit so it doesn't bloat your saved data. */
function readLogo(file) {
  var img = new Image(), reader = new FileReader();
  reader.onload = function () { img.src = reader.result; };
  img.onload = function () {
    var max = 400, scale = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    state.data.settings.logo = c.toDataURL("image/png"); save(); render(); toast("Logo added.");
  };
  img.onerror = function () { toast("Couldn't read that image."); };
  reader.readAsDataURL(file);
}
function restoreBackup(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var parsed = JSON.parse(reader.result);
      if (!parsed || parsed.app !== "dk-jobs" || !parsed.data) throw new Error("not a DK Jobs backup");
      if (!confirm("Replace everything in DK Jobs with this backup from " + (parsed.exported || "").slice(0, 10) + "? This changes it on all your devices.")) return;
      state.data = normaliseData(parsed.data); save(); render(); toast("Backup restored.");
    } catch (e) { toast("Couldn't restore: " + errMessage(e) + "."); }
  };
  reader.readAsText(file);
}
