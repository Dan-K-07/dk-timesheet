"use strict";

/* ============ Persistence ============ */
function load() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    state.entries = raw ? JSON.parse(raw) : [];
  } catch (e) { state.entries = []; }
  try { state.lastRate = localStorage.getItem(RATE_KEY) ? parseFloat(localStorage.getItem(RATE_KEY)) : null; } catch (e) {}
  try { state.theme = localStorage.getItem(THEME_KEY) || null; } catch (e) {}
  if (state.theme) document.documentElement.setAttribute("data-theme", state.theme);
  try { localStorage.removeItem(LEGACY_PIN_KEY); } catch (e) {}
  loadSettings();
  loadExpensesCache();
}
function save(skipPush) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries)); } catch (e) {
    toast("Couldn't save — your browser storage may be full or disabled.");
  }
  if (!skipPush) scheduleSyncPush();
}
function saveRate(r) {
  state.lastRate = r;
  try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) {}
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
