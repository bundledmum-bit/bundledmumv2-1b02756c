// Client-side PDF generation for branded BundledMum quotes.
// Pure jsPDF + jspdf-autotable so we never need a server round-trip.
// All money values are NAIRA (not kobo); the storefront cart layer
// passes naira directly to /admin/quotes which mirrors this.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const FOREST = "#2D6A4F";
const CORAL = "#E76F51";
const BODY = "#1A1A1A";
const MUTED = "#6B6B6B";
const BG_TINT = "#F5EDE0";

// NGN prefix (instead of the ₦ glyph) because Helvetica in jsPDF does
// not embed the naira sign reliably and several PDF viewers render it
// as a missing-glyph box.
const fmtN = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `NGN ${Math.round(n).toLocaleString()}` : "NGN 0";

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "customer";

// Public asset path — served by Vite from /public/images/ in dev and by
// the prod CDN at the same path. Same bytes the email and public quote
// page reference at https://bundledmum.com/images/BM-LOGO-CORAL.png, so
// visual handoff is consistent across surfaces. Relative path avoids
// dev CORS issues (cross-origin fetch from localhost would fail).
const CORAL_LOGO_URL = "/images/BM-LOGO-CORAL.png";

// jsPDF.addImage() needs a data URL or an HTMLImageElement — it cannot
// resolve a network URL on its own. We fetch the asset once per PDF
// generation and convert to a base64 data URL. Returns null on failure
// (e.g., offline, 404) so the caller can fall back to a text wordmark
// instead of crashing the whole download.
async function loadLogoForPdf(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`logo fetch ${res.status}`);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error("FileReader failed"));
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("logo decode failed"));
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch (e) {
    console.warn("[quotePdf] coral logo unavailable, falling back to text wordmark", e);
    return null;
  }
}

export interface QuoteItemForPdf {
  product_name: string;
  brand_name?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface QuoteForPdf {
  quote_number: string;
  created_at: string | Date;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  subtotal: number;
  service_fee: number;
  estimated_delivery_fee: number;
  total: number;
  customer_notes?: string | null;
  items: QuoteItemForPdf[];
}

export interface ContactBlock {
  whatsapp_number?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
}

export async function generateQuotePdf(quote: QuoteForPdf, contact: ContactBlock): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Resolve the logo before drawing so the header layout knows whether
  // to use the image (preferred) or the text-wordmark fallback. Done
  // here (rather than at module scope) so each PDF gets a fresh fetch
  // and we surface a useful console warning per generation if it 404s.
  const logo = await loadLogoForPdf(CORAL_LOGO_URL);

  // ── Header band ────────────────────────────────────────────────
  // Green band height stays at 30mm; logo sits inside it, vertically
  // centred. The previous coral text wordmark ("BundledMum") was
  // visually duplicating the brand on every PDF — replaced by the
  // image to match the email + public quote page.
  doc.setFillColor(FOREST);
  doc.rect(0, 0, pageW, 30, "F");

  if (logo) {
    // Constrain by height so the "Maternity & Baby Essentials" tagline
    // at y=22 stays clear regardless of the source asset's aspect ratio.
    // 13mm logo sits at y=4..17 inside the 30mm green band; tagline
    // continues to render at y=22 underneath.
    const targetH = 13;
    const targetW = (logo.w / Math.max(logo.h, 1)) * targetH;
    doc.addImage(logo.dataUrl, "PNG", margin, 4, targetW, targetH);
  } else {
    // Graceful fallback: keep the previous coral text wordmark so the
    // PDF still ships with brand presence when the asset can't load.
    doc.setFont("helvetica", "bold");
    doc.setTextColor(CORAL);
    doc.setFontSize(22);
    doc.text("BundledMum", margin, 16);
  }
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Maternity & Baby Essentials", margin, 22);

  // ── QUOTE title + meta ─────────────────────────────────────────
  let y = 42;
  doc.setTextColor(BODY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("QUOTE", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(quote.quote_number, pageW - margin, y - 4, { align: "right" });
  const dateStr = new Date(quote.created_at).toLocaleDateString("en-NG", {
    day: "numeric", month: "long", year: "numeric",
  });
  doc.text(`Date: ${dateStr}`, pageW - margin, y + 2, { align: "right" });
  y += 6;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Prepared For ───────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("PREPARED FOR", margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(BODY);
  doc.text(quote.customer_name || "—", margin, y);
  y += 5;

  const contactBits: string[] = [];
  if (quote.customer_email) contactBits.push(quote.customer_email);
  if (quote.customer_phone) contactBits.push(quote.customer_phone);
  if (contactBits.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text(contactBits.join("  |  "), margin, y);
    y += 5;
  }

  const addrBits: string[] = [];
  if (quote.delivery_address) addrBits.push(quote.delivery_address);
  if (quote.delivery_city) addrBits.push(quote.delivery_city);
  if (quote.delivery_state) addrBits.push(quote.delivery_state);
  if (addrBits.length > 0) {
    doc.setTextColor(BODY);
    const wrapped = doc.splitTextToSize(addrBits.join(", "), pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.5;
  }
  y += 4;

  // ── Items table ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("ITEMS", margin, y);
  y += 3;

  const itemRows = quote.items.map((it, i) => {
    const item = it.product_name + (it.size ? `\nSize: ${it.size}` : "") + (it.color ? `\nColour: ${it.color}` : "");
    return [
      String(i + 1),
      item,
      it.brand_name || "—",
      String(it.quantity),
      fmtN(it.unit_price),
      fmtN(it.line_total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "Brand", "Qty", "Unit Price", "Total"]],
    body: itemRows.length > 0 ? itemRows : [["—", "No items on this quote", "", "", "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2.5, textColor: BODY, lineColor: [230, 230, 230] },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 241] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
    },
  });

  // @ts-ignore — autoTable mutates the doc with the last-table position
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Totals block ───────────────────────────────────────────────
  const totalsX = pageW - margin - 80;
  const valX = pageW - margin;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(BODY);

  doc.text("Subtotal", totalsX, y);
  doc.text(fmtN(quote.subtotal), valX, y, { align: "right" });
  y += 5;
  doc.text("Service & Packaging", totalsX, y);
  doc.text(fmtN(quote.service_fee), valX, y, { align: "right" });
  y += 5;
  doc.text("Estimated Delivery", totalsX, y);
  doc.text(fmtN(quote.estimated_delivery_fee), valX, y, { align: "right" });
  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text("Final delivery cost confirmed at dispatch", totalsX, y);
  y += 5;

  doc.setDrawColor(FOREST);
  doc.setLineWidth(0.4);
  doc.line(totalsX, y, valX, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(FOREST);
  doc.text("GRAND TOTAL", totalsX, y);
  doc.text(fmtN(quote.total), valX, y, { align: "right" });
  y += 10;

  // ── Customer notes ─────────────────────────────────────────────
  if (quote.customer_notes && quote.customer_notes.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text("NOTE", margin, y);
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(BODY);
    const noteLines = doc.splitTextToSize(quote.customer_notes.trim(), pageW - margin * 2);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4.5 + 6;
  }

  // ── Coral divider + contact footer ─────────────────────────────
  if (y > pageH - 50) { doc.addPage(); y = margin; }

  doc.setDrawColor(CORAL);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BODY);
  doc.text("Questions? We're here to help.", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  if (contact.whatsapp_number) {
    doc.text(`WhatsApp: ${contact.whatsapp_number}`, margin, y);
    y += 4.5;
  }
  doc.text("Email: hello@bundledmum.ng", margin, y);
  y += 4.5;
  doc.text("Web: bundledmum.com", margin, y);
  y += 6;

  if (contact.bank_name || contact.bank_account_name || contact.bank_account_number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(BODY);
    doc.text("Bank Details for Transfer", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED);
    const bankBits = [contact.bank_name, contact.bank_account_name, contact.bank_account_number].filter(Boolean);
    doc.text(bankBits.join("  |  "), margin, y);
  }

  // ── Page footer on every page ──────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text("BundledMum · Trusted Maternity & Baby Brand", margin, pageH - 8);
    doc.text(quote.quote_number, pageW / 2, pageH - 8, { align: "center" });
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 8, { align: "right" });
  }

  // Silence unused-import warnings in the file scope.
  void BG_TINT;

  return doc;
}

export async function downloadQuotePdf(quote: QuoteForPdf, contact: ContactBlock) {
  const doc = await generateQuotePdf(quote, contact);
  const filename = `BundledMum-Quote-${quote.quote_number}-${slugify(quote.customer_name)}.pdf`;
  doc.save(filename);
}
