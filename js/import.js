"use strict";

/* ============ Excel import helpers ============ */
function excelSerialToISODate(serial) {
  var utcDays = Math.floor(serial - 25569);
  var d = new Date(utcDays * 86400 * 1000);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function excelFractionToHHMM(frac) {
  var totalMin = Math.round(frac * 24 * 60);
  totalMin = ((totalMin % 1440) + 1440) % 1440;
  return pad2(Math.floor(totalMin / 60)) + ":" + pad2(totalMin % 60);
}
function parseLooseTime(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return excelFractionToHHMM(v);
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return pad2(parseInt(m[1], 10)) + ":" + m[2];
  var ampm = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    var h = parseInt(ampm[1], 10) % 12;
    if (/[Pp]/.test(ampm[3])) h += 12;
    return pad2(h) + ":" + ampm[2];
  }
  return "";
}
function parseLooseDate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return excelSerialToISODate(v);
  var s = String(v).trim();
  var d = new Date(s);
  if (!isNaN(d)) return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  return "";
}

function importWorkbook(wb) {
  var sheetName = wb.SheetNames.find(function (n) { return n.replace(/\s|_/g, "").toLowerCase() === "alldata"; }) || wb.SheetNames[0];
  var ws = wb.Sheets[sheetName];
  var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  if (!rows.length) { toast("Couldn't find any rows to import."); return; }
  var header = rows[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
  function col(names) {
    for (var i = 0; i < names.length; i++) {
      var idx = header.indexOf(names[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  }
  var idx = {
    date: col(["date"]),
    start: col(["start"]),
    end: col(["end"]),
    brk: col(["break"]),
    rate: col(["rate"]),
    type: col(["type"]),
    notes: col(["notes"])
  };
  if (idx.date === -1) { toast("Couldn't find a Date column in that sheet."); return; }

  var byDate = {};
  state.entries.forEach(function (e) { byDate[e.date] = e; });

  var imported = 0;
  var emptyStreak = 0;
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var dateVal = row && idx.date !== -1 ? row[idx.date] : "";
    var iso = parseLooseDate(dateVal);
    if (!iso) {
      emptyStreak++;
      // Sheets sometimes declare a range covering the whole column;
      // stop once we've clearly run past the real data.
      if (imported > 0 && emptyStreak > 500) break;
      continue;
    }
    emptyStreak = 0;

    var existing = byDate[iso];
    var entry = existing ? Object.assign({}, existing) : { id: uid(), date: iso };
    entry.date = iso;
    if (idx.start !== -1) entry.start = parseLooseTime(row[idx.start]);
    if (idx.end !== -1) entry.end = parseLooseTime(row[idx.end]);
    if (idx.brk !== -1) entry.breakHrs = row[idx.brk] === "" ? "" : parseFloat(row[idx.brk]);
    if (idx.rate !== -1) entry.rate = row[idx.rate] === "" ? "" : parseFloat(row[idx.rate]);
    if (idx.type !== -1) entry.type = String(row[idx.type] || "").trim();
    if (idx.notes !== -1) entry.notes = String(row[idx.notes] || "").trim();

    byDate[iso] = entry;
    imported++;
  }
  state.entries = Object.keys(byDate).map(function (k) { return byDate[k]; });
  save();
  toast("Imported " + imported + " row" + (imported === 1 ? "" : "s") + " from " + sheetName + ".");
  render();
}
