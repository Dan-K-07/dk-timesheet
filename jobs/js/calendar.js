"use strict";

/* =====================================================================
   DK Jobs - Calendar: a month of job dates, coloured by status.
   #/calendar shows this month, #/calendar/2026-12 a given month, so
   Back and refresh keep your place. Cancelled jobs are left off.
   ===================================================================== */

var CAL_STATUS_CLASS = { "Potential": "st-potential", "Pencilled": "st-pencilled", "Confirmed": "st-confirmed",
  "Awaiting Payment": "st-awaiting", "Completed": "st-completed" };
var CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var CAL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function calMonthOf(iso) { return iso.slice(0, 7); }
function calShiftMonth(ym, n) {
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + "-" + pad2(m + 1);
}

// Every day each (non-cancelled) job date covers, as { iso: [ {job, date} ] }.
function calEntriesByDay(fromIso, toIso) {
  var byDay = {};
  state.data.jobs.forEach(function (j) {
    if (j.status === "Cancelled") return;
    (j.dates || []).forEach(function (d) {
      if (!d.start) return;
      var end = d.end && d.end >= d.start ? d.end : d.start;
      for (var day = d.start < fromIso ? fromIso : d.start, guard = 0; day <= end && day <= toIso && guard < 400; day = addDays(day, 1), guard++) {
        (byDay[day] = byDay[day] || []).push({ job: j, date: d });
      }
    });
  });
  Object.keys(byDay).forEach(function (k) {
    byDay[k].sort(function (a, b) {
      var ta = a.date.allDay ? "" : a.date.startTime || "", tb = b.date.allDay ? "" : b.date.startTime || "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
  });
  return byDay;
}

function calTime(d) { return d.allDay ? "All day" : (d.startTime || "") + (d.endTime ? "–" + d.endTime : ""); }

function renderCalendar() {
  var today = todayIso();
  var ym = /^\d{4}-\d{2}$/.test(state.route.id || "") ? state.route.id : calMonthOf(today);
  var first = ym + "-01";
  var lastDay = addDays(calShiftMonth(ym, 1) + "-01", -1);
  // The grid runs Monday to Sunday, from the week the month starts in.
  var lead = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  var gridStart = addDays(first, -lead);
  var trail = (7 - ((lead + +lastDay.slice(8, 10)) % 7)) % 7;
  var gridEnd = addDays(lastDay, trail);
  var byDay = calEntriesByDay(gridStart, gridEnd);

  var head = '<div class="mc-bar">' +
      '<a class="btn btn-sm" href="#/calendar/' + calShiftMonth(ym, -1) + '" aria-label="Previous month">‹</a>' +
      '<h2 class="mc-title">' + CAL_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4) + '</h2>' +
      '<a class="btn btn-sm" href="#/calendar/' + calShiftMonth(ym, 1) + '" aria-label="Next month">›</a>' +
      (ym !== calMonthOf(today) ? '<a class="btn btn-sm" href="#/calendar">Today</a>' : "") +
    '</div>' +
    '<div class="mc-legend">' + Object.keys(CAL_STATUS_CLASS).map(function (s) {
      return '<span class="mc-key"><span class="mc-dot ' + CAL_STATUS_CLASS[s] + '"></span>' + escapeHtml(s) + '</span>';
    }).join("") + '</div>';

  var cells = "";
  for (var day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    var items = byDay[day] || [];
    var cls = "mc-cell" + (calMonthOf(day) !== ym ? " other" : "") + (day === today ? " today" : "");
    cells += '<div class="' + cls + '"><div class="mc-num"><span>' + (+day.slice(8, 10)) + '</span></div>' +
      items.map(function (e) {
        var c = CAL_STATUS_CLASS[e.job.status] || "st-potential";
        return '<a class="mc-chip ' + c + '" href="#/jobs/' + encodeURIComponent(e.job.id) + '" title="' + attr(jobLabel(e.job) + " · " + calTime(e.date)) + '">' +
          (e.date.allDay ? "" : '<span class="mc-time">' + escapeHtml(e.date.startTime || "") + '</span>') +
          escapeHtml(e.job.title || e.job.ref || "Untitled job") + '</a>' +
          '<span class="mc-dot ' + c + '"></span>';
      }).join("") + '</div>';
  }
  var grid = '<div class="card mc-grid">' + CAL_DAYS.map(function (d) { return '<div class="mc-dow">' + d + '</div>'; }).join("") + cells + '</div>';

  // Phones: the grid shows dots, and this list underneath has the detail.
  var days = Object.keys(byDay).filter(function (k) { return calMonthOf(k) === ym; }).sort();
  var list = '<div class="card mc-agenda">' + (days.length ? days.map(function (k) {
    return '<div class="mc-day' + (k === today ? " today" : "") + '"><div class="mc-day-head">' + escapeHtml(fmtDate(k)) + '</div>' +
      byDay[k].map(function (e) {
        return '<a class="mc-row" href="#/jobs/' + encodeURIComponent(e.job.id) + '">' +
          '<span class="mc-row-main"><span class="mc-row-title">' + escapeHtml(jobLabel(e.job)) + '</span>' +
          '<span class="mc-row-sub">' + escapeHtml(calTime(e.date) + (e.date.label ? " · " + e.date.label : "") + (e.job.clientId ? " · " + clientName(e.job.clientId) : "")) + '</span></span>' +
          statusTag(e.job.status) + '</a>';
      }).join("") + '</div>';
  }).join("") : '<div class="list-empty">No jobs this month.</div>') + '</div>';

  return head + grid + list;
}
