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
  // Check for AM/PM first, or "5:00 PM" would be read as 05:00.
  var ampm = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AaPp])\.?[Mm]\.?$/);
  if (ampm) {
    var h = parseInt(ampm[1], 10) % 12;
    if (/[Pp]/.test(ampm[3])) h += 12;
    return pad2(h) + ":" + (ampm[2] || "00");
  }
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return pad2(parseInt(m[1], 10)) + ":" + m[2];
  return "";
}
function parseLooseDate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return excelSerialToISODate(v);
  var s = String(v).trim();
  // Typed or CSV dates are UK order: 03/10/2025 is 3 October (a plain
  // new Date() would read it the US way, as 10 March).
  var uk = s.match(/^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (uk) {
    var dd = parseInt(uk[1], 10), mm = parseInt(uk[2], 10), yy = parseInt(uk[3], 10);
    if (uk[3].length === 2) yy += 2000;
    var t = new Date(yy, mm - 1, dd);
    if (t.getFullYear() !== yy || t.getMonth() !== mm - 1 || t.getDate() !== dd) return "";
    return yy + "-" + pad2(mm) + "-" + pad2(dd);
  }
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  var d = new Date(s);
  if (!isNaN(d)) return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  return "";
}

// "warehouse", "onsite", "toil" etc. become the app's own day types.
function matchType(v) {
  var s = String(v || "").trim(), key = s.toLowerCase().replace(/[^a-z]/g, "");
  for (var i = 0; i < TYPES.length; i++) if (TYPES[i].toLowerCase().replace(/[^a-z]/g, "") === key) return TYPES[i];
  return s;
}

/* ============ Import template ============ */
// The columns the importer reads (any order; other columns are ignored).
// (Import also reads a "TOIL Banked" column, as in the app's own exports, but
// the template leaves it out.)
var IMPORT_COLUMNS = ["Date", "Start", "End", "Break", "Rate", "Type", "Notes"];
function downloadImportTemplate() {
  var wb = XLSX.utils.book_new();
  var data = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS]);
  data["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 7 }, { wch: 11 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, data, "All Data");
  var example = XLSX.utils.aoa_to_sheet([
    IMPORT_COLUMNS,
    ["06/01/2025", "08:00", "17:00", 0.5, 15, "Warehouse", "Normal day"],
    ["07/01/2025", "08:00", "19:00", 0.5, 15, "On Site", "Show build"],
    ["08/01/2025", "", "", "", "", "Holiday", "Full day off - no times needed"],
    ["09/01/2025", "09:00", "13:00", 0, 15, "Holiday", "Half day"],
    ["13/01/2025", "", "", "", "", "Sick", ""],
    ["14/01/2025", "", "", "", "", "Off", ""]
  ]);
  example["!cols"] = data["!cols"];
  XLSX.utils.book_append_sheet(wb, example, "Example");
  var help = XLSX.utils.aoa_to_sheet([
    ["How to fill in the All Data sheet"], [],
    ["Column", "What to put", "Example"],
    ["Date", "Required. One row per day. A real Excel date, or typed as DD/MM/YYYY.", "06/01/2025"],
    ["Start", "Start time with a colon: 24-hour (08:00) or with AM/PM (8:00 AM). Leave blank for days off.", "08:00"],
    ["End", "Finish time. Past midnight is fine (e.g. 22:00 to 02:00).", "17:00"],
    ["Break", "Unpaid break in hours (0.5 = 30 minutes).", "0.5"],
    ["Rate", "Hourly rate in pounds, numbers only.", "15"],
    ["Type", "One of: " + TYPES.filter(function (t) { return t !== "TOIL"; }).join(", ") + ".", "Warehouse"],
    ["Notes", "Anything you like.", "Show build"],
    [],
    ["Good to know"],
    ["Hours, hours worked and pay are worked out by the app - you don't need those columns (they're ignored if there)."],
    ["If a date is already logged with different details, you'll see both and choose for each day: Replace, Keep both (e.g. a split day) or Keep existing."],
    ["Rows that match what's already logged are skipped, so importing the same file twice won't make duplicates."],
    ["Only the sheet called \"All Data\" is imported (or the first sheet if there isn't one), so the Example sheet won't be."],
    ["A file exported from the app (Export Excel / Export CSV) can be imported straight back."]
  ]);
  help["!cols"] = [{ wch: 14 }, { wch: 78 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, help, "How to");
  var out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  offerDownload(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "DK_Timesheet_Import_Template.xlsx");
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
    notes: col(["notes"]),
    toil: col(["toil banked", "toil"])
  };
  if (idx.date === -1) { toast("Couldn't find a Date column in that sheet."); return; }

  // Read every usable row first, so clashes can be shown before anything changes.
  var fileRows = [], emptyStreak = 0;
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var iso = parseLooseDate(row ? row[idx.date] : "");
    if (!iso) {
      emptyStreak++;
      // Sheets sometimes declare a range covering the whole column;
      // stop once we've clearly run past the real data.
      if (fileRows.length && emptyStreak > 500) break;
      continue;
    }
    emptyStreak = 0;
    fileRows.push(entryFromRow(iso, row, idx));
  }
  if (!fileRows.length) { toast("No rows with a date found in " + sheetName + "."); return; }

  // Sort each row into: same as what's already logged (skipped), a new day,
  // or a clash with a day that's already logged differently.
  var existingOn = {};
  state.entries.forEach(function (e) { if (e.date) (existingOn[e.date] = existingOn[e.date] || []).push(e); });
  var plan = { fresh: [], same: 0, clashDates: [], clashRows: {} };
  fileRows.forEach(function (f) {
    var have = existingOn[f.date];
    if (!have) { plan.fresh.push(f); return; }
    if (have.some(function (e) { return sameEntry(e, f.fields); })) { plan.same++; return; }
    if (!plan.clashRows[f.date]) { plan.clashRows[f.date] = []; plan.clashDates.push(f.date); }
    plan.clashRows[f.date].push(f);
  });
  if (!plan.clashDates.length) { applyImport(plan, {}, sheetName); return; }
  showImportClashes(plan, existingOn, sheetName);
}

// The fields a row of the file sets (only the columns the file has).
function entryFromRow(iso, row, idx) {
  var f = {};
  if (idx.start !== -1) f.start = parseLooseTime(row[idx.start]);
  if (idx.end !== -1) f.end = parseLooseTime(row[idx.end]);
  if (idx.brk !== -1) f.breakHrs = row[idx.brk] === "" ? "" : parseFloat(row[idx.brk]);
  if (idx.rate !== -1) f.rate = row[idx.rate] === "" ? "" : parseFloat(row[idx.rate]);
  if (idx.type !== -1) f.type = matchType(row[idx.type]);
  if (idx.notes !== -1) f.notes = String(row[idx.notes] || "").trim();
  if (idx.toil !== -1) f.toilHrs = row[idx.toil] === "" ? "" : String(parseFloat(row[idx.toil]) || "");
  return { date: iso, fields: f };
}
// True when an existing entry already matches everything the file row says.
function sameEntry(e, f) {
  return Object.keys(f).every(function (k) {
    var a = e[k] === undefined || e[k] === null ? "" : String(e[k]), b = f[k] === undefined || f[k] === null ? "" : String(f[k]);
    if (k === "breakHrs" || k === "rate" || k === "toilHrs") return (parseFloat(a) || 0) === (parseFloat(b) || 0);
    return a === b;
  });
}
// One entry in the clash pop-up, e.g.
//   10:00 - 16:00
//   0.5 hr break
//   Total 5.5 hrs
//   Warehouse · "Show build"
function entrySummaryHtml(e) {
  var lines = [], brk = parseFloat(e.breakHrs), hw = computeHoursWorked(e);
  if (e.start || e.end) lines.push('<b>' + escapeHtml((e.start || "?") + " \u2013 " + (e.end || "?")) + '</b>');
  if (e.start && e.end) lines.push(escapeHtml((isNaN(brk) || !brk ? "No" : fmtHours(brk) + " hr") + " break"));
  if (hw !== null) lines.push('<b>Total ' + escapeHtml(fmtHours(hw)) + ' hr' + (hw === 1 ? "" : "s") + '</b>');
  var about = [];
  if (e.type) about.push(e.type);
  if (e.notes) about.push("\u201c" + (e.notes.length > 28 ? e.notes.slice(0, 27) + "\u2026" : e.notes) + "\u201d");
  if (about.length) lines.push('<span class="clash-about">' + escapeHtml(about.join(" \u00B7 ")) + '</span>');
  return lines.join("<br>") || "(blank)";
}

// What to do with each clashing day: choices[date] is "replace" (the file
// wins), "both" (add the file's rows as extra entries, e.g. the other half
// of a split day) or "skip" (keep what's logged). New days are always added.
function applyImport(plan, choices, sheetName) {
  var result = state.entries.slice(), added = 0, replaced = 0, kept = 0, both = 0;
  plan.fresh.forEach(function (f) { result.push(Object.assign({ id: uid(), date: f.date }, f.fields)); added++; });
  plan.clashDates.forEach(function (d) {
    var rows = plan.clashRows[d], choice = choices[d] || "skip";
    if (choice === "both") { rows.forEach(function (f) { result.push(Object.assign({ id: uid(), date: d }, f.fields)); added++; }); both++; return; }
    if (choice !== "replace") { kept++; return; }
    // Keep the first entry for the day (its id and any columns the file
    // doesn't have), drop any others, then add any extra rows from the file.
    var first = -1;
    result = result.filter(function (e, i) {
      if (e.date !== d) return true;
      if (first === -1) { first = i; return true; }
      return false;
    });
    var at = result.findIndex(function (e) { return e.date === d; });
    result[at] = Object.assign({}, result[at], rows[0].fields);
    rows.slice(1).forEach(function (f) { result.push(Object.assign({ id: uid(), date: d }, f.fields)); added++; });
    replaced++;
  });
  state.entries = result;
  save();
  var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
  var bits = [];
  if (added) bits.push(plural(added, "entry").replace("entrys", "entries") + " added");
  if (replaced) bits.push(plural(replaced, "day") + " replaced");
  if (both) bits.push(plural(both, "day") + " with both kept");
  if (kept) bits.push(plural(kept, "day") + " kept as they were");
  if (plan.same) bits.push(plan.same + " already up to date");
  toast("Imported from " + sheetName + ": " + (bits.join(", ") || "nothing new") + ".");
  render();
}

/* ---- "These days are already logged" popup: a choice for each day ---- */
var CLASH_CHOICES = [["replace", "Replace"], ["both", "Keep both"], ["skip", "Keep existing"]];
function showImportClashes(plan, existingOn, sheetName) {
  var n = plan.clashDates.length, choices = {};
  plan.clashDates.forEach(function (d) { choices[d] = "replace"; });
  var list = plan.clashDates.map(function (d, i) {
    return '<div class="clash-row" data-date="' + d + '"><div class="clash-date">' + escapeHtml(fmtDate(d)) + '</div>' +
      '<div class="clash-side"><span class="clash-label">Already logged</span>' + existingOn[d].map(entrySummaryHtml).join('<div class="clash-gap"></div>') + '</div>' +
      '<div class="clash-side"><span class="clash-label">In the import</span>' + plan.clashRows[d].map(function (f) { return entrySummaryHtml(f.fields); }).join('<div class="clash-gap"></div>') + '</div>' +
      '<div class="clash-pick" role="radiogroup" aria-label="' + escapeHtml(fmtDate(d)) + '">' + CLASH_CHOICES.map(function (c) {
        return '<label class="clash-opt"><input type="radio" name="clash' + i + '" value="' + c[0] + '" data-date="' + d + '"' + (c[0] === "replace" ? " checked" : "") + '><span>' + c[1] + '</span></label>';
      }).join("") + '</div></div>';
  }).join("");
  var box = document.createElement("div");
  box.className = "ts-modal-scrim";
  box.innerHTML = '<div class="ts-modal ts-modal-wide" role="dialog" aria-modal="true" aria-labelledby="clashTitle">' +
    '<div class="ts-modal-head"><span class="ts-modal-icon" aria-hidden="true">!</span><div>' +
      '<div class="ts-modal-title" id="clashTitle">' + n + ' day' + (n === 1 ? " is" : "s are") + ' already logged</div>' +
      '<div class="ts-modal-text">The file has different details for ' + (n === 1 ? "this day" : "these days") + '. Choose what to do with ' + (n === 1 ? "it" : "each one") + ': <b>Replace</b> with the file\u2019s version, <b>Keep both</b> (e.g. the other half of a split day) or <b>Keep existing</b>.' +
        (plan.fresh.length ? ' ' + (plan.fresh.length === 1 ? "The 1 new day" : "The " + plan.fresh.length + " new days") + ' in the file will be added either way.' : '') + '</div></div></div>' +
    (n > 1 ? '<div class="clash-all"><span>Set all:</span>' + CLASH_CHOICES.map(function (c) { return '<button type="button" class="btn btn-sm" data-clash-all="' + c[0] + '">' + c[1] + '</button>'; }).join("") + '</div>' : '') +
    '<div class="clash-list">' + list + '</div>' +
    '<div class="ts-modal-btns"><span class="clash-count" id="clashCount"></span>' +
      '<button class="btn" data-clash="stop">Stop</button>' +
      '<button class="btn btn-primary" data-clash="import">Import</button>' +
    '</div></div>';
  function count() {
    var t = { replace: 0, both: 0, skip: 0 };
    plan.clashDates.forEach(function (d) { t[choices[d]]++; });
    box.querySelector("#clashCount").textContent = [t.replace ? t.replace + " replace" : "", t.both ? t.both + " keep both" : "", t.skip ? t.skip + " keep existing" : ""].filter(Boolean).join(" \u00B7 ");
  }
  function close(go) {
    document.removeEventListener("keydown", onKey);
    box.remove();
    if (!go) { toast("Import stopped \u2014 nothing was changed."); return; }
    applyImport(plan, choices, sheetName);
  }
  function onKey(ev) { if (ev.key === "Escape") close(false); }
  box.addEventListener("change", function (ev) {
    var r = ev.target;
    if (r.matches('input[type="radio"][data-date]')) { choices[r.getAttribute("data-date")] = r.value; count(); }
  });
  box.addEventListener("click", function (ev) {
    var all = ev.target.closest("[data-clash-all]");
    if (all) {
      var v = all.getAttribute("data-clash-all");
      plan.clashDates.forEach(function (d) { choices[d] = v; });
      box.querySelectorAll('input[type="radio"][data-date]').forEach(function (r) { r.checked = r.value === v; });
      count(); return;
    }
    var b = ev.target.closest("[data-clash]");
    if (b) close(b.getAttribute("data-clash") === "import");
    else if (ev.target === box) close(false);
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
  count();
  box.querySelector('[data-clash="import"]').focus();
}
