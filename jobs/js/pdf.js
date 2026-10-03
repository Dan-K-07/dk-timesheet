"use strict";

/* =====================================================================
   DK Jobs - quote and invoice PDFs.
   Draws a proper A4 page (text, lines and boxes) with jsPDF, which is
   kept in jobs/vendor/ so it works offline too. The PDF downloads
   straight away - no print dialog.
   ===================================================================== */

var PDF_INK = [29, 32, 51], PDF_DIM = [108, 114, 144], PDF_LINE = [226, 229, 238],
    PDF_SOFT = [246, 247, 252], PDF_ACCENT = [76, 95, 213];

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
  var W = 210, H = 297, M = 18, R = W - M, CW = W - 2 * M;
  var y = M;

  function font(size, style, colour) {
    pdf.setFont("helvetica", style || "normal"); pdf.setFontSize(size); pdf.setTextColor.apply(pdf, colour || PDF_INK);
  }
  function lines(text, width) { return pdf.splitTextToSize(pdfText(text), width); }
  function lh(size) { return size * 0.42; } // line height in mm for a font size
  function box(x, top, w, h) {
    pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setFillColor.apply(pdf, PDF_SOFT); pdf.setLineWidth(0.3);
    pdf.roundedRect(x, top, w, h, 2.5, 2.5, "FD");
  }
  // Small capitals labels. Letter spacing only on left-aligned ones, as it
  // pushes right-aligned text past the edge.
  function label(text, x, top, align) {
    font(7.5, "bold", PDF_DIM);
    pdf.text(pdfText(text).toUpperCase(), x, top, align === "right" ? { align: "right" } : { charSpace: 0.3 });
  }

  /* ---- Top: who it's from (left) and what it is (right) ---- */
  var leftY = y;
  if (s.logo) {
    try {
      var p = pdf.getImageProperties(s.logo), lw = 38, lhgt = lw * p.height / p.width;
      if (lhgt > 18) { lhgt = 18; lw = lhgt * p.width / p.height; }
      pdf.addImage(s.logo, "PNG", M, leftY, lw, lhgt); leftY += lhgt + 5;
    } catch (e) {}
  }
  font(14, "bold"); pdf.text(lines(s.businessName || s.yourName || "Your business name", 95), M, leftY + 4); leftY += 9;
  var fromLines = [s.yourName && s.businessName ? s.yourName : ""].concat(String(s.address || "").split("\n"), [s.phone, s.email, s.website])
    .map(function (x) { return (x || "").trim(); }).filter(Boolean);
  font(8.5, "normal", PDF_DIM);
  fromLines.forEach(function (l) { pdf.text(lines(l, 95), M, leftY); leftY += lh(8.5) + 0.6; });

  var rightY = y + 7;
  font(24, "bold", PDF_ACCENT); pdf.text(isInv ? "INVOICE" : "QUOTATION", R, rightY, { align: "right" });
  rightY += 6.5;
  font(10, "bold"); pdf.text(pdfText(d.number), R, rightY, { align: "right" }); rightY += 7;
  var meta = [[isInv ? "Invoice date" : "Quote date", fmtDate(d.date)], [isInv ? "Due date" : "Valid until", fmtDate(d.due)]];
  if (d.client.supplierRef) meta.push(["Supplier ref", d.client.supplierRef]);
  if (s.vatRegistered && s.vatNumber) meta.push(["VAT no.", s.vatNumber]);
  meta.forEach(function (m) {
    label(m[0], R, rightY, "right"); rightY += 4;
    font(9.5, "bold"); pdf.text(pdfText(m[1]), R, rightY, { align: "right" }); rightY += 5.5;
  });
  y = Math.max(leftY, rightY) + 6;

  /* ---- Bill to / Job details boxes ---- */
  var billLines = [d.client.contact, d.client.email].concat(String(d.client.address || "").split("\n")).map(function (x) { return (x || "").trim(); }).filter(Boolean);
  var jobLines = [d.venue, d.jobDates, d.po ? "PO: " + d.po : ""].filter(Boolean);
  var hasJob = !!(d.title || jobLines.length);
  var gap = 6, bw = hasJob ? (CW - gap) / 2 : CW, pad = 5, inner = bw - 2 * pad;
  function boxBody(title, main, rest) {
    var out = [{ t: title, k: "label" }];
    if (main) lines(main, inner).forEach(function (l) { out.push({ t: l, k: "main" }); });
    rest.forEach(function (r) { lines(r, inner).forEach(function (l) { out.push({ t: l, k: "rest" }); }); });
    return out;
  }
  function boxHeight(rows) { return 2 * pad + rows.reduce(function (h, r) { return h + (r.k === "label" ? 5 : r.k === "main" ? 5 : lh(9) + 0.8); }, 0); }
  function drawBox(rows, x, top, h) {
    box(x, top, bw, h);
    var yy = top + pad + 2.5;
    rows.forEach(function (r) {
      if (r.k === "label") { label(r.t, x + pad, yy); yy += 5; }
      else if (r.k === "main") { font(10.5, "bold"); pdf.text(r.t, x + pad, yy); yy += 5; }
      else { font(9, "normal", PDF_DIM); pdf.text(r.t, x + pad, yy); yy += lh(9) + 0.8; }
    });
  }
  var billRows = boxBody(isInv ? "Bill to" : "Prepared for", d.client.name, billLines);
  var jobRows = hasJob ? boxBody("Job details", d.title, jobLines) : null;
  var bh = Math.max(boxHeight(billRows), jobRows ? boxHeight(jobRows) : 0);
  drawBox(billRows, M, y, bh);
  if (jobRows) drawBox(jobRows, M + bw + gap, y, bh);
  y += bh + 7;

  if (d.summary) {
    font(9.5, "normal");
    lines(d.summary, CW).forEach(function (l) { pdf.text(l, M, y); y += lh(9.5) + 1; });
    y += 4;
  }

  /* ---- Line items ---- */
  var cQty = R - 62, cPrice = R - 30, cAmt = R - 3, descW = cQty - M - 18;
  function tableHead() {
    pdf.setFillColor.apply(pdf, PDF_SOFT); pdf.setDrawColor.apply(pdf, PDF_LINE);
    pdf.roundedRect(M, y, CW, 8, 1.5, 1.5, "FD");
    label("Description", M + 3, y + 5.2); label("Qty", cQty, y + 5.2, "right");
    label("Unit price", cPrice, y + 5.2, "right"); label("Amount", cAmt, y + 5.2, "right");
    y += 8;
  }
  // Start a new page if the next bit won't fit. The table heading is only
  // repeated while we're still in the line items.
  var inTable = true;
  function room(need) {
    if (y + need <= H - M - 10) return;
    pdf.addPage(); y = M;
    if (inTable) tableHead();
  }
  tableHead();
  d.items.forEach(function (it) {
    font(9.5, "normal"); // wrapping is measured in the current font
    var desc = lines(it.desc || "", descW), rh = 9 + (Math.max(1, desc.length) - 1) * 4.2; // 4.2mm = 1.25 line spacing
    room(rh);
    var ty = y + 5.5;
    font(9.5, "normal"); pdf.text(desc, M + 3, ty, { lineHeightFactor: 1.25 });
    pdf.text(pdfText(String(num(it.qty))), cQty, ty, { align: "right" });
    pdf.text(pdfMoney(it.price), cPrice, ty, { align: "right" });
    font(9.5, "bold"); pdf.text(pdfMoney(lineNet(it)), cAmt, ty, { align: "right" });
    y += rh;
    pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setLineWidth(0.3); pdf.line(M, y, R, y);
  });

  /* ---- Totals ---- */
  inTable = false;
  room(32);
  y += 7;
  var tl = R - 75;
  if (d.vatRate) {
    font(9.5, "normal", PDF_DIM); pdf.text("Subtotal", tl, y); font(9.5, "normal"); pdf.text(pdfMoney(t.net), cAmt, y, { align: "right" }); y += 6;
    font(9.5, "normal", PDF_DIM); pdf.text("VAT @ " + num(d.vatRate) + "%", tl, y); font(9.5, "normal"); pdf.text(pdfMoney(t.vat), cAmt, y, { align: "right" }); y += 4;
  }
  pdf.setDrawColor.apply(pdf, PDF_INK); pdf.setLineWidth(0.6); pdf.line(tl, y, R, y);
  y += 8;
  font(11, "bold"); pdf.text(isInv ? "Total due" : "Total", tl, y);
  font(18, "bold", PDF_ACCENT); pdf.text(pdfMoney(t.gross), cAmt, y + 0.5, { align: "right" });
  y += 12;

  /* ---- Payment details ---- */
  if ((isInv || s.showBankOnQuotes) && (s.accountNumber || s.sortCode)) {
    var cols = [["Account name", s.accountName], ["Sort code", s.sortCode], ["Account number", s.accountNumber], ["Reference", d.number]]
      .filter(function (c) { return c[1]; });
    var colW = (CW - 10) / cols.length;
    room(26);
    box(M, y, CW, s.bankName ? 24 : 20);
    label("Payment details" + (s.bankName ? " · " + s.bankName : ""), M + 5, y + 6.5);
    cols.forEach(function (c, i) {
      var x = M + 5 + i * colW;
      font(7.5, "normal", PDF_DIM); pdf.text(pdfText(c[0]), x, y + 12.5);
      font(10, "bold"); pdf.text(lines(c[1], colW - 3)[0] || "", x, y + 17.5);
    });
    y += (s.bankName ? 24 : 20) + 7;
  }

  /* ---- Terms ---- */
  var terms = String(d.terms || "").replace(/\{days\}/g, String(d.termsDays || s.paymentTerms)).trim();
  if (terms) {
    // Starts straight under the payment details and runs on to the next
    // page line by line. Short numbered lines ("1. Payment Terms") are
    // treated as headings.
    room(14);
    label(isInv ? "Terms" : "Terms & conditions", M, y); y += 5.5;
    var step = lh(8.5) + 1.1;
    terms.split("\n").forEach(function (para) {
      para = para.trim();
      if (!para) { y += step * 0.6; return; }
      var heading = para.length <= 60 && /^(\d+[.)]|[A-Z][A-Za-z &/-]{2,40}:?$)/.test(para) && !/[.,;]$/.test(para);
      font(8.5, heading ? "bold" : "normal", heading ? PDF_INK : PDF_DIM);
      if (heading) { room(step * 3); y += 1; } // keep a heading with its first line
      lines(para, CW).forEach(function (l) {
        room(step);
        font(8.5, heading ? "bold" : "normal", heading ? PDF_INK : PDF_DIM);
        pdf.text(l, M, y); y += step;
      });
      if (heading) y += 0.4;
    });
  }

  /* ---- Footer on every page ---- */
  var pages = pdf.getNumberOfPages();
  for (var i = 1; i <= pages; i++) {
    pdf.setPage(i);
    font(7.5, "normal", PDF_DIM);
    pdf.text(pdfText([s.businessName || s.yourName, d.number].filter(Boolean).join(" · ")), M, H - 9);
    if (pages > 1) pdf.text("Page " + i + " of " + pages, R, H - 9, { align: "right" });
  }
  pdf.setProperties({ title: docFileName(d).replace(/\.pdf$/, ""), author: pdfText(s.businessName || s.yourName || ""), creator: "DK Jobs" });
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
