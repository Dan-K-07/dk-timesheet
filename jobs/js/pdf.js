"use strict";

/* =====================================================================
   DK Jobs - quote and invoice PDFs.
   Draws a proper A4 page (text, lines and boxes) with jsPDF, which is
   kept in jobs/vendor/ so it works offline too. The PDF downloads
   straight away - no print dialog.
   ===================================================================== */

var PDF_INK = [29, 32, 51], PDF_DIM = [108, 114, 144], PDF_LINE = [226, 229, 238],
    PDF_SOFT = [247, 248, 251], PDF_ACCENT = [76, 61, 214];

function pdfReady() { return !!(window.jspdf && window.jspdf.jsPDF); }

// The built-in PDF fonts only cover Western European characters, so swap
// the few others the app uses (arrows, minus sign) for plain ones.
function pdfText(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/\s*[→⇒➜]\s*/g, " to ").replace(/[−‒]/g, "-").replace(/[   ]/g, " ")
    .replace(/[^\x00-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "");
}
function pdfMoney(n) { return pdfText(money(n)); }
function docFileName(d) {
  var parts = [d.number, d.title || (d.client && d.client.name)].filter(Boolean).map(function (p) { return pdfText(p).trim(); });
  return parts.join(" - ").replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 120) + ".pdf";
}

function buildDocPdf(d) {
  var s = state.data.settings, isInv = d.kind === "invoice", t = docTotals(d);
  var pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  var W = 210, H = 297, M = 16, R = W - M, CW = W - 2 * M;
  var TOP2 = M + 8;            // where content starts on page 2 onwards (under the small header)
  var BOTTOM = H - 18;         // keep clear of the page number
  var y = M;

  function font(size, style, colour) {
    pdf.setFont("helvetica", style || "normal"); pdf.setFontSize(size); pdf.setTextColor.apply(pdf, colour || PDF_INK);
  }
  // Wrapping is measured in the current font, so set the font first.
  function lines(text, width) { return pdf.splitTextToSize(pdfText(text), width); }
  function rbox(x, top, w, h, fill) {
    pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setLineWidth(0.3);
    if (fill) pdf.setFillColor.apply(pdf, PDF_SOFT);
    pdf.roundedRect(x, top, w, h, 3, 3, fill ? "FD" : "S");
  }
  function heading(text, x, top, size) { font(size || 8.5, "bold"); pdf.text(pdfText(text), x, top, { charSpace: 0.15 }); }
  function newPage() { pdf.addPage(); y = TOP2; }

  /* ---- Top: logo, From details (left) and INVOICE with dates (right) ---- */
  var textX = M, logoH = 0;
  if (s.logo) {
    try {
      var p = pdf.getImageProperties(s.logo), lw = 26, lhgt = lw * p.height / p.width;
      if (lhgt > 26) { lhgt = 26; lw = lhgt * p.width / p.height; }
      pdf.addImage(s.logo, "PNG", M, y, lw, lhgt); textX = M + lw + 7; logoH = lhgt;
    } catch (e) {}
  }
  var leftY = y + 3.5;
  heading("From", textX, leftY); leftY += 6;
  font(12.5, "bold"); pdf.text(lines(s.businessName || s.yourName || "Your business name", 90), textX, leftY); leftY += 6;
  var fromLines = [s.yourName && s.businessName ? s.yourName : ""].concat(String(s.address || "").split("\n"), [s.phone, s.email, s.website])
    .map(function (x) { return (x || "").trim(); }).filter(Boolean);
  font(9, "normal", PDF_DIM);
  fromLines.forEach(function (l) { pdf.text(lines(l, 90), textX, leftY); leftY += 4.4; });

  var rightY = y + 6;
  font(21, "bold"); pdf.text(isInv ? "INVOICE" : "QUOTE", R, rightY, { align: "right" }); rightY += 4.5;
  font(9.5, "bold"); pdf.text(pdfText(d.number), R, rightY, { align: "right" }); rightY += 7.5;
  var meta = [[isInv ? "Invoice Date" : "Quote Date", fmtDate(d.date)], [isInv ? "Due Date" : "Valid Until", fmtDate(d.due)]];
  if (d.client.supplierRef) meta.push(["Supplier Ref", d.client.supplierRef]);
  if (s.vatRegistered && s.vatNumber) meta.push(["VAT No.", s.vatNumber]);
  meta.forEach(function (m) {
    font(8.5, "bold"); pdf.text(pdfText(m[0]), R, rightY, { align: "right" }); rightY += 5;
    font(10.5, "bold"); pdf.text(pdfText(m[1]), R, rightY, { align: "right" }); rightY += 6.5;
  });
  y = Math.max(leftY, rightY - 2, y + logoH) + 5;

  /* ---- Bill To / Job Details boxes ---- */
  var gap = 6, hasJob = !!(d.title || d.venue || d.jobDates || d.po);
  var bw = hasJob ? (CW - gap) / 2 : CW, pad = 5, inner = bw - 2 * pad;
  // Each box is a list of rows: [text, size, style, colour, gapAfter]
  function rows(list) {
    var out = [];
    list.forEach(function (r) {
      if (!r[0]) return;
      font(r[1], r[2]);
      lines(r[0], inner).forEach(function (l, i, all) { out.push([l, r[1], r[2], r[3], i === all.length - 1 ? r[4] : r[1] * 0.42]); });
    });
    return out;
  }
  var bill = rows([[isInv ? "Bill To" : "Prepared For", 8.5, "bold", PDF_INK, 7], [d.client.name, 12, "bold", PDF_INK, 4.5],
    [d.client.email, 8.5, "bold", PDF_DIM, 6]].concat(String(d.client.address || "").split("\n").map(function (a) { return [a.trim(), 9, "normal", PDF_INK, 4.4]; }))
    .concat(d.client.contact ? [["Attn: " + d.client.contact, 9, "normal", PDF_DIM, 4.4]] : []));
  var job = hasJob ? rows([["Job Details", 8.5, "bold", PDF_INK, 7], [d.title, 9.5, "bold", PDF_INK, 4.8], [d.venue, 8, "bold", PDF_DIM, 6],
    [d.jobDates, 9, "bold", PDF_DIM, 5], [d.po ? "PO: " + d.po : "", 9, "bold", PDF_DIM, 5]]) : [];
  function rowsH(list) { return list.reduce(function (h, r) { return h + r[4]; }, 0); }
  var bh = Math.max(rowsH(bill), rowsH(job)) + 2 * pad + 1;
  function drawRows(list, x) {
    var yy = y + pad + 3.5;
    list.forEach(function (r) { font(r[1], r[2], r[3]); pdf.text(r[0], x + pad, yy); yy += r[4]; });
  }
  rbox(M, y, bw, bh); drawRows(bill, M);
  if (hasJob) { rbox(M + bw + gap, y, bw, bh); drawRows(job, M + bw + gap); }
  y += bh + 9;

  if (d.summary) {
    font(9.5, "normal");
    lines(d.summary, CW).forEach(function (l) { pdf.text(l, M, y); y += 4.6; });
    y += 4;
  }

  /* ---- Line Items: one rounded box per page, header row shaded ---- */
  var cQty = R - 60, cPrice = R - 30, cAmt = R - 4, descW = cQty - M - 22;
  heading("Line Items", M, y); y += 4;
  var segTop;
  function tableHead() {
    segTop = y;
    pdf.setFillColor.apply(pdf, PDF_SOFT);
    pdf.roundedRect(M, y, CW, 10, 3, 3, "F"); pdf.rect(M, y + 5, CW, 5, "F"); // rounded top corners only
    font(8.5, "bold", PDF_DIM);
    pdf.text("Description", M + 4, y + 6.5); pdf.text("Qty", cQty, y + 6.5, { align: "right" });
    pdf.text("Unit Price", cPrice, y + 6.5, { align: "right" }); pdf.text("Amount", cAmt, y + 6.5, { align: "right" });
    y += 10;
  }
  function closeTable() { pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setLineWidth(0.3); pdf.roundedRect(M, segTop, CW, y - segTop, 3, 3, "S"); }
  tableHead();
  d.items.forEach(function (it, i) {
    font(9.5, "bold");
    var desc = lines(it.desc || "", descW), rh = 11 + (Math.max(1, desc.length) - 1) * 4.4;
    if (y + rh > BOTTOM) { closeTable(); newPage(); tableHead(); }
    else if (i > 0) { pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setLineWidth(0.25); pdf.line(M, y, R, y); }
    var ty = y + 6.8;
    font(9.5, "bold");
    pdf.text(desc, M + 4, ty, { lineHeightFactor: 1.3 });
    pdf.text(pdfText(String(num(it.qty))), cQty, ty, { align: "right" });
    pdf.text(pdfMoney(it.price), cPrice, ty, { align: "right" });
    pdf.text(pdfMoney(lineNet(it)), cAmt, ty, { align: "right" });
    y += rh;
  });
  closeTable();

  /* ---- Totals ---- */
  if (y + 34 > BOTTOM) newPage();
  y += 8;
  var tl = R - 82;
  pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setLineWidth(0.3); pdf.line(tl, y, R, y);
  function totalRow(lbl, val) {
    y += 7.5; font(9.5, "bold", PDF_DIM); pdf.text(lbl, tl, y); font(9.5, "bold"); pdf.text(val, R, y, { align: "right" }); y += 3.5;
  }
  totalRow("Subtotal", pdfMoney(t.net));
  if (d.vatRate) totalRow("VAT @ " + num(d.vatRate) + "%", pdfMoney(t.vat));
  pdf.setDrawColor.apply(pdf, PDF_INK); pdf.setLineWidth(0.5); pdf.line(tl, y + 1, R, y + 1);
  y += 11;
  font(9.5, "bold"); pdf.text(isInv ? "Total Payable" : "Quote Total", tl, y - 1);
  font(22, "bold", PDF_ACCENT); pdf.text(pdfMoney(t.gross), R, y + 2, { align: "right" });
  y += 12;

  /* ---- Payment Details ---- */
  if ((isInv || s.showBankOnQuotes) && (s.accountNumber || s.sortCode)) {
    var cols = [["Account Name", s.accountName], ["Account Number", s.accountNumber], ["Sort Code", s.sortCode], ["Reference", d.number]]
      .filter(function (c) { return c[1]; });
    var ph = s.bankName ? 27 : 23, colW = (CW - 10) / cols.length;
    if (y + ph > BOTTOM) newPage();
    rbox(M, y, CW, ph, true);
    heading("Payment Details" + (s.bankName ? " · " + s.bankName : ""), M + 5, y + 8);
    cols.forEach(function (c, i) {
      var x = M + 5 + i * colW;
      font(8.5, "bold"); pdf.text(pdfText(c[0]), x, y + 14.5, { charSpace: 0.15 });
      font(8.5, "bold"); pdf.text(lines(c[1], colW - 3)[0] || "", x, y + 19);
    });
    y += ph + 8;
  }

  /* ---- Terms: shaded box that carries on to the next page if needed ---- */
  var terms = String(d.terms || "").replace(/\{days\}/g, String(d.termsDays || s.paymentTerms)).trim();
  if (terms) {
    // Work out where every line goes first, so each page's box can be
    // drawn behind its text.
    var ops = [], segs = [], page = pdf.getNumberOfPages(), ty2 = y, seg, step = 4.2, tpad = 5, BODY = [70, 76, 100];
    function startSeg() { seg = { page: page, top: ty2 }; segs.push(seg); ty2 += tpad + 3; }
    var lastY = ty2;
    function fit(h) { if (ty2 + h > BOTTOM - tpad) { seg.bottom = lastY + tpad; page++; ty2 = TOP2; startSeg(); } }
    if (ty2 + 30 > BOTTOM) { page++; ty2 = TOP2; }
    startSeg();
    ops.push({ page: page, y: ty2, t: isInv ? "Payment Terms & Conditions" : "Terms & Conditions", h: "title" }); ty2 += 7;
    terms.split("\n").forEach(function (para) {
      para = para.trim();
      if (!para) { ty2 += step * 0.7; return; }
      var head = para.length <= 60 && /^(\d+[.)]|[A-Z][A-Za-z &/-]{2,40}:?$)/.test(para) && !/[.,;]$/.test(para);
      font(8.5, head ? "bold" : "normal");
      if (head) fit(step * 3);
      lines(para, CW - 2 * tpad).forEach(function (l) { fit(step); ops.push({ page: page, y: ty2, t: l, h: head ? "head" : "" }); lastY = ty2; ty2 += step; });
    });
    seg.bottom = lastY + tpad;
    while (pdf.getNumberOfPages() < page) pdf.addPage();
    segs.forEach(function (sg) { pdf.setPage(sg.page); rbox(M, sg.top, CW, sg.bottom - sg.top, true); });
    ops.forEach(function (o) {
      pdf.setPage(o.page);
      if (o.h === "title") heading(o.t, M + tpad, o.y, 9.5);
      else { font(8.5, o.h ? "bold" : "normal", o.h ? PDF_INK : BODY); pdf.text(o.t, M + tpad, o.y); }
    });
  }

  /* ---- Page numbers, and a small header on page 2 onwards ---- */
  var pages = pdf.getNumberOfPages(), name = docFileName(d).replace(/\.pdf$/, "");
  for (var i = 1; i <= pages; i++) {
    pdf.setPage(i);
    font(8, "normal", PDF_DIM);
    if (pages > 1) pdf.text("Page " + i + " of " + pages, R, H - 9, { align: "right" });
    if (i > 1) pdf.text(pdfText(name + (s.businessName || s.yourName ? " · " + (s.businessName || s.yourName) : "")), M, M - 4);
  }
  pdf.setProperties({ title: name, author: pdfText(s.businessName || s.yourName || ""), creator: "DK Jobs" });
  return pdf;
}

// Saves the PDF straight into your Downloads folder. Starts the download
// right now (jsPDF's own save waits a moment, which can clash with the
// email opening straight after).
function downloadDocPdf(d) {
  if (!pdfReady()) { toast("Couldn't load the PDF maker - opening the print window instead."); printDoc(d); return false; }
  var url = URL.createObjectURL(buildDocPdf(d).output("blob"));
  var a = document.createElement("a");
  a.href = url; a.download = docFileName(d); a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  return true;
}
// Opens the PDF in a new tab so you can print it from there.
function printDocPdf(d) {
  if (!pdfReady()) { printDoc(d); return; }
  var url = buildDocPdf(d).output("bloburl");
  var win = window.open(url, "_blank");
  if (!win) { toast("Pop-up blocked - downloading the PDF instead."); downloadDocPdf(d); }
}
