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

// ───────── DOC 4: AI-NARRATED FINANCIAL STATUS REPORT (investor) ─────────────
// Numbers come only from `figures` (the RPC output); `narrative` is Claude's
// prose (may be null on an AI hiccup, in which case each section still renders
// figures with a note, so the document is never blank).
const monthLabel = (iso: any): string => {
  const s = String(iso || "");
  const d = new Date(`${s.length <= 7 ? s + "-01" : s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-NG", { month: "short", year: "numeric" });
};

export async function generateFinancialStatusReportPdf(
  figures: Record<string, any>,
  narrative: Record<string, any> | null,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - 2 * MARGIN;

  const period = figures?.period || {};
  const label = period.p_start && period.p_end ? periodLabelFromRange(period.p_start, period.p_end) : "";
  await drawHeader(doc, "Financial Status Report", label);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(CORAL);
  doc.text("CONFIDENTIAL", MARGIN, 40);

  let y = 48;
  const bottom = pageH - 16;
  const ensure = (need: number) => {
    if (y + need > bottom) { doc.addPage(); y = 20; }
  };
  const heading = (text: string) => {
    ensure(12);
    doc.setFillColor(TINT);
    doc.rect(MARGIN - 2, y - 4.5, contentW + 4, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(FOREST);
    doc.text(text, MARGIN, y);
    y += 9;
  };
  const para = (text: string | null | undefined, opts: { muted?: boolean } = {}) => {
    const t = String(text || "").trim();
    if (!t) return;
    doc.setFont("helvetica", opts.muted ? "italic" : "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(opts.muted ? MUTED : BODY);
    for (const lineTxt of doc.splitTextToSize(t, contentW) as string[]) {
      ensure(6);
      doc.text(lineTxt, MARGIN, y);
      y += 5;
    }
    y += 2.5;
  };
  const afterTable = () => { y = ((doc as any).lastAutoTable?.finalY ?? y) + 8; };
  const naNote = "AI narrative unavailable; the verified figures below are shown.";

  const trend: any[] = Array.isArray(figures?.monthly_trend) ? figures.monthly_trend : [];
  const m = figures?.period_metrics || {};
  const sc = figures?.projection_scenarios || {};
  const rw = figures?.runway || {};

  heading("Executive Summary");
  para(narrative?.executive_summary || naNote, { muted: !narrative?.executive_summary });

  heading("Monthly Trend");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 8 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: BODY },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    head: [["Month", "Orders", "Revenue", "COGS", "Extra Costs", "Gross Profit", "Gross Margin", "Avg Markup"]],
    body: trend.length
      ? trend.map((r) => [
          monthLabel(r.month), countFmt(r.paid_orders), money(r.revenue), money(r.cogs),
          money(r.extra_costs), money(r.gross_profit), pct(r.gross_margin_pct), pct(r.avg_markup_pct),
        ])
      : [["No trading months in range", "", "", "", "", "", "", ""]],
  });
  afterTable();

  heading("Margin & Cost Analysis");
  para(narrative?.margin_and_cost_analysis || naNote, { muted: !narrative?.margin_and_cost_analysis });

  heading("Profit & Loss (selected period)");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, textColor: BODY },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    body: [
      ["Gross Revenue", money(m.gross_revenue)],
      ["less: Cost of Goods Sold", money(m.total_cogs)],
      [`Gross Profit  (margin ${pct(m.gross_margin_pct)})`, money(m.gross_profit)],
      ["less: Total Expenses", money(m.total_expenses)],
      ["less: Total Payroll", money(m.total_payroll)],
      ["EBITDA", money(m.ebitda)],
      ["less: Depreciation", money(m.depreciation)],
      [`Net Profit  (margin ${pct(m.net_margin_pct)})`, money(m.net_profit)],
    ],
    didParseCell: (d) => {
      const label0 = String((d.row.raw as any[])?.[0] || "");
      if (d.column.index === 0 && label0.startsWith("less:")) d.cell.styles.textColor = MUTED;
      if (/^Gross Profit|^EBITDA|^Net Profit/.test(label0)) d.cell.styles.fontStyle = "bold";
      if (d.column.index === 1 && /^Net Profit/.test(label0) && isNeg(m.net_profit)) d.cell.styles.textColor = NEG;
      if (d.column.index === 1 && /^EBITDA/.test(label0) && isNeg(m.ebitda)) d.cell.styles.textColor = NEG;
    },
  });
  afterTable();

  heading("Burn & Runway");
  para(narrative?.burn_and_runway || naNote, { muted: !narrative?.burn_and_runway });
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, textColor: BODY },
    columnStyles: { 0: { textColor: MUTED }, 1: { halign: "right", fontStyle: "bold" } },
    body: [
      ["Committed Capital", money(rw.committed_capital)],
      ["Capital Remaining", money(rw.capital_remaining)],
      ["Recurring Monthly Burn", money(rw.recurring_structural_monthly)],
      ["Runway (structural)", monthsFmt(rw.runway_months_structural_only)],
      ["Runway (at current marketing pace)", monthsFmt(rw.runway_months_at_current_marketing_pace)],
    ],
  });
  afterTable();

  heading("Outlook & Scenarios");
  para(narrative?.outlook_and_scenarios || naNote, { muted: !narrative?.outlook_and_scenarios });
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.4, textColor: BODY },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    head: [["Scenario (assumption)", "Figure"]],
    body: [
      [`Basis month (${monthLabel(sc.basis_month)}) revenue`, money(sc.basis_revenue)],
      ["Basis month gross profit", money(sc.basis_gross_profit)],
      ["3-month revenue, flat run-rate (no growth)", money(sc.proj_3mo_revenue_flat)],
      ["3-month revenue, at 20% month-on-month growth assumption", money(sc.proj_3mo_revenue_growth20)],
      ["6-month revenue, at 20% month-on-month growth assumption", money(sc.proj_6mo_revenue_growth20)],
      ["3-month gross profit, at 20% growth assumption", money(sc.proj_3mo_gross_profit_growth20)],
    ],
  });
  afterTable();
  para(`Based on ${countFmt(sc.months_of_data)} months of data; indicative, not predictive. Forward figures are scenarios, not forecasts.`, { muted: true });

  drawFooter(doc);
  return doc;
}
