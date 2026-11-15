"use strict";

/* ============ Holiday & TOIL ============ */
// Holiday years run 1 Jan - 31 Dec. Each year has an allowance of holiday
// days, bank holidays (on top) and days carried over, kept in
// state.settings.leaveYears, e.g. { "2026": { days: 20, bank: 8, carry: 0 } }.
// A Holiday entry on a UK bank holiday date (England & Wales) counts as a
// bank holiday; any other Holiday entry comes off the holiday days.
// Days are based on your normal working day (Settings, default 8 hrs).

/* ---- UK bank holidays (England & Wales), worked out for any year ---- */
function easterSunday(y) {
  var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoFromParts(y, month, day);
}
function weekday(iso) { var p = iso.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); } // 0 = Sun
function firstMonday(y, m) { for (var d = 1; ; d++) { var iso = isoFromParts(y, m, d); if (weekday(iso) === 1) return iso; } }
function lastMonday(y, m) { for (var d = daysInMonth(y, m); ; d--) { var iso = isoFromParts(y, m, d); if (weekday(iso) === 1) return iso; } }
// One-off changes to the usual pattern.
var BANK_HOLIDAY_CHANGES = {
  "2020": { remove: ["2020-05-04"], add: [["2020-05-08", "VE Day"]] },
  "2022": { remove: ["2022-05-30"], add: [["2022-06-02", "Spring bank holiday"], ["2022-06-03", "Platinum Jubilee"], ["2022-09-19", "State Funeral of Queen Elizabeth II"]] },
  "2023": { add: [["2023-05-08", "Coronation of King Charles III"]] }
};
function ukBankHolidays(y) {
  var easter = easterSunday(y), list = [];
  function add(iso, name) { list.push({ date: iso, name: name }); }
  // New Year's Day moves to Monday at a weekend.
  var ny = isoFromParts(y, 1, 1), nyd = weekday(ny);
  add(nyd === 6 ? isoFromParts(y, 1, 3) : nyd === 0 ? isoFromParts(y, 1, 2) : ny, "New Year's Day" + (nyd === 0 || nyd === 6 ? " (substitute day)" : ""));
  add(addDaysIso(easter, -2), "Good Friday");
  add(addDaysIso(easter, 1), "Easter Monday");
  add(firstMonday(y, 5), "Early May bank holiday");
  add(lastMonday(y, 5), "Spring bank holiday");
  add(lastMonday(y, 8), "Summer bank holiday");
  // Christmas and Boxing Day: a weekend day moves to the next free weekday.
  var xmas = isoFromParts(y, 12, 25), xd = weekday(xmas);
  if (xd === 6) { add(isoFromParts(y, 12, 27), "Christmas Day (substitute day)"); add(isoFromParts(y, 12, 28), "Boxing Day (substitute day)"); }
  else if (xd === 0) { add(isoFromParts(y, 12, 27), "Christmas Day (substitute day)"); add(isoFromParts(y, 12, 26), "Boxing Day"); }
  else if (xd === 5) { add(xmas, "Christmas Day"); add(isoFromParts(y, 12, 28), "Boxing Day (substitute day)"); }
  else { add(xmas, "Christmas Day"); add(isoFromParts(y, 12, 26), "Boxing Day"); }
  var ch = BANK_HOLIDAY_CHANGES[String(y)];
  if (ch) {
    list = list.filter(function (b) { return (ch.remove || []).indexOf(b.date) === -1; });
    (ch.add || []).forEach(function (a) { add(a[0], a[1]); });
  }
  return list.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}
function bankHolidayOn(iso) {
  if (!iso) return null;
  return ukBankHolidays(+iso.slice(0, 4)).filter(function (b) { return b.date === iso; })[0] || null;
}

/* ---- Amounts ---- */
function leaveDayHours() { return normalDayHours() || 8; }
// Hours a Holiday entry uses: its hours, or a normal day if no times are entered.
function holidayHours(e) {
  if (e.type !== "Holiday") return 0;
  var hw = computeHoursWorked(e);
  return hw !== null ? Math.max(0, hw) : leaveDayHours();
}
// Table cell for TOIL: hours, with the days on a small second line.
function hrsDaysCell(hours, signed) {
  var full = fmtHrsDays(hours, signed), i = full.indexOf(" (");
  return i === -1 ? full : full.slice(0, i) + '<div class="leave-sub">' + full.slice(i + 2, -1) + '</div>';
}
function round2(n) { return Math.round(n * 100) / 100; }
// "1 day", "0.5 days", or "1.47 days (11.75 hrs)" when it isn't a whole or half day.
function fmtDays(hours, signed) {
  var days = hours / leaveDayHours(), sign = signed ? (hours > 0 ? "+" : hours < 0 ? "−" : "") : (hours < 0 ? "−" : "");
  var a = Math.abs(days), neat = Math.abs(a * 2 - Math.round(a * 2)) < 0.005;
  var dTxt = (neat ? String(Math.round(a * 2) / 2) : a.toFixed(2)) + " day" + (Math.abs(a - 1) < 0.005 ? "" : "s");
  return sign + dTxt + (neat ? "" : " (" + fmtHours(round2(Math.abs(hours))) + " hrs)");
}
// TOIL reads best in hours, with days alongside: "11.75 hrs (1.47 days)".
function fmtHrsDays(hours, signed) {
  var a = round2(Math.abs(hours)), sign = signed ? (hours > 0 ? "+" : hours < 0 ? "−" : "") : (hours < 0 ? "−" : "");
  var days = a / leaveDayHours();
  return sign + fmtHours(a) + " hr" + (a === 1 ? "" : "s") + (a ? " (" + (Math.abs(days * 100 - Math.round(days * 100)) < 0.001 ? String(round2(days)) : days.toFixed(2)) + " day" + (Math.abs(days - 1) < 0.005 ? "" : "s") + ")" : "");
}

/* ---- Allowance per year ---- */
function leaveAllowance(year) {
  var all = state.settings.leaveYears || {}, own = all[String(year)];
  if (own) return { days: own.days, bank: own.bank, carry: own.carry || 0, set: true };
  // Not set yet: start from the latest earlier year, and this year's bank holidays.
  var earlier = Object.keys(all).filter(function (k) { return +k < year; }).sort().pop();
  return { days: earlier ? all[earlier].days : 0, bank: ukBankHolidays(year).length, carry: 0, set: false };
}
function saveLeaveAllowance(year, key, value) {
  var all = JSON.parse(JSON.stringify(state.settings.leaveYears || {}));
  var cur = leaveAllowance(year);
  all[String(year)] = { days: cur.days, bank: cur.bank, carry: cur.carry };
  all[String(year)][key] = value;
  saveSetting("leaveYears", all);
}

/* ---- The year's figures and log ---- */
function leaveYear(year) {
  var from = year + "-01-01", to = year + "-12-31", today = todayIso(), dayH = leaveDayHours();
  var allow = leaveAllowance(year);
  var holAllowH = (num0(allow.days) + num0(allow.carry)) * dayH, bankAllow = num0(allow.bank);
  var entries = state.entries.filter(function (e) { return e.date; }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var toilBefore = toilTotals(entries.filter(function (e) { return e.date < from; })).balance;
  var hol = { taken: 0, booked: 0 }, bank = { taken: 0, booked: 0 }, toil = { banked: 0, taken: 0 };
  var holLeft = holAllowH, bankLeft = bankAllow, toilBal = toilBefore, rows = [];
  entries.forEach(function (e) {
    if (e.date < from || e.date > to) return;
    var future = e.date > today, bh = bankHolidayOn(e.date);
    if (e.type === "Holiday") {
      var h = holidayHours(e);
      if (bh) {
        var d = h / dayH; bankLeft = round2(bankLeft - d); bank[future ? "booked" : "taken"] += d;
        rows.push({ e: e, kind: "bank", label: "Bank holiday", note: bh.name, amount: "−" + fmtDays(h), future: future, holLeft: holLeft, bankLeft: bankLeft, toilBal: toilBal });
      } else {
        holLeft -= h; hol[future ? "booked" : "taken"] += h;
        rows.push({ e: e, kind: "holiday", label: "Holiday", amount: "−" + fmtDays(h), future: future, holLeft: holLeft, bankLeft: bankLeft, toilBal: toilBal });
      }
    }
    var banked = toilBanked(e), used = toilUsed(e);
    if (banked) {
      toilBal += banked; toil.banked += banked;
      rows.push({ e: e, kind: "toil-in", label: "TOIL banked", amount: hrsDaysCell(banked, true), future: future, holLeft: holLeft, bankLeft: bankLeft, toilBal: toilBal });
    }
    if (used) {
      toilBal -= used; toil.taken += used;
      rows.push({ e: e, kind: "toil-out", label: "TOIL taken", amount: hrsDaysCell(-used, true), future: future, holLeft: holLeft, bankLeft: bankLeft, toilBal: toilBal });
    }
  });
  // What happened on each of the year's bank holidays.
  var byDate = {};
  entries.forEach(function (e) { if (e.date >= from && e.date <= to) byDate[e.date] = e; });
  var bankDays = ukBankHolidays(year).map(function (b) {
    var e = byDate[b.date];
    return { date: b.date, name: b.name, entry: e || null, future: b.date > today };
  });
  return {
    year: year, allow: allow, holAllowH: holAllowH, hol: hol, holLeftH: holAllowH - hol.taken - hol.booked,
    bankAllow: bankAllow, bank: bank, bankLeft: round2(bankAllow - bank.taken - bank.booked),
    toilBefore: toilBefore, toil: toil, toilBalance: toilBal, rows: rows, bankDays: bankDays
  };
}
function num0(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function leaveYearChoices() {
  var set = {}, now = +todayIso().slice(0, 4);
  set[now - 1] = set[now] = set[now + 1] = true;
  state.entries.forEach(function (e) { if (e.date) set[+e.date.slice(0, 4)] = true; });
  Object.keys(state.settings.leaveYears || {}).forEach(function (k) { set[+k] = true; });
  return Object.keys(set).map(Number).sort();
}

/* ---- Page ---- */
function renderLeave() {
  var year = state.leaveYear || +todayIso().slice(0, 4);
  var L = leaveYear(year), a = L.allow, today = todayIso();
  var yearSel = '<select id="leaveYearSel" aria-label="Holiday year">' + leaveYearChoices().map(function (y) {
    return '<option value="' + y + '"' + (y === year ? " selected" : "") + '>' + y + '</option>';
  }).join("") + '</select>';
  var toolbar = '<div class="log-toolbar"><div class="section-sub leave-year-note">Holiday year 1 Jan – 31 Dec ' + year + ' · 1 day = ' + fmtHours(leaveDayHours()) + ' hrs (from Settings)</div><div class="filters">' + yearSel + '</div></div>';

  var allowance = '<div class="card calc-card settings-section leave-allow">' +
    '<h3 class="settings-title">Allowance for ' + year + (a.set ? "" : ' <span class="tag tag-none">not set yet</span>') + '</h3>' +
    '<div class="leave-allow-row">' +
      '<label class="salary-field">Holiday days<input type="number" min="0" step="0.5" class="field-input" data-leave-allow="days" value="' + escapeHtml(String(a.days)) + '"></label>' +
      '<label class="salary-field">Bank holidays (on top)<input type="number" min="0" step="1" class="field-input" data-leave-allow="bank" value="' + escapeHtml(String(a.bank)) + '"></label>' +
      '<label class="salary-field">Carried over (days)<input type="number" step="0.5" class="field-input" data-leave-allow="carry" value="' + escapeHtml(String(a.carry)) + '"></label>' +
    '</div>' +
    '<p class="settings-help">Bank holidays are spotted automatically: a <b>Holiday</b> entry on a UK bank holiday (England &amp; Wales) comes off the bank holiday allowance, any other Holiday entry comes off your holiday days.</p>' +
  '</div>';

  var holTotal = L.holAllowH;
  var stats = '<div class="stat-grid">' +
    '<div class="card stat-card"><div class="stat-label">Holiday left</div><div class="stat-value' + (L.holLeftH < 0 ? " toil-neg" : "") + '">' + fmtDays(L.holLeftH) + '</div>' +
      '<div class="stat-sub">' + fmtDays(L.hol.taken) + ' taken' + (L.hol.booked ? ' · ' + fmtDays(L.hol.booked) + ' booked' : '') + ' · of ' + fmtDays(holTotal) + '</div></div>' +
    '<div class="card stat-card"><div class="stat-label">Bank holidays left</div><div class="stat-value' + (L.bankLeft < 0 ? " toil-neg" : "") + '">' + fmtDays(L.bankLeft * leaveDayHours()) + '</div>' +
      '<div class="stat-sub">' + fmtDays(L.bank.taken * leaveDayHours()) + ' taken' + (L.bank.booked ? ' · ' + fmtDays(L.bank.booked * leaveDayHours()) + ' booked' : '') + ' · of ' + L.bankAllow + '</div></div>' +
    '<div class="card stat-card"><div class="stat-label">TOIL balance</div><div class="stat-value' + (L.toilBalance < 0 ? " toil-neg" : "") + '" style="font-size:21px">' + fmtHrsDays(L.toilBalance) + '</div>' +
      '<div class="stat-sub">By 31 Dec ' + year + ' · ' + fmtHours(round2(L.toil.banked)) + ' hrs banked, ' + fmtHours(round2(L.toil.taken)) + ' hrs taken this year</div></div>' +
  '</div>';

  var bankRows = L.bankDays.map(function (b) {
    var e = b.entry, status;
    if (e && e.type === "Holiday") status = '<span class="tag tag-Holiday">' + (b.future ? "Booked off" : "Off (holiday)") + '</span>';
    else if (e && (e.type === "Warehouse" || e.type === "On Site")) status = '<span class="tag ' + TYPE_CLASS[e.type] + '">Worked · ' + e.type + '</span>';
    else if (e && e.type) status = '<span class="tag ' + (TYPE_CLASS[e.type] || "tag-none") + '">' + escapeHtml(e.type) + '</span>';
    else status = '<span class="tag tag-none">' + (b.future ? "Upcoming" : "Not logged") + '</span>';
    return '<tr class="' + (b.future ? "leave-future" : "") + '"><td class="mono date-cell">' + fmtDate(b.date) + '</td><td>' + escapeHtml(b.name) + '</td><td>' + status + '</td></tr>';
  }).join("");

  var logRows = L.rows.map(function (r) {
    var cls = { holiday: "tag-Holiday", bank: "tag-Holiday", "toil-in": "tag-TOIL", "toil-out": "tag-TOIL" }[r.kind];
    return '<tr class="' + (r.future ? "leave-future" : "") + '">' +
      '<td class="mono date-cell">' + fmtDate(r.e.date) + (r.future ? ' <span class="leave-booked">booked</span>' : '') + '</td>' +
      '<td><span class="tag ' + cls + '">' + r.label + '</span></td>' +
      '<td class="notes-cell" title="' + escapeHtml(r.note || r.e.notes || "") + '">' + escapeHtml(r.note || r.e.notes || "") + '</td>' +
      '<td class="num">' + r.amount + '</td>' +
      '<td class="num">' + fmtDays(r.holLeft) + '</td>' +
      '<td class="num">' + fmtDays(r.bankLeft * leaveDayHours()) + '</td>' +
      '<td class="num">' + hrsDaysCell(r.toilBal) + '</td>' +
    '</tr>';
  }).join("");
  var opening = '<tr class="leave-open"><td class="mono date-cell">1 Jan</td><td colspan="3">Start of ' + year + (a.carry ? ' (incl. ' + fmtDays(num0(a.carry) * leaveDayHours()) + ' carried over)' : '') + '</td>' +
    '<td class="num">' + fmtDays(L.holAllowH) + '</td><td class="num">' + fmtDays(L.bankAllow * leaveDayHours()) + '</td><td class="num">' + hrsDaysCell(L.toilBefore) + '</td></tr>';

  return toolbar + allowance + stats +
    '<div class="section-title">Holiday &amp; TOIL log <span class="section-sub">' + year + ' · every day off and every hour of TOIL, with what’s left after each</span></div>' +
    '<div class="card log-table-wrap"><div class="leave-scroll"><table class="log-table leave-table"><thead><tr><th>Date</th><th>What</th><th>Notes</th><th class="num">Used / added</th><th class="num">Holiday left</th><th class="num">Bank hols left</th><th class="num">TOIL balance</th></tr></thead><tbody>' +
      opening + (logRows || '<tr><td colspan="7" style="text-align:center;color:var(--ink-dim);padding:22px;">No holiday or TOIL in ' + year + ' yet. Log a Holiday or TOIL day in All Data, or bank overtime as TOIL.</td></tr>') +
    '</tbody></table></div></div>' +
    '<div class="section-title">Bank holidays ' + year + ' <span class="section-sub">England &amp; Wales</span></div>' +
    '<div class="card log-table-wrap"><div class="leave-scroll"><table class="log-table leave-bank-table"><thead><tr><th>Date</th><th>Bank holiday</th><th>You</th></tr></thead><tbody>' + bankRows + '</tbody></table></div></div>' +
    '<p class="footnote">Holiday and bank holidays reset each 1 January; TOIL carries on from year to year. Half days count as half a day; anything else is shown in hours too. Booked = a Holiday or TOIL day logged for a date that hasn’t happened yet.</p>';
}

function attachLeaveEvents() {
  bindIf("leaveYearSel", "change", function (ev) { state.leaveYear = parseInt(ev.target.value, 10); render(); });
  document.querySelectorAll("[data-leave-allow]").forEach(function (input) {
    input.addEventListener("change", function () {
      if (render.busy) return;
      var key = input.getAttribute("data-leave-allow"), v = parseFloat(input.value);
      if (isNaN(v) || (key !== "carry" && v < 0)) { toast("Enter a number of days."); render(); return; }
      saveLeaveAllowance(state.leaveYear || +todayIso().slice(0, 4), key, v);
      render();
    });
  });
}
