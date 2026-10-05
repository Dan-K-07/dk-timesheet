"use strict";

/* =====================================================================
   DK Jobs - expenses: the Add / Edit Expense popup (with receipt upload),
   viewing receipts, subscriptions that log themselves, and
   downloading all receipts as a zip.
   ===================================================================== */

/* ---------- Receipt files ---------- */
// Photos are shrunk to a sensible size (and iPhone HEIC turned into JPEG)
// before upload: quicker to upload, and still easy to read.
function prepareReceiptFile(file) {
  if (!/^image\//.test(file.type) || /gif$/.test(file.type)) return Promise.resolve(file);
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 2000, scale = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) {
        resolve(b ? new File([b], String(file.name || "receipt").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file);
      }, "image/jpeg", 0.85);
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
function receiptSignedUrl(path) {
  return sbClient.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 600).then(function (r) { if (r.error) throw r.error; return r.data.signedUrl; });
}
// Shows a receipt inside the app (PDF or photo), with a button to open it in its own tab.
function viewReceipt(e) {
  if (!e.receiptPath && !e.receiptUrl) return;
  if (e.receiptPath && !state.user) { toast("You need a connection to view receipts."); return; }
  var isPdf = /\.pdf($|\?)/i.test(e.receiptPath || e.receiptUrl);
  var urlP = e.receiptPath ? receiptSignedUrl(e.receiptPath) : Promise.resolve(e.receiptUrl);
  showModal({
    title: (e.merchant || "Receipt") + (e.date ? " · " + fmtDate(e.date) : ""),
    body: '<div class="receipt-view" id="receiptView"><div class="lr-sub">Loading…</div></div>',
    buttons: [
      { label: "Open in new tab ↗", cls: "modal-neutral", run: function () { urlP.then(function (u) { window.open(u, "_blank", "noopener"); }); return false; } },
      { label: "Close", cls: "modal-primary" }
    ]
  });
  urlP.then(function (u) {
    var box = document.getElementById("receiptView"); if (!box) return;
    box.innerHTML = isPdf ? '<iframe src="' + attr(u) + '" title="Receipt"></iframe>' : '<img src="' + attr(u) + '" alt="Receipt">';
  }).catch(function (err) {
    var box = document.getElementById("receiptView"); if (box) box.innerHTML = '<div class="lr-sub">Couldn\'t open the receipt (' + escapeHtml(errMessage(err)) + ').</div>';
  });
}

/* ---------- The Add / Edit Expense popup ---------- */
function openExpense(e, opts) {
  opts = opts || {};
  var editing = !!e, s = state.data.settings;
  var j = !editing && opts.jobId ? jobById(opts.jobId) : null;
  e = e || { id: uid("e"), date: todayIso(), category: "Other", jobId: opts.jobId || "", billable: false };
  // What the popup is holding: receipt uploaded so far, a file waiting for a connection, etc.
  var R = { id: e.id, path: e.receiptPath || "", url: e.receiptUrl || "", newPath: "", file: null, removed: false, status: "" };
  var cats = s.expenseCategories.map(function (c) { return c.name; });
  if (e.category && cats.indexOf(e.category) === -1) cats.push(e.category);
  var opt = function (list, val) { return list.map(function (o) { var v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o; return '<option value="' + attr(v) + '"' + (String(v) === String(val || "") ? " selected" : "") + '>' + escapeHtml(l) + '</option>'; }).join(""); };
  showModal({
    title: editing ? "Edit Expense" : "Add Expense",
    body: '<div class="modal-form exp-form" id="expModal">' +
      '<div class="field"><label>Receipt (optional)</label><div id="rcptBox"></div>' +
        '<input type="file" id="rcptFile" accept="image/*,application/pdf" hidden></div>' +
      '<div class="j-grid3">' +
        field("Date", '<input type="date" class="field-input" id="xDate" value="' + attr(e.date) + '">') +
        field("Merchant / supplier", '<input class="field-input" id="xMerchant" value="' + attr(e.merchant) + '" placeholder="e.g. Screwfix" list="merchantList">') +
        field("Total (GBP)", '<input class="field-input" id="xAmount" inputmode="decimal" value="' + attr(e.amount) + '" placeholder="0.00">' +
          '<div class="lr-sub hint">Use a minus amount for a refund or credit.</div>') +
      '</div>' +
      '<div class="j-grid3">' +
        field("Category", '<select class="field-input" id="xCategory">' + opt(cats, e.category) + '</select>') +
        field("Description", '<input class="field-input" id="xDesc" value="' + attr(e.desc) + '" placeholder="What was it for?">') +
        field("Link to job (optional)", '<select class="field-input" id="xJob">' + opt(jobOptions("No job"), e.jobId) + '</select>') +
      '</div>' +
      (vatOn() ? '<div class="j-grid3">' + field("VAT included (£)", '<input class="field-input" id="xVat" inputmode="decimal" value="' + attr(e.vat) + '" placeholder="0.00">') + '</div>' : "") +
      field("Notes", '<input class="field-input" id="xNotes" value="' + attr(e.notes) + '" placeholder="Any additional notes…">') +
      '<label class="toggle-row"><input type="checkbox" id="xBillable"' + (e.billable ? " checked" : "") + '><span class="toggle"></span>' +
        '<span><b>Billable to client</b><span class="lr-sub" id="xBillHint"></span></span></label>' +
      (e.invoiceId ? '<div class="import-note">This expense is on an invoice, so the amount is fixed there.</div>' : "") +
      '<datalist id="merchantList">' + uniqueValues(state.data.expenses, "merchant").map(function (m) { return '<option value="' + attr(m) + '">'; }).join("") + '</datalist>' +
    '</div>',
    focus: editing ? "#xAmount" : "#xMerchant",
    onDismiss: function () { dropUnsavedReceipt(R); },
    buttons: [
      { label: icon("save") + (editing ? " Update Expense" : " Save Expense"), cls: "modal-primary", run: function () { return saveExpenseModal(e, editing, R, false); } },
    ].concat(editing ? [] : [{ label: "Save &amp; add another", cls: "modal-neutral", run: function () { return saveExpenseModal(e, editing, R, true); } }])
     .concat([{ label: "Cancel", cls: "modal-neutral", run: function () { dropUnsavedReceipt(R); } }])
  });
  var $ = function (id) { return document.getElementById(id); };
  function billHint() { $("xBillHint").textContent = $("xBillable").checked ? "Added to the job's next invoice" : "Tracked for your records only — not put on an invoice"; }
  $("xBillable").addEventListener("change", billHint); billHint();
  function paintReceipt() {
    var box = $("rcptBox"); if (!box) return;
    var has = (R.newPath || R.file || ((R.path || R.url) && !R.removed));
    if (R.status === "uploading") {
      box.innerHTML = '<div class="rcpt-box busy">' + icon("refresh", "spin-ico") + ' Uploading…</div>';
      return;
    }
    if (!has) {
      box.innerHTML = '<button type="button" class="rcpt-drop" id="rcptPick">' + icon("camera") + ' Upload Receipt / Photo</button>';
      $("rcptPick").addEventListener("click", function () { $("rcptFile").click(); });
      return;
    }
    var note = R.file ? '<span class="lr-sub">Saved with the expense when you\'re back online</span>' : "";
    box.innerHTML = '<div class="rcpt-box">' + icon("file") + '<div><b>' + (R.file ? "Receipt attached" : "Receipt uploaded") + '</b>' +
      '<div class="rcpt-links">' + (R.file ? "" : '<button type="button" class="link-add" id="rcptView">View →</button>') + note + '</div></div>' +
      '<button type="button" class="icon-only" id="rcptRemove" title="Remove receipt">✕</button></div>';
    if ($("rcptView")) $("rcptView").addEventListener("click", function () {
      var p = R.newPath || R.path;
      (p ? receiptSignedUrl(p) : Promise.resolve(R.url)).then(function (u) { window.open(u, "_blank", "noopener"); });
    });
    $("rcptRemove").addEventListener("click", function () {
      if (R.newPath) { deleteReceipt(R.newPath); R.newPath = ""; }
      R.file = null; R.removed = true; R.status = ""; paintReceipt();
    });
  }
  $("rcptFile").addEventListener("change", async function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    if (R.newPath) { deleteReceipt(R.newPath); R.newPath = ""; }
    var file = await prepareReceiptFile(f);
    if (!state.user) { R.file = file; R.removed = false; R.status = ""; paintReceipt(); return; }
    R.status = "uploading"; paintReceipt();
    try { R.newPath = await uploadReceipt(file, R.id); R.removed = false; R.status = ""; }
    catch (err) { R.status = ""; R.file = file; toast("Upload failed (" + errMessage(err) + ") — it'll be tried again when you save."); }
    if ($("rcptBox")) paintReceipt();
  });
  paintReceipt();
}
function dropUnsavedReceipt(R) { if (R.newPath) { deleteReceipt(R.newPath); R.newPath = ""; } }
async function saveExpenseModal(e, editing, R, another) {
  var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
  var amount = round2(num(g("xAmount")));
  if (!g("xDate")) { toast("Add the date."); return false; }
  if (!g("xMerchant")) { toast("Add the merchant or supplier."); document.getElementById("xMerchant").focus(); return false; }
  if (!amount) { toast("Add the total."); document.getElementById("xAmount").focus(); return false; }
  if (e.invoiceId && round2(num(e.amount)) !== amount) { toast("This expense is on an invoice — the amount can't change."); return false; }
  if (R.status === "uploading") { toast("Hang on — the receipt is still uploading."); return false; }
  if (R.file) {
    try { R.newPath = await uploadReceipt(R.file, R.id); R.file = null; }
    catch (err) { toast("The receipt couldn't be uploaded (" + errMessage(err) + "). Save without it, or try again when you're online."); return false; }
  }
  Object.assign(e, {
    date: g("xDate"), merchant: g("xMerchant"), amount: amount, category: g("xCategory"), desc: g("xDesc"), jobId: g("xJob"),
    notes: g("xNotes"), billable: document.getElementById("xBillable").checked,
    vat: vatOn() ? round2(num(g("xVat"))) : (e.vat || 0)
  });
  if (R.newPath) { if (e.receiptPath) deleteReceipt(e.receiptPath); e.receiptPath = R.newPath; delete e.receiptUrl; }
  else if (R.removed) { if (e.receiptPath) deleteReceipt(e.receiptPath); e.receiptPath = ""; delete e.receiptUrl; }
  if (!editing) { e.created = new Date().toISOString(); state.data.expenses.push(e); }
  save(); render(); toast(editing ? "Expense updated." : "Expense saved.");
  if (another) setTimeout(function () { openExpense(null, { jobId: e.jobId }); }, 0);
}

/* ---------- Subscriptions: regular costs that log themselves ---------- */
function subNextDates(sub, upTo) {
  var out = [], start = sub.start; if (!start) return out;
  var p = start.split("-").map(Number), y = p[0], m = p[1], d = p[2], step = sub.frequency === "annual" ? 12 : 1;
  for (var i = 0; i < 600; i++) {
    var mm = m + i * step, yy = y + Math.floor((mm - 1) / 12), mo = ((mm - 1) % 12) + 1;
    var last = new Date(yy, mo, 0).getDate(), iso = yy + "-" + pad2(mo) + "-" + pad2(Math.min(d, last));
    if (iso > upTo || (sub.end && iso > sub.end)) break;
    out.push(iso);
  }
  return out;
}
function subNext(sub) {
  var all = subNextDates(sub, "9999-12-31").filter(function (dt) { return dt > todayIso(); });
  return sub.end && (!all[0] || all[0] > sub.end) ? "" : all[0] || "";
}
// Adds any payments that are due (including ones back to the start date).
function applySubscriptions() {
  var subs = state.data.subscriptions || [], today = todayIso(), added = 0;
  if (!subs.length) return 0;
  var have = {}; state.data.expenses.forEach(function (e) { if (e.subId) have[e.subId + "|" + e.date] = true; });
  subs.forEach(function (sub) {
    subNextDates(sub, today).forEach(function (dt) {
      if (have[sub.id + "|" + dt]) return;
      state.data.expenses.push({ id: uid("e"), created: new Date().toISOString(), subId: sub.id, date: dt, merchant: sub.name,
        desc: sub.name + " (" + (sub.frequency === "annual" ? "annual" : "monthly") + " subscription)", category: sub.category || "Software",
        amount: round2(num(sub.amount)), vat: 0, jobId: "", billable: false, receiptPath: "" });
      have[sub.id + "|" + dt] = true; added++;
    });
  });
  return added;
}
// Run when the app has its data. Only saves straight away if you're not mid-edit.
function runSubscriptions() {
  if (hasChanges()) return;
  var n = applySubscriptions();
  if (n) { save(); render(); toast(n + " subscription payment" + (n === 1 ? "" : "s") + " logged."); }
}
function openSubscription(sub) {
  var editing = !!sub, s = state.data.settings;
  sub = sub || { name: "", amount: "", frequency: "monthly", category: "Software", start: todayIso() };
  var cats = s.expenseCategories.map(function (c) { return c.name; });
  showModal({
    title: editing ? "Edit Subscription" : "Add Subscription",
    body: '<div class="modal-form exp-form">' +
      field("Subscription name", '<input class="field-input" id="sName" value="' + attr(sub.name) + '" placeholder="e.g. Adobe Creative Cloud">') +
      '<div class="j-grid2">' +
        field("Amount (£)", '<input class="field-input" id="sAmount" inputmode="decimal" value="' + attr(sub.amount) + '" placeholder="0.00">') +
        field("Frequency", '<select class="field-input" id="sFreq"><option value="monthly"' + (sub.frequency !== "annual" ? " selected" : "") + '>Monthly</option><option value="annual"' + (sub.frequency === "annual" ? " selected" : "") + '>Annual</option></select>') +
      '</div>' +
      field("Category", '<select class="field-input" id="sCat">' + cats.map(function (c) { return '<option' + (c === sub.category ? " selected" : "") + '>' + escapeHtml(c) + '</option>'; }).join("") + '</select>') +
      field("Start date", '<input type="date" class="field-input" id="sStart" value="' + attr(sub.start) + '"' + (editing ? " disabled" : "") + '>') +
      '<div class="lr-sub">' + (editing ? "Changes apply to payments from now on — ones already logged stay as they are." : "Set this to when it started — past payments are added automatically.") + '</div>' +
    '</div>',
    focus: "#sName",
    buttons: [
      { label: editing ? "Save Changes" : "Add Subscription", cls: "modal-primary", run: function () {
        var g = function (id) { return document.getElementById(id).value.trim(); };
        if (!g("sName")) { toast("Give it a name."); return false; }
        if (!num(g("sAmount"))) { toast("Add the amount."); return false; }
        if (!g("sStart")) { toast("Add the start date."); return false; }
        var target = editing ? sub : { id: uid("s"), created: new Date().toISOString() };
        Object.assign(target, { name: g("sName"), amount: round2(num(g("sAmount"))), frequency: g("sFreq"), category: g("sCat") });
        if (!editing) { target.start = g("sStart"); state.data.subscriptions = state.data.subscriptions || []; state.data.subscriptions.push(target); state.subsOpen = true; }
        var n = applySubscriptions(); save(); render();
        toast(editing ? "Subscription updated." : "Subscription added" + (n ? " — " + n + " past payment" + (n === 1 ? "" : "s") + " logged." : "."));
      } },
      { label: "Cancel", cls: "modal-neutral" }
    ]
  });
}
function subMonthly(sub) { return sub.frequency === "annual" ? 0 : num(sub.amount); }
function subActive(sub) { return !sub.end || sub.end >= todayIso(); }

/* ---------- Download receipts as a zip ---------- */
async function exportReceiptsZip(list, name) {
  var withReceipts = list.filter(function (e) { return e.receiptPath || e.receiptUrl; });
  if (!withReceipts.length) { toast("No receipts to download for these expenses."); return; }
  if (!window.JSZip) { toast("Couldn't load the zip maker."); return; }
  if (!state.user) { toast("You need a connection to download receipts."); return; }
  var zip = new window.JSZip(), used = {}, failed = 0;
  for (var i = 0; i < withReceipts.length; i++) {
    var e = withReceipts[i];
    toast("Collecting receipts… " + (i + 1) + " of " + withReceipts.length);
    try {
      var url = e.receiptPath ? await receiptSignedUrl(e.receiptPath) : e.receiptUrl;
      var res = await fetch(url); if (!res.ok) throw new Error("HTTP " + res.status);
      var blob = await res.blob();
      var ext = ((e.receiptPath || e.receiptUrl).split("?")[0].match(/\.([a-z0-9]{2,4})$/i) || [, blob.type === "application/pdf" ? "pdf" : "jpg"])[1].toLowerCase();
      var base = (e.date + "-" + (e.merchant || "receipt")).replace(/[^a-zA-Z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 70).toLowerCase();
      var fname = base + "." + ext, k = 2;
      while (used[fname]) fname = base + "-" + (k++) + "." + ext;
      used[fname] = true;
      zip.file(fname, blob);
    } catch (err) { failed++; }
  }
  var out = await zip.generateAsync({ type: "blob" });
  var a = document.createElement("a"), href = URL.createObjectURL(out);
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(href); }, 60000);
  toast((withReceipts.length - failed) + " receipt" + (withReceipts.length - failed === 1 ? "" : "s") + " saved to " + name + (failed ? " · " + failed + " couldn't be downloaded" : "") + ".");
}
