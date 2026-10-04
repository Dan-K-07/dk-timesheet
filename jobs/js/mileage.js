"use strict";

/* =====================================================================
   DK Jobs - logging journeys, with places suggested as you type and the
   driving distance worked out for you.

   Free services, no account or key needed:
   - postcodes.io  UK postcodes (Ordnance Survey / ONS data)
   - Photon        places and venues (OpenStreetMap)
   - OSRM          driving distance by road (OpenStreetMap)
   If any of them can't be reached, you just type the miles in.
   ===================================================================== */

var GEO_CACHE = {};
var UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
var UK_BBOX = "-8.7,49.8,1.9,60.9";

function fetchJson(url) {
  return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
}
// Place suggestions for what's been typed so far: postcodes first, then places.
function placeSuggestions(q) {
  q = q.trim();
  if (q.length < 3) return Promise.resolve([]);
  var jobs = [];
  if (/^[A-Z]{1,2}\d/i.test(q)) {
    jobs.push(fetchJson("https://api.postcodes.io/postcodes/" + encodeURIComponent(q) + "/autocomplete?limit=5")
      .then(function (d) { return (d.result || []).map(function (pc) { return { label: pc, pc: pc }; }); }).catch(function () { return []; }));
  }
  jobs.push(fetchJson("https://photon.komoot.io/api/?limit=5&lang=en&bbox=" + UK_BBOX + "&q=" + encodeURIComponent(q))
    .then(function (d) {
      return (d.features || []).map(function (f) {
        var p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
        var label = [p.name, p.street && !p.name ? p.street : "", p.city || p.county, p.postcode].filter(Boolean)
          .filter(function (x, i, a) { return a.indexOf(x) === i; }).join(", ");
        return c ? { label: label, lon: c[0], lat: c[1] } : null;
      }).filter(Boolean);
    }).catch(function () { return []; }));
  return Promise.all(jobs).then(function (lists) {
    var seen = {}, out = [];
    lists.forEach(function (l) { l.forEach(function (s) { var k = s.label.toLowerCase(); if (s.label && !seen[k]) { seen[k] = true; out.push(s); } }); });
    out.forEach(function (s) { if (s.lat) GEO_CACHE[s.label.toLowerCase()] = { lat: s.lat, lon: s.lon }; });
    return out.slice(0, 7);
  });
}
// Map position for a place or postcode (as typed or picked).
function geocode(text) {
  var key = String(text || "").trim().toLowerCase();
  if (!key) return Promise.reject(new Error("empty"));
  if (GEO_CACHE[key]) return Promise.resolve(GEO_CACHE[key]);
  var pc = key.match(/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/i);
  var viaPostcode = pc ? fetchJson("https://api.postcodes.io/postcodes/" + encodeURIComponent(pc[0])).then(function (d) {
    if (!d.result) throw new Error("postcode not found");
    return { lat: d.result.latitude, lon: d.result.longitude };
  }) : Promise.reject(new Error("no postcode"));
  return viaPostcode.catch(function () {
    return fetchJson("https://photon.komoot.io/api/?limit=1&lang=en&bbox=" + UK_BBOX + "&q=" + encodeURIComponent(text)).then(function (d) {
      var f = (d.features || [])[0];
      if (!f) throw new Error("place not found");
      return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    });
  }).then(function (p) { GEO_CACHE[key] = p; return p; });
}
// One-way driving distance in miles (1 decimal place).
function drivingMiles(from, to) {
  return Promise.all([geocode(from), geocode(to)]).then(function (pts) {
    var url = "https://router.project-osrm.org/route/v1/driving/" + pts[0].lon + "," + pts[0].lat + ";" + pts[1].lon + "," + pts[1].lat + "?overview=false";
    return fetchJson(url);
  }).then(function (d) {
    if (!d.routes || !d.routes.length) throw new Error("no route");
    return Math.round(d.routes[0].distance / 1609.344 * 10) / 10;
  });
}

/* ---------- The Log / Amend Journey popup ---------- */
// What you charge a client per mile: your Settings rate, or the HMRC rate.
function mileageChargeRate(dateIso) {
  var s = state.data.settings;
  return num(s.mileageBillRate) || rateHighFor(taxYearOf(dateIso || todayIso()));
}
function openJourney(m, jobId) {
  var s = state.data.settings, editing = !!m, j = jobById(m ? m.jobId : jobId);
  m = m || { date: j && jobStartDate(j) || todayIso(), jobId: jobId || "", from: s.homeAddress || "", to: j ? j.venue || "" : "", trip: "return", trips: 1,
    desc: j ? [j.ref, j.title].filter(Boolean).join(" - ") : "" };
  var jobOpts = jobOptions("No job selected").map(function (o) { return '<option value="' + attr(o.value) + '"' + (o.value === (m.jobId || "") ? " selected" : "") + '>' + escapeHtml(o.label) + '</option>'; }).join("");
  var ret = m.trip !== "single";
  showModal({
    title: editing ? "Amend Journey" : "Log Journey",
    body: '<div class="modal-form journey-form" id="journeyForm">' +
      field("Link to job (optional)", '<select class="field-input" id="jJob">' + jobOpts + '</select>') +
      '<div class="j-grid3">' +
        field("Date", '<input type="date" class="field-input" id="jDate" value="' + attr(m.date) + '">') +
        field("End date", '<input type="date" class="field-input" id="jEnd" value="' + attr(m.endDate || m.date) + '">') +
        field("Description", '<input class="field-input" id="jDesc" value="' + attr(m.desc) + '" placeholder="e.g. Get out">') +
      '</div>' +
      '<div class="j-grid2">' +
        field("Start location", '<div class="place-wrap"><input class="field-input" id="jFrom" autocomplete="off" value="' + attr(m.from) + '" placeholder="Postcode or place"><div class="place-list" id="jFromList"></div></div>') +
        field("End location", '<div class="place-wrap"><input class="field-input" id="jTo" autocomplete="off" value="' + attr(m.to) + '" placeholder="Postcode, venue or address"><div class="place-list" id="jToList"></div></div>') +
      '</div>' +
      '<div class="j-grid3">' +
        field("Miles (one-way)", '<div class="miles-wrap"><input class="field-input" id="jMiles" inputmode="decimal" value="' + attr(m.miles || "") + '" placeholder="0.0">' +
          '<button type="button" class="icon-only" id="jCalc" title="Work out the distance">' + icon("refresh") + '</button></div>') +
        field("Trips", '<input class="field-input" id="jTrips" type="number" min="1" step="1" value="' + attr(m.trips || 1) + '">') +
        field("Return?", '<button type="button" class="btn ret-btn' + (ret ? " on" : "") + '" id="jReturn">' + (ret ? "Yes - Return" : "No - One way") + '</button>') +
      '</div>' +
      '<div class="j-status lr-sub" id="jStatus"></div>' +
      '<div class="j-total" id="jTotal"></div>' +
    '</div>',
    focus: editing ? "#jMiles" : m.to ? "#jMiles" : "#jTo",
    buttons: [
      { label: icon("save") + (editing ? " Update Journey" : " Save Journey"), cls: "modal-primary", run: function () { return saveJourney(editing ? m : null); } },
      { label: "Cancel", cls: "modal-neutral" }
    ]
  });
  wireJourneyForm(!editing && !m.miles);
}
function wireJourneyForm(autoCalc) {
  var $ = function (id) { return document.getElementById(id); };
  var autoMiles = autoCalc; // keep filling the miles in until you type your own
  function total() {
    var miles = num($("jMiles").value) * ($("jReturn").classList.contains("on") ? 2 : 1) * Math.max(1, parseInt($("jTrips").value, 10) || 1);
    var rate = rateHighFor(taxYearOf($("jDate").value || todayIso()));
    $("jTotal").innerHTML = "Entry total: <b>" + round2(miles) + " mi</b> <span class=\"j-money\">" + money(miles * rate) + "</span> <span class=\"lr-sub\">at " + Math.round(rate * 100) + "p</span>";
  }
  var calcSeq = 0;
  function calc(force) {
    var from = $("jFrom").value.trim(), to = $("jTo").value.trim();
    if (!from || !to || (!force && !autoMiles)) return;
    var seq = ++calcSeq;
    $("jStatus").textContent = "Working out the distance…"; $("jCalc").classList.add("spin");
    drivingMiles(from, to).then(function (mi) {
      if (seq !== calcSeq || !$("jMiles")) return;
      $("jMiles").value = mi; autoMiles = true;
      $("jStatus").textContent = "Driving distance by road (OpenStreetMap). Check it if the route looks unusual.";
      total();
    }).catch(function () {
      if (seq !== calcSeq || !$("jStatus")) return;
      $("jStatus").innerHTML = "Couldn't work out the distance — type the miles in. <a target=\"_blank\" rel=\"noopener\" href=\"https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + encodeURIComponent(from) + "&destination=" + encodeURIComponent(to) + "\">Check on Google Maps ↗</a>";
    }).then(function () { if ($("jCalc")) $("jCalc").classList.remove("spin"); });
  }
  ["jFrom", "jTo"].forEach(function (id) {
    var input = $(id), list = $(id + "List"), timer = null, seq = 0;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value;
      timer = setTimeout(function () {
        var mySeq = ++seq;
        placeSuggestions(q).then(function (items) {
          if (mySeq !== seq || document.activeElement !== input) return;
          list.innerHTML = items.map(function (s, i) { return '<button type="button" class="place-opt" data-i="' + i + '">' + icon("pin") + '<span>' + escapeHtml(s.label) + '</span></button>'; }).join("");
          list.classList.toggle("open", items.length > 0);
          list.querySelectorAll(".place-opt").forEach(function (b) {
            b.addEventListener("mousedown", function (ev) {
              ev.preventDefault();
              input.value = items[parseInt(b.getAttribute("data-i"), 10)].label;
              list.classList.remove("open");
              calc(false);
            });
          });
        });
      }, 300);
    });
    input.addEventListener("blur", function () { setTimeout(function () { list.classList.remove("open"); }, 150); });
    input.addEventListener("change", function () { calc(false); });
    input.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && list.classList.contains("open")) { ev.stopPropagation(); list.classList.remove("open"); } });
  });
  $("jMiles").addEventListener("input", function () { autoMiles = false; total(); });
  $("jTrips").addEventListener("input", total);
  $("jDate").addEventListener("change", function () { if (!$("jEnd").value || $("jEnd").value < $("jDate").value) $("jEnd").value = $("jDate").value; total(); });
  $("jCalc").addEventListener("click", function () { calc(true); });
  $("jReturn").addEventListener("click", function () {
    var on = !this.classList.contains("on");
    this.classList.toggle("on", on); this.textContent = on ? "Yes - Return" : "No - One way"; total();
  });
  $("jJob").addEventListener("change", function () {
    var j = jobById(this.value); if (!j) return;
    if (!$("jTo").value) { $("jTo").value = j.venue || ""; calc(false); }
    if (jobStartDate(j)) { $("jDate").value = jobStartDate(j); $("jEnd").value = jobEndDate(j) || jobStartDate(j); }
    if (!$("jDesc").value) $("jDesc").value = [j.ref, j.title].filter(Boolean).join(" - ");
    total();
  });
  total();
  if (autoCalc) calc(false);
}
function saveJourney(existing) {
  var g = function (id) { return (document.getElementById(id).value || "").trim(); };
  var miles = round2(num(g("jMiles")));
  if (!g("jDate")) { toast("Add the date."); return false; }
  if (!g("jTo")) { toast("Add where you went."); return false; }
  if (miles <= 0) { toast("Add the miles (one-way)."); document.getElementById("jMiles").focus(); return false; }
  var m = existing || { id: uid("m"), created: new Date().toISOString() };
  var trip = document.getElementById("jReturn").classList.contains("on") ? "return" : "single";
  var trips = Math.max(1, parseInt(g("jTrips"), 10) || 1);
  if (m.invoiceId && round2(tripMiles(m)) !== round2(miles * (trip === "return" ? 2 : 1) * trips)) { toast("This journey is on an invoice — the miles can't change."); return false; }
  Object.assign(m, { jobId: g("jJob"), date: g("jDate"), endDate: g("jEnd") && g("jEnd") !== g("jDate") ? g("jEnd") : "", desc: g("jDesc"),
    from: g("jFrom"), to: g("jTo"), miles: miles, trip: trip, trips: trips });
  if (!existing) state.data.mileage.push(m);
  save(); render(); toast(existing ? "Journey updated." : "Journey saved.");
}
// "Add to Items": puts the journey on the job's charges at your per-mile rate.
function journeyItemDesc(m, rate) {
  return "Mileage: " + [m.from, m.to].filter(Boolean).join(" → ") + (m.trip === "return" ? " (return)" : "") + (num(m.trips) > 1 ? " ×" + m.trips : "") + " @ " + Math.round(rate * 100) + "p per mile";
}
function journeyOnItems(m) {
  var j = jobById(m.jobId);
  return !!(j && m.itemId && (j.items || []).some(function (it) { return it.id === m.itemId; }));
}
function journeyDates(m) {
  if (!m.endDate || m.endDate === m.date) return fmtDate(m.date);
  var a = m.date.split("-"), b = m.endDate.split("-");
  if (a[0] === b[0] && a[1] === b[1]) return parseInt(a[2], 10) + "–" + fmtDate(m.endDate);
  return fmtDate(m.date) + " – " + fmtDate(m.endDate);
}
