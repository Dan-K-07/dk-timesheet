"use strict";

/* ============ Settings ============ */
// Saved to the account (the settings column on the timesheet row) so every
// device matches, with a copy in this browser for offline use. To add a new
// setting: give it a default in DEFAULT_SETTINGS, add a section to
// renderSettings() and wire it up in attachSettingsEvents().
var SETTINGS_KEY = "dk_timesheet_settings_v1";
var DEFAULT_EXPENSE_CATEGORIES = ["Rent", "Subscriptions", "Utilities", "Insurance", "Phone", "Vehicle", "Fuel", "Other"];
var DEFAULT_SETTINGS = {
  dateFormat: "ddd_d_mmm_yyyy",
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  // Where the Expenses year view gets earnings from: "timesheet" (logged
  // pay), "salary" (annual salary / 12, using the latest pay change) or
  // "custom" (an amount typed in for each month in the year view).
  earningsSource: "timesheet",
  salaries: [], // [{ annual: 32000, from: "2026-04-01" }]
  customEarnings: {}, // { "2026-04": 2650.5 }
  earningsTaxBasis: "before", // salary / custom amounts are "before" or "after" tax
  taxCode: "", // used by the Take-Home Pay calculator, e.g. "1257L"
  typeColors: {} // e.g. { "Warehouse": "#2c8c99" }; missing types use the theme colours
};

var DAY_NAMES_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var DAY_NAMES_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// Each format takes a Date and returns the text shown in the app.
var DATE_FORMATS = [
  { id: "ddd_d_mmm_yyyy", fmt: function (d) { return DAY_NAMES_SHORT[d.getDay()] + " " + d.getDate() + " " + MONTH_NAMES[d.getMonth()].slice(0,3) + " " + d.getFullYear(); } },
  { id: "ddd_dd/mm/yyyy", fmt: function (d) { return DAY_NAMES_SHORT[d.getDay()] + " " + pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear(); } },
  { id: "dd/mm/yyyy", fmt: function (d) { return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear(); } },
  { id: "ddd_dd/mm/yy", fmt: function (d) { return DAY_NAMES_SHORT[d.getDay()] + " " + pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2); } },
  { id: "d_mmm_yyyy", fmt: function (d) { return d.getDate() + " " + MONTH_NAMES[d.getMonth()].slice(0,3) + " " + d.getFullYear(); } },
  { id: "dddd_d_mmmm_yyyy", fmt: function (d) { return DAY_NAMES_LONG[d.getDay()] + " " + d.getDate() + " " + MONTH_NAMES[d.getMonth()] + " " + d.getFullYear(); } },
  { id: "yyyy-mm-dd", fmt: function (d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); } }
];

/* ---- Day type colours ---- */
var TYPE_COLOR_PALETTE = [
  { name: "Blue", hex: "#3e6c99" }, { name: "Navy", hex: "#2f4b7c" },
  { name: "Teal", hex: "#2c8c99" }, { name: "Green", hex: "#3f8f70" },
  { name: "Lime", hex: "#6e9a2e" }, { name: "Gold", hex: "#b8961e" },
  { name: "Orange", hex: "#b8631e" }, { name: "Red", hex: "#a5424b" },
  { name: "Pink", hex: "#c2508a" }, { name: "Purple", hex: "#7b5ea7" },
  { name: "Brown", hex: "#8a5a3c" }, { name: "Grey", hex: "#7a7468" }
];
// CSS variable name for each type (matches the --t-* variables in styles.css)
var TYPE_VAR = { "Warehouse": "warehouse", "On Site": "onsite", "Holiday": "holiday", "Sick": "sick", "Off": "off" };
var PANEL_LIGHT = "#ffffff", PANEL_DARK = "#232527";

function isHexColor(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
function hexToRgb(hex) {
  var n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb) {
  return "#" + rgb.map(function (c) {
    return ("0" + Math.max(0, Math.min(255, Math.round(c))).toString(16)).slice(-2);
  }).join("");
}
// amount = how much of `b` to mix into `a` (0..1)
function mixHex(a, b, amount) {
  var x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map(function (c, i) { return c + (y[i] - c) * amount; }));
}
function luminance(hex) {
  var c = hexToRgb(hex).map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrastRatio(a, b) {
  var la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Nudge `hex` towards `target` (black or white) until it's readable on `bg`.
function readableOn(hex, bg, target) {
  for (var i = 0; i <= 20; i++) {
    var c = mixHex(hex, target, i * 0.05);
    if (contrastRatio(c, bg) >= 4.5) return c;
  }
  return target;
}
// Text + tint colours for a chosen colour, in light and dark mode.
function typeColorPair(hex) {
  var bgLight = mixHex(PANEL_LIGHT, hex, 0.16);
  var bgDark = mixHex(PANEL_DARK, hex, 0.26);
  return {
    light: { fg: readableOn(hex, bgLight, "#000000"), bg: bgLight },
    dark: { fg: readableOn(hex, bgDark, "#ffffff"), bg: bgDark }
  };
}

function applyTypeColors() {
  var light = [], dark = [];
  var colors = state.settings.typeColors || {};
  Object.keys(TYPE_VAR).forEach(function (type) {
    var hex = colors[type];
    if (!isHexColor(hex)) return;
    var pair = typeColorPair(hex.toLowerCase()), v = "--t-" + TYPE_VAR[type];
    light.push(v + ":" + pair.light.fg + ";" + v + "-bg:" + pair.light.bg + ";");
    dark.push(v + ":" + pair.dark.fg + ";" + v + "-bg:" + pair.dark.bg + ";");
  });
  var css = light.length ? ':root{' + light.join("") + '}' +
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + dark.join("") + '}}' +
    ':root[data-theme="dark"]{' + dark.join("") + '}' : "";
  var el = document.getElementById("typeColorStyles");
  if (!el) {
    el = document.createElement("style");
    el.id = "typeColorStyles";
    document.head.appendChild(el);
  }
  el.textContent = css;
}
function setTypeColor(type, hex) {
  var colors = Object.assign({}, state.settings.typeColors);
  if (hex) colors[type] = hex.toLowerCase(); else delete colors[type];
  saveSetting("typeColors", colors);
  applyTypeColors();
}

function normalizeSettings(saved) {
  var s = Object.assign({}, DEFAULT_SETTINGS, saved && typeof saved === "object" ? saved : {});
  if (!s.typeColors || typeof s.typeColors !== "object" || Array.isArray(s.typeColors)) s.typeColors = {};
  s.expenseCategories = cleanCategoryList(s.expenseCategories);
  if (["timesheet", "salary", "custom"].indexOf(s.earningsSource) === -1) s.earningsSource = "timesheet";
  s.salaries = cleanSalaryList(s.salaries);
  s.customEarnings = cleanCustomEarnings(s.customEarnings);
  if (s.earningsTaxBasis !== "after") s.earningsTaxBasis = "before";
  s.taxCode = typeof s.taxCode === "string" ? s.taxCode.toUpperCase().replace(/[^A-Z0-9 \/]/g, "").slice(0, 12) : "";
  return s;
}
function cleanCategoryList(list) {
  var seen = {}, out = [];
  (Array.isArray(list) ? list : []).forEach(function (c) {
    var name = typeof c === "string" ? c.trim().slice(0, 40) : "";
    if (name && !seen[name.toLowerCase()]) { seen[name.toLowerCase()] = true; out.push(name); }
  });
  return out.length ? out : DEFAULT_EXPENSE_CATEGORIES.slice();
}
function cleanSalaryList(list) {
  return (Array.isArray(list) ? list : []).filter(function (x) {
    return x && typeof x === "object" && /^\d{4}-\d{2}-\d{2}$/.test(x.from) && isFinite(x.annual) && Number(x.annual) >= 0;
  }).map(function (x) {
    return { annual: Math.round(Number(x.annual) * 100) / 100, from: x.from };
  }).sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; }).slice(0, 50);
}
function cleanCustomEarnings(map) {
  var out = {};
  if (!map || typeof map !== "object" || Array.isArray(map)) return out;
  Object.keys(map).filter(function (k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(k); }).sort().slice(-600).forEach(function (k) {
    var v = Number(map[k]);
    if (map[k] !== null && map[k] !== "" && isFinite(v) && v >= 0) out[k] = Math.round(v * 100) / 100;
  });
  return out;
}
function storeSettingsLocally() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) {}
}
function loadSettings() {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch (e) {}
  state.settings = normalizeSettings(saved);
  applyTypeColors();
}
function saveSetting(key, value) {
  state.settings[key] = value;
  storeSettingsLocally();
  scheduleSyncPush();
}

// What gets stored on the account.
function settingsForSync() {
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = state.settings[k]; });
  return out;
}
function hasCustomSettings() {
  return JSON.stringify(settingsForSync()) !== JSON.stringify(normalizeSettings({}));
}
// Use the account's settings (from the server). Returns false if it has none yet.
function applyAccountSettings(remote) {
  if (!remote || typeof remote !== "object" || !Object.keys(remote).length) return false;
  state.settings = normalizeSettings(remote);
  storeSettingsLocally();
  applyTypeColors();
  return true;
}

function dateFormatById(id) {
  for (var i = 0; i < DATE_FORMATS.length; i++) if (DATE_FORMATS[i].id === id) return DATE_FORMATS[i];
  return DATE_FORMATS[0];
}

function renderSettings() {
  var today = new Date();
  var current = dateFormatById(state.settings.dateFormat).id;
  var options = DATE_FORMATS.map(function (f) {
    return '<label class="settings-option">' +
      '<input type="radio" name="dateFormat" value="' + f.id + '"' + (f.id === current ? " checked" : "") + '> ' +
      '<span class="settings-example">' + escapeHtml(f.fmt(today)) + '</span>' +
    '</label>';
  }).join("");

  var colors = state.settings.typeColors || {};
  var rootStyle = getComputedStyle(document.documentElement);
  var typeRows = TYPES.map(function (type) {
    var current = isHexColor(colors[type]) ? colors[type].toLowerCase() : "";
    // With no custom colour, open the picker on the theme's own colour.
    var themeColor = rootStyle.getPropertyValue("--" + TYPE_VAR[type]).trim().toLowerCase();
    var swatches = TYPE_COLOR_PALETTE.map(function (c) {
      return '<button type="button" class="swatch' + (c.hex === current ? " selected" : "") + '"' +
        ' style="background:' + c.hex + '" data-type-color="' + escapeHtml(type) + '" data-color="' + c.hex + '"' +
        ' title="' + c.name + '" aria-label="' + escapeHtml(type) + ': ' + c.name + '"></button>';
    }).join("");
    return '<div class="type-color-row">' +
      '<span class="tag ' + TYPE_CLASS[type] + '">' + escapeHtml(type) + '</span>' +
      '<div class="swatches">' + swatches + '</div>' +
      '<label class="custom-color" title="Pick any colour">Custom ' +
        '<input type="color" data-type-custom="' + escapeHtml(type) + '" value="' + (current || (isHexColor(themeColor) ? themeColor : "#888888")) + '"></label>' +
      (current ? '<button type="button" class="link-btn" data-type-reset="' + escapeHtml(type) + '">Reset</button>' : '') +
    '</div>';
  }).join("");

  return '<div class="card calc-card settings-section">' +
      '<h3 class="settings-title">Date format</h3>' +
      '<p class="settings-help">How dates appear in All Data and Documents. Examples use today’s date.</p>' +
      '<div class="settings-options">' + options + '</div>' +
    '</div>' +
    renderCategorySettings() +
    renderEarningsSettings() +
    '<div class="card calc-card settings-section">' +
      '<h3 class="settings-title">Day type colours</h3>' +
      '<p class="settings-help">Pick a colour for each day type, or choose a custom one. Text is adjusted automatically so it stays readable in light and dark mode.</p>' +
      typeRows +
    '</div>' +
    '<p class="footnote">Settings are saved to your account, so they\u2019re the same on every device you log in on. Light/dark mode is set per device. Exports are not affected.</p>';
}

function renderCategorySettings() {
  var cats = expenseCategories();
  var rows = cats.map(function (c, i) {
    var used = state.expenses.filter(function (e) { return e.category === c; }).length;
    return '<div class="category-row">' +
      '<input type="text" class="field-input" maxlength="40" data-cat-index="' + i + '" value="' + escapeHtml(c) + '" aria-label="Category name">' +
      '<span class="exp-muted category-used">' + (used ? used + " expense" + (used === 1 ? "" : "s") : "") + '</span>' +
      '<button type="button" class="link-btn" data-cat-remove="' + i + '">Remove</button>' +
    '</div>';
  }).join("");
  return '<div class="card calc-card settings-section">' +
    '<h3 class="settings-title">Expense categories</h3>' +
    '<p class="settings-help">Used on the Expenses tab. Renaming a category updates the expenses that use it.</p>' +
    rows +
    '<div class="category-row category-add">' +
      '<input type="text" class="field-input" maxlength="40" id="newCategory" placeholder="New category">' +
      '<button type="button" class="btn btn-sm" id="addCategory">Add</button>' +
    '</div>' +
  '</div>';
}
function renderEarningsSettings() {
  var source = state.settings.earningsSource, list = state.settings.salaries, basis = state.settings.earningsTaxBasis;
  var rows = list.map(function (x, i) {
    return '<div class="category-row salary-row">' +
      '<label class="salary-field">Annual salary (\u00A3, ' + (basis === "after" ? "after" : "before") + ' tax)<input type="number" min="0" step="0.01" class="field-input" data-salary-annual="' + i + '" value="' + x.annual + '"></label>' +
      '<label class="salary-field">From<input type="date" class="field-input" data-salary-from="' + i + '" value="' + x.from + '"></label>' +
      '<span class="exp-muted salary-month">' + fmtPay(x.annual / 12) + '/mo</span>' +
      '<button type="button" class="link-btn" data-salary-remove="' + i + '">Remove</button>' +
    '</div>';
  }).join("");
  return '<div class="card calc-card settings-section">' +
    '<h3 class="settings-title">Earnings for Expenses</h3>' +
    '<p class="settings-help">What the Expenses year view compares your expenses against.</p>' +
    '<div class="settings-options">' +
      '<label class="settings-option"><input type="radio" name="earningsSource" value="timesheet"' + (source === "timesheet" ? " checked" : "") + '> Pay logged in my timesheet</label>' +
      '<label class="settings-option"><input type="radio" name="earningsSource" value="salary"' + (source === "salary" ? " checked" : "") + '> My salary</label>' +
      '<label class="settings-option"><input type="radio" name="earningsSource" value="custom"' + (source === "custom" ? " checked" : "") + '> Amounts I enter for each month</label>' +
    '</div>' +
    (source !== "timesheet"
      ? '<div class="tax-basis"><span class="exp-muted">These amounts are</span>' +
          '<label class="settings-option"><input type="radio" name="earningsTaxBasis" value="before"' + (basis === "before" ? " checked" : "") + '> Before tax</label>' +
          '<label class="settings-option"><input type="radio" name="earningsTaxBasis" value="after"' + (basis === "after" ? " checked" : "") + '> After tax (take-home)</label>' +
        '</div>'
      : '') +
    (source === "custom"
      ? '<p class="settings-help" style="margin-top:10px;">Type each month\u2019s pay into the Earnings column of the Year view on the Expenses tab. Months left blank count as \u00A30.</p>'
      : '') +
    (source === "salary"
      ? '<div class="salary-list">' +
          (rows || '<p class="exp-muted">Add your salary to get started.</p>') +
          '<button type="button" class="btn btn-sm" id="addSalary">' + (list.length ? "+ Add a pay change" : "+ Add salary") + '</button>' +
          '<p class="settings-help" style="margin-top:10px;">Each month counts as the annual salary \u00F7 12, using the latest pay change that started on or before that month. Add a new line when your pay changes so earlier months stay correct.</p>' +
        '</div>'
      : '') +
  '</div>';
}
function updateSalaries(fn) {
  var list = state.settings.salaries.map(function (x) { return { annual: x.annual, from: x.from }; });
  fn(list);
  saveSetting("salaries", cleanSalaryList(list));
  render();
}
function attachEarningsEvents() {
  document.querySelectorAll('input[name="earningsSource"]').forEach(function (r) {
    r.addEventListener("change", function () { saveSetting("earningsSource", r.value); render(); });
  });
  document.querySelectorAll('input[name="earningsTaxBasis"]').forEach(function (r) {
    r.addEventListener("change", function () { saveSetting("earningsTaxBasis", r.value); render(); });
  });
  bindIf("addSalary", "click", function () {
    var list = state.settings.salaries, last = list[list.length - 1];
    updateSalaries(function (l) { l.push({ annual: last ? last.annual : 0, from: todayIso() }); });
  });
  document.querySelectorAll("[data-salary-annual]").forEach(function (input) {
    input.addEventListener("change", function () {
      var v = parseFloat(input.value), i = parseInt(input.getAttribute("data-salary-annual"), 10);
      if (isNaN(v) || v < 0) { toast("Enter a salary of \u00A30 or more."); render(); return; }
      updateSalaries(function (l) { l[i].annual = v; });
    });
  });
  document.querySelectorAll("[data-salary-from]").forEach(function (input) {
    input.addEventListener("change", function () {
      var i = parseInt(input.getAttribute("data-salary-from"), 10);
      if (!input.value) { toast("Pick the date this salary started."); render(); return; }
      updateSalaries(function (l) { l[i].from = input.value; });
    });
  });
  document.querySelectorAll("[data-salary-remove]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var i = parseInt(btn.getAttribute("data-salary-remove"), 10);
      updateSalaries(function (l) { l.splice(i, 1); });
    });
  });
}
function categoryTaken(name, exceptIndex) {
  return expenseCategories().some(function (c, i) { return i !== exceptIndex && c.toLowerCase() === name.toLowerCase(); });
}
function attachCategoryEvents() {
  document.querySelectorAll("[data-cat-index]").forEach(function (input) {
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") input.blur(); });
    input.addEventListener("change", function () {
      var i = parseInt(input.getAttribute("data-cat-index"), 10), list = expenseCategories().slice();
      var oldName = list[i], name = input.value.trim().slice(0, 40);
      if (!name || name === oldName) { render(); return; }
      if (categoryTaken(name, i)) { toast("There's already a category called \u201c" + name + "\u201d."); render(); return; }
      if (!requireOnline()) { render(); return; }
      list[i] = name;
      saveSetting("expenseCategories", list);
      renameExpenseCategory(oldName, name);
      render();
    });
  });
  document.querySelectorAll("[data-cat-remove]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var i = parseInt(btn.getAttribute("data-cat-remove"), 10), list = expenseCategories().slice(), name = list[i];
      if (list.length === 1) { toast("Keep at least one category."); return; }
      var used = state.expenses.filter(function (e) { return e.category === name; }).length;
      if (used && !confirm(used + " expense" + (used === 1 ? " uses" : "s use") + " \u201c" + name + "\u201d. They'll keep it until you edit them. Remove it from the list?")) return;
      list.splice(i, 1);
      saveSetting("expenseCategories", list);
      render();
    });
  });
  var add = function () {
    var input = document.getElementById("newCategory"), name = input.value.trim().slice(0, 40);
    if (!name) return;
    if (categoryTaken(name, -1)) { toast("There's already a category called \u201c" + name + "\u201d."); return; }
    saveSetting("expenseCategories", expenseCategories().concat([name]));
    render();
    var again = document.getElementById("newCategory"); if (again) again.focus();
  };
  bindIf("addCategory", "click", add);
  var newInput = document.getElementById("newCategory");
  if (newInput) newInput.addEventListener("keydown", function (ev) { if (ev.key === "Enter") add(); });
}

function attachSettingsEvents() {
  attachCategoryEvents();
  attachEarningsEvents();
  document.querySelectorAll('input[name="dateFormat"]').forEach(function (radio) {
    radio.addEventListener("change", function () { saveSetting("dateFormat", radio.value); render(); });
  });
  document.querySelectorAll("[data-type-color]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setTypeColor(btn.getAttribute("data-type-color"), btn.getAttribute("data-color"));
      render();
    });
  });
  document.querySelectorAll("[data-type-custom]").forEach(function (input) {
    var type = input.getAttribute("data-type-custom");
    // "input" fires while dragging in the picker: update colours live without
    // re-rendering (that would close the picker). "change" fires when done.
    input.addEventListener("input", function () { setTypeColor(type, input.value); });
    input.addEventListener("change", function () { setTypeColor(type, input.value); render(); });
  });
  document.querySelectorAll("[data-type-reset]").forEach(function (btn) {
    btn.addEventListener("click", function () { setTypeColor(btn.getAttribute("data-type-reset"), ""); render(); });
  });
}
