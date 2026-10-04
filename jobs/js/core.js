"use strict";

/* =====================================================================
   DK Jobs - core: constants, state, local storage, sync and login.
   Uses the same Supabase project and the same login as DK Timesheet
   (same storage key on the same site), so signing in to one signs in
   to the other.
   ===================================================================== */

var JOBS_VERSION = "2.0.0"; // bump this whenever you change the Jobs app
var SUPABASE_URL = "https://axiqpqjquywvzymmzwgr.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_gO1jSR_OETTKmwCz-hEb3w_JUYS1tik";
var AUTH_STORAGE_KEY = "dk_timesheet_auth_v1"; // shared with the timesheet
var THEME_KEY = "dk_timesheet_theme_v1";       // shared with the timesheet
var DATA_KEY = "dk_jobs_data_v1";
var UNSYNCED_KEY = "dk_jobs_unsynced_v1";
var CLIENT_ID_KEY = "dk_timesheet_client_id_v1";
var SYNC_TABLE = "jobs_sync";
var RECEIPT_BUCKET = "receipts";

var JOB_STATUSES = ["Potential", "Pencilled", "Confirmed", "Awaiting Payment", "Completed", "Cancelled"];

/* Expense categories. Each maps to the HMRC self-employment expense
   category used on your Self Assessment (SA103) and MTD quarterly
   updates. */
var HMRC_CATEGORIES = {
  costOfGoods: "Cost of goods / materials",
  subcontractors: "Payments to subcontractors",
  wages: "Wages and staff costs",
  travel: "Car, van and travel",
  premises: "Rent, rates, power and insurance",
  repairs: "Repairs and maintenance",
  admin: "Phone, stationery and office",
  advertising: "Advertising and marketing",
  interest: "Interest on loans",
  finance: "Bank and finance charges",
  professional: "Accountancy, legal and professional fees",
  other: "Other allowable expenses",
  capital: "Capital (equipment) - claim as allowance",
  disallowable: "Not allowable"
};
var DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Equipment", hmrc: "capital" },
  { name: "Materials", hmrc: "costOfGoods" },
  { name: "Kit Hire", hmrc: "costOfGoods" },
  { name: "Travel", hmrc: "travel" },
  { name: "Fuel", hmrc: "travel" },
  { name: "Parking", hmrc: "travel" },
  { name: "Accommodation", hmrc: "travel" },
  { name: "Subsistence", hmrc: "travel" },
  { name: "Software", hmrc: "admin" },
  { name: "Phone", hmrc: "admin" },
  { name: "Office Costs", hmrc: "admin" },
  { name: "Workwear / PPE", hmrc: "other" },
  { name: "Training", hmrc: "other" },
  { name: "Insurance", hmrc: "premises" },
  { name: "Marketing", hmrc: "advertising" },
  { name: "Subcontractor", hmrc: "subcontractors" },
  { name: "Professional Fees", hmrc: "professional" },
  { name: "Bank Charges", hmrc: "finance" },
  { name: "Other", hmrc: "other" }
];

function defaultSettings() {
  return {
    businessName: "", yourName: "", address: "", email: "", phone: "", website: "",
    bankName: "", accountName: "", sortCode: "", accountNumber: "", showBankOnQuotes: false,
    vatRegistered: false, vatNumber: "", vatRate: 20,
    invoicePrefix: "INV-", nextInvoiceNo: 1, quotePrefix: "QUO-", nextQuoteNo: 1,
    paymentTerms: 30, termsText: "Payment due within {days} days of the invoice date. Please quote the invoice number as your reference.",
    homeAddress: "",
    mileageRateHigh: 0.55, mileageRateLow: 0.25, mileageThreshold: 10000,
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES.slice(),
    logo: ""
  };
}
function emptyData() {
  return { clients: [], jobs: [], projects: [], products: [], invoices: [], expenses: [], mileage: [], subscriptions: [], settings: defaultSettings() };
}

/* ============ State ============ */
var state = {
  data: emptyData(),
  route: { tab: "home", id: null },
  authed: false, user: null, authChecking: true, authBusy: false, authError: "", authInfo: "", authMode: "login",
  startingSession: false, syncStatus: "off",
  // UI
  jobFilter: "active", jobSearch: "",
  invFilter: "active",
  expYear: null, mileYear: null, reportYear: null, reportQuarter: "all",
  expEditingId: null, expAdding: false, expFromJob: null,
  mileEditingId: null, mileAdding: false, mileFromJob: null,
  clientEditingId: null, clientAdding: false, clientEditing: false,
  projectNaming: false, projectOpen: {}, histSort: { key: "jobDate", dir: -1 },
  productEditingId: null, productAdding: false,
  receiptBusy: false,
  // Unsaved changes: edits stay on screen until you press Save.
  savedJson: "",     // what's saved on this device right now
  baseJson: "",      // what counts as "no changes" on this page
  newRecord: null,   // { tab, id } of a just-created job/client not saved yet
  remoteData: null,  // an update from another device that arrived mid-edit
  formKey: null, formJson: ""  // an open expense / mileage form, as it first appeared
};
var sbClient = null, realtimeChannel = null, syncPushTimer = null, syncRetryTimer = null;

/* ============ Small helpers ============ */
function uid(p) { return (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function todayIso() { var d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function addDays(iso, n) {
  var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function money(n) {
  var v = round2(num(n));
  var s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (v < 0 ? "−£" : "£") + s;
}
var SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso) {
  if (!iso) return "—";
  var p = iso.split("-");
  if (p.length < 3) return iso;
  return parseInt(p[2], 10) + " " + SHORT_MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
}
// UK dates: 2026-10-03 <-> 03/10/2026. parseUkDate accepts / - . or spaces
// between the parts, a 2-digit year, or 8 digits in a row (03102026).
function ukDate(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
function parseUkDate(text) {
  var t = String(text || "").trim(), m = t.match(/^(\d{1,2})[\/\-. ]+(\d{1,2})[\/\-. ]+(\d{2}|\d{4})$/) || t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  var dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yy = parseInt(m[3], 10);
  if (m[3].length === 2) yy += 2000;
  var dt = new Date(yy, mm - 1, dd);
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null; // e.g. 31/02
  return yy + "-" + pad2(mm) + "-" + pad2(dd);
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function toast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
}
function errMessage(e) { return e && e.message ? e.message : "unknown error"; }
function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

/* ============ Local storage ============ */
function normaliseData(d) {
  var base = emptyData();
  d = d && typeof d === "object" ? d : {};
  ["clients", "jobs", "projects", "products", "invoices", "expenses", "mileage", "subscriptions"].forEach(function (k) {
    base[k] = Array.isArray(d[k]) ? d[k] : [];
  });
  // Clients used to have one contact name; now they have a list of contacts.
  base.clients.forEach(function (c) {
    if (!Array.isArray(c.contacts)) c.contacts = c.contact ? [{ id: "k" + c.id, name: c.contact, role: "", email: "", phone: "" }] : [];
  });
  var s = defaultSettings();
  var ds = d.settings || {};
  Object.keys(ds).forEach(function (k) { s[k] = ds[k]; });
  if (!Array.isArray(s.expenseCategories) || !s.expenseCategories.length) s.expenseCategories = DEFAULT_EXPENSE_CATEGORIES.slice();
  base.settings = s;
  return base;
}
function loadLocal() {
  try { state.data = normaliseData(JSON.parse(localStorage.getItem(DATA_KEY) || "null")); }
  catch (e) { state.data = emptyData(); }
  markSaved();
  var theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (theme) document.documentElement.setAttribute("data-theme", theme);
}
/* Saves everything on screen: on this device straight away and to your
   account shortly after. Typing into a page doesn't call this - the Save
   button (or a button that does something, like Create invoice) does. */
function save(skipPush) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(state.data)); }
  catch (e) { toast("Couldn't save - your browser storage may be full (a large logo can cause this)."); }
  markSaved();
  if (!skipPush) scheduleSyncPush();
}
function markSaved() {
  state.savedJson = state.baseJson = JSON.stringify(state.data);
  state.newRecord = null;
  if (state.remoteData) { state.remoteData = null; toast("Saved. Your changes replace the ones made on your other device."); }
  if (typeof updateSaveBar === "function") updateSaveBar();
}
// A job or client was just created on screen. Nothing counts as a change
// until you type into it, and it's dropped if you leave without saving.
function startNewRecord(tab, id) {
  state.baseJson = JSON.stringify(state.data);
  state.newRecord = { tab: tab, id: id };
}
function dataChanged() { return JSON.stringify(state.data) !== state.baseJson; }
function hasChanges() { return dataChanged() || formChanged(); }
// Put everything back as it was last saved (or take the update from
// another device that arrived while you were editing).
function discardChanges() {
  if (state.remoteData) { state.data = state.remoteData; state.remoteData = null; save(true); }
  else { state.data = normaliseData(JSON.parse(state.savedJson || "null")); markSaved(); }
  state.expAdding = state.mileAdding = false; state.expEditingId = state.mileEditingId = null;
  state.formKey = null;
}
// New data from your account (another device, or when you log in).
function applyIncoming(data, quiet) {
  if (hasChanges() || state.newRecord) {
    state.remoteData = normaliseData(data);
    toast("Changed on another device. Save to keep your edits, or discard them to see that change.");
    return false;
  }
  state.data = normaliseData(data);
  save(true);
  if (!quiet) render();
  return true;
}
function getClientId() {
  var id = null;
  try { id = localStorage.getItem(CLIENT_ID_KEY); } catch (e) {}
  if (!id) {
    id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(CLIENT_ID_KEY, id); } catch (e) {}
  }
  return id;
}
function toggleTheme() {
  var root = document.documentElement;
  var cur = root.getAttribute("data-theme");
  var isDark = cur ? cur === "dark" : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var next = isDark ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  render();
}

/* ============ Sync ============ */
function getSupabase() {
  if (!sbClient) {
    sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return sbClient;
}
function hasStoredSession() { try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch (e) { return false; } }
function storedUserId() {
  try { var s = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null"); return (s && s.user && s.user.id) || null; }
  catch (e) { return null; }
}
function markUnsynced() {
  var id = state.user ? state.user.id : storedUserId();
  if (!id) return;
  try { localStorage.setItem(UNSYNCED_KEY, JSON.stringify({ uid: id, at: Date.now() })); } catch (e) {}
}
function unsyncedFor(id) {
  try { var d = JSON.parse(localStorage.getItem(UNSYNCED_KEY) || "null"); return d && id && d.uid === id ? d : null; }
  catch (e) { return null; }
}
function clearUnsynced(at) {
  try { var d = JSON.parse(localStorage.getItem(UNSYNCED_KEY) || "null"); if (d && d.at === at) localStorage.removeItem(UNSYNCED_KEY); }
  catch (e) {}
}
function hasUnsynced() { return !!unsyncedFor(state.user ? state.user.id : storedUserId()); }

function syncStatusLabel() {
  switch (state.syncStatus) {
    case "connecting": return "Connecting…";
    case "syncing": return "Syncing…";
    case "synced": return "Synced";
    case "error": return hasUnsynced() ? "Saved offline" : "Offline";
    default: return "Sync";
  }
}
function updateSyncStatusUI() {
  var pill = document.getElementById("syncStatusPill");
  if (!pill) return;
  pill.querySelector(".sync-dot").className = "sync-dot " + state.syncStatus;
  pill.querySelector(".sync-label").textContent = syncStatusLabel();
}

async function pushRow() {
  // Only what's been saved goes up - never half-finished edits on screen.
  var payload = { user_id: state.user.id, data: JSON.parse(state.savedJson), updated_by: getClientId(), updated_at: new Date().toISOString() };
  var res = await sbClient.from(SYNC_TABLE).upsert(payload, { onConflict: "user_id" });
  if (res.error) throw res.error;
}
function scheduleSyncPush() {
  if (!state.authed) return;
  markUnsynced();
  if (!state.user) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(doSyncPush, 800);
}
async function doSyncPush() {
  syncPushTimer = null;
  clearTimeout(syncRetryTimer); syncRetryTimer = null;
  if (!state.user) return;
  var pending = unsyncedFor(state.user.id);
  state.syncStatus = "syncing"; updateSyncStatusUI();
  try {
    await pushRow();
    if (pending) clearUnsynced(pending.at);
    state.syncStatus = "synced";
  } catch (e) {
    state.syncStatus = "error";
    syncRetryTimer = setTimeout(doSyncPush, 30000);
  }
  updateSyncStatusUI();
}
function retryUnsyncedNow() { if (state.user && unsyncedFor(state.user.id) && !syncPushTimer) doSyncPush(); }

function handleRemoteChange(payload) {
  var row = payload && payload.new;
  if (!row || row.updated_by === getClientId()) return;
  if (unsyncedFor(state.user.id)) { retryUnsyncedNow(); return; }
  state.syncStatus = "synced";
  if (applyIncoming(row.data, true)) { toast("Updated from another device."); render(); }
  else updateSyncStatusUI();
}
function subscribeRealtime() {
  if (realtimeChannel) { try { sbClient.removeChannel(realtimeChannel); } catch (e) {} }
  var filter = "user_id=eq." + state.user.id;
  realtimeChannel = sbClient.channel("jobs-" + state.user.id)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: SYNC_TABLE, filter: filter }, handleRemoteChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: SYNC_TABLE, filter: filter }, handleRemoteChange)
    .subscribe();
}

/* ============ Login (shared with DK Timesheet) ============ */
function initAuth() {
  var client;
  try { client = getSupabase(); } catch (e) {
    state.authChecking = false; state.authError = "Couldn't start the sync client."; render(); return;
  }
  client.auth.onAuthStateChange(function (event, session) {
    setTimeout(function () { handleAuthEvent(event, session); }, 0);
  });
  setTimeout(function () { if (state.authChecking && hasStoredSession()) enterOfflineMode(); }, 4000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && syncPushTimer) { clearTimeout(syncPushTimer); doSyncPush(); }
    else if (document.visibilityState === "visible") retryUnsyncedNow();
  });
  window.addEventListener("online", function () {
    retryUnsyncedNow();
    if (state.authed && !state.user) {
      client.auth.getSession().then(function (r) { if (r.data && r.data.session) startSession(r.data.session.user); });
    }
  });
}
function handleAuthEvent(event, session) {
  if (event === "SIGNED_OUT") { if (state.authed) endSession(); return; }
  if (event === "INITIAL_SESSION") {
    state.authChecking = false;
    if (session) { startSession(session.user); return; }
    if (hasStoredSession()) { if (!state.authed) enterOfflineMode(); return; }
    if (state.authed) endSession(); else render();
    return;
  }
  if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
    if (!state.user || state.user.id !== session.user.id) startSession(session.user);
  }
}
function enterOfflineMode() {
  state.authChecking = false; state.authed = true; state.syncStatus = "error";
  render(); runSubscriptions();
  toast("Couldn't reach sync — showing your last saved data.");
}
async function startSession(user) {
  if (state.startingSession) return;
  state.startingSession = true;
  state.user = { id: user.id, email: user.email };
  state.authed = true; state.authError = ""; state.syncStatus = "connecting";
  render();
  try {
    var res = await sbClient.from(SYNC_TABLE).select("data,updated_at,updated_by").eq("user_id", user.id).maybeSingle();
    if (res.error) throw res.error;
    var pending = unsyncedFor(user.id);
    if (pending) {
      await pushRow(); clearUnsynced(pending.at);
      toast("Back online — changes made on this device have been synced.");
    } else if (res.data) {
      applyIncoming(res.data.data, true);
    } else {
      if (!state.data.settings.email && !hasChanges()) { state.data.settings.email = user.email || ""; save(true); }
      await pushRow();
    }
    subscribeRealtime();
    state.syncStatus = "synced";
  } catch (e) {
    state.syncStatus = "error";
    toast("Couldn't reach sync (" + errMessage(e) + ") — showing your last saved data.");
  }
  state.startingSession = false;
  render(); runSubscriptions();
}
function endSession() {
  if (realtimeChannel) { try { sbClient.removeChannel(realtimeChannel); } catch (e) {} realtimeChannel = null; }
  clearTimeout(syncPushTimer); clearTimeout(syncRetryTimer); syncPushTimer = syncRetryTimer = null;
  state.authed = false; state.user = null; state.syncStatus = "off"; state.authMode = "login";
  render();
}
async function signIn(email, password) {
  email = String(email || "").trim();
  if (!email || !password) { state.authError = "Enter your email and password."; render(); return; }
  state.authBusy = true; state.authError = ""; render();
  var res;
  try { res = await getSupabase().auth.signInWithPassword({ email: email, password: password }); } catch (e) { res = { error: e }; }
  state.authBusy = false;
  if (res.error) {
    state.authError = /invalid login/i.test(errMessage(res.error)) ? "Email or password is incorrect." : "Couldn't sign in (" + errMessage(res.error) + ").";
    render(); return;
  }
  startSession(res.data.user);
}
async function logout() {
  if (realtimeChannel) { try { sbClient.removeChannel(realtimeChannel); } catch (e) {} realtimeChannel = null; }
  try { await getSupabase().auth.signOut({ scope: "local" }); } catch (e) {}
  endSession();
}

/* ============ Receipts (Supabase storage) ============ */
async function uploadReceipt(file, expenseId) {
  if (!state.user) throw new Error("You need a connection to upload a receipt");
  var safe = String(file.name || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  var path = state.user.id + "/" + expenseId + "-" + Date.now().toString(36) + "-" + safe;
  var res = await sbClient.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (res.error) throw res.error;
  return path;
}
async function openReceipt(path) {
  if (!state.user) { toast("You need a connection to view receipts."); return; }
  var win = window.open("", "_blank");
  var res = await sbClient.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 300);
  if (res.error) { if (win) win.close(); toast("Couldn't open the receipt (" + errMessage(res.error) + ")."); return; }
  if (win) win.location = res.data.signedUrl; else location.href = res.data.signedUrl;
}
async function deleteReceipt(path) {
  if (!path || !state.user) return;
  try { await sbClient.storage.from(RECEIPT_BUCKET).remove([path]); } catch (e) {}
}
