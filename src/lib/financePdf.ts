// Investor-ready finance PDFs, drawn programmatically with jsPDF (NOT a DOM
// screenshot). Every value is passed in from RPC data, so a document is never
// blank regardless of what is rendered on screen. Mirrors the branding of
// quotePdf.ts (green header band + logo, coral accent).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import bmLogoWhite from "@/assets/logos/BM-LOGO-WHITE.png";

const FOREST = "#2D6A4F";
const DEEP_FOREST = "#1E5C44";
const CORAL = "#E76F51";
const BODY = "#1A1A1A";
const MUTED = "#6B6B6B";
const NEG = "#B00020";
const TINT = "#F1F5F1";

// jsPDF's Helvetica does not embed the ₦ glyph reliably, so we prefix "NGN ".
// Money is INTEGER NAIRA (no /100). Negatives render in parentheses.
const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const money = (v: any): string => {
  const n = num(v);
  if (n === null) return "n/a";
  const s = "NGN " + Math.round(Math.abs(n)).toLocaleString();
  return n < 0 ? `(${s})` : s;
};
const pct = (v: any): string => {
  const n = num(v);
  return n === null ? "n/a" : `${n.toFixed(1)}%`;
};
const roas = (v: any): string => {
  const n = num(v);
  return n === null ? "n/a" : `${n.toFixed(2)}x`;
};
const monthsFmt = (v: any): string => {
  const n = num(v);
  return n === null ? "n/a" : `${n.toFixed(1)} months`;
};
const countFmt = (v: any): string => {
  const n = num(v);
  return n === null ? "n/a" : String(Math.round(n));
};
const isNeg = (v: any): boolean => {
  const n = num(v);
  return n !== null && n < 0;
};

const fmtLongDate = (d: Date) =>
  d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

/** Human period label, e.g. "1-30 June 2026" for a single month. */
export function periodLabelFromRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}-${e.getDate()} ${s.toLocaleDateString("en-NG", { month: "long" })} ${s.getFullYear()}`;
  }
  return `${fmtLongDate(s)} to ${fmtLongDate(e)}`;
}

async function loadLogo(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
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
    console.warn("[financePdf] logo unavailable, using text wordmark", e);
    return null;
  }
}

const MARGIN = 18;

async function drawHeader(doc: jsPDF, title: string, subtitle?: string) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(FOREST);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(DEEP_FOREST);
  doc.rect(0, 32, pageW, 2, "F"); // deep-forest baseline accent

  const logo = await loadLogo(bmLogoWhite);
  if (logo) {
    const h = 13;
    const w = (logo.w / Math.max(logo.h, 1)) * h;
    doc.addImage(logo.dataUrl, "PNG", MARGIN, 6, w, h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("BundledMum", MARGIN, 17);
  }
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Maternity & Baby Essentials", MARGIN, 25);

  // Title block (right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pageW - MARGIN, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (subtitle) doc.text(subtitle, pageW - MARGIN, 21, { align: "right" });
  doc.setFontSize(8);
  doc.text(`Generated ${fmtLongDate(new Date())}`, pageW - MARGIN, 27, { align: "right" });
}

function drawFooter(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text("BundledMum - Confidential", MARGIN, pageH - 10);
    doc.text(`Page ${i} of ${pages}`, pageW - MARGIN, pageH - 10, { align: "right" });
  }
}

// ─────────────────────────── DOC 1: P&L STATEMENT ──────────────────────────
export async function generatePLPdf(periodLabel: string, m: Record<string, any>): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  await drawHeader(doc, "Profit & Loss Statement", periodLabel);

  let y = 48;
  const line = (
    label: string,
    value: string,
    opts: { bold?: boolean; subtotal?: boolean; indent?: boolean; neg?: boolean; note?: string } = {},
  ) => {
    if (opts.subtotal) {
      doc.setDrawColor(210, 210, 210);
      doc.line(MARGIN, y - 5, pageW - MARGIN, y - 5);
      doc.setFillColor(TINT);
      doc.rect(MARGIN - 2, y - 4.5, pageW - 2 * MARGIN + 4, 8, "F");
    }
    doc.setFont("helvetica", opts.bold || opts.subtotal ? "bold" : "normal");
    doc.setFontSize(opts.subtotal ? 11 : 10);
    doc.setTextColor(opts.subtotal ? FOREST : opts.indent ? MUTED : BODY);
    doc.text(label, opts.indent ? MARGIN + 6 : MARGIN, y);
    doc.setTextColor(opts.neg ? NEG : opts.subtotal ? FOREST : BODY);
    doc.text(value, pageW - MARGIN, y, { align: "right" });
    if (opts.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(MUTED);
      doc.text(opts.note, pageW - MARGIN, y + 4, { align: "right" });
      y += 4;
    }
    y += opts.subtotal ? 11 : 8;
  };

  line("Gross Revenue", money(m.gross_revenue));
  line("less: Cost of Goods Sold", money(m.total_cogs), { indent: true });
  line("Gross Profit", money(m.gross_profit), { subtotal: true, neg: isNeg(m.gross_profit), note: `Gross Margin ${pct(m.gross_margin_pct)}` });
  line("less: Total Expenses", money(m.total_expenses), { indent: true });
  line("less: Total Payroll", money(m.total_payroll), { indent: true });
  line("EBITDA", money(m.ebitda), { subtotal: true, neg: isNeg(m.ebitda), note: "Earnings before interest, tax, depreciation & amortisation" });
  line("less: Depreciation", money(m.depreciation), { indent: true });
  line("Net Profit", money(m.net_profit), { subtotal: true, neg: isNeg(m.net_profit), note: `Net Margin ${pct(m.net_margin_pct)}` });

  drawFooter(doc);
  return doc;
}

// ───────────────────── DOC 2: CASH POSITION & RUNWAY ────────────────────────
export async function generateRunwayPdf(r: Record<string, any>): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  await drawHeader(doc, "Cash Position & Runway");

  const committed = num(r.committed_capital);
  const remaining = num(r.capital_remaining);
  const netSpend = num(r.net_spend) ?? (committed !== null && remaining !== null ? committed - remaining : null);

  // Emphasised headline: capital remaining + structural runway.
  doc.setFillColor(TINT);
  doc.rect(MARGIN, 44, pageW - 2 * MARGIN, 26, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("Capital Remaining", MARGIN + 6, 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(FOREST);
  doc.text(money(remaining), MARGIN + 6, 63);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("Runway (structural)", pageW - MARGIN - 6, 52, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(CORAL);
  doc.text(monthsFmt(r.runway_months_structural_only), pageW - MARGIN - 6, 63, { align: "right" });

  autoTable(doc, {
    startY: 78,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: BODY },
    columnStyles: { 1: { halign: "right" } },
    body: [
      ["Committed Capital", money(committed)],
      ["Net Spend to Date", money(netSpend)],
      ["Capital Remaining", money(remaining)],
      ["Recurring Monthly Burn", money(r.recurring_structural_monthly)],
      ["Runway (structural)", monthsFmt(r.runway_months_structural_only)],
      ["Runway (at current marketing pace)", monthsFmt(r.runway_months_at_current_marketing_pace)],
    ],
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 0) d.cell.styles.textColor = MUTED;
      if (d.section === "body" && d.column.index === 1) d.cell.styles.fontStyle = "bold";
    },
  });

  drawFooter(doc);
  return doc;
}

// ───────────────── DOC 3: KPI / UNIT ECONOMICS ONE-PAGER ────────────────────
export async function generateKpiPdf(periodLabel: string, m: Record<string, any>): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await drawHeader(doc, "Key Metrics & Unit Economics", periodLabel);

  autoTable(doc, {
    startY: 46,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 10 },
    styles: { font: "helvetica", fontSize: 10, cellPadding: 3.5, textColor: BODY },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 3: { halign: "right", fontStyle: "bold" } },
    head: [["Metric", "Value", "Metric", "Value"]],
    body: [
      ["Paid Orders", countFmt(m.paid_orders), "CAC", money(m.cac_naira)],
      ["Unique Customers", countFmt(m.unique_customers), "ROAS", roas(m.roas)],
      ["New Customers", countFmt(m.new_customers), "Marketing ROI", pct(m.marketing_roi_pct)],
      ["Repeat Rate", pct(m.repeat_rate_pct), "Acquisition Spend", money(m.acquisition_spend)],
      ["Avg Order Value", money(m.avg_order_value), "", ""],
    ],
    didParseCell: (d) => {
      // Highlight a negative Marketing ROI value (row index 2, value col 3).
      if (d.section === "body" && d.column.index === 3 && d.row.index === 2 && isNeg(m.marketing_roi_pct)) {
        d.cell.styles.textColor = NEG;
      }
    },
  });

  drawFooter(doc);
  return doc;
}
