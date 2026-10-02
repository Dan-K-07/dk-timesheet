"use strict";

/* ============ Expenses ============ */
// Rows live in the Supabase "expenses" table (see supabase/migrations),
// one row per expense, owner-only via RLS. A copy is kept in this browser
// so the tab still shows while offline; changes need a connection.
var EXPENSES_TABLE = "expenses";
var EXPENSES_KEY = "dk_timesheet_expenses_v1";
var EXPENSE_FREQUENCIES = [
  { id: "weekly", label: "Weekly", perYear: 52, months: 0 },
  { id: "monthly", label: "Monthly", perYear: 12, months: 1 },
  { id: "quarterly", label: "Quarterly", perYear: 4, months: 3 },
  { id: "yearly", label: "Yearly", perYear: 1, months: 12 },
  { id: "one-off", label: "One-off", perYear: 0, months: 0 }
];
var expenseChannel = null;
var recentExpenseWrites = {}; // id -> time we changed it, to tell our own realtime echoes apart

function frequencyInfo(id) {
  for (var i = 0; i < EXPENSE_FREQUENCIES.length; i++) if (EXPENSE_FREQUENCIES[i].id === id) return EXPENSE_FREQUENCIES[i];
  return EXPENSE_FREQUENCIES[1];
}
function expenseCategories() {
  var list = state.settings && state.settings.expenseCategories;
  return Array.isArray(list) && list.length ? list : DEFAULT_EXPENSE_CATEGORIES;
}

/* ---- Dates (ISO yyyy-mm-dd strings, calculated in UTC to dodge clock changes) ---- */
function isoFromParts(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); } // m is 1-12
function todayIso() { var d = new Date(); return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function isoParts(iso) { var p = iso.split("-"); return [parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10)]; }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function addDaysIso(iso, n) {
  var p = isoParts(iso), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function daysBetween(a, b) {
  var x = isoParts(a), y = isoParts(b);
  return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
}
function lastDayIso(y, m) { return isoFromParts(y, m, daysInMonth(y, m)); }

/* ---- Calculations ---- */
function monthlyEquivalent(e) {
  return (Number(e.amount) || 0) * frequencyInfo(e.frequency).perYear / 12;
}
function isCurrentExpense(e, today) {
  today = today || todayIso();
  return e.active && e.start_date <= today && (!e.end_date || e.end_date >= today);
}
function currentRecurring() {
  var today = todayIso();
  return state.expenses.filter(function (e) { return e.frequency !== "one-off" && isCurrentExpense(e, today); });
}
function expenseTotals() {
  var monthly = currentRecurring().reduce(function (s, e) { return s + monthlyEquivalent(e); }, 0);
  return { monthly: monthly, yearly: monthly * 12 };
}
function categoryBreakdown() {
  var map = {}, total = 0;
  currentRecurring().forEach(function (e) {
    var m = monthlyEquivalent(e);
    map[e.category] = (map[e.category] || 0) + m;
    total += m;
  });
  return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).map(function (c) {
    return { category: c, monthly: map[c], share: total ? map[c] / total : 0 };
  });
}

// Every payment date of `e` between `from` and `to` (inclusive ISO dates).
// Ignores active/paused - callers decide whether a paused expense counts.
function expenseOccurrences(e, from, to) {
  var out = [], start = e.start_date, last = e.end_date && e.end_date < to ? e.end_date : to;
  if (!start || start > last) return out;
  var f = frequencyInfo(e.frequency);
  if (f.id === "one-off") {
    if (start >= from && start <= last) out.push(start);
    return out;
  }
  if (f.id === "weekly") {
    var k = start < from ? Math.ceil(daysBetween(start, from) / 7) : 0;
    for (var d = addDaysIso(start, k * 7); d <= last; d = addDaysIso(d, 7)) out.push(d);
    return out;
  }
  // Monthly / quarterly / yearly: on payment_day (or the start date's day),
  // moved to the month's last day in shorter months.
  var sp = isoParts(start), day = e.payment_day || sp[2], step = f.months;
  var fp = isoParts(from);
  var gap = (fp[0] * 12 + fp[1]) - (sp[0] * 12 + sp[1]);
  var i = Math.max(0, Math.floor(gap / step) - 1);
  for (var guard = 0; guard < 2000; guard++, i++) {
    var idx = (sp[1] - 1) + i * step, y = sp[0] + Math.floor(idx / 12), m = (idx % 12) + 1;
    var date = isoFromParts(y, m, Math.min(day, daysInMonth(y, m)));
    if (date > last) break;
    if (date >= start && date >= from) out.push(date);
  }
  return out;
}
function nextPayment(e) {
  var today = todayIso(), p = isoParts(today);
  var found = expenseOccurrences(e, today, isoFromParts(p[0] + 2, p[1], 1));
  return found.length ? found[0] : null;
}
function dueThisMonth() {
  var p = isoParts(todayIso()), from = isoFromParts(p[0], p[1], 1), to = lastDayIso(p[0], p[1]);
  var items = [];
  state.expenses.forEach(function (e) {
    if (!e.active) return;
    expenseOccurrences(e, from, to).forEach(function (d) { items.push({ date: d, expense: e }); });
  });
  items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.expense.name.localeCompare(b.expense.name); });
  return items;
}

// Year view: calendar year (Jan-Dec) or UK tax year (Apr-Mar, matching the
// Take-Home Pay tab). `startYear` is the year the period starts in.
function expensePeriodMonths(mode, startYear) {
  var months = [];
  for (var i = 0; i < 12; i++) {
    var idx = (mode === "tax" ? 3 : 0) + i, y = startYear + Math.floor(idx / 12), m = (idx % 12) + 1;
    months.push({ key: y + "-" + pad2(m), from: isoFromParts(y, m, 1), to: lastDayIso(y, m) });
  }
  return months;
}
function periodLabel(mode, startYear) {
  return mode === "tax" ? "Tax year " + startYear + "/" + String(startYear + 1).slice(2) : String(startYear);
}
function currentPeriodStart(mode) {
  var p = isoParts(todayIso());
  return mode === "tax" && p[1] < 4 ? p[0] - 1 : p[0];
}
function earningsSource() { return (state.settings && state.settings.earningsSource) || "timesheet"; }
function usingSalary() { return earningsSource() === "salary"; }
// Timesheet pay is always before tax; salary / custom amounts can be either.
function earningsAfterTax() { return earningsSource() !== "timesheet" && state.settings.earningsTaxBasis === "after"; }
function usingCustomEarnings() { return earningsSource() === "custom"; }
// Salary for one calendar month: annual / 12 from the latest pay change
// that started on or before the end of that month.
function salaryForMonth(y, m) {
  var end = lastDayIso(y, m), annual = 0;
  (state.settings.salaries || []).forEach(function (x) { if (x.from <= end) annual = x.annual; });
  return annual / 12;
}
function earningsBetween(from, to) {
  if (usingSalary() || usingCustomEarnings()) {
    // Whole months from `from` to `to` (the year view always asks for whole months).
    var a = isoParts(from), b = isoParts(to), total = 0, custom = state.settings.customEarnings || {};
    for (var y = a[0], m = a[1]; y * 12 + m <= b[0] * 12 + b[1]; m === 12 ? (y++, m = 1) : m++) {
      total += usingSalary() ? salaryForMonth(y, m) : (custom[y + "-" + pad2(m)] || 0);
    }
    return total;
  }
  return state.entries.reduce(function (s, e) {
    if (!e.date || e.date < from || e.date > to) return s;
    var pay = computePay(e);
    return pay === null ? s : s + pay;
  }, 0);
}
function expensesBetween(from, to) {
  return state.expenses.reduce(function (s, e) {
    if (!e.active) return s;
    return s + expenseOccurrences(e, from, to).length * (Number(e.amount) || 0);
  }, 0);
}
function expenseYearView(mode, startYear) {
  var months = expensePeriodMonths(mode, startYear).map(function (m) {
    var earned = earningsBetween(m.from, m.to), spent = expensesBetween(m.from, m.to);
    return { key: m.key, from: m.from, to: m.to, earnings: earned, expenses: spent, left: earned - spent };
  });
  var tot = months.reduce(function (t, m) {
    t.earnings += m.earnings; t.expenses += m.expenses; t.left += m.left; return t;
  }, { earnings: 0, expenses: 0, left: 0 });
  return { months: months, totals: tot };
}
function yearChoices(mode) {
  var years = {}, now = currentPeriodStart(mode);
  years[now - 1] = years[now] = years[now + 1] = true;
  function add(iso) {
    if (!iso) return;
    var p = isoParts(iso);
    years[mode === "tax" && p[1] < 4 ? p[0] - 1 : p[0]] = true;
  }
  state.entries.forEach(function (e) { add(e.date); });
  state.expenses.forEach(function (e) { add(e.start_date); });
  return Object.keys(years).map(Number).sort();
}

/* ---- Local copy ---- */
function loadExpensesCache() {
  try { state.expenses = (JSON.parse(localStorage.getItem(EXPENSES_KEY) || "[]") || []).map(normalizeExpense); }
  catch (e) { state.expenses = []; }
}
function saveExpensesCache() {
  try { localStorage.setItem(EXPENSES_KEY, JSON.stringify(state.expenses)); } catch (e) {}
}
function normalizeExpense(r) {
  return {
    id: r.id, user_id: r.user_id, name: r.name || "", category: r.category || "Other",
    amount: Number(r.amount) || 0, frequency: r.frequency || "monthly",
    start_date: r.start_date || "", end_date: r.end_date || null,
    payment_day: r.payment_day ? Number(r.payment_day) : null,
    notes: r.notes || "", active: r.active !== false, created_at: r.created_at || ""
  };
}

/* ---- Supabase ---- */
async function loadExpenses() {
  if (!state.user) return;
  try {
    var res = await sbClient.from(EXPENSES_TABLE).select("*").eq("user_id", state.user.id).order("created_at", { ascending: true });
    if (res.error) throw res.error;
    state.expenses = (res.data || []).map(normalizeExpense);
    saveExpensesCache();
    render();
  } catch (e) {
    toast("Couldn't load expenses: " + errMessage(e));
  }
}

function upsertLocalExpense(row) {
  var x = normalizeExpense(row);
  var i = state.expenses.findIndex(function (e) { return e.id === x.id; });
  if (i === -1) state.expenses.push(x); else state.expenses[i] = x;
  saveExpensesCache();
}
function handleExpenseChange(payload) {
  var row = payload.eventType === "DELETE" ? payload.old : payload.new;
  if (!row || !row.id) return;
  var known = state.expenses.some(function (e) { return e.id === row.id; });
  if (payload.eventType === "DELETE") {
    // Delete events can't be filtered by user and only carry the id, so
    // ignore ids that aren't ours.
    if (!known) return;
    state.expenses = state.expenses.filter(function (e) { return e.id !== row.id; });
    saveExpensesCache();
  } else {
    if (state.user && row.user_id !== state.user.id) return;
    upsertLocalExpense(row);
  }
  var mine = recentExpenseWrites[row.id] && Date.now() - recentExpenseWrites[row.id] < 10000;
  if (!mine) toast("Expenses updated from another device.");
  render();
}
function subscribeExpensesRealtime() {
  if (expenseChannel) { try { sbClient.removeChannel(expenseChannel); } catch (e) {} expenseChannel = null; }
  var filter = "user_id=eq." + state.user.id;
  expenseChannel = sbClient.channel("expenses-" + state.user.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: EXPENSES_TABLE, filter: filter }, handleExpenseChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: EXPENSES_TABLE, filter: filter }, handleExpenseChange)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: EXPENSES_TABLE }, handleExpenseChange)
    .subscribe();
}

function requireOnline() {
  if (state.user) return true;
  toast("You're offline — expenses can be changed once you're reconnected.");
  return false;
}
async function saveExpense(id, vals) {
  if (!requireOnline()) return false;
  try {
    var res = id
      ? await sbClient.from(EXPENSES_TABLE).update(vals).eq("id", id).select().single()
      : await sbClient.from(EXPENSES_TABLE).insert(Object.assign({ user_id: state.user.id }, vals)).select().single();
    if (res.error) throw res.error;
    recentExpenseWrites[res.data.id] = Date.now();
    upsertLocalExpense(res.data);
    return true;
  } catch (e) {
    toast("Couldn't save expense: " + errMessage(e));
    return false;
  }
}
async function setExpenseActive(id, active) {
  var e = state.expenses.find(function (x) { return x.id === id; });
  if (!e || !(await saveExpense(id, { active: active }))) return;
  toast(active ? "Resumed “" + e.name + "”." : "Paused “" + e.name + "”.");
  render();
}
async function deleteExpense(id) {
  var e = state.expenses.find(function (x) { return x.id === id; });
  if (!e || !requireOnline()) return;
  if (!confirm("Delete “" + e.name + "”? This can't be undone. (Pause it instead to keep it for later.)")) return;
  try {
    recentExpenseWrites[id] = Date.now();
    var res = await sbClient.from(EXPENSES_TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    state.expenses = state.expenses.filter(function (x) { return x.id !== id; });
    saveExpensesCache();
    if (state.expEditingId === id) state.expEditingId = null;
    render();
    toast("Deleted.");
  } catch (err) {
    toast("Couldn't delete: " + errMessage(err));
  }
}
// Used by Settings when a category is renamed.
async function renameExpenseCategory(from, to) {
  var affected = state.expenses.filter(function (e) { return e.category === from; });
  if (!affected.length || !state.user) return;
  affected.forEach(function (e) { recentExpenseWrites[e.id] = Date.now(); e.category = to; });
  saveExpensesCache();
  var res = await sbClient.from(EXPENSES_TABLE).update({ category: to }).eq("user_id", state.user.id).eq("category", from);
  if (res.error) toast("Couldn't rename the category on existing expenses: " + errMessage(res.error));
}

/* ---- CSV ---- */
function exportExpensesCSV() {
  var rows = [["Name", "Category", "Amount", "Frequency", "Monthly equivalent", "Yearly equivalent", "Start date", "End date", "Payment day", "Status", "Next payment", "Notes"]];
  sortedExpenses().forEach(function (e) {
    var m = monthlyEquivalent(e), next = e.active ? nextPayment(e) : null;
    rows.push([
      e.name, e.category, e.amount.toFixed(2), frequencyInfo(e.frequency).label,
      m.toFixed(2), (m * 12).toFixed(2), e.start_date, e.end_date || "", e.payment_day || "",
      e.active ? "Active" : "Paused", next || "", e.notes
    ]);
  });
  var csv = rows.map(function (r) {
    return r.map(function (v) {
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }).join("\n");
  offerDownload(new Blob([csv], { type: "text/csv" }), "DK_Expenses.csv");
}

/* ---- Rendering ---- */
function sortedExpenses() {
  return state.expenses.slice().sort(function (a, b) {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return monthlyEquivalent(b) - monthlyEquivalent(a) || a.name.localeCompare(b.name);
  });
}
// Like fmtPay but puts the minus before the pound sign: -£12.50
function fmtMoney(n) { return n < 0 ? "-" + fmtPay(-n) : fmtPay(n); }
function nextMonthKey(key) {
  var p = key.split("-"), y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  return m === 12 ? (y + 1) + "-01" : y + "-" + pad2(m + 1);
}
function ordinal(n) {
  var s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderExpenseForm(existing) {
  var e = existing || { name: "", category: expenseCategories()[0], amount: "", frequency: "monthly", start_date: todayIso(), end_date: "", payment_day: "", notes: "" };
  var cats = expenseCategories().slice();
  if (e.category && cats.indexOf(e.category) === -1) cats.push(e.category);
  var catOpts = cats.map(function (c) {
    return '<option value="' + escapeHtml(c) + '"' + (c === e.category ? " selected" : "") + '>' + escapeHtml(c) + '</option>';
  }).join("");
  var freqOpts = EXPENSE_FREQUENCIES.map(function (f) {
    return '<option value="' + f.id + '"' + (f.id === e.frequency ? " selected" : "") + '>' + f.label + '</option>';
  }).join("");
  var noDay = e.frequency === "weekly" || e.frequency === "one-off";
  return '<div class="card entry-form" id="expenseForm">' +
    '<div class="form-grid">' +
      '<div class="field"><label>Name</label><input type="text" id="x_name" value="' + escapeHtml(e.name) + '" placeholder="e.g. Car insurance"></div>' +
      '<div class="field"><label>Category</label><select id="x_category">' + catOpts + '</select></div>' +
      '<div class="field"><label>Amount (£)</label><input type="number" step="0.01" min="0" id="x_amount" value="' + escapeHtml(e.amount) + '"></div>' +
      '<div class="field"><label>How often</label><select id="x_frequency">' + freqOpts + '</select></div>' +
      '<div class="field"><label id="x_start_label">' + (e.frequency === "one-off" ? "Date paid" : "First payment") + '</label><input type="date" id="x_start" value="' + escapeHtml(e.start_date) + '"></div>' +
      '<div class="field"><label>Ends (optional)</label><input type="date" id="x_end" value="' + escapeHtml(e.end_date || "") + '"' + (e.frequency === "one-off" ? " disabled" : "") + '></div>' +
      '<div class="field"><label>Payment day (optional)</label><input type="number" min="1" max="31" step="1" id="x_day" value="' + escapeHtml(e.payment_day || "") + '" placeholder="1–31"' + (noDay ? " disabled" : "") + '></div>' +
      '<div class="field full"><label>Notes</label><input type="text" id="x_notes" value="' + escapeHtml(e.notes) + '" placeholder="Optional"></div>' +
    '</div>' +
    '<div class="form-preview" id="expensePreview">' + expensePreviewText(e) + '</div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-primary" id="saveExpense" data-existing-id="' + (existing ? existing.id : "") + '">' + (existing ? "Save changes" : "Add expense") + '</button>' +
      '<button class="btn btn-ghost" id="cancelExpense">Cancel</button>' +
    '</div>' +
  '</div>';
}
function expensePreviewText(e) {
  if (e.frequency === "one-off") return 'One-off: counted in the month it’s paid, not in the monthly total.';
  var m = monthlyEquivalent(e);
  return 'Per month: <b>' + fmtPay(m) + '</b> &nbsp; Per year: <b>' + fmtPay(m * 12) + '</b>';
}
function readExpenseForm() {
  var freq = document.getElementById("x_frequency").value;
  var day = parseInt(document.getElementById("x_day").value, 10);
  return {
    name: document.getElementById("x_name").value.trim(),
    category: document.getElementById("x_category").value,
    amount: document.getElementById("x_amount").value,
    frequency: freq,
    start_date: document.getElementById("x_start").value,
    end_date: freq === "one-off" ? null : (document.getElementById("x_end").value || null),
    payment_day: freq === "weekly" || freq === "one-off" || isNaN(day) ? null : day,
    notes: document.getElementById("x_notes").value.trim()
  };
}
function validateExpense(v) {
  if (!v.name) return "Give the expense a name.";
  var amt = parseFloat(v.amount);
  if (isNaN(amt) || amt < 0) return "Enter an amount of £0 or more.";
  if (!v.start_date) return v.frequency === "one-off" ? "Pick the date it's paid." : "Pick the date of the first payment.";
  if (v.end_date && v.end_date < v.start_date) return "The end date is before the first payment.";
  if (v.payment_day !== null && (v.payment_day < 1 || v.payment_day > 31)) return "Payment day must be between 1 and 31.";
  return "";
}

function renderExpenses() {
  var form = state.expAdding ? renderExpenseForm(null) : "";
  var toolbar = '<div class="log-toolbar">' +
    '<div class="btn-row">' +
      '<button class="btn btn-primary" id="addExpenseBtn">+ Add expense</button>' +
      (state.expenses.length ? '<button class="btn" id="exportExpensesBtn">Export CSV</button>' : '') +
    '</div>' +
  '</div>';

  if (!state.expenses.length) {
    return toolbar + form + (state.expAdding ? '' :
      '<div class="card empty-state"><div class="big">No expenses yet</div>' +
      'Add your regular outgoings — rent, subscriptions, insurance — to see what they cost each month and what’s left from your earnings.' +
      '<div class="btn-row"><button class="btn btn-primary" id="emptyAddExpense">Add first expense</button></div></div>') +
      renderExpenseYearView();
  }

  var totals = expenseTotals(), due = dueThisMonth(), today = todayIso();
  var dueTotal = due.reduce(function (s, d) { return s + d.expense.amount; }, 0);
  var dueLeft = due.filter(function (d) { return d.date >= today; }).reduce(function (s, d) { return s + d.expense.amount; }, 0);
  var p = isoParts(today), monthName = MONTH_NAMES[p[1] - 1] + " " + p[0];

  var stats = '<div class="stat-grid">' +
    '<div class="card stat-card"><div class="stat-label">Monthly total</div><div class="stat-value">' + fmtPay(totals.monthly) + '</div><div class="stat-sub">Regular expenses, as a monthly figure</div></div>' +
    '<div class="card stat-card"><div class="stat-label">Yearly total</div><div class="stat-value">' + fmtPay(totals.yearly) + '</div><div class="stat-sub">' + currentRecurring().length + ' active regular expense' + (currentRecurring().length === 1 ? "" : "s") + '</div></div>' +
    '<div class="card stat-card"><div class="stat-label">Due in ' + MONTH_NAMES[p[1] - 1] + '</div><div class="stat-value">' + fmtPay(dueTotal) + '</div><div class="stat-sub">' + fmtPay(dueLeft) + ' still to go out</div></div>' +
  '</div>';

  var cats = categoryBreakdown();
  var catBars = cats.length ? cats.map(function (c) {
    var pct = Math.round(c.share * 1000) / 10;
    return '<div class="bar-row">' +
      '<span class="bar-tag exp-cat">' + escapeHtml(c.category) + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.min(pct, 100) + '%;background:var(--accent)"></div></div>' +
      '<span class="exp-cat-amount">' + fmtPay(c.monthly) + '/mo</span>' +
      '<span class="bar-pct">' + pct.toFixed(1) + '%</span>' +
    '</div>';
  }).join("") : '<div class="exp-muted">No active regular expenses.</div>';

  var dueRows = due.length ? due.map(function (d) {
    var gone = d.date < today, dp = isoParts(d.date);
    return '<tr class="' + (gone ? "exp-gone" : "") + '">' +
      '<td class="m-label">' + ordinal(dp[2]) + '</td>' +
      '<td class="exp-name-cell">' + escapeHtml(d.expense.name) + '</td>' +
      '<td class="exp-cat-cell">' + escapeHtml(d.expense.category) + '</td>' +
      '<td class="num">' + fmtPay(d.expense.amount) + '</td>' +
      '<td class="exp-status">' + (gone ? "Gone out" : d.date === today ? "Today" : "Upcoming") + '</td>' +
    '</tr>';
  }).join("") : '<tr><td colspan="5" class="exp-muted" style="text-align:center;padding:18px;">Nothing due this month.</td></tr>';

  var listRows = sortedExpenses().map(function (e) {
    if (state.expEditingId === e.id) return '<tr><td colspan="8" style="padding:0;border-bottom:none;">' + renderExpenseForm(e) + '</td></tr>';
    var f = frequencyInfo(e.frequency), next = e.active ? nextPayment(e) : null;
    var ended = e.end_date && e.end_date < today;
    var status = !e.active ? '<span class="tag tag-none">Paused</span>' : ended ? '<span class="tag tag-none">Ended</span>' : "";
    return '<tr class="' + (!e.active || ended ? "exp-paused" : "") + '">' +
      '<td class="exp-name-cell" title="' + escapeHtml(e.notes) + '">' + escapeHtml(e.name) + (e.notes ? '<div class="exp-note">' + escapeHtml(e.notes) + '</div>' : '') + '</td>' +
      '<td>' + escapeHtml(e.category) + '</td>' +
      '<td class="num">' + fmtPay(e.amount) + '</td>' +
      '<td>' + f.label + (e.payment_day && f.months ? ' <span class="exp-muted">(' + ordinal(e.payment_day) + ')</span>' : '') + '</td>' +
      '<td class="num">' + (e.frequency === "one-off" ? "—" : fmtPay(monthlyEquivalent(e))) + '</td>' +
      '<td class="mono date-cell">' + (next ? fmtDate(next) : "—") + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="actions-cell"><div class="row-actions">' +
        '<button class="icon-btn" data-exp-edit="' + e.id + '">Edit</button>' +
        '<button class="icon-btn" data-exp-toggle="' + e.id + '">' + (e.active ? "Pause" : "Resume") + '</button>' +
        '<button class="icon-btn danger" data-exp-delete="' + e.id + '">Delete</button>' +
      '</div></td>' +
    '</tr>';
  }).join("");

  return toolbar + form + stats +
    '<div class="section-title">By category <span class="section-sub">monthly equivalent</span></div>' +
    '<div class="card breakdown">' + catBars + '</div>' +
    '<div class="section-title">Due this month <span class="section-sub">' + monthName + '</span></div>' +
    '<div class="card month-table exp-due"><table><thead><tr><th>Day</th><th>Expense</th><th class="exp-cat-head">Category</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' + dueRows + '</tbody></table></div>' +
    '<div class="section-title">Your expenses</div>' +
    '<div class="card log-table-wrap"><table class="log-table exp-table"><thead><tr>' +
      '<th>Name</th><th>Category</th><th class="num">Amount</th><th>How often</th><th class="num">Per month</th><th>Next payment</th><th></th><th class="actions-col"></th>' +
    '</tr></thead><tbody>' + listRows + '</tbody></table></div>' +
    renderExpenseYearView();
}

function earningsSourceNote() {
  if (usingCustomEarnings()) return Object.keys(state.settings.customEarnings || {}).length ? "Entered by you" : "Type each month\u2019s pay in the table below";
  if (usingSalary()) return state.settings.salaries.length ? "From your salary" : "Add your salary in Settings";
  return "From your timesheet";
}
function earningsInput(key) {
  var v = (state.settings.customEarnings || {})[key];
  return '<span class="earn-input-wrap">\u00A3<input type="number" min="0" step="0.01" inputmode="decimal" class="field-input earn-input" data-earn-month="' + key + '"' +
    ' value="' + (v === undefined ? "" : v.toFixed(2)) + '" placeholder="0.00" aria-label="Earnings for ' + monthLabel(key) + '"></span>';
}
function renderExpenseYearView() {
  var mode = state.expYearMode === "tax" ? "tax" : "calendar";
  var choices = yearChoices(mode);
  var year = state.expYear !== null && choices.indexOf(state.expYear) !== -1 ? state.expYear : currentPeriodStart(mode);
  var view = expenseYearView(mode, year), current = monthKey(todayIso());
  var yearOpts = choices.map(function (y) {
    return '<option value="' + y + '"' + (y === year ? " selected" : "") + '>' + periodLabel(mode, y) + '</option>';
  }).join("");
  var rows = view.months.map(function (m) {
    var future = m.key > current;
    return '<tr class="' + (future ? "exp-future" : "") + (m.key === current ? " exp-current" : "") + '">' +
      '<td class="m-label">' + monthLabel(m.key) + '</td>' +
      '<td class="num">' + (usingCustomEarnings() ? earningsInput(m.key) : fmtPay(m.earnings)) + '</td>' +
      '<td class="num">' + fmtPay(m.expenses) + '</td>' +
      '<td class="num ' + (m.left < 0 ? "exp-neg" : "") + '">' + fmtMoney(m.left) + '</td>' +
    '</tr>';
  }).join("");
  var t = view.totals;
  return '<div class="section-title">Year view</div>' +
    '<div class="log-toolbar">' +
      '<div class="btn-row">' +
        '<button class="btn btn-sm' + (mode === "calendar" ? " btn-primary" : "") + '" data-exp-mode="calendar">Calendar year</button>' +
        '<button class="btn btn-sm' + (mode === "tax" ? " btn-primary" : "") + '" data-exp-mode="tax">Tax year (Apr–Mar)</button>' +
      '</div>' +
      '<select id="expYearSelect" class="field-input exp-year-select">' + yearOpts + '</select>' +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="card stat-card"><div class="stat-label">Earnings (' + (earningsAfterTax() ? "after" : "before") + ' tax)</div><div class="stat-value">' + fmtPay(t.earnings) + '</div><div class="stat-sub">' + earningsSourceNote() + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Expenses</div><div class="stat-value">' + fmtPay(t.expenses) + '</div><div class="stat-sub">' + periodLabel(mode, year) + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Left over</div><div class="stat-value ' + (t.left < 0 ? "exp-neg" : "exp-pos") + '">' + fmtMoney(t.left) + '</div><div class="stat-sub">Earnings minus expenses</div></div>' +
    '</div>' +
    '<div class="card month-table"><table><thead><tr><th>Month</th><th class="num">Earnings</th><th class="num">Expenses</th><th class="num">Left over</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr class="exp-total"><td class="m-label">Total</td><td class="num">' + fmtPay(t.earnings) + '</td><td class="num">' + fmtPay(t.expenses) + '</td><td class="num ' + (t.left < 0 ? "exp-neg" : "") + '">' + fmtMoney(t.left) + '</td></tr></tfoot>' +
    '</table></div>' +
    '<p class="footnote">' + (usingCustomEarnings()
      ? 'Earnings are the ' + (earningsAfterTax() ? 'after-tax' : 'before-tax') + ' amounts you\u2019ve typed in for each month (change where they come from in Settings). '
      : usingSalary()
      ? 'Earnings are your salary ' + (earningsAfterTax() ? 'after tax' : 'before tax') + ' (annual \u00F7 12 each month), set in Settings' + (earningsAfterTax() ? '. ' : ' \u2014 see Take-Home Pay for after-tax figures. ')
      : 'Earnings are your logged pay before tax, the same as the Summary tab \u2014 see Take-Home Pay for after-tax figures. You can use your salary or your own monthly amounts instead in Settings. ') +
      'Expenses count each payment in the month it falls, including one-offs. Paused expenses are left out.' +
      (earningsSource() === "timesheet" ? ' Later months (faded) only include what\u2019s logged so far.' : '') + '</p>';
}

function attachExpenseEvents() {
  bindIf("addExpenseBtn", "click", function () { state.expAdding = true; state.expEditingId = null; render(); focusExpenseForm(); });
  bindIf("emptyAddExpense", "click", function () { state.expAdding = true; render(); focusExpenseForm(); });
  bindIf("exportExpensesBtn", "click", exportExpensesCSV);
  bindIf("cancelExpense", "click", function () { state.expAdding = false; state.expEditingId = null; render(); });

  var saveBtn = document.getElementById("saveExpense");
  if (saveBtn) saveBtn.addEventListener("click", async function () {
    var v = readExpenseForm(), problem = validateExpense(v);
    if (problem) { toast(problem); return; }
    v.amount = Math.round(parseFloat(v.amount) * 100) / 100;
    saveBtn.disabled = true;
    var id = saveBtn.getAttribute("data-existing-id") || null;
    if (await saveExpense(id, v)) {
      state.expAdding = false; state.expEditingId = null;
      toast(id ? "Saved." : "Added “" + v.name + "”.");
      render();
    } else {
      saveBtn.disabled = false;
    }
  });

  var freq = document.getElementById("x_frequency");
  if (freq) {
    var refresh = function () {
      var f = freq.value, noDay = f === "weekly" || f === "one-off";
      document.getElementById("x_day").disabled = noDay;
      document.getElementById("x_end").disabled = f === "one-off";
      document.getElementById("x_start_label").textContent = f === "one-off" ? "Date paid" : "First payment";
      document.getElementById("expensePreview").innerHTML = expensePreviewText({
        frequency: f, amount: parseFloat(document.getElementById("x_amount").value) || 0
      });
    };
    freq.addEventListener("change", refresh);
    document.getElementById("x_amount").addEventListener("input", refresh);
  }

  document.querySelectorAll("[data-exp-edit]").forEach(function (b) {
    b.addEventListener("click", function () { state.expEditingId = b.getAttribute("data-exp-edit"); state.expAdding = false; render(); focusExpenseForm(); });
  });
  document.querySelectorAll("[data-exp-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var e = state.expenses.find(function (x) { return x.id === b.getAttribute("data-exp-toggle"); });
      if (e) setExpenseActive(e.id, !e.active);
    });
  });
  document.querySelectorAll("[data-exp-delete]").forEach(function (b) {
    b.addEventListener("click", function () { deleteExpense(b.getAttribute("data-exp-delete")); });
  });
  document.querySelectorAll("[data-exp-mode]").forEach(function (b) {
    b.addEventListener("click", function () { state.expYearMode = b.getAttribute("data-exp-mode"); state.expYear = null; render(); });
  });
  bindIf("expYearSelect", "change", function (ev) { state.expYear = parseInt(ev.target.value, 10); render(); });
  document.querySelectorAll("[data-earn-month]").forEach(function (input) {
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") input.blur(); });
    input.addEventListener("change", function () {
      var key = input.getAttribute("data-earn-month"), map = Object.assign({}, state.settings.customEarnings);
      var v = parseFloat(input.value);
      if (input.value.trim() === "") delete map[key];
      else if (isNaN(v) || v < 0) { toast("Enter an amount of \u00A30 or more."); render(); return; }
      else map[key] = Math.round(v * 100) / 100;
      saveSetting("customEarnings", cleanCustomEarnings(map));
      // Redraw once focus has moved, then put the cursor back where the user
      // was going: the box they clicked, or the next month after Enter.
      setTimeout(function () {
        var active = document.activeElement, target = active && active.getAttribute && active.getAttribute("data-earn-month");
        if (!target && (!active || active === document.body)) target = nextMonthKey(key);
        render();
        var el = target && document.querySelector('[data-earn-month="' + target + '"]');
        if (el) { el.focus(); el.select(); }
      }, 0);
    });
  });
}
function focusExpenseForm() {
  var el = document.getElementById("expenseForm");
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); var n = document.getElementById("x_name"); if (n) n.focus(); }
}
