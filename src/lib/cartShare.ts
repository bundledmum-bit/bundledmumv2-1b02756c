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
 * Route any external image URL through images.weserv.nl so it comes back
 * with CORS-friendly headers. Without this proxy, canvas.toDataURL throws
 * a SecurityError on tainted canvases for jumia.is / i.ibb.co / amazon
 * etc and the image is silently dropped from the PDF. The proxy also
 * resizes to ~80px so embeds are small.
 */
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes("images.weserv.nl") || url.startsWith("/")) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  const stripped = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=80&h=80&fit=cover&output=jpg`;
}

/**
 * Best-effort image → JPEG data URL via a CORS-anonymous <img> drawn to a
 * canvas. Times out after 5s so a single slow host can't stall the whole
 * PDF build. Returns null on any failure mode (timeout, decode error,
 * tainted canvas) so the cell can render blank instead of breaking the
 * row layout.
 */
async function fetchImageAsBase64(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      console.warn("[cartShare] image fetch timeout:", url);
      resolve(null);
    }, 5000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const w = img.naturalWidth || img.width || 1;
        const h = img.naturalHeight || img.height || 1;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), w, h });
      } catch (e) {
        console.warn("[cartShare] canvas taint:", url, e);
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      console.warn("[cartShare] image load failed:", url);
      resolve(null);
    };
    img.src = url;
  });
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

  // ── Pre-fetch thumbnails through the CORS-friendly proxy ───────
  const thumbs = await Promise.all(
    items.map((it) => fetchImageAsBase64(proxyImageUrl(it.image_url) || "")),
  );

  // ── Items table ────────────────────────────────────────────────
  const thumbBox = 18; // mm
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
    styles: { fontSize: 9, cellPadding: 3, valign: "middle", overflow: "linebreak", textColor: BODY, lineColor: [230, 230, 230], minCellHeight: 22 },
    headStyles: { fillColor: [45, 106, 79], textColor: 255, halign: "center", fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },                     // #
      1: { halign: "center", cellWidth: 22 },                     // image
      2: { halign: "left",   cellWidth: "auto" },                 // item — flex
      3: { halign: "left",   cellWidth: 35 },                     // brand
      4: { halign: "center", cellWidth: 12 },                     // qty
      5: { halign: "right",  cellWidth: 28 },                     // unit price
      6: { halign: "right",  cellWidth: 30, fontStyle: "bold" },  // total
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const thumb = thumbs[data.row.index];
      if (!thumb) return;
      const aspect = thumb.w / thumb.h;
      let w = thumbBox, h = thumbBox;
      if (aspect > 1) h = thumbBox / aspect; else w = thumbBox * aspect;
      const cx = data.cell.x + data.cell.width / 2;
      const cy = data.cell.y + data.cell.height / 2;
      try {
        doc.addImage(thumb.dataUrl, "JPEG", cx - w / 2, cy - h / 2, w, h, undefined, "FAST");
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
