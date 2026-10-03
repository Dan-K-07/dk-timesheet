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
  var st = clientStats(c.id), score = paymentScore(c.id);
  var issued = st.invoices.filter(function (i) { return i.status !== "draft"; });
  var billed = sumGross(issued), paid = sumGross(issued.filter(function (i) { return i.status === "paid"; }));
  var head = '<div class="page-head client-head"><a class="back-link" href="#/clients">← Clients</a>' +
    '<div class="client-title"><div><h1 class="page-title accent-title">' + escapeHtml(c.name || "New client") + '</h1><div class="page-sub">Client details &amp; invoice history</div></div>' +
    '<button class="btn" data-action="client-edit">' + icon(state.clientEditing ? "save" : "pencil") + ' ' + (state.clientEditing ? "Done editing" : "Edit Client") + '</button></div></div>';

  var details;
  if (state.clientEditing) {
    var contacts = (c.contacts || []).map(function (k) {
      return '<div class="contact-edit">' +
        bound("client-contacts", c.id, "name", k.name, { sub: k.id, placeholder: "Name" }) +
        bound("client-contacts", c.id, "role", k.role, { sub: k.id, placeholder: "Role, e.g. Head of Sound" }) +
        bound("client-contacts", c.id, "email", k.email, { sub: k.id, placeholder: "Email", type: "email" }) +
        bound("client-contacts", c.id, "phone", k.phone, { sub: k.id, placeholder: "Phone", type: "tel" }) +
        '<button class="icon-only btn-danger" data-action="contact-del" data-id="' + attr(c.id) + '" data-sub="' + attr(k.id) + '" title="Remove contact">' + icon("bin") + '</button></div>';
    }).join("");
    details = '<div class="card client-card"><div class="client-cols"><div><div class="cap-title">Client details</div><div class="form-grid client-form">' +
        field("Company / client name", bound("client", c.id, "name", c.name), "full") +
        field("Address", bound("client", c.id, "address", c.address, { type: "textarea", rows: 4 }), "full") +
        field("Email (invoices go here)", bound("client", c.id, "email", c.email, { type: "email" }), "span-2") +
        field("Phone", bound("client", c.id, "phone", c.phone, { type: "tel" }), "span-2") +
        field("Payment terms (days)", bound("client", c.id, "terms", c.terms, { num: true, type: "number", placeholder: String(state.data.settings.paymentTerms) }), "span-2") +
        field("Your supplier / vendor ref", bound("client", c.id, "supplierRef", c.supplierRef), "span-2") +
        field("Notes (private)", bound("client", c.id, "notes", c.notes, { type: "textarea", rows: 3 }), "full") +
      '</div></div>' +
      '<div><div class="cap-title">Contacts</div>' + (contacts || '<div class="lr-sub">No contacts yet.</div>') +
        '<button class="link-add" data-action="contact-add" data-id="' + attr(c.id) + '">＋ Add contact</button>' +
        '<div class="lr-sub contact-note">The first contact is the one greeted in invoice emails.</div></div>' +
    '</div></div>';
  } else {
    var lines = function (k) { return [k.email ? '<a href="mailto:' + attr(k.email) + '">' + escapeHtml(k.email) + '</a>' : "", escapeHtml(k.phone || "")].filter(Boolean).join("<br>"); };
    details = '<div class="card client-card"><div class="client-cols">' +
      '<div><div class="cap-title">Client details</div><div class="client-name">' + escapeHtml(c.name || "(no name)") + '</div>' +
        (c.address ? '<div class="pre client-addr">' + escapeHtml(c.address) + '</div>' : "") +
        '<div class="client-facts">' +
          (c.email ? '<div>' + icon("mail") + '<a href="mailto:' + attr(c.email) + '">' + escapeHtml(c.email) + '</a></div>' : "") +
          (c.phone ? '<div>' + icon("phone") + escapeHtml(c.phone) + '</div>' : "") +
          '<div>' + icon("clock") + 'Payment terms: ' + (num(c.terms) || num(state.data.settings.paymentTerms) || 30) + ' days</div>' +
          (c.supplierRef ? '<div>' + icon("tag") + 'Supplier ref: ' + escapeHtml(c.supplierRef) + '</div>' : "") +
        '</div>' + (c.notes ? '<div class="client-notes pre">' + escapeHtml(c.notes) + '</div>' : "") + '</div>' +
      '<div><div class="cap-title">Contacts</div>' + ((c.contacts || []).length ? c.contacts.map(function (k) {
        return '<div class="contact"><div><b>' + escapeHtml(k.name || "(no name)") + '</b>' + (k.role ? ' <span class="lr-sub">· ' + escapeHtml(k.role) + '</span>' : "") + '</div>' +
          (lines(k) ? '<div class="contact-lines">' + lines(k) + '</div>' : "") + '</div>';
      }).join("") : '<div class="lr-sub">No contacts yet — use Edit Client to add them.</div>') + '</div>' +
    '</div></div>';
  }

  var stats = '<div class="stat-grid stat-grid-4 client-stats">' +
    '<div class="card stat-card score ' + (score ? "sc-" + score.cls : "") + '"><div class="stat-label">Payment score</div>' +
      (score ? '<div class="score-word">' + score.label + '</div><div class="score-days">' + score.days + 'd</div><div class="stat-sub">Avg days to pay · from invoice date · ' + score.count + ' invoice' + (score.count === 1 ? "" : "s") + '</div>'
        : '<div class="score-word">—</div><div class="stat-sub">Shows once an invoice has been paid</div>') + '</div>' +
    stat("Total invoiced", money(billed), issued.length + " invoice" + (issued.length === 1 ? "" : "s")) +
    stat("Total paid", money(paid), "", "good") +
    stat("Outstanding", money(st.owed), st.owed ? "" : "Nothing owed", st.owed ? "warn" : "muted") +
  '</div>';

  return head + details + stats + renderProjects(c) + renderClientHistory(c) +
    '<div class="btn-row side-btns client-foot">' + btn("＋ New job for this client", "new-job", { id: c.id, cls: "btn-sm" }) + btn("Delete client", "client-delete", { id: c.id, cls: "btn-sm btn-danger" }) + '</div>';
}

/* Projects: group several of a client's jobs and invoice them together. */
function renderProjects(c) {
  var projects = state.data.projects.filter(function (p) { return p.clientId === c.id; });
  var jobs = state.data.jobs.filter(function (j) { return j.clientId === c.id; })
    .sort(function (a, b) { return (jobStartDate(b) || "") < (jobStartDate(a) || "") ? -1 : 1; });
  var naming = state.projectNaming ? '<div class="project-new"><input class="field-input" id="projectName" data-id="' + attr(c.id) + '" placeholder="Project name, e.g. Monthly matches" autocomplete="off">' +
    btn("Create", "project-create", { id: c.id, cls: "btn-primary" }) + '<button class="icon-only" data-action="project-cancel" title="Cancel">✕</button></div>' : "";
  var cards = projects.map(function (p) {
    var mine = projectJobs(p), open = !!state.projectOpen[p.id];
    var toBill = round2(mine.reduce(function (s, j) { return s + jobUninvoiced(j).total; }, 0));
    var body = !open ? "" : '<div class="project-body">' + (jobs.length ? jobs.map(function (j) {
        var other = j.projectId && j.projectId !== p.id ? projectById(j.projectId) : null;
        return '<label class="project-job"><input type="checkbox" data-project-job="' + attr(j.id) + '" data-id="' + attr(p.id) + '"' + (j.projectId === p.id ? " checked" : "") + '>' +
          '<span class="pj-title">' + escapeHtml(j.title || "Untitled job") + '</span><span class="lr-sub">· ' + jobDateText(j) + '</span><span class="pj-ref">#' + escapeHtml(j.ref || "") + '</span>' +
          (other ? '<span class="mini-tag">in ' + escapeHtml(other.name) + '</span>' : "") + '</label>';
      }).join("") : '<div class="lr-sub">This client has no jobs yet.</div>') +
      '<div class="project-actions">' + btn("Create Invoice for Project" + (toBill ? " · " + money(toBill) : ""), "project-invoice", { id: p.id, cls: "btn-good", disabled: !mine.length || toBill <= 0 }) +
        btn("Delete", "project-delete", { id: p.id, cls: "btn-danger" }) + '</div>' +
      (mine.length && toBill <= 0 ? '<div class="lr-sub">Everything on these jobs has been invoiced.</div>' : "") + '</div>';
    return '<div class="project' + (open ? " open" : "") + '"><button class="project-head" data-action="project-toggle" data-id="' + attr(p.id) + '">' +
      '<span><b>' + escapeHtml(p.name) + '</b><span class="lr-sub">' + mine.length + ' job' + (mine.length === 1 ? "" : "s") + ' assigned' + (toBill ? " · " + money(toBill) + " to invoice" : "") + '</span></span>' + icon("chevron", "chev") + '</button>' + body + '</div>';
  }).join("");
  return '<div class="card projects-card"><div class="cap-head"><span class="cap-title">Projects <span class="info-tip" title="Group several jobs for this client into a project, then raise one invoice covering all of them — useful for recurring work billed together, e.g. several matches invoiced once a month.">' + icon("info") + '</span></span>' +
      (state.projectNaming ? "" : '<button class="link-add" data-action="project-new">＋ New Project</button>') + '</div>' +
    naming + (cards || (state.projectNaming ? "" : '<div class="lr-sub">Group several jobs into a project, then raise one invoice covering all of them.</div>')) + '</div>';
}

// A date in the history table that you can click and change.
function histDate(i, f) {
  return '<input type="date" class="cell-date" data-bind="doc" data-id="' + attr(i.id) + '" data-field="' + f + '" data-rerender="1" value="' + attr(i[f] || "") + '" title="Click to change">';
}
/* Every job for the client, with its invoice (if any). Sortable. */
function renderClientHistory(c) {
  var rows = [];
  state.data.jobs.filter(function (j) { return j.clientId === c.id; }).forEach(function (j) {
    var invs = invoicesForJob(j.id).filter(function (i) { return i.kind === "invoice" && i.status !== "void"; });
    if (!invs.length) rows.push({ job: j, inv: null });
    invs.forEach(function (i) { rows.push({ job: j, inv: i }); });
  });
  var key = state.histSort.key, dir = state.histSort.dir;
  var val = function (r) {
    var i = r.inv;
    switch (key) {
      case "ref": return r.job.ref || "";
      case "job": return (r.job.title || "").toLowerCase();
      case "invoice": return i ? i.number : "";
      case "invDate": return i ? i.date || "" : "";
      case "due": return i ? i.due || "" : "";
      case "amount": return i ? docTotals(i).gross : -1;
      case "status": return i ? invoiceStatusText(i) : "~";
      case "paid": return i && i.paidDate || "";
      default: return jobStartDate(r.job) || "";
    }
  };
  rows.sort(function (a, b) { var x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  var th = function (k, label, cls) {
    return '<th class="sortable' + (cls ? " " + cls : "") + (key === k ? " sorted" : "") + '" data-action="hist-sort" data-id="' + k + '">' + label + ' <span class="sort-ind">' + (key === k ? (dir > 0 ? "▲" : "▼") : "⇅") + '</span></th>';
  };
  var body = rows.map(function (r) {
    var j = r.job, i = r.inv;
    var status = i ? '<span class="tag ' + (i.status === "paid" ? "ds-paid" : isOverdue(i) ? "ds-overdue" : "ds-" + i.status) + '">' + escapeHtml(invoiceStatusText(i)) + '</span>'
      : '<span class="tag ' + (j.status === "Cancelled" ? "st-cancelled" : "ds-draft") + '">' + (j.status === "Cancelled" ? "Cancelled" : "Not invoiced") + '</span>';
    return '<tr>' +
      '<td><a class="ref-link" href="#/jobs/' + encodeURIComponent(j.id) + '">' + escapeHtml(j.ref || "—") + '</a></td>' +
      '<td class="hist-job">' + escapeHtml(j.title || "Untitled job") + (j.projectId && projectById(j.projectId) ? '<div class="lr-sub">' + escapeHtml(projectById(j.projectId).name) + '</div>' : "") + '</td>' +
      '<td class="date-cell">' + (jobStartDate(j) ? fmtDate(jobStartDate(j)) : "—") + '</td>' +
      '<td>' + (i ? '<a class="ref-link" href="#/doc/' + encodeURIComponent(i.id) + '">' + escapeHtml(i.number) + '</a>' : "—") + '</td>' +
      '<td class="date-cell">' + (i ? histDate(i, "date") : "—") + '</td>' +
      '<td class="date-cell">' + (i ? histDate(i, "due") : "—") + '</td>' +
      '<td class="num">' + (i ? money(docTotals(i).gross) : "—") + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="date-cell">' + (i && i.status === "paid" ? histDate(i, "paidDate") : "—") + '</td></tr>';
  }).join("");
  return '<div class="card log-table-wrap hist-card"><div class="cap-head"><span class="cap-title">Job &amp; invoice history</span><span class="lr-sub">' + icon("pencil") + ' Click any date to edit</span></div>' +
    '<div class="table-scroll"><table class="log-table hist-table"><thead><tr>' + th("ref", "Job ref") + th("job", "Job") + th("jobDate", "Job date") + th("invoice", "Invoice") +
      th("invDate", "Inv date") + th("due", "Due date") + th("amount", "Amount", "num") + th("status", "Status") + th("paid", "Date paid") + '</tr></thead><tbody>' +
    (body || '<tr><td colspan="9" class="list-empty">No jobs for this client yet.</td></tr>') + '</tbody></table></div></div>';
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
  { key: "active", label: "Invoices", test: function (i) { return i.kind === "invoice" && i.status !== "void"; } },
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
  var settled = liveInvoices().filter(function (i) { return i.status === "paid"; });
  var owing = liveInvoices().filter(function (i) { return i.status === "sent"; }), overdue = owing.filter(isOverdue);
  var y = currentTaxYear(), paidYear = sumGross(settled.filter(function (i) { return inTaxYear(i.paidDate || i.date, y); }));
  var chips = '<div class="chips">' + INV_FILTERS.map(function (x) {
    return '<button class="chip' + (x.key === f.key ? " active" : "") + '" data-action="inv-filter" data-id="' + x.key + '">' + x.label + ' <span>' + all.filter(x.test).length + '</span></button>';
  }).join("") + '</div>';
  var rows = list.map(function (i) {
    var jobs = docJobs(i), isInv = i.kind === "invoice";
    var cls = i.status === "paid" || i.status === "accepted" ? "ds-paid" : isOverdue(i) ? "ds-overdue" : "ds-" + i.status;
    var act = btn("View", "open-doc", { id: i.id, cls: "btn-sm btn-dark" });
    if (isInv && i.status === "draft") act += btn("Mark Sent", "doc-sent", { id: i.id, cls: "btn-sm btn-amber" });
    if (isInv && i.status === "sent") act += btn("Mark Paid", "doc-paid", { id: i.id, cls: "btn-sm btn-amber" });
    if (isInv && i.status === "paid") act += btn("Mark Unpaid", "doc-unpaid", { id: i.id, cls: "btn-sm btn-amber" });
    if (i.projectId && projectById(i.projectId)) act += btn("Project", "open-project-client", { id: i.projectId, cls: "btn-sm" });
    else if (jobs.length === 1) act += btn("Job", "open-job", { id: jobs[0].id, cls: "btn-sm" });
    return '<tr>' +
      '<td><a class="ref-link" href="#/doc/' + encodeURIComponent(i.id) + '">' + escapeHtml(i.number) + '</a>' + (isInv ? "" : '<div class="lr-sub">Quote</div>') + '</td>' +
      '<td><div class="inv-title">' + escapeHtml(i.title || (jobs[0] && jobs[0].title) || "—") + '</div><div class="inv-client">' + escapeHtml(i.client.name || "") + '</div>' +
        '<div class="lr-sub">' + fmtDate(i.date) + (isInv && i.status !== "paid" && i.status !== "void" ? " · due " + fmtDate(i.due) : "") + (i.status === "paid" && i.paidDate ? " · paid " + fmtDate(i.paidDate) : "") + '</div></td>' +
      '<td><span class="tag ' + cls + '">' + escapeHtml(invoiceStatusText(i)) + '</span></td>' +
      '<td class="num inv-total">' + money(docTotals(i).gross) + '</td>' +
      '<td class="inv-actions"><div class="btn-row nowrap">' + act + '</div></td></tr>';
  }).join("");
  return '<div class="stat-grid fin-stats">' +
      stat("Settled income", money(sumGross(settled)), money(paidYear) + " this tax year (" + taxYearLabel(y) + ")", "good") +
      stat("Accounts receivable", money(sumGross(owing)), overdue.length ? money(sumGross(overdue)) + " overdue" : owing.length ? "Nothing overdue" : "Nothing owed", overdue.length ? "warn" : "info") +
    '</div>' +
    '<div class="card log-table-wrap inv-card"><div class="cap-head inv-head"><div><div class="inv-card-title">' + escapeHtml(f.key === "active" ? "Invoices" : f.label) + '</div><div class="lr-sub">' + (f.key === "active" ? "Active invoices shown by default" : list.length + " shown") + '</div></div>' + chips + '</div>' +
    '<div class="table-scroll"><table class="log-table inv-table"><thead><tr><th>Doc ref</th><th>Project / description</th><th>Status</th><th class="num">Total</th><th class="inv-actions">Actions</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5" class="list-empty">Nothing here.</td></tr>') + '</tbody></table></div></div>';
}
function sumGross(list) { return round2(list.reduce(function (s, i) { return s + docTotals(i).gross; }, 0)); }

/* ---------- Single quote / invoice ---------- */
function renderDocPage(id) {
  var d = byId(state.data.invoices, id);
  if (!d) return emptyBlock("Not found", "This quote or invoice may have been deleted on another device.", '<a class="btn" href="#/invoices">Back</a>');
  var isInv = d.kind === "invoice", draft = d.status === "draft";
  var job = jobById(d.jobId), proj = d.projectId ? projectById(d.projectId) : null;
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
        field("Terms / notes at the bottom", bound("doc", d.id, "terms", d.terms, { type: "textarea", rows: d.terms && d.terms.length > 200 ? 8 : 3, rerender: true, placeholder: "Leave blank for none" }) +
          (state.data.settings.termsText && d.terms !== state.data.settings.termsText ?
            '<div class="btn-row terms-btns">' + btn("Use terms from Settings", "doc-terms-template", { id: d.id, cls: "btn-sm" }) + '</div>' : ""), "full") +
      '</div>' +
      '<div class="log-table-wrap"><table class="log-table items-table"><thead><tr><th>Description</th><th class="qty-cell">Qty</th><th class="price-cell">Price</th><th class="actions-col"></th></tr></thead><tbody>' + items + '</tbody></table></div>' +
      '<div class="btn-row items-actions">' + btn("＋ Add line", "doc-item-add", { id: d.id, cls: "btn-sm" }) + '</div></div>';
  }

  var back = job ? ["#/jobs/" + encodeURIComponent(job.id), job.title || "Job"] : proj ? ["#/clients/" + encodeURIComponent(proj.clientId), proj.name] : ["#/invoices", "Quotes & Invoices"];
  // Sent / paid invoices: the dates can still be changed.
  if (!draft && d.status !== "void") {
    editor = '<div class="card job-card no-print dates-card"><div class="settings-title">Dates</div><div class="form-grid">' +
      field(isInv ? "Invoice date" : "Quote date", bound("doc", d.id, "date", d.date, { type: "date", rerender: true })) +
      field(isInv ? "Due date" : "Valid until", bound("doc", d.id, "due", d.due, { type: "date", rerender: true })) +
      (d.status === "paid" ? field("Date paid", bound("doc", d.id, "paidDate", d.paidDate, { type: "date", rerender: true })) : "") +
    '</div><div class="lr-sub">Press Save after changing a date. If you\'ve already sent it, send the client the updated PDF.</div></div>';
  }
  return '<div class="page-head no-print"><a class="back-link" href="' + back[0] + '">← ' + escapeHtml(back[1]) + '</a>' +
      '<h1 class="page-title">' + (isInv ? "Invoice " : "Quote ") + escapeHtml(d.number) + '</h1>' + docStatusTag(d) +
      (d.status === "paid" ? '<span class="lr-sub">Paid ' + fmtDate(d.paidDate) + '</span>' : "") + '</div>' +
    '<div class="btn-row doc-actions no-print">' + actions.join("") + '</div>' +
    editor + renderDocSheet(d, t);
}

/* The on-screen preview. Laid out the same way as the downloaded PDF
   (pdf.js), so what you see is what the client gets. */
function renderDocSheet(d, t) {
  var s = state.data.settings, isInv = d.kind === "invoice";
  var from = [s.yourName && s.businessName ? s.yourName : ""].concat(String(s.address || "").split("\n"), [s.phone, s.email, s.website])
    .map(function (x) { return (x || "").trim(); }).filter(Boolean);
  var meta = [[isInv ? "Invoice Date" : "Quote Date", fmtDate(d.date)], [isInv ? "Due Date" : "Valid Until", fmtDate(d.due)]];
  if (d.client.supplierRef) meta.push(["Supplier Ref", d.client.supplierRef]);
  if (s.vatRegistered && s.vatNumber) meta.push(["VAT No.", s.vatNumber]);
  var hasJob = !!(d.title || d.venue || d.jobDates || d.po);
  var lines = d.items.map(function (it) {
    return '<tr><td>' + escapeHtml(it.desc) + '</td><td class="num">' + escapeHtml(String(num(it.qty))) + '</td><td class="num">' + money(it.price) + '</td><td class="num">' + money(lineNet(it)) + '</td></tr>';
  }).join("");
  var bankCols = [["Account Name", s.accountName], ["Account Number", s.accountNumber], ["Sort Code", s.sortCode], ["Reference", d.number]].filter(function (c) { return c[1]; });
  var bank = (isInv || s.showBankOnQuotes) && (s.accountNumber || s.sortCode) ?
    '<div class="ds-shade"><div class="ds-h">Payment Details' + (s.bankName ? " · " + escapeHtml(s.bankName) : "") + '</div><div class="ds-bank">' +
      bankCols.map(function (c) { return '<div><div class="ds-h">' + c[0] + '</div><div class="ds-v">' + escapeHtml(c[1]) + '</div></div>'; }).join("") + '</div></div>' : "";
  var terms = String(d.terms || "").replace(/\{days\}/g, String(d.termsDays || s.paymentTerms)).trim();
  var termsHtml = terms ? '<div class="ds-shade ds-terms"><div class="ds-h ds-h-lg">' + (isInv ? "Payment Terms &amp; Conditions" : "Terms &amp; Conditions") + '</div>' +
    terms.split("\n").map(function (p) {
      p = p.trim();
      if (!p) return '<div class="ds-gap"></div>';
      return '<div class="' + (isTermsHeading(p) ? "ds-th" : "ds-tp") + '">' + escapeHtml(p) + '</div>';
    }).join("") + '</div>' : "";
  return '<div class="doc-sheet">' +
    '<div class="ds-top">' +
      '<div class="ds-from">' + (s.logo ? '<img class="ds-logo" src="' + attr(s.logo) + '" alt="">' : "") +
        '<div><div class="ds-h">From</div><div class="ds-biz">' + escapeHtml(s.businessName || s.yourName || "Your business name") + '</div>' +
        '<div class="ds-dim pre">' + escapeHtml(from.join("\n")) + '</div></div></div>' +
      '<div class="ds-title"><div class="ds-kind">' + (isInv ? "INVOICE" : "QUOTE") + '</div><div class="ds-no">' + escapeHtml(d.number) + '</div>' +
        meta.map(function (m) { return '<div class="ds-meta"><div class="ds-h">' + m[0] + '</div><div class="ds-v ds-v-lg">' + escapeHtml(m[1]) + '</div></div>'; }).join("") + '</div>' +
    '</div>' +
    '<div class="ds-boxes' + (hasJob ? "" : " one") + '">' +
      '<div class="ds-box"><div class="ds-h">' + (isInv ? "Bill To" : "Prepared For") + '</div>' +
        '<div class="ds-client">' + escapeHtml(d.client.name || "") + '</div>' +
        (d.client.email ? '<div class="ds-email">' + escapeHtml(d.client.email) + '</div>' : "") +
        '<div class="pre">' + escapeHtml(String(d.client.address || "").trim()) + '</div>' +
        (d.client.contact ? '<div class="ds-dim">Attn: ' + escapeHtml(d.client.contact) + '</div>' : "") + '</div>' +
      (hasJob ? '<div class="ds-box"><div class="ds-h">Job Details</div>' +
        (d.title ? '<div class="ds-job">' + escapeHtml(d.title) + '</div>' : "") +
        (d.venue ? '<div class="ds-venue">' + escapeHtml(d.venue) + '</div>' : "") +
        (d.jobDates ? '<div class="ds-dates">' + escapeHtml(d.jobDates) + '</div>' : "") +
        (d.po ? '<div class="ds-dates">PO: ' + escapeHtml(d.po) + '</div>' : "") + '</div>' : "") +
    '</div>' +
    (d.summary ? '<div class="ds-summary pre">' + escapeHtml(d.summary) + '</div>' : "") +
    '<div class="ds-h">Line Items</div>' +
    '<div class="ds-table"><table class="ds-lines"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead><tbody>' + lines + '</tbody></table></div>' +
    '<div class="ds-totals">' +
      '<div class="ds-trow"><span>Subtotal</span><b>' + money(t.net) + '</b></div>' +
      (d.vatRate ? '<div class="ds-trow"><span>VAT @ ' + num(d.vatRate) + '%</span><b>' + money(t.vat) + '</b></div>' : "") +
      '<div class="ds-grand"><span>' + (isInv ? "Total Payable" : "Quote Total") + '</span><b>' + money(t.gross) + '</b></div>' +
    '</div>' +
    bank + termsHtml +
  '</div>';
}
