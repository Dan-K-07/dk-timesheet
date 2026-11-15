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
// Pay for the day. Overtime hours banked as TOIL aren't paid now - they're
// paid when you take them off (a TOIL day, paid like a holiday).
function computePay(entry) {
  var hw = computeHoursWorked(entry);
  var rate = parseFloat(entry.rate);
  if (hw === null || isNaN(rate)) return null;
  return (hw - toilBanked(entry)) * rate;
}

/* ---- Overtime & TOIL (time off in lieu) ---- */
// Your normal working day (hours worked, after breaks), from Settings. 0 = overtime not tracked.
function normalDayHours() { var n = parseFloat(state.settings && state.settings.dailyHours); return n > 0 ? n : 0; }
function isWorkDay(entry) { return entry.type === "Warehouse" || entry.type === "On Site"; }
// Hours worked beyond your normal day, on a Warehouse or On Site day.
function computeOvertime(entry) {
  var hw = computeHoursWorked(entry), day = normalDayHours();
  if (!isWorkDay(entry) || hw === null || !day) return 0;
  return Math.max(0, Math.round((hw - day) * 100) / 100);
}
// Overtime hours you chose to bank as TOIL on this entry (never more than you worked).
function toilBanked(entry) {
  var t = parseFloat(entry.toilHrs), hw = computeHoursWorked(entry);
  if (isNaN(t) || t <= 0 || !isWorkDay(entry)) return 0;
  return hw === null ? 0 : Math.min(t, Math.max(0, hw));
}
// TOIL used by a TOIL day: its hours, or a normal day if no times are entered.
function toilUsed(entry) {
  if (entry.type !== "TOIL") return 0;
  var hw = computeHoursWorked(entry);
  return hw !== null ? Math.max(0, hw) : normalDayHours();
}
function toilTotals(entries) {
  var earned = 0, used = 0;
  (entries || state.entries).forEach(function (e) { earned += toilBanked(e); used += toilUsed(e); });
  return { earned: earned, used: used, balance: earned - used };
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
