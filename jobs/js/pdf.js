"use strict";

/* =====================================================================
   DK Jobs - quote, invoice and statement PDFs.
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
// Short numbered lines like "1. Payment Terms" are shown as headings
// (in the PDF and the on-screen preview).
function isTermsHeading(p) { return p.length <= 60 && /^(\d+[.)]|[A-Z][A-Za-z &/-]{2,40}:?$)/.test(p) && !/[.,;]$/.test(p); }
function pdfMoney(n) { return pdfText(money(n)); }
function docFileName(d) {
  var parts = [d.number, d.title || (d.client && d.client.name)].filter(Boolean).map(function (p) { return pdfText(p).trim(); });
  return parts.join(" - ").replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 120) + ".pdf";
}

/* ---- Shared by invoices, quotes and statements ---- */
// A new A4 PDF plus the page sizes and drawing helpers.
function pdfKit() {
  var pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  var k = { pdf: pdf, W: 210, H: 297, M: 16 };
  k.R = k.W - k.M; k.CW = k.W - 2 * k.M;
  k.TOP2 = k.M + 8;      // where content starts on page 2 onwards (under the small header)
  k.BOTTOM = k.H - 18;   // keep clear of the page number
  k.font = function (size, style, colour) {
    pdf.setFont("helvetica", style || "normal"); pdf.setFontSize(size); pdf.setTextColor.apply(pdf, colour || PDF_INK);
  };
  // Wrapping is measured in the current font, so set the font first.
  k.lines = function (text, width) { return pdf.splitTextToSize(pdfText(text), width); };
  k.rbox = function (x, top, w, h, fill) {
    pdf.setDrawColor.apply(pdf, PDF_LINE); pdf.setLineWidth(0.3);
    if (fill) pdf.setFillColor.apply(pdf, PDF_SOFT);
    pdf.roundedRect(x, top, w, h, 3, 3, fill ? "FD" : "S");
  };
  k.heading = function (text, x, top, size) { k.font(size || 8.5, "bold"); pdf.text(pdfText(text), x, top, { charSpace: 0.15 }); };
  return k;
}
// Top of page 1: logo and your details on the left; the title (INVOICE,
// STATEMENT...), its number and the key dates on the right. Returns where
// the next thing goes.
function pdfLetterhead(k, title, number, meta) {
  var pdf = k.pdf, s = state.data.settings, M = k.M, R = k.R, y = M;
  var font = k.font, lines = k.lines, heading = k.heading;
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
  font(21, "bold"); pdf.text(title, R, rightY, { align: "right" }); rightY += 4.5;
  font(9.5, "bold"); pdf.text(pdfText(number), R, rightY, { align: "right" }); rightY += 7.5;
  if (s.vatRegistered && s.vatNumber) meta = meta.concat([["VAT No.", s.vatNumber]]);
  meta.forEach(function (m) {
    font(8.5, "bold"); pdf.text(pdfText(m[0]), R, rightY, { align: "right" }); rightY += 5;
    font(10.5, "bold"); pdf.text(pdfText(m[1]), R, rightY, { align: "right" }); rightY += 6.5;
  });
  return Math.max(leftY, rightY - 2, y + logoH) + 5;
}
// Your bank details in a shaded box. Returns where the next thing goes.
function pdfPaymentBox(k, y, reference, newPage) {
  var pdf = k.pdf, s = state.data.settings, M = k.M, CW = k.CW;
  var cols = [["Account Name", s.accountName], ["Account Number", s.accountNumber], ["Sort Code", s.sortCode], ["Reference", reference]]
    .filter(function (c) { return c[1]; });
  var ph = s.bankName ? 27 : 23, colW = (CW - 10) / cols.length;
  if (y + ph > k.BOTTOM) y = newPage();
  k.rbox(M, y, CW, ph, true);
  k.heading("Payment Details" + (s.bankName ? " · " + s.bankName : ""), M + 5, y + 8);
  cols.forEach(function (c, i) {
    var x = M + 5 + i * colW;
    k.font(8.5, "bold"); pdf.text(pdfText(c[0]), x, y + 14.5, { charSpace: 0.15 });
    k.font(8.5, "bold"); pdf.text(k.lines(c[1], colW - 3)[0] || "", x, y + 19);
  });
  return y + ph + 8;
}
// Page numbers, and a small header (the file name) on page 2 onwards.
function pdfFinish(k, name) {
  var pdf = k.pdf, s = state.data.settings, pages = pdf.getNumberOfPages();
  for (var i = 1; i <= pages; i++) {
    pdf.setPage(i);
    k.font(8, "normal", PDF_DIM);
    if (pages > 1) pdf.text("Page " + i + " of " + pages, k.R, k.H - 9, { align: "right" });
    if (i > 1) pdf.text(pdfText(name + (s.businessName || s.yourName ? " · " + (s.businessName || s.yourName) : "")), k.M, k.M - 4);
  }
  pdf.setProperties({ title: name, author: pdfText(s.businessName || s.yourName || ""), creator: "DK Jobs" });
}

function buildDocPdf(d) {
  var s = state.data.settings, isInv = d.kind === "invoice", t = docTotals(d);
  var k = pdfKit(), pdf = k.pdf, H = k.H, M = k.M, R = k.R, CW = k.CW, TOP2 = k.TOP2, BOTTOM = k.BOTTOM;
  var font = k.font, lines = k.lines, rbox = k.rbox, heading = k.heading;
  function newPage() { pdf.addPage(); y = TOP2; return y; }

  /* ---- Top: logo, From details (left) and INVOICE with dates (right) ---- */
  var meta = [[isInv ? "Invoice Date" : "Quote Date", fmtDate(d.date)], [isInv ? "Due Date" : "Valid Until", fmtDate(d.due)]];
  if (d.client.supplierRef) meta.push(["Supplier Ref", d.client.supplierRef]);
  var y = pdfLetterhead(k, isInv ? "INVOICE" : "QUOTE", d.number, meta);

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
  if ((isInv || s.showBankOnQuotes) && (s.accountNumber || s.sortCode)) y = pdfPaymentBox(k, y, d.number, newPage);

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
      var head = isTermsHeading(para);
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
  pdfFinish(k, docFileName(d).replace(/\.pdf$/, ""));
  return pdf;
}

/* ---- Statement of account ---- */
function statementFileName(c, st) {
  var when = st.from || st.to ? statementPeriod(st) : "full history";
  return ("Statement - " + pdfText(c.name || "Client").trim() + " - " + when).replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 120) + ".pdf";
}
function buildStatementPdf(c, st) {
  var s = state.data.settings, k = pdfKit(), pdf = k.pdf, M = k.M, R = k.R, TOP2 = k.TOP2, BOTTOM = k.BOTTOM;
  var font = k.font, lines = k.lines, y = M + 4;
  function newPage() { pdf.addPage(); y = TOP2; return y; }
  function hr(yy, colour, w) { pdf.setDrawColor.apply(pdf, colour || PDF_LINE); pdf.setLineWidth(w || 0.25); pdf.line(M, yy, R, yy); }
  var balanceLabel = st.to && st.to < todayIso() ? "Balance at " + fmtDate(st.to) : "Balance outstanding";

  /* ---- Top: the client (left), your details (middle), your logo (right) ---- */
  var colL = M, colM = M + 66, colW = 62, ly = y, my = y;
  font(10.5, "bold"); lines(c.name || "Client", colW).forEach(function (l) { pdf.text(l, colL, ly); ly += 4.8; });
  font(9, "normal", PDF_DIM); if (c.email) { pdf.text(lines(c.email, colW)[0], colL, ly); ly += 4.4; }

  font(10.5, "bold"); lines(s.businessName || s.yourName || "Your business name", colW).forEach(function (l) { pdf.text(l, colM, my); my += 4.8; });
  font(9, "normal", PDF_DIM);
  var block = function (list) {
    list = list.map(function (x) { return (x || "").trim(); }).filter(Boolean);
    if (!list.length) return;
    list.forEach(function (l) { lines(l, colW).forEach(function (w) { pdf.text(w, colM, my); my += 4.4; }); });
    my += 1.6;
  };
  block([s.yourName && s.businessName ? s.yourName : ""].concat(String(s.address || "").split("\n")));
  block([s.email, s.phone, s.website]);
  block([s.vatRegistered && s.vatNumber ? "VAT number: " + s.vatNumber : ""]);

  var logoH = 0;
  if (s.logo) {
    try {
      var p = pdf.getImageProperties(s.logo), lw = 46, lh = lw * p.height / p.width;
      if (lh > 18) { lh = 18; lw = lh * p.width / p.height; }
      pdf.addImage(s.logo, "PNG", R - lw, y - 3.5, lw, lh); logoH = lh;
    } catch (e) {}
  }
  y = Math.max(ly, my, y + logoH) + 6;

  /* ---- Title, who it's to, and the dates it covers ---- */
  font(22, "normal"); pdf.text("Statement of Account", M, y + 4); y += 15;
  font(7, "normal", PDF_DIM); pdf.text("TO", M, y, { charSpace: 0.3 }); y += 4.8;
  font(10, "bold"); pdf.text(lines(c.name || "", 120)[0] || "", M, y); y += 5;
  var addr = String(c.address || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).join(", ");
  font(10, "normal"); if (addr) { lines(addr, 120).forEach(function (l) { pdf.text(l, M, y); y += 5; }); }
  font(9.5, "normal", PDF_DIM);
  if (clientContactName(c)) { pdf.text(pdfText("Attn: " + clientContactName(c)), M, y); y += 5; }
  if (c.email) { pdf.text(pdfText(c.email), M, y); y += 5; }
  y += 4;
  var period = [statementPeriod(st), "Statement date " + fmtDate(todayIso()), c.supplierRef ? "Supplier ref " + c.supplierRef : ""].filter(Boolean).join("  ·  ");
  font(9, "normal", PDF_DIM); pdf.text(pdfText(period), M, y); y += 8;

  /* ---- Transactions: plain table, a hairline under each row ----
     Each column is measured to fit what's in it (plus a gap), and Detail gets
     the room that's left, so nothing runs into the next column. Days have two
     digits (05 Jul 2026) so dates line up. */
  var day2 = function (iso) { return iso ? pdfText(fmtDate(iso)).replace(/^(\d)\s/, "0$1 ") : ""; };
  var rows = (st.from ? [{ bf: true }] : []).concat(st.rows), rh = 8.2, gap = 6, ROW = 8.8, HEAD = 8;
  var fit = function (text, w) {
    text = pdfText(text);
    if (pdf.getTextWidth(text) <= w) return text;
    while (text.length > 1 && pdf.getTextWidth(text + "...") > w) text = text.slice(0, -1);
    return text.trim() + "...";
  };
  var widest = function (head, values) {
    font(HEAD, "bold"); var w = pdf.getTextWidth(head);
    font(ROW, "normal");
    values.forEach(function (v) { if (v) w = Math.max(w, pdf.getTextWidth(v)); });
    return w;
  };
  var cell = rows.map(function (r) {
    return r.bf ? { date: day2(st.from), ref: "", detail: "Balance brought forward", due: "", charge: "", paid: "", bal: pdfMoney(st.opening) }
      : { date: day2(r.date), ref: pdfText(r.ref), detail: r.detail, due: day2(r.due), charge: r.charge ? pdfMoney(r.charge) : "",
          paid: r.paid ? pdfMoney(r.paid) : "", bal: pdfMoney(r.balance), pay: r.detail === "Payment" };
  });
  var pick = function (k) { return cell.map(function (c) { return c[k]; }); };
  var wDate = widest("Date", pick("date")), wRef = Math.min(widest("Reference", pick("ref")), 30), wDue = widest("Due", pick("due"));
  var wCharge = widest("Charge", pick("charge")), wPaid = widest("Credit / paid", pick("paid")), wBal = widest("Balance", pick("bal").concat([pdfMoney(st.closing)]));
  var xBal = R, xPaid = xBal - wBal - gap, xCharge = xPaid - wPaid - gap, xDue = xCharge - wCharge - gap - wDue;
  var xDate = M, xRef = xDate + wDate + gap, xDetail = xRef + wRef + gap, wDetail = xDue - gap - xDetail;
  var cols = [["Date", xDate, "left"], ["Reference", xRef, "left"], ["Detail", xDetail, "left"], ["Due", xDue, "left"],
    ["Charge", xCharge, "right"], ["Credit / paid", xPaid, "right"], ["Balance", xBal, "right"]];
  function tableHead() {
    font(HEAD, "bold", PDF_DIM);
    cols.forEach(function (c2) { pdf.text(c2[0], c2[1], y, { align: c2[2] }); });
    y += 3; hr(y, [200, 204, 216], 0.3);
  }
  tableHead();
  if (!rows.length) { font(ROW, "normal", PDF_DIM); pdf.text("No transactions in these dates.", M, y + 5.9); y += rh; hr(y); }
  cell.forEach(function (c) {
    if (y + rh > BOTTOM) { newPage(); tableHead(); }
    var ty = y + 5.5;
    font(ROW, "normal", PDF_DIM);
    pdf.text(c.date, xDate, ty);
    if (c.ref) pdf.text(fit(c.ref, wRef), xRef, ty);
    pdf.text(fit(c.detail, wDetail), xDetail, ty);
    if (c.due) pdf.text(c.due, xDue, ty);
    font(ROW, "normal");
    if (c.charge) pdf.text(c.charge, xCharge, ty, { align: "right" });
    if (c.paid) pdf.text(c.paid, xPaid, ty, { align: "right" });
    pdf.text(c.bal, xBal, ty, { align: "right" });
    y += rh; hr(y);
  });

  /* ---- Under the table: how to pay (left) and the balance (right), side by
     side so they stay on the same page as the table where they can ---- */
  var pay = st.closing > 0 && (s.accountNumber || s.sortCode) ? [["Bank", s.bankName], ["Account name", s.accountName],
    ["Account number", s.accountNumber], ["Sort code", s.sortCode], ["Reference", c.supplierRef]].filter(function (x) { return x[1]; }) : [];
  var payH = pay.length ? 6 + pay.length * 4.8 : 0;
  // The balance always stays with the table; if the bank details won't fit
  // beside it, they go at the top of the next page instead.
  if (y + 12 > BOTTOM) newPage();
  y += 8;
  font(11, "bold"); pdf.text(pdfText(balanceLabel), xBal - wBal - gap, y, { align: "right" });
  pdf.text(pdfMoney(st.closing), xBal, y, { align: "right" });
  if (pay.length) {
    var py = y - 3;
    if (py + payH > BOTTOM) { newPage(); py = y + 2; }
    font(7, "normal", PDF_DIM); pdf.text("PAYMENT DETAILS", M, py, { charSpace: 0.3 }); py += 5;
    pay.forEach(function (x) {
      font(9, "normal", PDF_DIM); pdf.text(pdfText(x[0]), M, py);
      font(9, "normal"); pdf.text(pdfText(x[1]), M + 28, py); py += 4.8;
    });
  }

  pdfFinish(k, statementFileName(c, st).replace(/\.pdf$/, ""));
  return pdf;
}

// Starts a download straight into your Downloads folder (jsPDF's own save
// waits a moment, which can clash with the email opening straight after).
function savePdfFile(pdf, name) {
  var url = URL.createObjectURL(pdf.output("blob"));
  var a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}
// Saves the PDF straight into your Downloads folder.
function downloadDocPdf(d) {
  if (!pdfReady()) { toast("Couldn't load the PDF maker - opening the print window instead."); printDoc(d); return false; }
  savePdfFile(buildDocPdf(d), docFileName(d));
  return true;
}
function downloadStatementPdf(c, range) {
  if (!pdfReady()) { toast("Couldn't load the PDF maker - check your connection and try again."); return; }
  var st = clientStatement(c.id, range.from, range.to);
  savePdfFile(buildStatementPdf(c, st), statementFileName(c, st));
  toast("Statement saved to your Downloads.");
}
// Every unpaid (sent, not yet paid) invoice for a client: one PDF on its
// own, or several in a zip.
function unpaidInvoices(clientId) {
  return liveInvoices().filter(function (i) { return i.clientId === clientId && i.status === "sent"; })
    .sort(function (a, b) { return (a.date || "") < (b.date || "") ? -1 : 1; });
}
async function downloadUnpaidInvoices(c) {
  var list = unpaidInvoices(c.id);
  if (!list.length) { toast("No unpaid invoices for this client."); return; }
  if (!pdfReady()) { toast("Couldn't load the PDF maker - check your connection and try again."); return; }
  if (list.length === 1) { savePdfFile(buildDocPdf(list[0]), docFileName(list[0])); toast("Invoice saved to your Downloads."); return; }
  if (!window.JSZip) { toast("Couldn't load the zip maker."); return; }
  var zip = new window.JSZip(), used = {};
  list.forEach(function (d) {
    var name = docFileName(d), n = 2;
    while (used[name]) name = docFileName(d).replace(/\.pdf$/, " (" + (n++) + ").pdf");
    used[name] = true;
    zip.file(name, buildDocPdf(d).output("blob"));
  });
  var zipName = ("Unpaid invoices - " + pdfText(c.name || "Client").trim() + " - " + fmtDate(todayIso())).replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 120) + ".zip";
  var out = await zip.generateAsync({ type: "blob" });
  var a = document.createElement("a"), href = URL.createObjectURL(out);
  a.href = href; a.download = zipName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(href); }, 60000);
  toast(list.length + " unpaid invoices saved to " + zipName + ".");
}
// Opens the PDF in a new tab so you can print it from there.
function printDocPdf(d) {
  if (!pdfReady()) { printDoc(d); return; }
  var url = buildDocPdf(d).output("bloburl");
  var win = window.open(url, "_blank");
  if (!win) { toast("Pop-up blocked - downloading the PDF instead."); downloadDocPdf(d); }
}
