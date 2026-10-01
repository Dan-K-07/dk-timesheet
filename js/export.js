"use strict";

/* ============ Export ============ */
function exportCSV() {
  var rows = [["Date","Start","End","Hours","Break","Hours Worked","Rate","Pay","Month","Type","Notes"]];
  sortedEntries().forEach(function (e) {
    var hours = computeHours(e), hw = computeHoursWorked(e), pay = computePay(e);
    rows.push([
      e.date || "", e.start || "", e.end || "",
      hours === null ? "" : hours.toFixed(2),
      e.breakHrs === "" || e.breakHrs === undefined || e.breakHrs === null ? "" : e.breakHrs,
      hw === null ? "" : hw.toFixed(2),
      e.rate === "" || e.rate === undefined || e.rate === null ? "" : e.rate,
      pay === null ? "" : pay.toFixed(2),
      e.date ? monthLabel(monthKey(e.date)) : "",
      e.type || "", e.notes || ""
    ]);
  });
  var csv = rows.map(function (r) {
    return r.map(function (v) {
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }).join("\n");
  var blob = new Blob([csv], { type: "text/csv" });
  offerDownload(blob, "DK_Timesheet.csv");
}
function exportXLSX() {
  var dataRows = [["Date","Start","End","Hours","Break","Hours Worked","Rate","Pay","Month","Type","Notes"]];
  sortedEntries().forEach(function (e) {
    var hours = computeHours(e), hw = computeHoursWorked(e), pay = computePay(e);
    dataRows.push([
      e.date || "", e.start || "", e.end || "",
      hours === null ? "" : Number(hours.toFixed(2)),
      e.breakHrs === "" || e.breakHrs === undefined ? "" : Number(e.breakHrs),
      hw === null ? "" : Number(hw.toFixed(2)),
      e.rate === "" || e.rate === undefined ? "" : Number(e.rate),
      pay === null ? "" : Number(pay.toFixed(2)),
      e.date ? monthLabel(monthKey(e.date)) : "",
      e.type || "", e.notes || ""
    ]);
  });
  var stats = summaryStats();
  var summaryRows = [
    ["Summary Dashboard"], [],
    ["Total Hours", "Total Pay", "Avg Hours/Month", "Avg Pay/Month", "Busiest Month"],
    [Number(stats.totalHours.toFixed(2)), Number(stats.totalPay.toFixed(2)), Number(stats.avgHours.toFixed(2)), Number(stats.avgPay.toFixed(2)), stats.busiestKey ? monthLabel(stats.busiestKey) + " (\u00A3" + stats.totalPay.toFixed(2) + ")" : ""],
    [],
    ["Warehouse %", "On Site %", "Holiday %", "Sick %"],
    [Math.round(stats.breakdown["Warehouse"] * 1000) / 10, Math.round(stats.breakdown["On Site"] * 1000) / 10, Math.round(stats.breakdown["Holiday"] * 1000) / 10, Math.round(stats.breakdown["Sick"] * 1000) / 10],
    [],
    ["Month", "Hours Worked", "Pay"]
  ];
  stats.monthKeys.forEach(function (k) {
    summaryRows.push([monthLabel(k), Number(stats.byMonth[k].hours.toFixed(2)), Number(stats.byMonth[k].pay.toFixed(2))]);
  });

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), "All_Data");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");
  var wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  var blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  offerDownload(blob, "DK_Timesheet.xlsx");
}
function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
