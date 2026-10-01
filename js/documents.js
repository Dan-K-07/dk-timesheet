"use strict";

/* ============ Documents (Supabase Storage) ============ */
var DOC_BUCKET = "documents";
var DOC_TABLE = "timesheet_documents";

function formatBytes(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
function docPublicUrl(storagePath) {
  if (!sbClient) return "#";
  var res = sbClient.storage.from(DOC_BUCKET).getPublicUrl(storagePath);
  return (res && res.data && res.data.publicUrl) || "#";
}
function sortedDocuments() {
  var arr = state.documents.slice();
  arr.sort(function (a, b) { return new Date(b.uploaded_at) - new Date(a.uploaded_at); });
  return arr;
}
function docsForDate(dateIso) {
  return state.documents.filter(function (d) { return d.entry_date === dateIso; });
}

async function loadDocuments() {
  if (!state.user) return;
  try {
    var res = await sbClient.from(DOC_TABLE).select("*").eq("user_id", state.user.id).order("uploaded_at", { ascending: false });
    if (res.error) throw res.error;
    state.documents = res.data || [];
    render();
  } catch (e) {
    toast("Couldn't load documents: " + (e && e.message ? e.message : "unknown error"));
  }
}

function subscribeDocRealtime() {
  if (docChannel) { try { sbClient.removeChannel(docChannel); } catch (e) {} docChannel = null; }
  docChannel = sbClient.channel("docs-" + state.user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: DOC_TABLE, filter: "user_id=eq." + state.user.id }, function () {
      loadDocuments();
    })
    .subscribe();
}

async function uploadDocument(file, entryDate, label) {
  if (!state.user) { toast("Not connected \u2014 try logging in again."); return; }
  if (!file) return;
  state.docUploading = true;
  render();
  try {
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Files go in a folder named after the account - the storage policy relies on it.
    var storagePath = state.user.id + "/" + uid() + "-" + safeName;
    var upRes = await sbClient.storage.from(DOC_BUCKET).upload(storagePath, file, { upsert: false });
    if (upRes.error) throw upRes.error;

    var meta = {
      user_id: state.user.id,
      entry_date: entryDate || null,
      filename: label && label.trim() ? label.trim() : file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size || null
    };
    var insRes = await sbClient.from(DOC_TABLE).insert(meta).select();
    if (insRes.error) throw insRes.error;

    state.docUploading = false;
    await loadDocuments();
    toast("Uploaded " + meta.filename);
  } catch (e) {
    state.docUploading = false;
    render();
    toast("Upload failed: " + (e && e.message ? e.message : "unknown error"));
  }
}

async function deleteDocument(doc) {
  if (!state.user) return;
  if (!confirm("Delete \u201c" + doc.filename + "\u201d? This can't be undone.")) return;
  try {
    await sbClient.storage.from(DOC_BUCKET).remove([doc.storage_path]);
    var res = await sbClient.from(DOC_TABLE).delete().eq("id", doc.id);
    if (res.error) throw res.error;
    state.documents = state.documents.filter(function (d) { return d.id !== doc.id; });
    render();
    toast("Deleted.");
  } catch (e) {
    toast("Couldn't delete: " + (e && e.message ? e.message : "unknown error"));
  }
}
