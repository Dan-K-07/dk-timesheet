"use strict";

/* ============ Settings ============ */
// Saved per device in this browser. To add a new setting: give it a default
// in DEFAULT_SETTINGS, add a section to renderSettings() and wire it up in
// attachSettingsEvents().
var SETTINGS_KEY = "dk_timesheet_settings_v1";
var DEFAULT_SETTINGS = {
  dateFormat: "ddd_d_mmm_yyyy"
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

function loadSettings() {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch (e) {}
  state.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
}
function saveSetting(key, value) {
  state.settings[key] = value;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) {}
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

  return '<div class="card calc-card settings-section">' +
      '<h3 class="settings-title">Date format</h3>' +
      '<p class="settings-help">How dates appear in All Data and Documents. Examples use today’s date.</p>' +
      '<div class="settings-options">' + options + '</div>' +
    '</div>' +
    '<p class="footnote">Settings are saved on this device only. Exports are not affected.</p>';
}

function attachSettingsEvents() {
  document.querySelectorAll('input[name="dateFormat"]').forEach(function (radio) {
    radio.addEventListener("change", function () { saveSetting("dateFormat", radio.value); render(); });
  });
}
