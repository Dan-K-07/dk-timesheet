"use strict";

/* ============ UK take-home pay (2026/27 rates) ============ */
function personalAllowance(income) {
  if (income <= 100000) return 12570;
  if (income >= 125140) return 0;
  return 12570 - (income - 100000) / 2;
}
function ukIncomeTaxEW(gross) {
  var pa = personalAllowance(gross);
  var taxable = Math.max(0, gross - pa);
  var basicBand = 37700;
  var higherBandTop = 125140 - pa;
  var tax = 0;
  tax += Math.min(taxable, basicBand) * 0.20;
  if (taxable > basicBand) tax += (Math.min(taxable, higherBandTop) - basicBand) * 0.40;
  if (taxable > higherBandTop) tax += (taxable - higherBandTop) * 0.45;
  return Math.max(0, tax);
}
function ukIncomeTaxScotland(gross) {
  var pa = personalAllowance(gross);
  var taxable = Math.max(0, gross - pa);
  var stdPA = 12570;
  var bands = [
    { top: 16537 - stdPA, rate: 0.19 },
    { top: 29526 - stdPA, rate: 0.20 },
    { top: 43662 - stdPA, rate: 0.21 },
    { top: 75000 - stdPA, rate: 0.42 },
    { top: 125140 - pa, rate: 0.45 },
    { top: Infinity, rate: 0.48 }
  ];
  var tax = 0, prevTop = 0;
  for (var i = 0; i < bands.length; i++) {
    if (taxable <= prevTop) break;
    var sliceTop = Math.min(taxable, bands[i].top);
    tax += Math.max(0, sliceTop - prevTop) * bands[i].rate;
    prevTop = bands[i].top;
  }
  return Math.max(0, tax);
}
function employeeNI(gross) {
  var pt = 12570, uel = 50270;
  if (gross <= pt) return 0;
  var ni = (Math.min(gross, uel) - pt) * 0.08;
  if (gross > uel) ni += (gross - uel) * 0.02;
  return ni;
}
function studentLoanRepayment(basis, plan) {
  var thresholds = { plan1: 26900, plan2: 29385, plan4: 33795, plan5: 25000, postgrad: 21000 };
  var rates = { plan1: 0.09, plan2: 0.09, plan4: 0.09, plan5: 0.09, postgrad: 0.06 };
  if (!plan || !thresholds[plan]) return 0;
  return Math.max(0, basis - thresholds[plan]) * rates[plan];
}
function cumulativeIncomeTaxEW(ytdGross, monthIndex) {
  var scale = monthIndex / 12;
  var estAnnual = scale > 0 ? ytdGross / scale : ytdGross;
  var pa = personalAllowance(estAnnual) * scale;
  var taxable = Math.max(0, ytdGross - pa);
  var basicBand = 37700 * scale;
  var higherTop = 125140 * scale - pa;
  var tax = 0;
  tax += Math.min(taxable, basicBand) * 0.20;
  if (taxable > basicBand) tax += (Math.min(taxable, higherTop) - basicBand) * 0.40;
  if (taxable > higherTop) tax += (taxable - higherTop) * 0.45;
  return Math.max(0, tax);
}
function cumulativeIncomeTaxScotland(ytdGross, monthIndex) {
  var scale = monthIndex / 12;
  var estAnnual = scale > 0 ? ytdGross / scale : ytdGross;
  var pa = personalAllowance(estAnnual) * scale;
  var taxable = Math.max(0, ytdGross - pa);
  var bands = [
    { top: (16537 - 12570) * scale, rate: 0.19 },
    { top: (29526 - 12570) * scale, rate: 0.20 },
    { top: (43662 - 12570) * scale, rate: 0.21 },
    { top: (75000 - 12570) * scale, rate: 0.42 },
    { top: 125140 * scale - pa, rate: 0.45 },
    { top: Infinity, rate: 0.48 }
  ];
  var tax = 0, prev = 0;
  for (var i = 0; i < bands.length; i++) {
    if (taxable <= prev) break;
    var sliceTop = Math.min(taxable, bands[i].top);
    tax += Math.max(0, sliceTop - prev) * bands[i].rate;
    prev = bands[i].top;
  }
  return Math.max(0, tax);
}
function monthlyNI(monthGross) {
  var pt = 12570 / 12, uel = 50270 / 12;
  if (monthGross <= pt) return 0;
  var ni = (Math.min(monthGross, uel) - pt) * 0.08;
  if (monthGross > uel) ni += (monthGross - uel) * 0.02;
  return ni;
}
function monthlyStudentLoan(monthGross, plan) {
  var thresholds = { plan1: 26900, plan2: 29385, plan4: 33795, plan5: 25000, postgrad: 21000 };
  var rates = { plan1: 0.09, plan2: 0.09, plan4: 0.09, plan5: 0.09, postgrad: 0.06 };
  if (!plan || !thresholds[plan]) return 0;
  return Math.max(0, monthGross - thresholds[plan] / 12) * rates[plan];
}
function allMonthsGrossMap() {
  var map = {};
  state.entries.forEach(function (e) {
    var k = monthKey(e.date);
    if (!k) return;
    var pay = computePay(e);
    if (pay === null) return;
    map[k] = (map[k] || 0) + pay;
  });
  return map;
}
function taxYearInfo(monthKeyStr) {
  var parts = monthKeyStr.split("-");
  var calYear = parseInt(parts[0], 10), calMonth = parseInt(parts[1], 10);
  var startYear = calMonth >= 4 ? calYear : calYear - 1;
  return { label: startYear + "/" + String(startYear + 1).slice(2), monthIndex: ((calMonth - 4 + 12) % 12) + 1 };
}
function monthlyPayeBreakdown(vals) {
  var grossMap = allMonthsGrossMap();
  var keys = Object.keys(grossMap).sort();
  var byTaxYear = {};
  keys.forEach(function (k) {
    var info = taxYearInfo(k);
    if (!byTaxYear[info.label]) byTaxYear[info.label] = [];
    byTaxYear[info.label].push({ key: k, monthIndex: info.monthIndex, gross: grossMap[k] });
  });

  var rows = [];
  Object.keys(byTaxYear).sort().forEach(function (taxYearLabel) {
    var months = byTaxYear[taxYearLabel].slice().sort(function (a, b) { return a.monthIndex - b.monthIndex; });
    var cumTaxableGross = 0, cumTaxPaid = 0;
    months.forEach(function (m) {
      var pensionAmount = vals.pensionMethod === "none" ? 0 : m.gross * (vals.pensionPct / 100);
      var taxableThisMonth = Math.max(0, m.gross - pensionAmount);
      var niBasisThisMonth = vals.pensionMethod === "sacrifice" ? Math.max(0, m.gross - pensionAmount) : m.gross;

      cumTaxableGross += taxableThisMonth;
      var due = vals.region === "scotland"
        ? cumulativeIncomeTaxScotland(cumTaxableGross, m.monthIndex)
        : cumulativeIncomeTaxEW(cumTaxableGross, m.monthIndex);
      var monthTax = due - cumTaxPaid;
      cumTaxPaid = due;

      var monthNI = monthlyNI(niBasisThisMonth);
      var monthLoan = monthlyStudentLoan(niBasisThisMonth, vals.loanPlan);
      var net = m.gross - monthTax - monthNI - monthLoan - pensionAmount;

      rows.push({ taxYear: taxYearLabel, key: m.key, gross: m.gross, incomeTax: monthTax, ni: monthNI, loan: monthLoan, pension: pensionAmount, net: net });
    });
  });
  return rows;
}

function computeTakeHome(vals) {
  var gross = vals.gross;
  var pensionAmount = vals.pensionMethod === "none" ? 0 : gross * (vals.pensionPct / 100);
  var taxBasis = Math.max(0, gross - pensionAmount);
  var niBasis = vals.pensionMethod === "sacrifice" ? Math.max(0, gross - pensionAmount) : gross;
  var incomeTax = vals.region === "scotland" ? ukIncomeTaxScotland(taxBasis) : ukIncomeTaxEW(taxBasis);
  var ni = employeeNI(niBasis);
  var loan = studentLoanRepayment(niBasis, vals.loanPlan);
  var net = gross - incomeTax - ni - loan - pensionAmount;
  return { gross: gross, incomeTax: incomeTax, ni: ni, loan: loan, pension: pensionAmount, net: net };
}

function summaryStats() {
  var byMonth = aggregateByMonth();
  var keys = Object.keys(byMonth).sort();
  var totalHours = 0, totalPay = 0;
  keys.forEach(function (k) { totalHours += byMonth[k].hours; totalPay += byMonth[k].pay; });

  var hoursMonths = keys.filter(function (k) { return byMonth[k].hours > 0; });
  var payMonths = keys.filter(function (k) { return byMonth[k].pay > 0; });
  var avgHours = hoursMonths.length ? hoursMonths.reduce(function (s, k) { return s + byMonth[k].hours; }, 0) / hoursMonths.length : 0;
  var avgPay = payMonths.length ? payMonths.reduce(function (s, k) { return s + byMonth[k].pay; }, 0) / payMonths.length : 0;

  var busiestKey = null, busiestPay = -1;
  keys.forEach(function (k) { if (byMonth[k].pay > busiestPay) { busiestPay = byMonth[k].pay; busiestKey = k; } });

  var rangeEntries = summaryEntries();
  var working = rangeEntries.filter(function (e) { return e.type && e.type !== "Off"; });
  var logged = rangeEntries.filter(function (e) { return !!e.type; });
  function pct(type, denom) { return denom.length ? (denom.filter(function (e) { return e.type === type; }).length / denom.length) : 0; }

  return {
    totalHours: totalHours, totalPay: totalPay,
    avgHours: avgHours, avgPay: avgPay,
    busiestKey: busiestKey, busiestPay: busiestKey ? byMonth[busiestKey].pay : 0,
    byMonth: byMonth, monthKeys: keys,
    entryCount: rangeEntries.length,
    breakdown: {
      "Warehouse": pct("Warehouse", working),
      "On Site": pct("On Site", working),
      "Holiday": pct("Holiday", working),
      "Sick": pct("Sick", logged)
    }
  };
}
