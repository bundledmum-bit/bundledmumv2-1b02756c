// Customer-facing "Share my Cart" PDF generator.
// Pure client-side jsPDF + jspdf-autotable so the user just gets a file
// download — no server round-trip, no DB write.
//
// This file deliberately does NOT import from src/lib/quotePdf.ts. The
// admin quotes flow and the customer cart-share flow have separate
// lifecycles and brand surfaces; sharing patterns is fine, sharing code
// would couple two products that should evolve independently.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const FOREST = "#2D6A4F";
const CORAL = "#E76F51";
const BODY = "#1A1A1A";
const MUTED = "#6B6B6B";

const fmtN = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "₦0";

export interface CartShareItem {
  product_name: string;
  brand_name?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url?: string | null;
}

export interface CartShareContact {
  whatsapp_number?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  customer_name?: string;
}

/** Random 5-char ID, uppercase A-Z + 0-9. Mirrors the BMQ-style readability. */
function randomShareId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I/O/0/1
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function todayCompact(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function todayHuman(): string {
  return new Date().toLocaleDateString("en-NG", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function todayFileDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Best-effort fetch of an image URL → base64 PNG data URL. Returns null when
 * the image can't be fetched (CORS, 404, network) so the caller can skip
 * the image cell without aborting the whole PDF.
 */
async function fetchImageDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(blob);
    });
    // Probe dimensions via Image() so we can letterbox the cell.
    const dims: { w: number; h: number } = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => reject(new Error("decode"));
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

export async function downloadCartPdf(items: CartShareItem[], contact: CartShareContact = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;

  // ── Header band ────────────────────────────────────────────────
  doc.setFillColor(FOREST);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CORAL);
  doc.setFontSize(22);
  doc.text("BundledMum", margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Maternity & Baby Essentials", margin, 22);

  // ── Title block ────────────────────────────────────────────────
  const shareId = `CART-${todayCompact()}-${randomShareId()}`;
  let y = 42;
  doc.setTextColor(BODY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("MY CART", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(shareId, pageW - margin, y - 4, { align: "right" });
  doc.text(`Date: ${todayHuman()}`, pageW - margin, y + 2, { align: "right" });
  y += 4;
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(`Saved by ${contact.customer_name || "Guest"}`, margin, y + 4);
  y += 8;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Pre-fetch thumbnails in parallel (best-effort) ─────────────
  const thumbs = await Promise.all(
    items.map((it) => (it.image_url ? fetchImageDataUrl(it.image_url) : Promise.resolve(null))),
  );

  // ── Items table ────────────────────────────────────────────────
  const rowH = 14;
  const thumbBox = 10; // mm
  const itemRows = items.map((it, i) => [
    String(i + 1),
    "", // image cell — drawn manually via didDrawCell
    it.product_name + (it.size ? `\nSize: ${it.size}` : "") + (it.color ? `\nColour: ${it.color}` : ""),
    it.brand_name || "—",
    String(it.quantity),
    fmtN(it.unit_price),
    fmtN(it.line_total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Image", "Item", "Brand", "Qty", "Unit Price", "Total"]],
    body: itemRows.length > 0 ? itemRows : [["—", "", "Your cart is empty.", "", "", "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2, textColor: BODY, lineColor: [230, 230, 230], minCellHeight: rowH },
    headStyles: { fillColor: FOREST, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 241] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", valign: "middle" },
      1: { cellWidth: 14, halign: "center", valign: "middle" },
      2: { valign: "middle" },
      3: { valign: "middle" },
      4: { cellWidth: 12, halign: "center", valign: "middle" },
      5: { cellWidth: 24, halign: "right", valign: "middle" },
      6: { cellWidth: 26, halign: "right", fontStyle: "bold", valign: "middle" },
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const thumb = thumbs[data.row.index];
      if (!thumb) return;
      // Letterbox a 10×10 mm box centred in the cell.
      const cx = data.cell.x + data.cell.width / 2;
      const cy = data.cell.y + data.cell.height / 2;
      const aspect = thumb.w / thumb.h;
      let w = thumbBox, h = thumbBox;
      if (aspect > 1) h = thumbBox / aspect; else w = thumbBox * aspect;
      try {
        doc.addImage(thumb.dataUrl, "PNG", cx - w / 2, cy - h / 2, w, h, undefined, "FAST");
      } catch {
        /* malformed image — skip */
      }
    },
  });

  // @ts-ignore — autoTable mutates the doc with the last-table position
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Totals block (right-aligned) ───────────────────────────────
  const subtotal = items.reduce((s, it) => s + (it.line_total || 0), 0);
  const totalsX = pageW - margin - 80;
  const valX = pageW - margin;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(BODY);
  doc.text("Subtotal", totalsX, y);
  doc.text(fmtN(subtotal), valX, y, { align: "right" });
  y += 5;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text("Delivery and service fees calculated at checkout", totalsX, y);
  y += 5;

  doc.setDrawColor(FOREST);
  doc.setLineWidth(0.4);
  doc.line(totalsX, y, valX, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(FOREST);
  doc.text("GRAND TOTAL (PRODUCTS ONLY)", totalsX, y);
  doc.text(fmtN(subtotal), valX, y, { align: "right" });
  y += 12;

  // ── How to complete this order ─────────────────────────────────
  if (y > pageH - 55) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(BODY);
  doc.text("HOW TO COMPLETE THIS ORDER", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(BODY);
  const bullets = [
    "Visit bundledmum.com/cart to add these items to your cart, then check out.",
    "Share this PDF with whoever is paying — they can pay directly via the site.",
    contact.whatsapp_number
      ? `Questions? WhatsApp us on ${contact.whatsapp_number}.`
      : "Questions? Reach us at hello@bundledmum.com.",
  ];
  bullets.forEach((b) => {
    doc.text("•", margin, y);
    const wrapped = doc.splitTextToSize(b, pageW - margin * 2 - 4);
    doc.text(wrapped, margin + 4, y);
    y += wrapped.length * 4.5 + 1;
  });

  // ── Coral divider + contact footer per page ────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(CORAL);
    doc.setLineWidth(0.8);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    const waBit = contact.whatsapp_number ? ` · WhatsApp: ${contact.whatsapp_number}` : "";
    doc.text(`BundledMum · bundledmum.com · hello@bundledmum.com${waBit}`, margin, pageH - 8);
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 8, { align: "right" });
  }

  const filename = `BundledMum-Cart-${shareId}-${todayFileDate()}.pdf`;
  doc.save(filename);
  return { shareId, filename };
}
