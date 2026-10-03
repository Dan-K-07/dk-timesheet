"use strict";

/* =====================================================================
   DK Jobs - Clients, Price List, Quotes & Invoices, document page.
   ===================================================================== */

/* ---------- Clients ---------- */
function clientStats(cId) {
  var jobs = state.data.jobs.filter(function (j) { return j.clientId === cId; });
  var invs = liveInvoices().filter(function (i) { return i.clientId === cId; });
  var billed = invs.reduce(function (s, i) { return s + docTotals(i).gross; }, 0);
  var owed = invs.filter(function (i) { return i.status === "sent"; }).reduce(function (s, i) { return s + docTotals(i).gross; }, 0);
  return { jobs: jobs, invoices: invs, billed: round2(billed), owed: round2(owed) };
}
function renderClients() {
  if (state.route.id) return renderClientPage(state.route.id);
  var list = state.data.clients.slice().sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  if (!list.length) return emptyBlock("No clients yet", "Add the companies you work for. Their details go on your quotes and invoices.", btn("Add client", "new-client", { cls: "btn-primary" }));
  var rows = list.map(function (c) {
    var st = clientStats(c.id);
    return '<tr class="link-row" data-action="open-client" data-id="' + attr(c.id) + '">' +
      '<td><div class="lr-title">' + escapeHtml(c.name || "(no name)") + '</div><div class="lr-sub">' + escapeHtml(c.contact || "") + '</div></td>' +
      '<td>' + escapeHtml(c.email || "") + '</td>' +
      '<td class="num">' + st.jobs.length + '</td>' +
      '<td class="num">' + money(st.billed) + '</td>' +
      '<td class="num">' + (st.owed ? money(st.owed) : "—") + '</td></tr>';
  }).join("");
  return '<div class="log-toolbar"><div class="section-sub">' + list.length + ' client' + (list.length === 1 ? "" : "s") + '</div>' +
    '<div class="btn-row">' + btn("＋ Add client", "new-client", { cls: "btn-primary" }) + '</div></div>' +
    '<div class="card log-table-wrap"><table class="log-table"><thead><tr><th>Client</th><th>Email</th><th class="num">Jobs</th><th class="num">Invoiced</th><th class="num">Owed</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function renderClientPage(id) {
  var c = byId(state.data.clients, id);
  if (!c) return emptyBlock("Client not found", "It may have been deleted on another device.", '<a class="btn" href="#/clients">Back to clients</a>');
  var st = clientStats(c.id);
  var jobs = st.jobs.slice().sort(function (a, b) { return jobStartDate(a) < jobStartDate(b) ? 1 : -1; });
  return '<div class="page-head"><a class="back-link" href="#/clients">← Clients</a><h1 class="page-title">' + escapeHtml(c.name || "New client") + '</h1></div>' +
    '<div class="job-layout"><div class="job-main"><div class="card job-card"><div class="form-grid">' +
      field("Company / client name", bound("client", c.id, "name", c.name), "span-2") +
      field("Contact name", bound("client", c.id, "contact", c.contact)) +
      field("Phone", bound("client", c.id, "phone", c.phone, { type: "tel" })) +
      field("Email (invoices go here)", bound("client", c.id, "email", c.email, { type: "email" }), "span-2") +
      field("Default payment terms (days)", bound("client", c.id, "terms", c.terms, { num: true, type: "number", placeholder: String(state.data.settings.paymentTerms) })) +
      field("Your supplier / vendor ref", bound("client", c.id, "supplierRef", c.supplierRef)) +
      field("Address", bound("client", c.id, "address", c.address, { type: "textarea", rows: 4 }), "span-2") +
      field("Notes", bound("client", c.id, "notes", c.notes, { type: "textarea", rows: 4 }), "span-2") +
    '</div></div>' +
    '<div class="section-title">Jobs</div><div class="card list-card">' + (jobs.length ? jobs.map(function (j) {
      return '<div class="list-row link-row" data-action="open-job" data-id="' + attr(j.id) + '"><div class="lr-main"><div class="lr-title">' + escapeHtml(j.title || "Untitled job") + '</div><div class="lr-sub">' + jobDateText(j) + '</div></div><div class="lr-end"><div class="mono">' + money(jobNet(j)) + '</div>' + statusTag(j.status) + '</div></div>';
    }).join("") : '<div class="list-empty">No jobs for this client yet.</div>') + '</div></div>' +
    '<div class="job-side"><div class="card side-card"><div class="side-title">Invoiced to date</div><div class="side-big mono">' + money(st.billed) + '</div>' +
      '<div class="lr-sub">' + (st.owed ? money(st.owed) + " outstanding" : "Nothing outstanding") + '</div></div>' +
      '<div class="btn-row side-btns">' + btn("＋ New job for this client", "new-job", { id: c.id, cls: "btn-sm" }) + btn("Delete client", "client-delete", { id: c.id, cls: "btn-sm btn-danger" }) + '</div></div></div>';
}

/* ---------- Price list ---------- */
function renderPrices() {
  var list = state.data.products;
  var rows = list.map(function (p) {
    return '<tr' + (p.active === false ? ' class="muted-row"' : "") + '>' +
      '<td>' + bound("product", p.id, "name", p.name, { placeholder: "e.g. Day rate (10 hrs)" }) + '</td>' +
      '<td>' + bound("product", p.id, "desc", p.desc, { placeholder: "Optional note" }) + '</td>' +
      '<td class="qty-cell">' + bound("product", p.id, "qty", p.qty, { num: true, cls: "num-input" }) + '</td>' +
      '<td class="price-cell">' + bound("product", p.id, "price", p.price, { num: true, cls: "num-input" }) + '</td>' +
      '<td class="center">' + bound("product", p.id, "active", p.active !== false, { type: "checkbox", rerender: true }) + '</td>' +
      '<td class="actions-cell"><button class="btn btn-ghost btn-sm btn-danger" data-action="product-delete" data-id="' + attr(p.id) + '" title="Delete">✕</button></td></tr>';
  }).join("");
  return '<div class="log-toolbar"><div class="settings-help">Day rates, half days, per diems, overtime — anything you charge regularly. Pick them on a job instead of typing them each time.</div>' +
    '<div class="btn-row">' + (list.length ? "" : btn("Add common rates", "products-starter")) + btn("＋ Add item", "product-add", { cls: "btn-primary" }) + '</div></div>' +
    (list.length ? '<div class="card log-table-wrap"><table class="log-table items-table"><thead><tr><th>Name</th><th>Note</th><th class="qty-cell">Default qty</th><th class="price-cell">Price</th><th class="center">In use</th><th class="actions-col"></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : emptyBlock("Your price list is empty", "Add your rates, or start with a few common ones and edit the prices.", ""));
}

/* ---------- Quotes & Invoices list ---------- */
var INV_FILTERS = [
  { key: "open", label: "Unpaid", test: function (i) { return i.kind === "invoice" && (i.status === "draft" || i.status === "sent"); } },
  { key: "paid", label: "Paid", test: function (i) { return i.kind === "invoice" && i.status === "paid"; } },
  { key: "quotes", label: "Quotes", test: function (i) { return i.kind === "quote" && i.status !== "void"; } },
  { key: "void", label: "Void", test: function (i) { return i.status === "void"; } },
  { key: "all", label: "All", test: function () { return true; } }
];
function renderInvoices() {
  var all = state.data.invoices;
  if (!all.length) return emptyBlock("No quotes or invoices yet", "Open a job and use Create invoice or Create quote — the client, charges and costs are filled in for you.", '<a class="btn btn-primary" href="#/jobs">Go to jobs</a>');
  var f = INV_FILTERS.filter(function (x) { return x.key === state.invFilter; })[0] || INV_FILTERS[0];
  var list = all.filter(f.test).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.number < b.number ? 1 : -1); });
  var owed = sumGross(liveInvoices().filter(function (i) { return i.status === "sent"; }));
  var overdue = sumGross(liveInvoices().filter(isOverdue));
  var y = currentTaxYear();
  var paidYear = sumGross(liveInvoices().filter(function (i) { return i.status === "paid" && inTaxYear(i.paidDate || i.date, y); }));
  var chips = '<div class="chips">' + INV_FILTERS.map(function (x) {
    return '<button class="chip' + (x.key === f.key ? " active" : "") + '" data-action="inv-filter" data-id="' + x.key + '">' + x.label + ' <span>' + all.filter(x.test).length + '</span></button>';
  }).join("") + '</div>';
  var rows = list.map(function (i) {
    var job = jobById(i.jobId);
    return '<tr class="link-row" data-action="open-doc" data-id="' + attr(i.id) + '">' +
      '<td class="mono">' + escapeHtml(i.number) + '</td>' +
      '<td class="date-cell">' + fmtDate(i.date) + '</td>' +
      '<td><div class="lr-title">' + escapeHtml(i.client.name || "") + '</div><div class="lr-sub">' + escapeHtml(job ? job.title : (i.title || "")) + '</div></td>' +
      '<td class="date-cell">' + (i.kind === "invoice" ? (i.status === "paid" ? "Paid " + fmtDate(i.paidDate) : "Due " + fmtDate(i.due)) : "Valid to " + fmtDate(i.due)) + '</td>' +
      '<td>' + docStatusTag(i) + '</td>' +
      '<td class="num">' + money(docTotals(i).gross) + '</td></tr>';
  }).join("");
  return '<div class="stat-grid">' +
      stat("Outstanding", money(owed), overdue ? money(overdue) + " overdue" : "Nothing overdue", overdue ? "warn" : "") +
      stat("Paid " + taxYearLabel(y), money(paidYear), "This tax year, incl. VAT") +
      stat("Invoices issued", String(liveInvoices().filter(function (i) { return i.status !== "draft"; }).length), "All time") +
    '</div>' + chips +
    '<div class="card log-table-wrap"><table class="log-table"><thead><tr><th>Number</th><th>Date</th><th>Client / job</th><th>Due</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="6" class="list-empty">Nothing here.</td></tr>') + '</tbody></table></div>';
}
function sumGross(list) { return round2(list.reduce(function (s, i) { return s + docTotals(i).gross; }, 0)); }

/* ---------- Single quote / invoice ---------- */
function renderDocPage(id) {
  var d = byId(state.data.invoices, id);
  if (!d) return emptyBlock("Not found", "This quote or invoice may have been deleted on another device.", '<a class="btn" href="#/invoices">Back</a>');
  var isInv = d.kind === "invoice", draft = d.status === "draft";
  var job = jobById(d.jobId);
  var t = docTotals(d);

  var actions = [];
  actions.push(btn("Download PDF", "doc-pdf", { id: d.id, cls: "btn-primary" }));
  actions.push(btn("Print", "doc-print", { id: d.id }));
  if (d.status !== "void") actions.push(btn("Email…", "doc-email", { id: d.id }));
  if (draft) actions.push(btn("Mark as sent", "doc-sent", { id: d.id }));
  if (isInv && d.status === "sent") actions.push(btn("Mark as paid", "doc-paid", { id: d.id }));
  if (isInv && d.status === "paid") actions.push(btn("Mark as unpaid", "doc-unpaid", { id: d.id }));
  if (!isInv && (d.status === "sent" || d.status === "draft")) { actions.push(btn("Accepted", "doc-accept", { id: d.id })); actions.push(btn("Declined", "doc-decline", { id: d.id })); }
  if (!isInv && d.status !== "void") actions.push(btn("Turn into invoice", "doc-convert", { id: d.id }));
  if (!draft && d.status !== "void" && d.status !== "paid") actions.push(btn("Edit again", "doc-redraft", { id: d.id }));
  if (draft) actions.push(btn("Delete", "doc-delete", { id: d.id, cls: "btn-danger" }));
  else if (d.status !== "void") actions.push(btn("Void", "doc-void", { id: d.id, cls: "btn-danger" }));

  var editor = "";
  if (draft) {
    var items = d.items.map(function (it) {
      return '<tr><td>' + bound("doc-items", d.id, "desc", it.desc, { sub: it.id, rerender: true }) + '</td>' +
        '<td class="qty-cell">' + bound("doc-items", d.id, "qty", it.qty, { sub: it.id, num: true, cls: "num-input", rerender: true }) + '</td>' +
        '<td class="price-cell">' + bound("doc-items", d.id, "price", it.price, { sub: it.id, num: true, cls: "num-input", rerender: true }) + '</td>' +
        '<td class="actions-cell"><button class="btn btn-ghost btn-sm btn-danger" data-action="doc-item-del" data-id="' + attr(d.id) + '" data-sub="' + attr(it.id) + '">✕</button></td></tr>';
    }).join("");
    editor = '<div class="card job-card no-print"><div class="settings-title">Edit ' + (isInv ? "invoice" : "quote") + '</div>' +
      '<div class="form-grid">' +
        field(isInv ? "Invoice date" : "Quote date", bound("doc", d.id, "date", d.date, { type: "date", rerender: true })) +
        field(isInv ? "Due date" : "Valid until", bound("doc", d.id, "due", d.due, { type: "date", rerender: true })) +
        field("Number", bound("doc", d.id, "number", d.number, { rerender: true })) +
        field("Purchase order", bound("doc", d.id, "po", d.po, { rerender: true })) +
        field("Description", bound("doc", d.id, "summary", d.summary, { type: "textarea", rows: 2, rerender: true }), "full") +
        field("Terms / notes at the bottom", bound("doc", d.id, "terms", d.terms, { type: "textarea", rows: 2, rerender: true, placeholder: "Leave blank for none" }) +
          (state.data.settings.termsText && d.terms !== state.data.settings.termsText ?
            '<div class="btn-row terms-btns">' + btn("Use terms from Settings", "doc-terms-template", { id: d.id, cls: "btn-sm" }) + '</div>' : ""), "full") +
      '</div>' +
      '<div class="log-table-wrap"><table class="log-table items-table"><thead><tr><th>Description</th><th class="qty-cell">Qty</th><th class="price-cell">Price</th><th class="actions-col"></th></tr></thead><tbody>' + items + '</tbody></table></div>' +
      '<div class="btn-row items-actions">' + btn("＋ Add line", "doc-item-add", { id: d.id, cls: "btn-sm" }) + '</div></div>';
  }

  return '<div class="page-head no-print"><a class="back-link" href="' + (job ? "#/jobs/" + encodeURIComponent(job.id) : "#/invoices") + '">← ' + (job ? escapeHtml(job.title || "Job") : "Quotes & Invoices") + '</a>' +
      '<h1 class="page-title">' + (isInv ? "Invoice " : "Quote ") + escapeHtml(d.number) + '</h1>' + docStatusTag(d) +
      (d.status === "paid" ? '<span class="lr-sub">Paid ' + fmtDate(d.paidDate) + '</span>' : "") + '</div>' +
    '<div class="btn-row doc-actions no-print">' + actions.join("") + '</div>' +
    editor + renderDocSheet(d, t);
}

/* The printable page. Kept plain so it prints cleanly in black and white. */
function renderDocSheet(d, t) {
  var s = state.data.settings, isInv = d.kind === "invoice";
  var from = [s.yourName && s.businessName ? s.yourName : "", s.address, s.phone, s.email, s.website].filter(Boolean);
  var bank = (isInv || s.showBankOnQuotes) && (s.accountNumber || s.sortCode) ?
    '<div class="ds-block"><div class="ds-label">Payment details</div>' +
      (s.bankName ? '<div>' + escapeHtml(s.bankName) + '</div>' : "") +
      (s.accountName ? '<div>Account name: ' + escapeHtml(s.accountName) + '</div>' : "") +
      (s.sortCode ? '<div>Sort code: ' + escapeHtml(s.sortCode) + '</div>' : "") +
      (s.accountNumber ? '<div>Account number: ' + escapeHtml(s.accountNumber) + '</div>' : "") +
      '<div>Reference: ' + escapeHtml(d.number) + '</div></div>' : "";
  var lines = d.items.map(function (it) {
    return '<tr><td>' + escapeHtml(it.desc) + '</td><td class="num">' + escapeHtml(String(num(it.qty))) + '</td><td class="num">' + money(it.price) + '</td><td class="num">' + money(lineNet(it)) + '</td></tr>';
  }).join("");
  var terms = String(d.terms || "").replace(/\{days\}/g, String(d.termsDays || s.paymentTerms));
  return '<div class="doc-sheet">' +
    '<div class="ds-top">' +
      '<div class="ds-from">' + (s.logo ? '<img class="ds-logo" src="' + attr(s.logo) + '" alt="">' : "") +
        '<div class="ds-biz">' + escapeHtml(s.businessName || s.yourName || "Your business name") + '</div>' +
        '<div class="ds-small pre">' + escapeHtml(from.join("\n")) + '</div></div>' +
      '<div class="ds-title"><div class="ds-kind">' + (isInv ? "INVOICE" : "QUOTATION") + '</div>' +
        '<table class="ds-meta"><tr><td>' + (isInv ? "Invoice no." : "Quote no.") + '</td><td>' + escapeHtml(d.number) + '</td></tr>' +
        '<tr><td>Date</td><td>' + fmtDate(d.date) + '</td></tr>' +
        '<tr><td>' + (isInv ? "Due" : "Valid until") + '</td><td>' + fmtDate(d.due) + '</td></tr>' +
        (d.po ? '<tr><td>PO</td><td>' + escapeHtml(d.po) + '</td></tr>' : "") +
        (d.client.supplierRef ? '<tr><td>Supplier ref</td><td>' + escapeHtml(d.client.supplierRef) + '</td></tr>' : "") +
        (s.vatRegistered && s.vatNumber ? '<tr><td>VAT no.</td><td>' + escapeHtml(s.vatNumber) + '</td></tr>' : "") +
        '</table></div>' +
    '</div>' +
    '<div class="ds-block"><div class="ds-label">' + (isInv ? "Bill to" : "Prepared for") + '</div>' +
      '<div class="ds-strong">' + escapeHtml(d.client.name || "") + '</div>' +
      '<div class="pre">' + escapeHtml([d.client.contact, d.client.address].filter(Boolean).join("\n")) + '</div></div>' +
    ((d.title || d.summary) ? '<div class="ds-block"><div class="ds-strong">' + escapeHtml(d.title || "") + (d.venue ? " · " + escapeHtml(d.venue) : "") + (d.jobDates ? " · " + escapeHtml(d.jobDates) : "") + '</div>' +
      (d.summary ? '<div class="pre">' + escapeHtml(d.summary) + '</div>' : "") + '</div>' : "") +
    '<table class="ds-lines"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' + lines + '</tbody></table>' +
    '<table class="ds-totals">' +
      (d.vatRate ? '<tr><td>Subtotal</td><td class="num">' + money(t.net) + '</td></tr><tr><td>VAT @ ' + num(d.vatRate) + '%</td><td class="num">' + money(t.vat) + '</td></tr>' : "") +
      '<tr class="ds-grand"><td>' + (isInv ? "Total due" : "Total") + '</td><td class="num">' + money(t.gross) + '</td></tr></table>' +
    bank +
    (terms ? '<div class="ds-block ds-small pre">' + escapeHtml(terms) + '</div>' : "") +
  '</div>';
}
