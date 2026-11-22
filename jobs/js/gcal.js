"use strict";

/* =====================================================================
   DK Jobs - Google Calendar sync.
   Connect once (Settings) and the app keeps a "DK Jobs" calendar in your
   Google account matching your jobs: every job date becomes an event,
   coloured by status, and cancelled or deleted jobs are removed.

   How it works:
   - Google sign-in happens in the browser (Google Identity Services). The
     permission asked for only covers calendars this app creates, so it
     can't see or change your other calendars.
   - Each event's ID is worked out from the job and date, so every device
     updates the same events instead of making copies.
   - After each Save, the calendar is brought up to date. Google's access
     lasts about an hour; when it runs out, your next tap in the app gets a
     new one (a Google window may flash up for a moment) and syncs.
   - Nothing about Google is stored in your database except the calendar's
     ID, so other devices find the same calendar.
   ===================================================================== */

var GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
var GCAL_API = "https://www.googleapis.com/calendar/v3";
var GCAL_KEY = "dk_jobs_gcal_v1";          // this device: { on, calendarId, lastSync, pending }
var GCAL_TOKEN_KEY = "dk_jobs_gcal_token_v1"; // this tab: { token, exp }
var GCAL_NAME = "DK Jobs";
var GCAL_ZONE = "Europe/London";
// Google's event colours: 8 Graphite, 9 Blueberry, 10 Basil, 6 Tangerine, 2 Sage.
var GCAL_COLOURS = { "Potential": "8", "Pencilled": "9", "Confirmed": "10", "Awaiting Payment": "6", "Completed": "2" };

var gcal = { busy: false, error: "", tokenClient: null, again: false };

function gcalClientId() { return (window.DK_SITE && window.DK_SITE.googleClientId) || ""; }
function gcalConf() { try { return JSON.parse(localStorage.getItem(GCAL_KEY) || "null") || {}; } catch (e) { return {}; } }
function gcalSetConf(patch) {
  var c = Object.assign(gcalConf(), patch);
  try { localStorage.setItem(GCAL_KEY, JSON.stringify(c)); } catch (e) {}
  return c;
}
function gcalOn() { return !!(gcalClientId() && gcalConf().on); }
function gcalToken() {
  try {
    var t = JSON.parse(sessionStorage.getItem(GCAL_TOKEN_KEY) || "null");
    return t && t.token && t.exp > Date.now() + 60000 ? t.token : "";
  } catch (e) { return ""; }
}
function gcalSetToken(token, seconds) {
  try {
    if (token) sessionStorage.setItem(GCAL_TOKEN_KEY, JSON.stringify({ token: token, exp: Date.now() + (seconds || 3600) * 1000 }));
    else sessionStorage.removeItem(GCAL_TOKEN_KEY);
  } catch (e) {}
}

/* ---------- Google sign-in (needs a tap: browsers block pop-ups otherwise) ---------- */
function gcalRequestToken(interactive, then) {
  if (!window.google || !google.accounts || !google.accounts.oauth2) { gcal.error = "Google sign-in didn't load. Check your connection and try again."; gcalPaint(); return; }
  gcal.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: gcalClientId(),
    scope: GCAL_SCOPE,
    callback: function (res) {
      if (res && res.access_token && google.accounts.oauth2.hasGrantedAllScopes(res, GCAL_SCOPE)) {
        gcalSetToken(res.access_token, res.expires_in);
        gcal.error = "";
        if (then) then();
      } else {
        gcal.error = "Google Calendar wasn't allowed. Tick the calendar box when Google asks.";
        gcalPaint();
      }
    },
    error_callback: function (err) {
      gcal.error = err && err.type === "popup_closed" ? "The Google window was closed before it finished." :
        "Couldn't reach Google (" + ((err && err.type) || "unknown") + ").";
      gcalPaint();
    }
  });
  gcal.tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
}

/* ---------- Calendar API ---------- */
async function gcalFetch(method, path, body) {
  var token = gcalToken();
  if (!token) { var e0 = new Error("signed-out"); e0.status = 401; throw e0; }
  var res = await fetch(GCAL_API + path, {
    method: method,
    headers: Object.assign({ Authorization: "Bearer " + token }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  var data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (res.status === 401) gcalSetToken("");
    var err = new Error((data && data.error && data.error.message) || ("Google said " + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

// Finds the DK Jobs calendar (this device, then your account's settings,
// then Google's list), or makes it.
async function gcalCalendarId() {
  var ids = [gcalConf().calendarId, state.data.settings.gcalCalendarId].filter(Boolean);
  for (var i = 0; i < ids.length; i++) {
    try { await gcalFetch("GET", "/calendars/" + encodeURIComponent(ids[i])); return gcalRememberCalendar(ids[i]); }
    catch (e) { if (e.status === 401) throw e; }
  }
  try {
    var list = await gcalFetch("GET", "/users/me/calendarList?minAccessRole=owner&maxResults=250");
    var found = (list.items || []).filter(function (c) { return c.summary === GCAL_NAME; })[0];
    if (found) return gcalRememberCalendar(found.id);
  } catch (e) { if (e.status === 401) throw e; }
  var made = await gcalFetch("POST", "/calendars", { summary: GCAL_NAME, description: "Jobs from DK Jobs. Changes here are overwritten; edit the job in the app instead.", timeZone: GCAL_ZONE });
  return gcalRememberCalendar(made.id);
}
function gcalRememberCalendar(id) {
  gcalSetConf({ calendarId: id });
  // Kept with your account too, so your other devices use the same calendar.
  // Only saved when there's nothing half-edited on screen.
  if (state.data.settings.gcalCalendarId !== id && !hasChanges()) {
    state.data.settings.gcalCalendarId = id;
    gcal.savingId = true; save(); gcal.savingId = false;
  }
  return id;
}

/* ---------- What the calendar should hold ---------- */
// Google event IDs may only use 0-9 and a-v, so the job and date IDs are
// spelt out in base32hex.
function gcalEventId(text) {
  var bytes = unescape(encodeURIComponent(text)), alphabet = "0123456789abcdefghijklmnopqrstuv", out = "", bits = 0, val = 0;
  for (var i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes.charCodeAt(i); bits += 8;
    while (bits >= 5) { out += alphabet[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= 255;
  }
  if (bits > 0) out += alphabet[(val << (5 - bits)) & 31];
  return "dk" + out;
}
function gcalHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

function gcalDesiredEvents() {
  var base = (window.DK_SITE && window.DK_SITE.jobsUrl) ? String(window.DK_SITE.jobsUrl).replace(/\/+$/, "") + "/" : "";
  var out = {};
  state.data.jobs.forEach(function (j) {
    if (j.status === "Cancelled" || !GCAL_COLOURS[j.status]) return;
    var title = (j.title || j.ref || "Untitled job") + (j.status === "Potential" || j.status === "Pencilled" ? " (" + j.status + ")" : "");
    (j.dates || []).forEach(function (d) {
      if (!d.start) return;
      var end = d.end && d.end >= d.start ? d.end : d.start;
      var desc = [j.ref, j.clientId ? clientName(j.clientId) : "", d.label, "Status: " + j.status, j.po ? "PO: " + j.po : "",
        base ? base + "#/jobs/" + encodeURIComponent(j.id) : ""].filter(Boolean).join("\n");
      var common = { summary: title + (d.label ? " · " + d.label : ""), description: desc, location: j.venue || "", colorId: GCAL_COLOURS[j.status] };
      var add = function (key, timing) {
        var ev = Object.assign({}, common, timing);
        var h = gcalHash(JSON.stringify(ev));
        ev.id = gcalEventId(key);
        ev.extendedProperties = { "private": { dk: "1", h: h } };
        out[ev.id] = ev;
      };
      if (d.allDay || !d.startTime) {
        add(j.id + "|" + d.id, { start: { date: d.start }, end: { date: addDays(end, 1) } });
      } else {
        // Timed dates over several days are one event a day (e.g. 08:00-23:00 each show day).
        for (var day = d.start, n = 0; day <= end && n < 120; day = addDays(day, 1), n++) {
          var endTime = d.endTime || d.startTime;
          var endDay = endTime > d.startTime ? day : addDays(day, 1); // finishes after midnight
          add(j.id + "|" + d.id + "|" + n, {
            start: { dateTime: day + "T" + d.startTime + ":00", timeZone: GCAL_ZONE },
            end: { dateTime: endDay + "T" + endTime + ":00", timeZone: GCAL_ZONE }
          });
        }
      }
    });
  });
  return out;
}

/* ---------- Sync ---------- */
async function gcalSync() {
  if (!gcalOn()) return;
  if (gcal.busy) { gcal.again = true; return; }
  if (!gcalToken()) { gcalSetConf({ pending: true }); gcalPaint(); return; }
  gcal.busy = true; gcal.error = ""; gcalPaint();
  var changes = 0;
  try {
    var cal = encodeURIComponent(await gcalCalendarId());
    var have = {}, page = "";
    do {
      var list = await gcalFetch("GET", "/calendars/" + cal + "/events?showDeleted=true&maxResults=2500" + (page ? "&pageToken=" + encodeURIComponent(page) : ""));
      (list.items || []).forEach(function (e) {
        have[e.id] = { cancelled: e.status === "cancelled", h: e.extendedProperties && e.extendedProperties["private"] && e.extendedProperties["private"].h };
      });
      page = list.nextPageToken || "";
    } while (page);

    var want = gcalDesiredEvents(), jobs = [];
    Object.keys(want).forEach(function (id) {
      var ev = want[id], ex = have[id];
      if (ex && !ex.cancelled && ex.h === ev.extendedProperties["private"].h) return;
      jobs.push(function () {
        if (!ex) return gcalFetch("POST", "/calendars/" + cal + "/events", ev).catch(function (e) {
          if (e.status === 409) return gcalFetch("PUT", "/calendars/" + cal + "/events/" + id, Object.assign({ status: "confirmed" }, ev));
          throw e;
        });
        return gcalFetch("PUT", "/calendars/" + cal + "/events/" + id, Object.assign({ status: "confirmed" }, ev));
      });
    });
    Object.keys(have).forEach(function (id) {
      if (want[id] || have[id].cancelled) return;
      jobs.push(function () { return gcalFetch("DELETE", "/calendars/" + cal + "/events/" + id).catch(function (e) { if (e.status !== 404 && e.status !== 410) throw e; }); });
    });
    changes = jobs.length;
    // A few at a time, so Google doesn't turn us away for going too fast.
    for (var i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(function (f) { return f(); }));
    gcalSetConf({ pending: false, lastSync: new Date().toISOString() });
    if (changes) toast("Google Calendar updated (" + changes + " change" + (changes === 1 ? "" : "s") + ").");
  } catch (e) {
    gcalSetConf({ pending: true });
    gcal.error = e.status === 401 ? "" : "Couldn't update Google Calendar: " + errMessage(e);
  }
  gcal.busy = false;
  gcalPaint();
  if (gcal.again) { gcal.again = false; gcalSync(); }
}

// After every Save: bring Google up to date (the ID save above doesn't count).
var gcalSyncTimer = null;
(function () {
  var plainSave = save;
  save = function (skipPush) {
    plainSave(skipPush);
    if (gcalOn() && !gcal.savingId) {
      gcalSetConf({ pending: true });
      clearTimeout(gcalSyncTimer);
      gcalSyncTimer = setTimeout(gcalSync, 1500);
    }
  };
})();

// Opening the app (or Google's access running out) leaves a sync waiting;
// the next tap anywhere gets a fresh Google pass and sends it.
document.addEventListener("click", function () {
  if (!gcalOn() || gcalToken() || gcal.asking || !state.authed) return;
  gcal.asking = true;
  setTimeout(function () { gcal.asking = false; }, 10000);
  gcalRequestToken(false, gcalSync);
}, true);
window.addEventListener("load", function () { if (gcalOn()) { gcalSetConf({ pending: true }); if (gcalToken()) gcalSync(); } });

/* ---------- Settings card ---------- */
function gcalSettingsCard() {
  var c = gcalConf(), body;
  if (!gcalClientId()) {
    body = '<p class="settings-help">Not set up on this copy of the site.</p>';
  } else if (!c.on) {
    body = '<p class="settings-help">Puts every job date into a “' + GCAL_NAME + '” calendar in your Google account, coloured by status, and keeps it up to date when you save. It can’t see or change your other calendars.</p>' +
      '<div class="btn-row">' + btn("Connect Google Calendar", "gcal-connect", { cls: "btn-primary" }) + '</div>';
  } else {
    var when = c.lastSync ? new Date(c.lastSync).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not yet";
    body = '<p class="settings-help" id="gcalStatus">' + gcalStatusText(c, when) + '</p>' +
      '<div class="btn-row">' + btn("Sync now", "gcal-sync", { cls: "btn-sm" }) + btn("Disconnect", "gcal-disconnect", { cls: "btn-sm" }) + '</div>';
  }
  return '<div class="card settings-card" id="gcalCard"><div class="settings-title">Google Calendar</div>' + body +
    (gcal.error ? '<p class="gate-error">' + escapeHtml(gcal.error) + '</p>' : "") + '</div>';
}
function gcalStatusText(c, when) {
  if (gcal.busy) return "Updating Google Calendar…";
  if (c.pending) return "Connected. Changes waiting to be sent; they go next time you tap anything. Last updated: " + when + ".";
  return "Connected. Last updated: " + when + ".";
}
// Refresh just the card (if Settings is open) without redrawing the page.
function gcalPaint() {
  var card = document.getElementById("gcalCard");
  if (card) card.outerHTML = gcalSettingsCard();
}

ACTIONS["gcal-connect"] = function () {
  gcalRequestToken(true, function () {
    gcalSetConf({ on: true, pending: true });
    gcalPaint();
    gcalSync();
  });
};
ACTIONS["gcal-sync"] = function () {
  if (gcalToken()) gcalSync(); else gcalRequestToken(false, gcalSync);
};
ACTIONS["gcal-disconnect"] = function () {
  if (!confirm("Stop updating Google Calendar from this device? The “" + GCAL_NAME + "” calendar stays in Google; delete it there if you don't want it.")) return;
  // The Google permission itself is left alone, so other devices keep syncing.
  // To remove it everywhere: myaccount.google.com > Security > Third-party connections.
  gcalSetToken("");
  gcalSetConf({ on: false, pending: false });
  gcal.error = "";
  gcalPaint();
};
