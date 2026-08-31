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
  // Skip empty trailing months (0 orders AND 0 revenue), e.g. a current month
  // with no trading yet, so the table never shows a Jul-2026-all-zeros row.
  const shownTrend = trend.filter((r) => !(Number(r.paid_orders) === 0 && Number(r.revenue) === 0));
  const m = figures?.period_metrics || {};
  const sc = figures?.projection_scenarios || {};
  const rw = figures?.runway || {};
  const mkt: any[] = Array.isArray(figures?.marketing_by_channel) ? figures.marketing_by_channel : [];
  const ue = figures?.unit_economics || {};
  const pipe = figures?.quote_pipeline || {};

  // ── Company-wide views (two arms + shared overhead + combined). Optional:
  // an older cached report has none of these, so every section below is gated
  // on presence and simply omitted when absent (never an empty heading). ──
  const cfm: any[] = Array.isArray(figures?.company_finance_monthly) ? figures.company_finance_monthly : [];
  const cfmLatest: any = cfm.length ? cfm[cfm.length - 1] : null;
  const cfmPrior: any = cfm.length > 1 ? cfm[cfm.length - 2] : null;
  // PERIOD aggregate over the whole report range (true company / per-arm totals).
  // The arm and company-combined summary tables MUST read these, not the latest
  // MONTH row: in a month the storefront booked no paid revenue, the latest month
  // reports only the marketplace take (e.g. NGN 9,800), which is NOT company revenue.
  // Falls back to the latest month for older cached reports that predate this field.
  const cper: any = figures?.company_finance_period || null;
  const crw = figures?.company_runway || null;
  const cpipe: any[] = Array.isArray(figures?.company_pipeline) ? figures.company_pipeline : [];
  const mrev = figures?.marketplace_revenue_split || null;
  const mfunnel = figures?.marketplace_funnel || null;
  const mue = figures?.marketplace_unit_economics || null;
  const attemptsFmt = (v: any): string => { const n = num(v); return n === null ? "n/a" : n.toFixed(1); };
  const humanize = (v: any): string => String(v ?? "").replace(/_/g, " ").trim();

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
    body: shownTrend.length
      ? shownTrend.map((r) => [
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

  // Marketing Spend & ROI (per-channel)
  heading("Marketing Spend & ROI");
  para(narrative?.marketing_channel_analysis || naNote, { muted: !narrative?.marketing_channel_analysis });
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.4, textColor: BODY },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "center" } },
    head: [["Channel", "Spend", "% of Total", "Measurable"]],
    body: mkt.length
      ? mkt.map((c) => [String(c.channel ?? ""), money(c.spend), pct(c.pct_of_total), c.is_measurable ? "Yes" : "No"])
      : [["No marketing spend in range", "", "", ""]],
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 3 && mkt[d.row.index] && !mkt[d.row.index].is_measurable) {
        d.cell.styles.textColor = NEG;
      }
    },
  });
  afterTable();
  {
    const meas = mkt.filter((c) => c.is_measurable);
    const measPct = meas.reduce((s, c) => s + (num(c.pct_of_total) || 0), 0);
    const unmeasPct = mkt.reduce((s, c) => s + (num(c.pct_of_total) || 0), 0) - measPct;
    para(`Measurable channels (Meta, Google): ${measPct.toFixed(1)}% of spend. Unmeasurable channels (hub, influencer, giveaway): ${unmeasPct.toFixed(1)}% of spend, which is not attributable.`, { muted: true });
    para(`Acquisition Spend ${money(m.acquisition_spend)}. ROAS ${roas(m.roas)}. Marketing ROI ${pct(m.marketing_roi_pct)}. CAC ${money(m.cac_naira)}. These reflect measurable spend only.`, { muted: true });
  }

  // Unit Economics
  heading("Unit Economics");
  para(narrative?.unit_economics_analysis || naNote, { muted: !narrative?.unit_economics_analysis });
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, textColor: BODY },
    columnStyles: { 0: { textColor: MUTED }, 1: { halign: "right", fontStyle: "bold" } },
    body: [
      ["Paid Orders", countFmt(ue.paid_orders)],
      ["Avg Order Value", money(ue.avg_order_value)],
      ["Avg Gross Profit per Order", money(ue.avg_gross_profit_per_order)],
      ["Avg Gross Margin", pct(ue.avg_gross_margin_pct)],
      ["Largest Order Value", money(ue.largest_order_value)],
      ["Largest Order as % of Revenue", pct(ue.largest_order_pct_of_revenue)],
    ],
    didParseCell: (d) => {
      if (d.column.index === 1 && /Largest Order as/.test(String((d.row.raw as any[])?.[0] || ""))) d.cell.styles.textColor = NEG;
    },
  });
  afterTable();

  // Quote Pipeline
  heading("Quote Pipeline (Customer Enquiries)");
  para(narrative?.quote_pipeline_analysis || naNote, { muted: !narrative?.quote_pipeline_analysis });
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, textColor: BODY },
    columnStyles: { 0: { textColor: MUTED }, 1: { halign: "right", fontStyle: "bold" } },
    body: [
      ["Total Quotes", countFmt(pipe.total_quotes_ever)],
      ["Paid Conversions", countFmt(pipe.paid_count)],
      ["Paid Value", money(pipe.paid_value)],
      ["Conversion Rate", pct(pipe.conversion_rate_pct)],
      ["Open Pipeline Value", money(pipe.total_open_pipeline_raw)],
      ["Dead / Expired Pipeline Value", money(pipe.dead_pipeline_value)],
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

  // ════════════════════════════════════════════════════════════════════════
  // COMPANY-WIDE SECTIONS (two arms + shared overhead + combined). Appended
  // AFTER all existing content so nothing above moves. Each is gated on its
  // narrative key OR its underlying view, and skipped entirely when neither is
  // present (older cached reports render as if these sections never existed).
  // Arm-level money is CONTRIBUTION, never profit; GMV is labelled volume.
  // ════════════════════════════════════════════════════════════════════════

  // 1. STOREFRONT ──────────────────────────────────────────────────────────
  if (narrative?.storefront_section || cfmLatest) {
    heading("Storefront");
    para(narrative?.storefront_section || naNote, { muted: !narrative?.storefront_section });
    if (cfmLatest) {
      const twoCol = !!cfmPrior;
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        theme: "grid",
        headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, textColor: BODY },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
        head: [twoCol
          ? ["Storefront (NGN)", monthLabel(cfmLatest.month), monthLabel(cfmPrior.month)]
          : ["Storefront (NGN)", monthLabel(cfmLatest.month)]],
        body: [
          ["Revenue", money(cfmLatest.store_revenue), ...(twoCol ? [money(cfmPrior.store_revenue)] : [])],
          ["Gross profit", money(cfmLatest.store_gross_profit), ...(twoCol ? [money(cfmPrior.store_gross_profit)] : [])],
          ["Direct costs", money(cfmLatest.store_direct_costs), ...(twoCol ? [money(cfmPrior.store_direct_costs)] : [])],
          ["Contribution", money(cfmLatest.store_contribution), ...(twoCol ? [money(cfmPrior.store_contribution)] : [])],
        ],
        didParseCell: (d) => {
          if (/^Contribution/.test(String((d.row.raw as any[])?.[0] || ""))) d.cell.styles.fontStyle = "bold";
        },
      });
      afterTable();
    }
  }

  // 2. MARKETPLACE ─────────────────────────────────────────────────────────
  if (narrative?.marketplace_section || mrev || mfunnel || mue || cfmLatest) {
    heading("Marketplace");
    para(narrative?.marketplace_section || naNote, { muted: !narrative?.marketplace_section });
    const L = cper || cfmLatest || {};
    // (a) Revenue kept vs GMV volume.
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, textColor: BODY },
      columnStyles: { 0: { textColor: MUTED }, 1: { halign: "right", fontStyle: "bold" } },
      body: [
        ["GMV (volume, not revenue)", money(mrev?.gmv ?? L.marketplace_gmv_volume)],
        ["less: Seller share (pass-through liability)", money(L.marketplace_seller_share)],
        ["Markup revenue", money(mrev?.markup_revenue)],
        ["Service fee revenue", money(mrev?.service_fee_revenue)],
        ["Revenue kept (take)", money(mrev?.total_platform_revenue ?? L.marketplace_net_revenue)],
        ["Blended take rate", pct(mrev?.blended_take_pct ?? L.marketplace_take_rate_pct)],
        ["Contribution per order", money(mue?.contribution_per_order)],
      ],
      didParseCell: (d) => {
        const l0 = String((d.row.raw as any[])?.[0] || "");
        if (d.column.index === 0 && l0.startsWith("less:")) d.cell.styles.textColor = MUTED;
        if (/^Contribution per order/.test(l0)) d.cell.styles.fontStyle = "bold";
      },
    });
    afterTable();
    // (b) Funnel.
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
      headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, textColor: BODY },
      columnStyles: { 1: { halign: "right" } },
      head: [["Marketplace funnel", "Value"]],
      body: [
        ["Sellers registered", countFmt(mfunnel?.sellers_registered)],
        ["Sellers who listed", countFmt(mfunnel?.sellers_who_listed)],
        ["% of listers who sold", pct(mfunnel?.pct_listers_who_sold)],
        ["Listings live", countFmt(mfunnel?.listings_live)],
        ["Listings sold", countFmt(mfunnel?.listings_sold)],
        ["Checkouts started", countFmt(mfunnel?.checkouts_started)],
        ["Orders paid", countFmt(mfunnel?.orders_paid)],
        ["Orders paid out", countFmt(mfunnel?.orders_paid_out)],
        ["Sell-through rate", pct(mfunnel?.listing_sell_through_pct)],
        ["Checkout to paid", pct(mfunnel?.pct_checkout_to_paid)],
        ["Avg payment attempts per paid order", attemptsFmt(mfunnel?.avg_attempts_per_paid_order)],
      ],
    });
    afterTable();
    para(`Marketplace direct spend ${money(L.marketplace_direct_costs)} against revenue kept ${money(L.marketplace_net_revenue)}, leaving a contribution of ${money(L.marketplace_contribution)}. This is contribution, not profit: the arm also consumes shared staff and tools charged at company level.`, { muted: true });
  }

  // 3. COMPANY COMBINED ────────────────────────────────────────────────────
  if (narrative?.company_combined_section || crw || cpipe.length || cfmLatest) {
    heading("Company Combined");
    para(narrative?.company_combined_section || naNote, { muted: !narrative?.company_combined_section });
    const L = cper || cfmLatest || {};
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, textColor: BODY },
      columnStyles: { 0: { textColor: MUTED }, 1: { halign: "right", fontStyle: "bold" } },
      body: [
        ["Company revenue (storefront retail + marketplace take)", money(L.company_revenue)],
        ["less: Shared overhead", money(L.shared_overhead)],
        ["less: Shared payroll", money(L.shared_payroll)],
        ["Company net profit", money(L.company_net_profit)],
        ["Runway (structural, company-wide)", monthsFmt(crw?.company_runway_months_structural)],
      ],
      didParseCell: (d) => {
        const l0 = String((d.row.raw as any[])?.[0] || "");
        if (d.column.index === 0 && l0.startsWith("less:")) d.cell.styles.textColor = MUTED;
        if (/^Company net profit/.test(l0)) d.cell.styles.fontStyle = "bold";
        if (d.column.index === 1 && /^Company net profit/.test(l0) && isNeg(L.company_net_profit)) d.cell.styles.textColor = NEG;
      },
    });
    afterTable();
    if (cpipe.length) {
      const kindOrder: Record<string, number> = { incoming: 0, supply: 1, liability: 2 };
      const pipeRows = [...cpipe].sort((a, b) => (kindOrder[String(a.kind)] ?? 9) - (kindOrder[String(b.kind)] ?? 9));
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        theme: "grid",
        headStyles: { fillColor: FOREST, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, textColor: BODY },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
        head: [["Kind", "Arm", "Source", "Items", "Value"]],
        body: pipeRows.map((r) => [
          humanize(r.kind), humanize(r.arm), humanize(r.source), countFmt(r.items), money(r.value_naira),
        ]),
      });
      afterTable();
      para("Pipeline is not earned revenue. Liabilities (escrow held, pending seller payouts, referral commissions owed) are money held on behalf of sellers, not company funds.", { muted: true });
    }
  }

  drawFooter(doc);
  return doc;
}
