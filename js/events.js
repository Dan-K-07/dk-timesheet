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
    if (confirm("Log out? You'll need your email and password to get back in on this device.")) logout();
  });

  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () { state.tab = btn.getAttribute("data-tab"); render(); });
  });
  attachSettingsEvents();
  attachExpenseEvents();

  bindIf("addBtn", "click", function () { state.adding = true; state.editingId = null; render(); scrollToForm(); });
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
      render();
    });
  });
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
