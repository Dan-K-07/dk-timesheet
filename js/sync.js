"use strict";

/* ============ Sync (Supabase) ============ */
function syncStatusLabel() {
  switch (state.syncStatus) {
    case "connecting": return "Connecting\u2026";
    case "syncing": return "Syncing\u2026";
    case "synced": return "Synced";
    case "error": return "Offline";
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
function maskPin(pin) {
  if (!pin) return "";
  if (pin.length <= 2) return pin.charAt(0) + "*";
  return pin.charAt(0) + new Array(pin.length - 1).join("*") + pin.charAt(pin.length - 1);
}
function formatTimeShort(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }

async function pushRow(client, pin) {
  var payload = { pin: pin, entries: state.entries, updated_by: getClientId(), updated_at: new Date().toISOString() };
  var res = await client.from(SYNC_TABLE).upsert(payload, { onConflict: "pin" });
  if (res.error) throw res.error;
}

function scheduleSyncPush() {
  if (!state.authed || !sbClient) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(doSyncPush, 800);
}
async function doSyncPush() {
  if (!sbClient || !state.pin) return;
  state.syncStatus = "syncing";
  updateSyncStatusUI();
  try {
    await pushRow(sbClient, state.pin);
    state.syncStatus = "synced";
    state.lastSynced = new Date();
  } catch (e) {
    state.syncStatus = "error";
    toast("Sync failed: " + (e && e.message ? e.message : "unknown error"));
  }
  updateSyncStatusUI();
}

function handleRemoteChange(payload) {
  var row = payload && payload.new;
  if (!row) return;
  if (row.updated_by === getClientId()) return; // our own write echoing back
  state.entries = row.entries || [];
  save(true);
  state.lastSynced = new Date();
  state.syncStatus = "synced";
  toast("Updated from another device.");
  render();
}
function subscribeRealtime(pin) {
  if (!sbClient) return;
  if (realtimeChannel) {
    try { sbClient.removeChannel(realtimeChannel); } catch (e) {}
    realtimeChannel = null;
  }
  realtimeChannel = sbClient.channel("sync-" + pin)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: SYNC_TABLE, filter: "pin=eq." + pin }, handleRemoteChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: SYNC_TABLE, filter: "pin=eq." + pin }, handleRemoteChange)
    .subscribe();
}

async function attemptLogin(pin, opts) {
  opts = opts || {};
  var cleanPin = String(pin || "").trim();
  if (!cleanPin || cleanPin.length < 4) {
    if (!opts.silent) { state.gateError = "Enter a PIN with at least 4 characters."; render(); }
    return;
  }

  state.pinAttempting = true;
  state.gateError = "";
  if (!opts.silent) render();

  var client;
  try {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    state.pinAttempting = false;
    state.gateError = "Couldn't start the sync client.";
    render();
    return;
  }

  try {
    var res = await client.from(SYNC_TABLE).select("entries,updated_at,updated_by").eq("pin", cleanPin).maybeSingle();
    if (res.error) throw res.error;
    var row = res.data;
    if (row) {
      state.entries = row.entries || [];
      save(true);
    } else {
      // First time this PIN has been used — seed it with whatever's on this device.
      await pushRow(client, cleanPin);
    }
    sbClient = client;
    state.pin = cleanPin;
    savePin(cleanPin);
    subscribeRealtime(cleanPin);
    subscribeDocRealtime(cleanPin);
    loadDocuments();
    state.authed = true;
    state.syncStatus = "synced";
    state.lastSynced = new Date();
    state.pinAttempting = false;
    render();
  } catch (e) {
    state.pinAttempting = false;
    if (opts.silent) {
      // Already logged in on this device before — let them work from the
      // local cache while offline rather than locking them out.
      state.pin = cleanPin;
      state.authed = true;
      state.syncStatus = "error";
      render();
      toast("Couldn't reach sync \u2014 showing your last saved data.");
    } else {
      state.gateError = "Couldn't reach sync (" + (e && e.message ? e.message : "unknown error") + "). Check your connection and try again.";
      render();
    }
  }
}

function logout() {
  if (realtimeChannel && sbClient) { try { sbClient.removeChannel(realtimeChannel); } catch (e) {} }
  if (docChannel && sbClient) { try { sbClient.removeChannel(docChannel); } catch (e) {} }
  realtimeChannel = null;
  docChannel = null;
  sbClient = null;
  clearPin();
  state.authed = false;
  state.pin = null;
  state.syncStatus = "off";
  state.gateError = "";
  state.documents = [];
  render();
}
