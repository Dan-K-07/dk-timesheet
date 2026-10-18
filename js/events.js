"use strict";

/* ============ Events ============ */
function attachGateEvents() {
  var form = document.getElementById("authForm");
  var val = function (id) { var el = document.getElementById(id); return el ? el.value : ""; };
  if (form) {
    var first = form.querySelector("input");
    if (first) first.focus();
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (state.authBusy) return;
      var mode = form.getAttribute("data-mode");
      if (mode === "forgot") sendPasswordReset(val("authEmail"));
      else if (mode === "reset") setNewPassword(val("authNewPassword"), val("authConfirmPassword"));
      else signIn(val("authEmail"), val("authPassword"));
    });
  }
  bindIf("authForgot", "click", function () {
    state.authMode = "forgot"; state.authError = ""; state.authInfo = ""; render();
  });
  bindIf("authBack", "click", function () {
    state.authMode = "login"; state.authError = ""; state.authInfo = "";
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    render();
  });
}

function attachEvents() {
  var themeBtn = document.getElementById("themeToggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  bindIf("logoutBtn", "click", function () {
    var msg = "Log out? You'll need your email and password to get back in on this device.";
    if (hasUnsynced()) msg += "\n\nThis device has changes that haven't synced yet. They're kept here and will be sent the next time you log in on this device.";
    if (confirm(msg)) logout();
  });

  document.querySelectorAll("[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () { state.tab = btn.getAttribute("data-tab"); state.navOpen = false; render(); window.scrollTo(0, 0); });
  });
  bindIf("navOpenBtn", "click", function () { state.navOpen = true; render(); });
  bindIf("navScrim", "click", function () { state.navOpen = false; render(); });
  attachSettingsEvents();
  attachExpenseEvents();

  bindIf("addBtn", "click", function () { state.adding = true; state.editingId = null; state.copyingId = null; render(); scrollToForm(); });
  bindIf("emptyAdd", "click", function () { state.tab = "log"; state.adding = true; render(); scrollToForm(); });
  bindIf("emptyImport", "click", function () { document.getElementById("fileInput").click(); });
  bindIf("importBtn", "click", function () { document.getElementById("fileInput").click(); });
  bindIf("exportCsvBtn", "click", exportCSV);
  bindIf("exportXlsxBtn", "click", exportXLSX);
  bindIf("sortBtn", "click", function () { state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; render(); });
  bindIf("filterMonth", "change", function (ev) { state.filterMonth = ev.target.value; render(); });
  bindIf("filterType", "change", function (ev) { state.filterType = ev.target.value; render(); });
  bindIf("cancelEntry", "click", function () { state.adding = false; state.editingId = null; render(); });

  bindIf("sumFrom", "change", function (ev) { state.summaryFrom = ev.target.value; render(); });
  bindIf("sumTo", "change", function (ev) { state.summaryTo = ev.target.value; render(); });
  bindIf("sumClear", "click", function () { state.summaryFrom = ""; state.summaryTo = ""; render(); });
  document.querySelectorAll("[data-preset]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyPreset(btn.getAttribute("data-preset")); });
  });

  var saveBtn = document.getElementById("saveEntry");
  if (saveBtn) saveBtn.addEventListener("click", function () {
    var vals = readFormValues();
    if (!vals.date) { toast("Pick a date before saving."); return; }
    var existingId = saveBtn.getAttribute("data-existing-id");
    if (vals.rate !== "") saveRate(vals.rate);
    if (existingId) {
      var idx = state.entries.findIndex(function (x) { return x.id === existingId; });
      if (idx !== -1) state.entries[idx] = Object.assign({}, state.entries[idx], vals);
      state.editingId = null;
    } else {
      vals.id = uid();
      state.entries.push(vals);
      state.adding = false;
    }
    save();
    render();
    toast("Saved.");
  });

  ["f_date","f_start","f_end","f_break","f_rate","f_type"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", updatePreview);
    el.addEventListener("change", updatePreview);
  });

  document.querySelectorAll("[data-edit]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.editingId = btn.getAttribute("data-edit");
      state.adding = false;
      state.copyingId = null;
      render();
    });
  });
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () { openCopy(btn.getAttribute("data-copy")); });
  });
  bindIf("bulkCopy", "click", function () { var ids = Object.keys(state.selectedIds); if (ids.length === 1) openCopy(ids[0]); });
  attachCopyEvents();

  document.querySelectorAll("[data-delete]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-delete");
      if (!confirm("Delete this entry? This can't be undone.")) return;
      state.entries = state.entries.filter(function (x) { return x.id !== id; });
      delete state.selectedIds[id];
      save();
      render();
      toast("Entry deleted.");
    });
  });

  bindIf("selectAllChk", "change", function (ev) {
    var visible = filteredEntries();
    if (ev.target.checked) visible.forEach(function (e) { state.selectedIds[e.id] = true; });
    else visible.forEach(function (e) { delete state.selectedIds[e.id]; });
    render();
  });
  document.querySelectorAll(".row-check").forEach(function (chk) {
    chk.addEventListener("change", function () {
      toggleSelected(chk.getAttribute("data-id"));
      render();
    });
  });
  bindIf("bulkClear", "click", function () { clearSelection(); render(); });
  bindIf("bulkDelete", "click", function () {
    var ids = Object.keys(state.selectedIds);
    if (!ids.length) return;
    if (!confirm("Delete " + ids.length + " selected entr" + (ids.length === 1 ? "y" : "ies") + "? This can't be undone.")) return;
    state.entries = state.entries.filter(function (e) { return !state.selectedIds[e.id]; });
    clearSelection();
    save();
    render();
    toast("Deleted " + ids.length + " entr" + (ids.length === 1 ? "y" : "ies") + ".");
  });
  document.querySelectorAll("[data-calc-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () { state.calcMode = btn.getAttribute("data-calc-mode"); render(); });
  });
  ["calcGross", "calcRegion", "calcPensionPct", "calcPensionMethod", "calcLoanPlan", "calcTaxCode"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var handler = function () { if (state.calcMode === "monthly") updateMonthlyResults(); else updateCalcResults(); };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
  bindIf("calcUseSummary", "click", function () {
    var total = summaryStats().totalPay;
    var grossInput = document.getElementById("calcGross");
    if (grossInput) grossInput.value = total.toFixed(2);
    updateCalcResults();
  });

  bindIf("docDateFilter", "change", function (ev) { state.docFilterDate = ev.target.value; render(); });
  bindIf("docUploadBtn", "click", function () {
    var fileInput = document.getElementById("docFile");
    var file = fileInput && fileInput.files[0];
    if (!file) { toast("Choose a file first."); return; }
    var date = document.getElementById("docDate").value;
    var label = document.getElementById("docLabel").value;
    uploadDocument(file, date, label);
  });
  document.querySelectorAll("[data-doc-delete]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-doc-delete");
      var doc = state.documents.filter(function (d) { return d.id === id; })[0];
      if (doc) deleteDocument(doc);
    });
  });
  document.querySelectorAll("[data-goto-docs]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.tab = "docs";
      state.docFilterDate = btn.getAttribute("data-goto-docs");
      render();
    });
  });

  bindIf("bulkEditToggle", "click", function () { state.bulkEditOpen = !state.bulkEditOpen; render(); });
  document.querySelectorAll(".bulk-field-on").forEach(function (chk) {
    chk.addEventListener("change", function () {
      var input = document.getElementById(chk.id.replace(/_on$/, ""));
      if (input) input.disabled = !chk.checked;
    });
  });
  bindIf("bulkApplyFields", "click", function () {
    var ids = Object.keys(state.selectedIds);
    if (!ids.length) return;

    var fieldMap = [
      { on: "bulkType_on", input: "bulkType", key: "type", transform: function (v) { return v === "__clear__" ? "" : v; } },
      { on: "bulkRate_on", input: "bulkRate", key: "rate" },
      { on: "bulkStart_on", input: "bulkStart", key: "start" },
      { on: "bulkEnd_on", input: "bulkEnd", key: "end" },
      { on: "bulkBreak_on", input: "bulkBreak", key: "breakHrs" },
      { on: "bulkNotes_on", input: "bulkNotes", key: "notes" }
    ];
    var changes = fieldMap.filter(function (f) {
      var onEl = document.getElementById(f.on);
      return onEl && onEl.checked;
    });
    if (!changes.length) { toast("Tick at least one field to change first."); return; }

    state.entries.forEach(function (e) {
      if (!state.selectedIds[e.id]) return;
      changes.forEach(function (f) {
        var raw = document.getElementById(f.input).value;
        e[f.key] = f.transform ? f.transform(raw) : raw;
      });
    });
    clearSelection();
    state.bulkEditOpen = false;
    save();
    render();
    toast("Updated " + changes.length + " field" + (changes.length === 1 ? "" : "s") + " on " + ids.length + " entr" + (ids.length === 1 ? "y" : "ies") + ".");
  });
}

/* ---------- Copy a shift to other days ---------- */
function openCopy(id) {
  state.copyingId = id; state.adding = false; state.editingId = null;
  render();
  setTimeout(function () {
    var f = document.getElementById("copyForm");
    if (f) f.scrollIntoView({ behavior: "smooth", block: "center" });
    var d = document.getElementById("c_from"); if (d) d.focus();
  }, 30);
}
// Works out which dates the copy will land on, from the panel's inputs.
function copyPlan() {
  var from = document.getElementById("c_from").value, to = document.getElementById("c_to").value;
  var skip = document.getElementById("c_skip").checked;
  var plan = { dates: [], skipped: [], error: "" };
  if (!from) { plan.error = "Pick the day to copy to."; return plan; }
  var dates = [from];
  if (to && to !== from) {
    if (to < from) { plan.error = "\u201cUntil\u201d is before the first day."; return plan; }
    var days = {};
    document.querySelectorAll(".copy-dow").forEach(function (c) { if (c.checked) days[c.value] = true; });
    dates = [];
    for (var d = from, n = 0; d <= to; d = addDaysIso(d, 1), n++) {
      if (n > 366) { plan.error = "That's more than a year \u2014 pick a shorter run of days."; return plan; }
      var dow = (new Date(d + "T00:00:00").getDay() + 6) % 7; // Mon = 0
      if (days[dow]) dates.push(d);
    }
  }
  var taken = {};
  state.entries.forEach(function (e) { if (e.date) taken[e.date] = true; });
  dates.forEach(function (d) { if (skip && taken[d]) plan.skipped.push(d); else plan.dates.push(d); });
  return plan;
}
function updateCopyPreview() {
  var box = document.getElementById("copyPreview"), btn = document.getElementById("copySave");
  if (!box) return;
  var to = document.getElementById("c_to").value, from = document.getElementById("c_from").value;
  document.getElementById("c_daysWrap").hidden = !(to && from && to > from);
  var plan = copyPlan(), n = plan.dates.length;
  var list = function (arr) {
    var shown = arr.slice(0, 8).map(fmtDate).join(", ");
    return shown + (arr.length > 8 ? " and " + (arr.length - 8) + " more" : "");
  };
  var html = plan.error ? escapeHtml(plan.error)
    : n ? "Adds <b>" + n + "</b> entr" + (n === 1 ? "y" : "ies") + ": " + escapeHtml(list(plan.dates))
    : "No days to add.";
  if (!plan.error && plan.skipped.length) html += "<br>Skipping " + plan.skipped.length + " day" + (plan.skipped.length === 1 ? "" : "s") + " that already " + (plan.skipped.length === 1 ? "has" : "have") + " an entry: " + escapeHtml(list(plan.skipped));
  box.innerHTML = html;
  btn.disabled = !!plan.error || !n;
  btn.textContent = n > 1 ? "Copy to " + n + " days" : "Copy";
}
function attachCopyEvents() {
  var form = document.getElementById("copyForm");
  if (!form) return;
  ["c_from", "c_to", "c_skip"].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener("input", updateCopyPreview);
    el.addEventListener("change", updateCopyPreview);
  });
  form.querySelectorAll(".copy-dow").forEach(function (c) { c.addEventListener("change", updateCopyPreview); });
  bindIf("copyCancel", "click", function () { state.copyingId = null; render(); });
  bindIf("copySave", "click", function () {
    var src = state.entries.filter(function (e) { return e.id === form.getAttribute("data-id"); })[0];
    var plan = copyPlan();
    if (!src || plan.error || !plan.dates.length) { toast(plan.error || "No days to add."); return; }
    var withNotes = document.getElementById("c_notes").checked;
    plan.dates.forEach(function (d) {
      state.entries.push({
        id: uid(), date: d, start: src.start || "", end: src.end || "", breakHrs: src.breakHrs === undefined ? "" : src.breakHrs,
        rate: src.rate === undefined ? "" : src.rate, type: src.type || "", notes: withNotes ? (src.notes || "") : ""
      });
    });
    state.copyingId = null;
    clearSelection();
    save();
    render();
    var n = plan.dates.length;
    toast(n === 1 ? "Copied to " + fmtDate(plan.dates[0]) + "." : "Copied to " + n + " days.");
  });
  updateCopyPreview();
}

function bindIf(id, evt, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}

function updatePreview() {
  var vals = readFormValues();
  var preview = document.getElementById("formPreview");
  if (preview) preview.innerHTML = formPreviewText(vals);
}

// Save the tax code to the account and update the hint + region lock in place.
function syncTaxCodeField() {
  var input = document.getElementById("calcTaxCode");
  if (!input) return;
  var raw = input.value.toUpperCase().replace(/[^A-Z0-9 \/]/g, "").slice(0, 12);
  if (raw !== (state.settings.taxCode || "")) saveSetting("taxCode", raw);
  var code = parseTaxCode(raw), hint = document.getElementById("taxCodeHint"), region = document.getElementById("calcRegion");
  if (hint) { hint.textContent = describeTaxCode(code); hint.className = "tax-code-hint" + (code && !code.valid ? " bad" : ""); }
  if (region) {
    var locked = !!(code && code.valid);
    region.disabled = locked;
    region.value = locked ? code.region : (state.calcRegion || "ew");
  }
}
function updateCalcResults() {
  syncTaxCodeField();
  var vals = {
    gross: parseFloat(document.getElementById("calcGross").value) || 0,
    region: document.getElementById("calcRegion").value,
    pensionPct: parseFloat(document.getElementById("calcPensionPct").value) || 0,
    pensionMethod: document.getElementById("calcPensionMethod").value,
    loanPlan: document.getElementById("calcLoanPlan").value,
    taxCode: state.settings.taxCode || ""
  };
  state.calcGross = vals.gross;
  if (!document.getElementById("calcRegion").disabled) state.calcRegion = vals.region;
  state.calcPensionPct = vals.pensionPct;
  state.calcPensionMethod = vals.pensionMethod;
  state.calcLoanPlan = vals.loanPlan;
  var pensionInput = document.getElementById("calcPensionPct");
  if (pensionInput) pensionInput.disabled = vals.pensionMethod === "none";
  var results = document.getElementById("calcResults");
  if (results) results.innerHTML = renderCalcResults(vals);
}

function updateMonthlyResults() {
  syncTaxCodeField();
  if (!document.getElementById("calcRegion").disabled) state.calcRegion = document.getElementById("calcRegion").value;
  state.calcPensionPct = parseFloat(document.getElementById("calcPensionPct").value) || 0;
  state.calcPensionMethod = document.getElementById("calcPensionMethod").value;
  state.calcLoanPlan = document.getElementById("calcLoanPlan").value;
  var pensionInput = document.getElementById("calcPensionPct");
  if (pensionInput) pensionInput.disabled = state.calcPensionMethod === "none";
  var container = document.getElementById("monthlyResults");
  if (container) container.innerHTML = renderMonthlyTables(readCalcState());
}

function scrollToForm() {
  setTimeout(function () {
    var f = document.getElementById("entryForm");
    if (f) f.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 30);
}

function isoDateFromParts(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function applyPreset(name) {
  var today = new Date();
  if (name === "all") {
    state.summaryFrom = ""; state.summaryTo = "";
  } else if (name === "year") {
    state.summaryFrom = today.getFullYear() + "-01-01"; state.summaryTo = "";
  } else if (name === "3m") {
    var d3 = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    state.summaryFrom = isoDateFromParts(d3); state.summaryTo = "";
  } else if (name === "month") {
    state.summaryFrom = today.getFullYear() + "-" + pad2(today.getMonth() + 1) + "-01"; state.summaryTo = "";
  }
  render();
}

function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  var next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  render();
}

/* ============ File import wiring ============ */
document.getElementById("fileInput").addEventListener("change", function (ev) {
  var file = ev.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      if (/\.csv$/i.test(file.name)) {
        var wb = XLSX.read(e.target.result, { type: "string" });
        importWorkbook(wb);
      } else {
        var data = new Uint8Array(e.target.result);
        var wb2 = XLSX.read(data, { type: "array" });
        importWorkbook(wb2);
      }
    } catch (err) {
      toast("Couldn't read that file: " + err.message);
    }
    ev.target.value = "";
  };
  if (/\.csv$/i.test(file.name)) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
});
