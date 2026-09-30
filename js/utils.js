"use strict";

/* ============ Utilities ============ */
function uid() { return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }

function toMinutes(hhmm) {
  if (!hhmm) return null;
  var parts = hhmm.split(":");
  if (parts.length < 2) return null;
  var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function computeHours(entry) {
  var s = toMinutes(entry.start), e = toMinutes(entry.end);
  if (s === null || e === null) return null;
  var diff = ((e - s) % 1440 + 1440) % 1440;
  return diff / 60;
}
function computeHoursWorked(entry) {
  var h = computeHours(entry);
  if (h === null) return null;
  var brk = parseFloat(entry.breakHrs);
  if (isNaN(brk)) brk = 0;
  return h - brk;
}
function computePay(entry) {
  var hw = computeHoursWorked(entry);
  var rate = parseFloat(entry.rate);
  if (hw === null || isNaN(rate)) return null;
  return hw * rate;
}

function fmtHours(n) { return n === null || isNaN(n) ? "\u2014" : n.toFixed(2).replace(/\.00$/, "") ; }
function fmtHoursFixed(n) { return n === null || isNaN(n) ? "\u2014" : n.toFixed(2); }
function fmtPay(n) { return n === null || isNaN(n) ? "\u2014" : "\u00A3" + n.toFixed(2); }
function fmtDate(iso) {
  if (!iso) return "\u2014";
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return dateFormatById(state.settings.dateFormat).fmt(d);
}
function monthKey(iso) {
  if (!iso) return null;
  return iso.slice(0, 7); // YYYY-MM
}
function monthLabel(key) {
  var parts = key.split("-");
  return MONTH_NAMES[parseInt(parts[1], 10) - 1] + " " + parts[0];
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function toast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove("show"); }, 2400);
}

function isSelected(id) { return !!state.selectedIds[id]; }
function toggleSelected(id) {
  if (state.selectedIds[id]) delete state.selectedIds[id];
  else state.selectedIds[id] = true;
}
function selectedCount() { return Object.keys(state.selectedIds).length; }
function clearSelection() { state.selectedIds = {}; }
