"use strict";

/* ============ Sync (Supabase) ============ */
function syncStatusLabel() {
  switch (state.syncStatus) {
    case "connecting": return "Connecting\u2026";
    case "syncing": return "Syncing\u2026";
    case "synced": return "Synced";
    case "error": return hasUnsynced() ? "Saved offline" : "Offline";
    default: return "Sync";
  }
}
function updateSyncStatusUI() {
  var pill = document.getElementById("syncStatusPill");
  if (!pill) return;
  var dot = pill.querySelector(".sync-dot");
  var label = pill.querySelector(".sync-label");
  if (dot) dot.className = "sync-dot " + state.syncStatus;
  if (label) label.textContent = syncStatusLabel();
}
function formatTimeShort(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }

function getSupabase() {
  if (!sbClient) {
    sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return sbClient;
}
function hasStoredSession() {
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch (e) { return false; }
}
function errMessage(e) { return e && e.message ? e.message : "unknown error"; }

async function pushRow() {
  var payload = { user_id: state.user.id, entries: state.entries, settings: settingsForSync(), updated_by: getClientId(), updated_at: new Date().toISOString() };
  var res = await sbClient.from(SYNC_TABLE).upsert(payload, { onConflict: "user_id" });
  if (res.error) throw res.error;
}

/* ---- Changes not yet sent ----
   Edits are always saved on the device first. While the account hasn't
   received them (no signal, or the send failed) the device remembers that,
   and its copy is sent - rather than replaced by the account's - when it
   reconnects. The note is tied to the account so it can't leak into
   another one. */
function storedUserId() {
  try { var s = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null"); return (s && s.user && s.user.id) || null; }
  catch (e) { return null; }
}
function markUnsynced() {
  var uid = state.user ? state.user.id : storedUserId();
  if (!uid) return;
  try { localStorage.setItem(UNSYNCED_KEY, JSON.stringify({ uid: uid, at: Date.now() })); } catch (e) {}
}
function unsyncedFor(uid) {
  try { var d = JSON.parse(localStorage.getItem(UNSYNCED_KEY) || "null"); return d && uid && d.uid === uid ? d : null; }
  catch (e) { return null; }
}
// Only clears if nothing new was changed while the send was in flight.
function clearUnsynced(at) {
  try {
    var d = JSON.parse(localStorage.getItem(UNSYNCED_KEY) || "null");
    if (d && d.at === at) localStorage.removeItem(UNSYNCED_KEY);
  } catch (e) {}
}
function hasUnsynced() { return !!unsyncedFor(state.user ? state.user.id : storedUserId()); }

function scheduleSyncPush() {
  if (!state.authed) return;
  markUnsynced();
  if (!state.user) return; // offline: sent when the connection comes back
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(doSyncPush, 800);
}
async function doSyncPush() {
  syncPushTimer = null;
  clearTimeout(syncRetryTimer);
  syncRetryTimer = null;
  if (!state.user) return;
  var pending = unsyncedFor(state.user.id);
  state.syncStatus = "syncing";
  updateSyncStatusUI();
  try {
    await pushRow();
    if (pending) clearUnsynced(pending.at);
    state.syncStatus = "synced";
    state.lastSynced = new Date();
  } catch (e) {
    state.syncStatus = "error";
    // Venue wifi often drops without the browser noticing, so try again
    // every 30 seconds as well as when the connection comes back.
    syncRetryTimer = setTimeout(doSyncPush, 30000);
  }
  updateSyncStatusUI();
}
function retryUnsyncedNow() {
  if (state.user && unsyncedFor(state.user.id) && !syncPushTimer) doSyncPush();
}

function handleRemoteChange(payload) {
  var row = payload && payload.new;
  if (!row) return;
  if (row.updated_by === getClientId()) return; // our own write echoing back
  // This device has changes the account hasn't got yet: they're about to be
  // sent and will replace this, so keep them rather than lose them.
  if (unsyncedFor(state.user.id)) { retryUnsyncedNow(); return; }
  state.entries = row.entries || [];
  save(true);
  applyAccountSettings(row.settings);
  state.lastSynced = new Date();
  state.syncStatus = "synced";
  toast("Updated from another device.");
  render();
}
function subscribeRealtime() {
  if (realtimeChannel) {
    try { sbClient.removeChannel(realtimeChannel); } catch (e) {}
    realtimeChannel = null;
  }
  var filter = "user_id=eq." + state.user.id;
  realtimeChannel = sbClient.channel("sync-" + state.user.id)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: SYNC_TABLE, filter: filter }, handleRemoteChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: SYNC_TABLE, filter: filter }, handleRemoteChange)
    .subscribe();
}
function unsubscribeAll() {
  if (realtimeChannel) { try { sbClient.removeChannel(realtimeChannel); } catch (e) {} }
  if (docChannel) { try { sbClient.removeChannel(docChannel); } catch (e) {} }
  if (expenseChannel) { try { sbClient.removeChannel(expenseChannel); } catch (e) {} }
  realtimeChannel = null;
  docChannel = null;
  expenseChannel = null;
}

/* ============ Auth (Supabase email + password) ============ */
function initAuth() {
  var client;
  try { client = getSupabase(); } catch (e) {
    state.authChecking = false;
    state.authError = "Couldn't start the sync client.";
    render();
    return;
  }
  // A password-reset email link lands back here with type=recovery.
  if (/type=recovery/.test(location.hash)) state.authMode = "reset";

  client.auth.onAuthStateChange(function (event, session) {
    // Supabase advises against calling other auth methods inside this
    // callback, so hand the work off to the next tick.
    setTimeout(function () { handleAuthEvent(event, session); }, 0);
  });
  // With no signal Supabase keeps retrying the session refresh for a long
  // time before reporting back, so don't leave the user on "Loading".
  setTimeout(function () {
    if (state.authChecking && hasStoredSession()) enterOfflineMode();
  }, 4000);
  // Changes are sent 0.8s after the last edit. If the app is hidden first
  // (switching apps, locking the phone, closing the tab), send them now.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && syncPushTimer) {
      clearTimeout(syncPushTimer);
      doSyncPush();
    } else if (document.visibilityState === "visible") {
      retryUnsyncedNow();
    }
  });
  window.addEventListener("online", function () {
    retryUnsyncedNow();
    if (state.authed && !state.user) {
      client.auth.getSession().then(function (r) {
        if (r.data && r.data.session) startSession(r.data.session.user);
      });
    }
  });
}

function handleAuthEvent(event, session) {
  if (event === "PASSWORD_RECOVERY") {
    state.authMode = "reset";
    state.authChecking = false;
    render();
    return;
  }
  if (event === "SIGNED_OUT") {
    if (state.authed) endSession();
    return;
  }
  if (event === "INITIAL_SESSION") {
    state.authChecking = false;
    if (state.authMode === "reset") { render(); return; }
    if (session) { startSession(session.user); return; }
    if (hasStoredSession()) { if (!state.authed) enterOfflineMode(); return; }
    // No usable session (e.g. it was revoked) - back to the login form.
    if (state.authed) endSession(); else render();
    return;
  }
  if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session && state.authMode !== "reset") {
    if (!state.user || state.user.id !== session.user.id) startSession(session.user);
  }
}

// Signed in on this device before but the session couldn't be refreshed
// (usually no signal): work from the local copy and reconnect later.
function enterOfflineMode() {
  state.authChecking = false;
  state.authed = true;
  state.syncStatus = "error";
  render();
  toast("Couldn't reach sync \u2014 showing your last saved data.");
}

async function startSession(user) {
  if (state.startingSession) return;
  state.startingSession = true;
  state.user = { id: user.id, email: user.email };
  state.authed = true;
  state.authError = "";
  state.authInfo = "";
  state.syncStatus = "connecting";
  render();
  try {
    var res = await sbClient.from(SYNC_TABLE).select("entries,settings,updated_at,updated_by").eq("user_id", user.id).maybeSingle();
    if (res.error) throw res.error;
    var pending = unsyncedFor(user.id);
    if (pending) {
      // Changes made on this device while offline: send them instead of
      // replacing them with the account's copy.
      await pushRow();
      clearUnsynced(pending.at);
      toast("Back online \u2014 changes made on this device have been synced.");
    } else if (res.data) {
      state.entries = res.data.entries || [];
      save(true);
      // The account's settings win. If it has none yet, this device's
      // choices become the account's.
      if (!applyAccountSettings(res.data.settings) && hasCustomSettings()) await pushRow();
    } else {
      // No timesheet saved for this account yet - seed it from this device.
      await pushRow();
    }
    subscribeRealtime();
    subscribeDocRealtime();
    loadDocuments();
    subscribeExpensesRealtime();
    loadExpenses();
    state.syncStatus = "synced";
    state.lastSynced = new Date();
  } catch (e) {
    state.syncStatus = "error";
    toast("Couldn't reach sync (" + errMessage(e) + ") — showing your last saved data.");
  }
  state.startingSession = false;
  render();
}

function endSession() {
  unsubscribeAll();
  clearTimeout(syncPushTimer);
  clearTimeout(syncRetryTimer);
  syncPushTimer = syncRetryTimer = null;
  state.authed = false;
  state.user = null;
  state.syncStatus = "off";
  state.documents = [];
  state.authMode = "login";
  state.authError = "";
  state.authInfo = "";
  render();
}

async function signIn(email, password) {
  email = String(email || "").trim();
  if (!email || !password) { state.authError = "Enter your email and password."; render(); return; }
  state.authBusy = true;
  state.authError = "";
  render();
  var res;
  try { res = await getSupabase().auth.signInWithPassword({ email: email, password: password }); }
  catch (e) { res = { error: e }; }
  state.authBusy = false;
  if (res.error) {
    state.authError = /invalid login/i.test(errMessage(res.error))
      ? "Email or password is incorrect."
      : "Couldn't sign in (" + errMessage(res.error) + ").";
    render();
    return;
  }
  startSession(res.data.user);
}

async function sendPasswordReset(email) {
  email = String(email || "").trim();
  if (!email) { state.authError = "Enter the email you sign in with."; render(); return; }
  state.authBusy = true;
  state.authError = "";
  render();
  var res;
  try {
    res = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  } catch (e) { res = { error: e }; }
  state.authBusy = false;
  if (res.error) {
    state.authError = "Couldn't send the email (" + errMessage(res.error) + ").";
  } else {
    state.authInfo = "If that email has an account, a reset link is on its way. Open it on this device.";
    state.authMode = "login";
  }
  render();
}

async function setNewPassword(password, confirmPassword) {
  if (!password || password.length < 8) { state.authError = "Use at least 8 characters."; render(); return; }
  if (password !== confirmPassword) { state.authError = "The two passwords don't match."; render(); return; }
  state.authBusy = true;
  state.authError = "";
  render();
  var res;
  try { res = await getSupabase().auth.updateUser({ password: password }); }
  catch (e) { res = { error: e }; }
  state.authBusy = false;
  if (res.error) {
    state.authError = "Couldn't save the new password (" + errMessage(res.error) + "). The reset link may have expired — request a new one.";
    render();
    return;
  }
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  state.authMode = "login";
  toast("Password updated.");
  startSession(res.data.user);
}

async function logout() {
  unsubscribeAll();
  // "local" signs out this device only, so other devices stay logged in.
  try { await getSupabase().auth.signOut({ scope: "local" }); } catch (e) {}
  endSession();
}
