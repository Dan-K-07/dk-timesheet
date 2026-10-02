"use strict";

/* ============ Constants ============ */
var APP_VERSION = "2.6.0"; // bump this whenever you change the app
var TYPES = ["Warehouse", "On Site", "Holiday", "Sick", "Off"];
var TYPE_CLASS = { "Warehouse": "tag-Warehouse", "On Site": "tag-OnSite", "Holiday": "tag-Holiday", "Sick": "tag-Sick", "Off": "tag-Off" };
var STORAGE_KEY = "dk_timesheet_entries_v1";
var RATE_KEY = "dk_timesheet_last_rate_v1";
var THEME_KEY = "dk_timesheet_theme_v1";
var LEGACY_PIN_KEY = "dk_timesheet_pin_v1"; // from the old PIN login; removed on load
var AUTH_STORAGE_KEY = "dk_timesheet_auth_v1";
var UNSYNCED_KEY = "dk_timesheet_unsynced_v1"; // { uid, at } while this device has changes the account hasn't got
var syncRetryTimer = null;
var CLIENT_ID_KEY = "dk_timesheet_client_id_v1";
var SYNC_TABLE = "timesheet_sync";
var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// The publishable/anon key is meant to be public (it's exposed in any
// browser using Supabase). Access control is Supabase Auth plus the RLS
// policies in supabase/migrations, which only let a signed-in user reach
// rows where user_id = auth.uid().
var SUPABASE_URL = "https://axiqpqjquywvzymmzwgr.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_gO1jSR_OETTKmwCz-hEb3w_JUYS1tik";

/* ============ Downloads capability (falls back to a plain link) ============ */
var downloadsCap = null;
(function initDownloads() {
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then(function (cap) { downloadsCap = cap; }).catch(function () {});
  }
})();
function offerDownload(blob, filename) {
  if (downloadsCap) {
    downloadsCap.save({ filename: filename, data: blob }).then(function () {
      toast("Saved " + filename);
    }).catch(function (err) {
      if (err && err.code === "declined") return;
      downloadBlob(blob, filename);
    });
    return;
  }
  downloadBlob(blob, filename);
}

/* ============ State ============ */
var state = {
  tab: "summary",
  entries: [],
  editingId: null,
  adding: false,
  filterType: "",
  filterMonth: "",
  sortDir: "desc",
  lastRate: null,
  theme: null,
  summaryFrom: "",
  summaryTo: "",
  authed: false,
  user: null,
  authChecking: true,
  authMode: "login",
  authBusy: false,
  authError: "",
  authInfo: "",
  startingSession: false,
  syncStatus: "off",
  lastSynced: null,
  selectedIds: {},
  bulkEditOpen: false,
  documents: [],
  docFilterDate: "",
  docUploading: false,
  calcGross: 0,
  calcRegion: "ew",
  calcPensionPct: 0,
  calcPensionMethod: "none",
  calcLoanPlan: "",
  calcMode: "annual",
  expenses: [],
  expAdding: false,
  expEditingId: null,
  expYearMode: "calendar",
  expYear: null,
  settings: {}
};

/* ============ Sync (Supabase) runtime ============ */
var sbClient = null;
var realtimeChannel = null;
var docChannel = null;
var syncPushTimer = null;
