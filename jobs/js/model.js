"use strict";

/* =====================================================================
   DK Jobs - calculations: tax years, totals, mileage, reports.
   ===================================================================== */

/* ---------- UK tax year (6 April to 5 April) ---------- */
// Returns the year the tax year starts in, e.g. 2026 for 2026/27.
function taxYearOf(iso) {
  if (!iso) return null;
  var y = parseInt(iso.slice(0, 4), 10), md = iso.slice(5, 10);
  return md >= "04-06" ? y : y - 1;
}
function currentTaxYear() { return taxYearOf(todayIso()); }
function taxYearLabel(y) { return y + "/" + String(y + 1).slice(2); }
function taxYearStart(y) { return y + "-04-06"; }
function taxYearEnd(y) { return (y + 1) + "-04-05"; }
function inTaxYear(iso, y) { return !!iso && iso >= taxYearStart(y) && iso <= taxYearEnd(y); }
// MTD quarters (standard periods) and when each update is due.
function taxQuarters(y) {
  return [
    { key: "q1", label: "Q1", from: y + "-04-06", to: y + "-07-05", due: y + "-08-07" },
    { key: "q2", label: "Q2", from: y + "-07-06", to: y + "-10-05", due: y + "-11-07" },
    { key: "q3", label: "Q3", from: y + "-10-06", to: (y + 1) + "-01-05", due: (y + 1) + "-02-07" },
    { key: "q4", label: "Q4", from: (y + 1) + "-01-06", to: (y + 1) + "-04-05", due: (y + 1) + "-05-07" }
  ];
}
function periodRange(y, quarterKey) {
  if (!quarterKey || quarterKey === "all") return { from: taxYearStart(y), to: taxYearEnd(y) };
  var q = taxQuarters(y).filter(function (x) { return x.key === quarterKey; })[0];
  return { from: q.from, to: q.to };
}
function inRange(iso, r) { return !!iso && iso >= r.from && iso <= r.to; }
// Tax years that have any data in them, plus the current one, newest first.
function yearsWithData() {
  var set = {}; set[currentTaxYear()] = true;
  var d = state.data;
  d.jobs.forEach(function (j) { var s = jobStartDate(j); if (s) set[taxYearOf(s)] = true; });
  d.invoices.forEach(function (i) { if (i.date) set[taxYearOf(i.date)] = true; });
  d.expenses.forEach(function (e) { if (e.date) set[taxYearOf(e.date)] = true; });
  d.mileage.forEach(function (m) { if (m.date) set[taxYearOf(m.date)] = true; });
  return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
}

/* ---------- Lookups ---------- */
function clientName(id) { var c = byId(state.data.clients, id); return c ? c.name : "No client"; }
function jobById(id) { return byId(state.data.jobs, id); }
function jobLabel(j) { return j ? (j.ref ? j.ref + " · " : "") + (j.title || "Untitled job") : ""; }
function jobStartDate(j) {
  var ds = (j.dates || []).map(function (d) { return d.start; }).filter(Boolean).sort();
  return ds[0] || "";
}
function jobEndDate(j) {
  var ds = (j.dates || []).map(function (d) { return d.end || d.start; }).filter(Boolean).sort();
  return ds[ds.length - 1] || "";
}
function jobDateText(j) {
  var s = jobStartDate(j), e = jobEndDate(j);
  if (!s) return "No date";
  return s === e || !e ? fmtDate(s) : fmtDate(s) + " → " + fmtDate(e);
}
function categoryHmrc(name) {
  var cats = state.data.settings.expenseCategories;
  for (var i = 0; i < cats.length; i++) if (cats[i].name === name) return cats[i].hmrc;
  return "other";
}

/* ---------- Money ---------- */
function vatOn() { return !!state.data.settings.vatRegistered; }
function lineNet(it) { return round2(num(it.qty) * num(it.price)); }
function itemsNet(items) { return round2((items || []).reduce(function (s, it) { return s + lineNet(it); }, 0)); }
function jobNet(j) { return itemsNet(j.items); }
// Expense cost for profit: net of VAT if you're VAT registered (you reclaim it).
function expenseCost(e) { return round2(num(e.amount) - (vatOn() ? num(e.vat) : 0)); }

function docTotals(doc) {
  var net = itemsNet(doc.items);
  var vat = doc.vatRate ? round2(net * num(doc.vatRate) / 100) : 0;
  return { net: net, vat: vat, gross: round2(net + vat) };
}
function liveInvoices() { return state.data.invoices.filter(function (i) { return i.kind === "invoice" && i.status !== "void"; }); }
// An invoice is for one job (jobId), or for several jobs in a project (jobIds).
function invoicesForJob(jobId) {
  return state.data.invoices.filter(function (i) { return i.jobId === jobId || (i.jobIds && i.jobIds.indexOf(jobId) !== -1); });
}
function docJobs(d) {
  var ids = d.jobIds && d.jobIds.length ? d.jobIds : d.jobId ? [d.jobId] : [];
  return ids.map(jobById).filter(Boolean);
}
function projectById(id) { return byId(state.data.projects, id); }
function projectJobs(p) { return state.data.jobs.filter(function (j) { return j.projectId === p.id; }); }
// The name used to greet the client in emails: their first contact.
function clientContactName(c) { return (c.contacts && c.contacts[0] && c.contacts[0].name) || c.contact || ""; }
function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }
/* How quickly a client pays: average days from invoice date to paid. */
function paymentScore(clientId) {
  var paid = liveInvoices().filter(function (i) { return i.clientId === clientId && i.status === "paid" && i.paidDate && i.date; });
  if (!paid.length) return null;
  var avg = Math.round(paid.reduce(function (s, i) { return s + Math.max(0, daysBetween(i.date, i.paidDate)); }, 0) / paid.length);
  var band = avg <= 7 ? ["Amazing", "amazing"] : avg <= 21 ? ["Good", "good"] : avg <= 35 ? ["Okay", "okay"] : ["Poor", "poor"];
  return { days: avg, count: paid.length, label: band[0], cls: band[1] };
}
/* "Paid (26d early)", "Overdue (3d)" etc. for an invoice. */
function invoiceStatusText(i) {
  if (i.kind === "quote") return { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", void: "Void" }[i.status] || i.status;
  if (i.status === "paid") {
    if (!i.paidDate || !i.due) return "Paid";
    var diff = daysBetween(i.paidDate, i.due);
    return diff > 0 ? "Paid (" + diff + "d early)" : diff < 0 ? "Paid (" + -diff + "d late)" : "Paid (on time)";
  }
  if (isOverdue(i)) return "Overdue (" + daysBetween(i.due, todayIso()) + "d)";
  return { draft: "Draft", sent: "Sent", void: "Void" }[i.status] || i.status;
}
function isOverdue(inv) { return inv.kind === "invoice" && inv.status === "sent" && inv.due && inv.due < todayIso(); }

/* Things on a job not yet put on an invoice: line items without an
   invoiceId, plus billable expenses and billable mileage not invoiced. */
function jobUninvoiced(j) {
  var items = (j.items || []).filter(function (it) { return !it.invoiceId; });
  var exps = state.data.expenses.filter(function (e) { return e.jobId === j.id && e.billable && !e.invoiceId; });
  var miles = state.data.mileage.filter(function (m) { return m.jobId === j.id && m.billable && !m.invoiceId; });
  var total = itemsNet(items) +
    exps.reduce(function (s, e) { return s + expenseCost(e); }, 0) +
    miles.reduce(function (s, m) { return s + tripMiles(m) * num(m.billRate); }, 0);
  return { items: items, expenses: exps, mileage: miles, total: round2(total) };
}

/* ---------- Mileage ---------- */
// Total miles for a journey: one-way miles, doubled if it's a return, times the number of trips.
function tripMiles(m) { return round2(num(m.miles) * (m.trip === "return" ? 2 : 1) * Math.max(1, parseInt(m.trips, 10) || 1)); }
// The first-rate per mile for a tax year. HMRC raised it from 45p to
// 55p from 6 April 2026; Settings can change the current rates.
function rateHighFor(y) { return y >= 2026 ? num(state.data.settings.mileageRateHigh) : 0.45; }
function rateLowFor() { return num(state.data.settings.mileageRateLow); }
// Every trip in a tax year with its claimable value. The higher rate
// applies to the first 10,000 business miles in the year, in date order.
function mileageForYear(y) {
  var trips = state.data.mileage.filter(function (m) { return inTaxYear(m.date, y); })
    .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var threshold = num(state.data.settings.mileageThreshold) || 10000;
  var hi = rateHighFor(y), lo = rateLowFor();
  var running = 0, total = 0, miles = 0;
  var rows = trips.map(function (m) {
    var mi = tripMiles(m);
    var atHigh = Math.max(0, Math.min(mi, threshold - running));
    var val = round2(atHigh * hi + (mi - atHigh) * lo);
    running += mi; total += val; miles += mi;
    return { trip: m, miles: mi, value: val };
  });
  return { rows: rows, miles: round2(miles), value: round2(total), rateHigh: hi, rateLow: lo };
}

/* ---------- Income ---------- */
// Cash basis (the default for sole traders) counts an invoice when it's
// paid; accruals counts it on the invoice date.
function incomeDate(inv) {
  if (state.data.settings.accountingBasis === "accruals") return inv.date;
  return inv.status === "paid" ? (inv.paidDate || inv.date) : null;
}
function incomeInRange(r) {
  return liveInvoices().filter(function (i) { var d = incomeDate(i); return d && inRange(d, r); });
}

/* ---------- Report for a period ---------- */
function buildReport(y, quarterKey) {
  var r = periodRange(y, quarterKey);
  var invs = incomeInRange(r);
  var turnover = 0, vatCharged = 0;
  invs.forEach(function (i) { var t = docTotals(i); turnover += t.net; vatCharged += t.vat; });

  var cats = {}; Object.keys(HMRC_CATEGORIES).forEach(function (k) { cats[k] = 0; });
  var exps = state.data.expenses.filter(function (e) { return inRange(e.date, r); });
  var vatReclaim = 0;
  exps.forEach(function (e) { cats[categoryHmrc(e.category)] += expenseCost(e); if (vatOn()) vatReclaim += num(e.vat); });

  // Mileage value for trips in the period, using the whole-year running
  // total so the 10,000 mile switch-over lands in the right quarter.
  var mile = mileageForYear(y);
  var mRows = mile.rows.filter(function (x) { return inRange(x.trip.date, r); });
  var mileValue = round2(mRows.reduce(function (s, x) { return s + x.value; }, 0));
  var mileMiles = round2(mRows.reduce(function (s, x) { return s + x.miles; }, 0));
  // Fuel/car running costs can't be claimed as well as mileage allowance
  // for the same vehicle - see the note on the Reports page.
  cats.travel += mileValue;

  Object.keys(cats).forEach(function (k) { cats[k] = round2(cats[k]); });
  var allowable = 0;
  Object.keys(cats).forEach(function (k) { if (k !== "capital" && k !== "disallowable") allowable += cats[k]; });
  allowable = round2(allowable);
  return {
    range: r, invoices: invs, expenses: exps,
    turnover: round2(turnover), vatCharged: round2(vatCharged), vatReclaim: round2(vatReclaim),
    categories: cats, mileValue: mileValue, mileMiles: mileMiles, mileTrips: mRows.length,
    allowable: allowable, profit: round2(turnover - allowable)
  };
}

/* ---------- Numbering ---------- */
function nextDocNumber(kind) {
  var s = state.data.settings;
  var key = kind === "quote" ? "nextQuoteNo" : "nextInvoiceNo";
  var prefix = kind === "quote" ? s.quotePrefix : s.invoicePrefix;
  var n = Math.max(1, parseInt(s[key], 10) || 1);
  // Never reuse a number that's already been issued.
  var used = {};
  state.data.invoices.forEach(function (i) { used[i.number] = true; });
  while (used[prefix + String(n).padStart(4, "0")]) n++;
  s[key] = n + 1;
  return prefix + String(n).padStart(4, "0");
}
function nextJobRef() {
  var s = state.data.settings;
  var n = Math.max(1, parseInt(s.nextJobNo, 10) || (state.data.jobs.length + 1));
  s.nextJobNo = n + 1;
  return "J" + String(n).padStart(4, "0");
}

/* ---------- Status helpers ---------- */
/* After invoicing or payment, move the job along: invoiced -> Awaiting
   Payment; everything invoiced and paid -> Completed. Cancelled jobs
   and jobs you've set back to Potential/Pencilled by hand are left. */
function refreshJobStatus(j) {
  if (!j || j.status === "Cancelled") return;
  var invs = invoicesForJob(j.id).filter(function (i) { return i.kind === "invoice" && i.status !== "void"; });
  if (!invs.length) return;
  var unpaid = invs.some(function (i) { return i.status !== "paid"; });
  var left = jobUninvoiced(j).total > 0;
  if (!unpaid && !left) j.status = "Completed";
  else if (unpaid) j.status = "Awaiting Payment";
}
