"use strict";

/* ============ Derived data ============ */
function sortedEntries() {
  var arr = state.entries.slice();
  arr.sort(function (a, b) {
    if (a.date === b.date) return 0;
    return a.date < b.date ? -1 : 1;
  });
  if (state.sortDir === "desc") arr.reverse();
  return arr;
}
function filteredEntries() {
  return sortedEntries().filter(function (e) {
    if (state.filterType && e.type !== state.filterType) return false;
    if (state.filterMonth && monthKey(e.date) !== state.filterMonth) return false;
    return true;
  });
}
function monthOptions() {
  var keys = {};
  state.entries.forEach(function (e) { if (e.date) keys[monthKey(e.date)] = true; });
  return Object.keys(keys).sort();
}
function inSummaryRange(e) {
  if (!e.date) return false;
  if (state.summaryFrom && e.date < state.summaryFrom) return false;
  if (state.summaryTo && e.date > state.summaryTo) return false;
  return true;
}
function summaryEntries() {
  if (!state.summaryFrom && !state.summaryTo) return state.entries;
  return state.entries.filter(inSummaryRange);
}
function aggregateByMonth() {
  var map = {};
  summaryEntries().forEach(function (e) {
    var k = monthKey(e.date);
    if (!k) return;
    if (!map[k]) map[k] = { hours: 0, pay: 0, hasHours: false, hasPay: false };
    var hw = computeHoursWorked(e), pay = computePay(e);
    if (hw !== null) { map[k].hours += hw; map[k].hasHours = true; }
    if (pay !== null) { map[k].pay += pay; map[k].hasPay = true; }
  });
  return map;
}
