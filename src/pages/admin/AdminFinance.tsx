import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { NavLink, Routes, Route, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, FileText, Wallet, ShoppingCart, Users, Scale, Briefcase, Settings as SettingsIcon,
  Plus, Trash2, Save, Printer, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Calendar,
  Download, ChevronDown, ChevronRight, Info, FileCheck, Bell,
} from "lucide-react";
import bmLogoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  useFinancePL, useFinanceExpenses, useFinanceCogs, useFinancePayroll,
  useFinanceTaxPosition, useFinanceCategories, useFinanceTaxSettings, useFinanceAssets,
  useFinanceProducts, useAddExpense, useUpdateExpense, useDeleteExpense,
  useAddCogs, useDeleteCogs, useAddPayroll, useDeletePayroll,
  useUpdateTaxSettings, useAddAsset, useDeleteAsset,
  computeAnnualPaye, toKobo, fromKobo, fmtNaira, fmtPct, fmtDate, bookValue,
  type Expense, type CogsEntry, type PayrollEntry, type TaxSettings, type FinanceAsset, type PayeBand, type PLRow,
  NTA_2025_PAYE_BANDS,
} from "@/hooks/useFinance";

// ---------- Shared styles ----------
const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";
const sectionCls = "text-xs uppercase tracking-widest font-bold text-text-med mt-4 mb-2";
const btnPrimary = "inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-40";
const btnGhost = "inline-flex items-center gap-1.5 text-text-med hover:text-forest text-xs font-semibold";
const cardCls = "bg-card border border-border rounded-xl p-4";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TYPE_COLORS: Record<string, string> = {
  fixed: "#3B82F6",
  variable: "#F59E0B",
  cogs: "#10B981",
  payroll: "#8B5CF6",
  tax: "#EF4444",
  depreciation: "#6B7280",
};

const TYPE_BG: Record<string, string> = {
  fixed: "bg-blue-50",
  variable: "bg-amber-50",
  cogs: "bg-emerald-50",
  payroll: "bg-purple-50",
  tax: "bg-red-50",
  depreciation: "bg-gray-50",
};

// ---------- Top-level component ----------

const SUBNAV = [
  { to: "/admin/finance", label: "Dashboard", icon: BarChart3, exact: true },
  { to: "/admin/finance/pl", label: "P&L", icon: FileText },
  { to: "/admin/finance/expenses", label: "Expenses", icon: Wallet },
  { to: "/admin/finance/cogs", label: "COGS", icon: ShoppingCart },
  { to: "/admin/finance/payroll", label: "Payroll", icon: Users },
  { to: "/admin/finance/tax", label: "Tax Position", icon: Scale },
  { to: "/admin/finance/assets", label: "Assets", icon: Briefcase },
  { to: "/admin/finance/compliance", label: "Compliance", icon: FileCheck },
  { to: "/admin/finance/settings", label: "Settings", icon: SettingsIcon },
];

export default function AdminFinance() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-forest">Finance & Accounting</h1>
          <p className="text-xs text-text-light mt-1">
            All amounts stored as kobo. Displayed as ₦ (Naira). Negative values shown in (brackets).
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {SUBNAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-forest text-forest"
                  : "border-transparent text-text-med hover:text-forest"
              }`
            }
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<DashboardTab />} />
        <Route path="pl" element={<PLTab />} />
        <Route path="expenses" element={<ExpensesTab />} />
        <Route path="cogs" element={<CogsTab />} />
        <Route path="payroll" element={<PayrollTab />} />
        <Route path="tax" element={<TaxTab />} />
        <Route path="assets" element={<AssetsTab />} />
        <Route path="compliance" element={<ComplianceTab />} />
        <Route path="settings" element={<SettingsTab />} />
      </Routes>
    </div>
  );
}

// ---------- Period selector helper ----------
type PeriodMode = "this_month" | "last_month" | "ytd" | "custom";

function usePeriod(defaultMode: PeriodMode = "this_month") {
  const now = new Date();
  const [mode, setMode] = useState<PeriodMode>(defaultMode);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const resolved = useMemo(() => {
    const n = new Date();
    if (mode === "this_month") return { year: n.getFullYear(), month: n.getMonth() + 1 };
    if (mode === "last_month") {
      const y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
      const m = n.getMonth() === 0 ? 12 : n.getMonth();
      return { year: y, month: m };
    }
    if (mode === "ytd") return { year: n.getFullYear(), month: undefined as number | undefined };
    return { year, month };
  }, [mode, year, month]);

  return { mode, setMode, year, setYear, month, setMonth, resolved };
}

function PeriodSelector({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["this_month","last_month","ytd","custom"] as const).map(m => (
        <button
          key={m}
          onClick={() => p.setMode(m)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            p.mode === m
              ? "bg-forest text-primary-foreground border-forest"
              : "border-border text-text-med hover:bg-muted"
          }`}
        >
          {m === "this_month" ? "This Month" : m === "last_month" ? "Last Month" : m === "ytd" ? "YTD" : "Custom"}
        </button>
      ))}
      {p.mode === "custom" && (
        <>
          <select value={p.month} onChange={e => p.setMonth(Number(e.target.value))}
            className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background">
            {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
          </select>
          <input type="number" value={p.year} onChange={e => p.setYear(Number(e.target.value))}
            className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs bg-background" />
        </>
      )}
    </div>
  );
}

// ---------- Helpers ----------
function sumKobo<T>(rows: T[] | undefined, key: keyof T): number {
  return (rows || []).reduce((s, r) => s + (Number((r as any)[key]) || 0), 0);
}
function klast<T>(rows: T[] | undefined): T | undefined {
  if (!rows || !rows.length) return undefined;
  return rows[rows.length - 1];
}
function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
function ngnToKoboNum(ngnLike: number): number {
  return Math.round((ngnLike || 0) * 100);
}

// PL view returns numeric NGN values (not kobo). Convert to kobo for uniformity.
function plRowKobo(row: PLRow | undefined, key: keyof PLRow): number {
  if (!row) return 0;
  return ngnToKoboNum(Number(row[key]) || 0);
}

// ================================================================
// PAGE 1 — DASHBOARD
// ================================================================
// Acquisition KPI formatters. NOTE: the finance_kpi_* views are already in
// NAIRA, so these do NOT use fmtNaira (which expects kobo and divides by 100).
const acqNgn = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : "₦" + Number(n).toLocaleString("en-NG"));
const acqPct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${Number(n).toFixed(1)}%`);
const acqRoas = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${Number(n).toFixed(2)}x`);
const acqMonth = (y: number, m: number) => new Date(y, (m || 1) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
const acqPayback = (n: number | null | undefined) => (n === null || n === undefined ? "Not yet recoverable" : `${Number(n).toFixed(1)}x orders to break even`);

function DashboardTab() {
  const p = usePeriod("this_month");
  const { data: plRows } = useFinancePL(p.resolved.year, p.resolved.month);
  const { data: plAll } = useFinancePL(p.resolved.year);
  const { data: expenses } = useFinanceExpenses(p.resolved.year, p.resolved.month);
  const { data: taxPosition } = useFinanceTaxPosition(p.resolved.year);

  // Acquisition Health — lifetime + monthly, straight from the views.
  // No frontend computation; values are already in NAIRA.
  const { data: acq } = useQuery({
    queryKey: ["finance-kpi-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("finance_kpi_summary").select("*").single();
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });
  const { data: acqMonthly } = useQuery({
    queryKey: ["finance-kpi-monthly"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_kpi_monthly")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });

  const cur = plRows?.[0];
  // Previous period for delta
  const prevMonth = p.resolved.month ? (p.resolved.month === 1 ? 12 : p.resolved.month - 1) : undefined;
  const prevYear = p.resolved.month === 1 ? (p.resolved.year - 1) : p.resolved.year;
  const { data: prevRows } = useFinancePL(prevYear, prevMonth);
  const prev = prevRows?.[0];

  const revCur = plRowKobo(cur, "gross_revenue_ngn");
  const revPrev = plRowKobo(prev, "gross_revenue_ngn");
  const gpCur = plRowKobo(cur, "gross_profit_ngn");
  const ebitdaCur = plRowKobo(cur, "ebitda_ngn");
  const netCur = plRowKobo(cur, "net_profit_ngn");
  const cogsCur = plRowKobo(cur, "cogs_ngn");
  const opexCur = plRowKobo(cur, "total_opex_ngn");
  const payrollCur = plRowKobo(cur, "payroll_cost_ngn");

  // Expense breakdown
  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    (expenses || []).forEach(e => {
      const t = e.category?.type || "other";
      m[t] = (m[t] || 0) + (e.amount || 0);
    });
    return Object.entries(m).map(([type, value]) => ({ type, value }));
  }, [expenses]);

  // Trend chart data (monthly across current year)
  const trend = useMemo(() => {
    return (plAll || []).map(r => ({
      label: `${MONTHS[(r.month || 1) - 1]}`,
      revenue: Number(r.gross_revenue_ngn) || 0,
      cogs: Number(r.cogs_ngn) || 0,
      gp: Number(r.gross_profit_ngn) || 0,
      margin: Number(r.gross_margin_pct) || 0,
    }));
  }, [plAll]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PeriodSelector p={p} />
        <span className="text-[10px] text-text-light">Live — refreshes every 30s</span>
      </div>

      <SourceLegend />

      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Gross Revenue" source="auto" value={fmtNaira(revCur)} delta={pctChange(revCur, revPrev)} />
        <KpiCard title="Gross Profit" source="mixed" value={fmtNaira(gpCur)} badge={fmtPct(Number(cur?.gross_margin_pct))} />
        <KpiCard title="EBITDA" source="mixed" value={fmtNaira(ebitdaCur)} badge={fmtPct(Number(cur?.ebitda_margin_pct))} />
        <KpiCard title="Net Profit" source="mixed" value={fmtNaira(netCur, { brackets: true })} badge={fmtPct(Number(cur?.net_margin_pct))} negative={netCur < 0} />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Total Orders" source="auto" value={String(cur?.order_count ?? 0)} subtitle={`AOV: ${fmtNaira(ngnToKoboNum(Number(cur?.avg_order_value_ngn) || 0))}`} />
        <KpiCard title="Total COGS" source="mixed" value={fmtNaira(cogsCur)} subtitle={revCur > 0 ? `${((cogsCur / revCur) * 100).toFixed(1)}% of revenue` : "—"} />
        <KpiCard title="Total OpEx" source="manual" value={fmtNaira(opexCur + payrollCur)} subtitle={`Payroll: ${fmtNaira(payrollCur)}`} />
      </div>

      <CourierCostsSection year={p.resolved.year} />

      {/* ── Acquisition Health (lifetime, from finance_kpi_summary) ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold">Acquisition Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="CAC" source="auto" value={acqNgn(acq?.cac_naira)} />
          <KpiCard title="Repeat Rate" source="auto" value={acqPct(acq?.repeat_rate_pct)} />
          <KpiCard title="ROAS" source="auto" value={acqRoas(acq?.roas)} />
          <KpiCard title="Cost per Purchase" source="auto" value={acqNgn(acq?.cost_per_purchase)} />
          <KpiCard title="Marketing ROI" source="auto" value={acqPct(acq?.marketing_roi_pct)} negative={Number(acq?.marketing_roi_pct) < 0} />
          <KpiCard title="Acquisition Spend" source="auto" value={acqNgn(acq?.acquisition_spend)} subtitle="Marketing + Acquisition + Content" />
          <KpiCard title="Gross Margin" source="auto" value={acqPct(acq?.gross_margin_pct)} />
          <KpiCard title="Avg Order Value" source="auto" value={acqNgn(acq?.avg_order_value)} />
          <KpiCard title="Gross Profit / Customer" source="auto" value={acqNgn(acq?.gross_profit_per_customer)} />
          <KpiCard title="Payback" source="auto" value={acqPayback(acq?.payback_customer_multiples)} />
        </div>

        {/* Monthly acquisition KPIs (most recent first) */}
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs min-w-[820px]">
            <thead>
              <tr className="border-b border-border text-left text-text-light uppercase tracking-wide">
                <th className="px-3 py-2 font-semibold">Month</th>
                <th className="px-3 py-2 font-semibold text-right">Revenue</th>
                <th className="px-3 py-2 font-semibold text-right">Gross Profit</th>
                <th className="px-3 py-2 font-semibold text-right">Gross Margin %</th>
                <th className="px-3 py-2 font-semibold text-right">Acq. Spend</th>
                <th className="px-3 py-2 font-semibold text-right">CAC</th>
                <th className="px-3 py-2 font-semibold text-right">ROAS</th>
                <th className="px-3 py-2 font-semibold text-right">Marketing ROI %</th>
                <th className="px-3 py-2 font-semibold text-right">Break-even Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(acqMonthly || []).map((r) => (
                <tr key={`${r.year}-${r.month}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{acqMonth(r.year, r.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{acqNgn(r.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{acqNgn(r.gross_profit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{acqPct(r.gross_margin_pct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{acqNgn(r.acquisition_spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{acqNgn(r.cac_naira)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{acqRoas(r.roas)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Number(r.marketing_roi_pct) < 0 ? "text-red-600" : ""}`}>{acqPct(r.marketing_roi_pct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.breakeven_revenue_needed == null ? "n/a" : acqNgn(r.breakeven_revenue_needed)}</td>
                </tr>
              ))}
              {(acqMonthly || []).length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-text-light">No monthly data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Revenue vs COGS vs Gross Profit</h3>
          {trend.length === 0 ? (
            <div className="text-xs text-text-light py-10 text-center">No monthly data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" stroke="#2D6A4F" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cogs" stroke="#F59E0B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="gp" stroke="#3B82F6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Expense Breakdown</h3>
          {byType.length === 0 ? (
            <div className="text-xs text-text-light py-10 text-center">No expenses logged</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="type" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={(d: any) => d.type}>
                  {byType.map((b, i) => <Cell key={i} fill={TYPE_COLORS[b.type] || "#6B7280"} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtNaira(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Gross Margin % by Month</h3>
          {trend.length === 0 ? (
            <div className="text-xs text-text-light py-10 text-center">No monthly data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                <Bar dataKey="margin" fill="#2D6A4F" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Revenue by Channel</h3>
          <div className="py-10 text-center">
            <div className="text-2xl font-bold text-forest">{fmtNaira(revCur)}</div>
            <div className="text-xs text-text-light mt-1">Direct Sales (100%)</div>
            <div className="text-[10px] text-text-light mt-2">Multi-channel breakdown coming soon</div>
          </div>
        </div>
      </div>

      {/* Tax alert */}
      <TaxAlertBox position={taxPosition} />
    </div>
  );
}

type SourceKind = "auto" | "manual" | "mixed";

function SourceDot({ source, className = "" }: { source?: SourceKind; className?: string }) {
  if (!source) return null;
  const map: Record<SourceKind, { color: string; label: string }> = {
    auto:   { color: "#10B981", label: "Auto-pulled from orders" },
    manual: { color: "#F59E0B", label: "Needs manual entry" },
    mixed:  { color: "#3B82F6", label: "Mixed auto + manual" },
  };
  const { color, label } = map[source];
  return (
    <span
      title={label}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}

function SourceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-med bg-muted/30 border border-border rounded-lg px-3 py-1.5">
      <span className="flex items-center gap-1"><SourceDot source="auto" /> Auto-pulled from orders</span>
      <span className="flex items-center gap-1"><SourceDot source="manual" /> Needs manual entry</span>
      <span className="flex items-center gap-1"><SourceDot source="mixed" /> Mixed</span>
    </div>
  );
}

function KpiCard({ title, value, delta, badge, subtitle, negative, source }: {
  title: string; value: string; delta?: number | null; badge?: string; subtitle?: string; negative?: boolean; source?: SourceKind;
}) {
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-1.5">
        <SourceDot source={source} />
        <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">{title}</div>
      </div>
      <div className={`text-xl font-bold mt-1 ${negative ? "text-red-600" : "text-forest"}`}>{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs last period
          </span>
        )}
        {badge && (
          <span className="inline-flex items-center text-[10px] font-semibold text-forest bg-forest/10 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
        {subtitle && <span className="text-[10px] text-text-light">{subtitle}</span>}
      </div>
    </div>
  );
}

/**
 * Courier costs section — summarises partner_cost / actual_delivery_cost
 * from the orders table, grouped by month + courier.
 */
function CourierCostsSection({ year }: { year?: number }) {
  const { data: orders } = useQuery({
    queryKey: ["finance-courier-costs", year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("created_at,total,actual_courier_partner,delivery_partner,actual_delivery_cost,partner_cost,courier_cost_confirmed")
        .gte("created_at", start)
        .lt("created_at", end);
      if (error) throw error;
      return (data || []) as Array<any>;
    },
    staleTime: 60_000,
  });

  const { summary, totalRevenue, unconfirmed } = useMemo(() => {
    const rows = orders || [];
    const map: Record<number, Record<string, { orders: number; cost: number }>> = {};
    let tr = 0;
    let un = 0;
    rows.forEach(o => {
      const m = new Date(o.created_at).getMonth();
      const partner = o.actual_courier_partner || o.delivery_partner || "Unassigned";
      const cost = Number(o.actual_delivery_cost ?? o.partner_cost ?? 0);
      tr += Number(o.total || 0);
      if (!o.courier_cost_confirmed) un += 1;
      if (!map[m]) map[m] = {};
      if (!map[m][partner]) map[m][partner] = { orders: 0, cost: 0 };
      map[m][partner].orders += 1;
      map[m][partner].cost += cost;
    });
    return { summary: map, totalRevenue: tr, unconfirmed: un };
  }, [orders]);

  const months = Array.from({ length: 12 }, (_, i) => i);
  const totals = months.reduce((acc, m) => {
    const row = summary[m] || {};
    const monthTotal = Object.values(row).reduce((s, v) => s + v.cost, 0);
    const monthOrders = Object.values(row).reduce((s, v) => s + v.orders, 0);
    return { cost: acc.cost + monthTotal, orders: acc.orders + monthOrders };
  }, { cost: 0, orders: 0 });
  const pctOfRevenue = totalRevenue > 0 ? (totals.cost / totalRevenue) * 100 : 0;

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          <SourceDot source="auto" /> Courier Costs ({year})
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-text-med">
          <span>Delivery as % of revenue: <b className="text-forest">{pctOfRevenue.toFixed(2)}%</b></span>
          {unconfirmed > 0 && (
            <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
              ⚠ {unconfirmed} order{unconfirmed === 1 ? "" : "s"} still unverified — actual costs may differ
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2 text-right">Brain Express Orders</th>
              <th className="px-3 py-2 text-right">BE Cost</th>
              <th className="px-3 py-2 text-right">eFTD Orders</th>
              <th className="px-3 py-2 text-right">eFTD Cost</th>
              <th className="px-3 py-2 text-right">Total Courier Cost</th>
              <th className="px-3 py-2 text-right">Avg / Order</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const row = summary[m] || {};
              const be = row["Brain Express"] || { orders: 0, cost: 0 };
              const eftd = row["eFTD Africa"] || { orders: 0, cost: 0 };
              const other = Object.entries(row)
                .filter(([k]) => k !== "Brain Express" && k !== "eFTD Africa")
                .reduce((s, [, v]) => ({ orders: s.orders + v.orders, cost: s.cost + v.cost }), { orders: 0, cost: 0 });
              const total = be.cost + eftd.cost + other.cost;
              const totalOrders = be.orders + eftd.orders + other.orders;
              if (totalOrders === 0) return null;
              return (
                <tr key={m} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{MONTHS[m]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{be.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(be.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eftd.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(eftd.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNaira(total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-light">
                    {totalOrders ? fmtNaira(Math.round(total / totalOrders)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t-2 border-border">
              <td colSpan={5} className="px-3 py-2">YTD</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(totals.cost)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.orders ? fmtNaira(Math.round(totals.cost / totals.orders)) : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TaxAlertBox({ position }: { position?: Record<string, any> }) {
  if (!position) return null;
  const small = position.company_size === "small" || position.is_small_company;
  const vatReg = !!position.vat_registered;
  const revenueYtd = Number(position.revenue_ytd || position.annual_revenue_ytd || 0);
  const vatThreshold = 25_000_000; // ₦25M
  const approachingVat = !vatReg && revenueYtd >= vatThreshold * 0.8;

  return (
    <div className="space-y-2">
      <div className={`border rounded-xl p-4 flex items-start gap-3 ${small ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        {small ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
        <div className="flex-1">
          <div className="font-semibold text-sm">
            {small ? "CIT Exempt — Small Company" : "Large Company — CIT 25% applies"}
          </div>
          <div className="text-xs text-text-med mt-0.5">
            Annual turnover: ₦{Number(revenueYtd).toLocaleString()} (threshold ₦100M)
          </div>
        </div>
      </div>

      <div className={`border rounded-xl p-4 flex items-start gap-3 ${approachingVat ? "bg-amber-50 border-amber-200" : vatReg ? "bg-blue-50 border-blue-200" : "bg-muted border-border"}`}>
        {approachingVat ? <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5" />}
        <div className="flex-1">
          <div className="font-semibold text-sm">
            VAT status: {vatReg ? "Registered" : "Not registered"}
          </div>
          {approachingVat && (
            <div className="text-xs text-amber-700 mt-0.5">
              ⚠️ Approaching ₦25M VAT threshold — register with FIRS before you cross it.
            </div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-xl p-4">
        <div className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Upcoming Remittance Deadlines</div>
        <ul className="text-xs text-text-med space-y-1">
          <li>• <b>PAYE</b> — by 10th of following month (State IRS)</li>
          <li>• <b>Pension</b> — within 7 days of payroll run (PenCom via PFA)</li>
          <li>• <b>NSITF</b> — by 16th of following month</li>
          <li>• <b>VAT</b> — by 21st of following month (if registered)</li>
        </ul>
      </div>
    </div>
  );
}

// ================================================================
// PAGE 2 — P&L STATEMENT
// ================================================================
function PLTab() {
  const [gran, setGran] = useState<"month" | "quarter" | "year">("month");
  const [compare, setCompare] = useState(false);
  const p = usePeriod("this_month");
  const { data: plRows } = useFinancePL(p.resolved.year, p.resolved.month);
  const { data: expensesPeriod } = useFinanceExpenses(p.resolved.year, p.resolved.month);
  const { data: catList } = useFinanceCategories();

  // Previous
  const prevMonth = p.resolved.month ? (p.resolved.month === 1 ? 12 : p.resolved.month - 1) : undefined;
  const prevYear = p.resolved.month === 1 ? (p.resolved.year - 1) : p.resolved.year;
  const { data: prevRows } = useFinancePL(prevYear, prevMonth);

  const cur = plRows?.[0];
  const prev = prevRows?.[0];

  // Group expenses by category name for OpEx detail
  const opexByCat = useMemo(() => {
    const m: Record<string, { name: string; amount: number; type: string }> = {};
    (expensesPeriod || []).forEach(e => {
      const name = e.category?.name || "Uncategorised";
      const t = e.category?.type || "variable";
      if (t === "cogs" || t === "tax" || t === "payroll" || t === "depreciation") return;
      if (!m[name]) m[name] = { name, amount: 0, type: t };
      m[name].amount += e.amount || 0;
    });
    return Object.values(m).sort((a, b) => b.amount - a.amount);
  }, [expensesPeriod]);

  const print = () => window.print();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <PeriodSelector p={p} />
          <div className="flex gap-1 ml-2">
            {(["month","quarter","year"] as const).map(g => (
              <button key={g} onClick={() => setGran(g)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${gran===g ? "bg-forest text-primary-foreground border-forest" : "border-border text-text-med"}`}>
                {g[0].toUpperCase()+g.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />
            Compare previous
          </label>
          <button onClick={print} className={btnPrimary}>
            <Printer className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      <div className={cardCls + " print:shadow-none"}>
        <div className="text-center border-b border-border pb-3 mb-3">
          <div className="text-[10px] uppercase tracking-[3px] text-text-light">Income Statement</div>
          <div className="text-lg font-bold text-forest">Bundledmum</div>
          <div className="text-xs text-text-med">Period: {MONTHS[(cur?.month ?? p.resolved.month ?? 1) - 1]} {cur?.year ?? p.resolved.year}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <colgroup>
              <col />
              <col style={{ width: 160 }} />
              {compare && <col style={{ width: 140 }} />}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border">
                <th className="text-left py-2 text-[10px] uppercase tracking-widest text-text-light font-semibold">Account</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-widest text-text-light font-semibold">Current</th>
                {compare && <th className="text-right py-2 text-[10px] uppercase tracking-widest text-text-light font-semibold">Previous</th>}
              </tr>
            </thead>
            <tbody>
              <PLSection title="Revenue" compare={compare} />
              <PLLine label="Product Sales" source="auto" v={plRowKobo(cur, "product_revenue_ngn")} p={plRowKobo(prev, "product_revenue_ngn")} compare={compare} />
              <PLLine label="Delivery Revenue" source="auto" v={plRowKobo(cur, "delivery_revenue_ngn")} p={plRowKobo(prev, "delivery_revenue_ngn")} compare={compare} />
              <PLLine label="Service & Packaging Fees" source="auto" v={plRowKobo(cur, "service_fee_revenue_ngn")} p={plRowKobo(prev, "service_fee_revenue_ngn")} compare={compare} />
              <PLTotal label="Total Revenue" v={plRowKobo(cur, "gross_revenue_ngn")} p={plRowKobo(prev, "gross_revenue_ngn")} compare={compare} variant="subtotal" />

              <PLSection title="Cost of Goods Sold" compare={compare} />
              <PLLine label="Product Procurement, Packaging & Inbound" source="mixed" v={plRowKobo(cur, "cogs_ngn")} p={plRowKobo(prev, "cogs_ngn")} compare={compare} />
              <PLTotal label="Total COGS" v={plRowKobo(cur, "cogs_ngn")} p={plRowKobo(prev, "cogs_ngn")} compare={compare} variant="subtotal" />
              <PLTotal label="Gross Profit" v={plRowKobo(cur, "gross_profit_ngn")} p={plRowKobo(prev, "gross_profit_ngn")} compare={compare} badge={fmtPct(Number(cur?.gross_margin_pct))} variant="result" />

              <PLSection title="Operating Expenses" compare={compare} />
              <PLLine label="Salaries & Wages" source="manual" v={plRowKobo(cur, "payroll_cost_ngn")} p={plRowKobo(prev, "payroll_cost_ngn")} compare={compare} />
              {opexByCat.map(c => (
                <PLLine key={c.name} label={c.name} source="manual" v={c.amount} p={0} compare={compare} />
              ))}
              <PLTotal label="Total OPEX" v={plRowKobo(cur, "total_opex_ngn") + plRowKobo(cur, "payroll_cost_ngn")} p={plRowKobo(prev, "total_opex_ngn") + plRowKobo(prev, "payroll_cost_ngn")} compare={compare} variant="subtotal" />
              <PLTotal label="EBITDA" v={plRowKobo(cur, "ebitda_ngn")} p={plRowKobo(prev, "ebitda_ngn")} compare={compare} badge={fmtPct(Number(cur?.ebitda_margin_pct))} variant="result" />

              <PLSection title="Depreciation & Tax" compare={compare} />
              <PLLine label="Depreciation & Amortisation" source="manual" v={plRowKobo(cur, "depreciation_ngn")} p={plRowKobo(prev, "depreciation_ngn")} compare={compare} />
              <PLTotal label="EBIT (Operating Profit)" v={plRowKobo(cur, "ebit_ngn")} p={plRowKobo(prev, "ebit_ngn")} compare={compare} variant="subtotal" />
              <PLLine label="Tax Expenses" source="manual" v={plRowKobo(cur, "tax_expenses_ngn")} p={plRowKobo(prev, "tax_expenses_ngn")} compare={compare} />
              <PLTotal label="Net Profit / (Loss)" v={plRowKobo(cur, "net_profit_ngn")} p={plRowKobo(prev, "net_profit_ngn")} compare={compare} badge={fmtPct(Number(cur?.net_margin_pct))} variant="highlight" />
            </tbody>
          </table>
        </div>

        {!cur && (
          <div className="text-center text-xs text-text-light py-6">
            No data for this period. Enter expenses, COGS, and payroll to populate the statement.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Section band — a single full-width row that introduces a P&L group
 * (Revenue, COGS, OPEX, etc.). Adds vertical breathing room and a
 * forest-tinted background so the eye can chunk the statement.
 */
function PLSection({ title, compare }: { title: string; compare: boolean }) {
  const span = compare ? 3 : 2;
  return (
    <tr>
      <td colSpan={span} className="pt-5 pb-1.5">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-forest bg-forest/5 px-3 py-1.5 rounded-md">{title}</div>
      </td>
    </tr>
  );
}

/** Plain account line — indented label + tabular numbers right-aligned. */
function PLLine({ label, v, p, compare, source }: { label: string; v: number; p: number; compare: boolean; source?: SourceKind }) {
  const num = (x: number) => fmtNaira(x, { brackets: true });
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20">
      <td className="py-1.5 pl-6 pr-3">
        <span className="inline-flex items-center gap-2 text-text-med">
          <SourceDot source={source} />
          {label}
        </span>
      </td>
      <td className={`py-1.5 pr-3 text-right tabular-nums ${v < 0 ? "text-red-600" : "text-foreground"}`}>{num(v)}</td>
      {compare && <td className={`py-1.5 pr-3 text-right tabular-nums ${p < 0 ? "text-red-600" : "text-text-light"}`}>{num(p)}</td>}
    </tr>
  );
}

/**
 * Total / subtotal / result / highlight rows.
 *  - subtotal: thin top border, slightly bolder, neutral background
 *  - result: thicker forest top border, forest text, soft forest tint
 *  - highlight: full forest band reserved for NET PROFIT
 */
function PLTotal({ label, v, p, compare, badge, variant }: {
  label: string; v: number; p: number; compare: boolean; badge?: string;
  variant?: "subtotal" | "result" | "highlight";
}) {
  const num = (x: number) => fmtNaira(x, { brackets: true });
  const isHighlight = variant === "highlight";
  const isResult = variant === "result";

  let rowCls = "border-t border-border/80 bg-muted/30";
  let labelCls = "text-foreground";
  let valueCls = "text-foreground";
  if (isResult) {
    rowCls = "border-t-2 border-forest/70 bg-forest/5";
    labelCls = "text-forest";
    valueCls = "text-forest";
  }
  if (isHighlight) {
    rowCls = "border-t-2 border-forest";
    labelCls = "text-forest";
    valueCls = "text-forest";
  }

  return (
    <tr className={rowCls}>
      <td className={`py-2 pl-3 pr-3 font-bold ${labelCls} ${isHighlight ? "text-base bg-forest/10 rounded-l-md" : ""}`}>
        {label}
        {badge && (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold text-forest bg-forest/10 border border-forest/20">
            {badge}
          </span>
        )}
      </td>
      <td className={`py-2 pr-3 text-right tabular-nums font-bold ${v < 0 ? "text-red-600" : valueCls} ${isHighlight ? "bg-forest/10" : ""}`}>
        {num(v)}
      </td>
      {compare && (
        <td className={`py-2 pr-3 text-right tabular-nums font-bold ${p < 0 ? "text-red-600" : "text-text-med"} ${isHighlight ? "bg-forest/10 rounded-r-md" : ""}`}>
          {num(p)}
        </td>
      )}
    </tr>
  );
}

// ================================================================
// PAGE 3 — EXPENSES
// ================================================================
// Frequency pill options for the recurring expense form.
const RECURRENCE_UNITS: Array<{ v: "daily" | "weekly" | "monthly" | "annually" | "custom"; label: string }> = [
  { v: "daily",    label: "Daily" },
  { v: "weekly",   label: "Weekly" },
  { v: "monthly",  label: "Monthly" },
  { v: "annually", label: "Annually" },
  { v: "custom",   label: "Custom" },
];

/** Project the next auto-generation date from the current expense date. */
function calculateNextDate(date: string, unit: string, interval: number): string {
  const d = new Date(date);
  const n = Math.max(1, Number(interval) || 1);
  if (unit === "daily")    d.setDate(d.getDate() + n);
  else if (unit === "weekly")   d.setDate(d.getDate() + n * 7);
  else if (unit === "monthly")  d.setMonth(d.getMonth() + n);
  else if (unit === "annually") d.setFullYear(d.getFullYear() + n);
  else if (unit === "custom")   d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/** Human-readable cadence label, e.g. 'Every 2 weeks' / 'Monthly'. */
function cadenceLabel(unit: string | null, interval: number | null): string {
  const n = Math.max(1, Number(interval) || 1);
  if (!unit) return "";
  if (unit === "monthly")  return n === 1 ? "Monthly" : `Every ${n} months`;
  if (unit === "annually") return n === 1 ? "Annually" : `Every ${n} years`;
  if (unit === "weekly")   return n === 1 ? "Weekly"  : `Every ${n} weeks`;
  if (unit === "daily")    return n === 1 ? "Daily"   : `Every ${n} days`;
  if (unit === "custom")   return `Every ${n} days`;
  return unit;
}

function fmtLongDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function ExpensesTab() {
  const p = usePeriod("this_month");
  const [filterType, setFilterType] = useState<string>("");
  const [filterCat, setFilterCat] = useState<string>("");

  const { data: categories } = useFinanceCategories();
  const { data: expenses } = useFinanceExpenses(p.resolved.year, p.resolved.month);
  const addE = useAddExpense();
  const updE = useUpdateExpense();
  const delE = useDeleteExpense();

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    expense_date: today, category_id: "", description: "", amount: "",
    vendor: "", is_recurring: false, recurrence_unit: "monthly", recurrence_interval: 1,
    recurrence_end_date: "", notes: "",
  });

  const [editing, setEditing] = useState<any | null>(null);

  const filtered = useMemo(() => {
    return (expenses || []).filter(e => {
      if (filterType && e.category?.type !== filterType) return false;
      if (filterCat && e.category_id !== filterCat) return false;
      return true;
    });
  }, [expenses, filterType, filterCat]);

  const typeSummary = useMemo(() => {
    const m: Record<string, number> = { fixed: 0, variable: 0, payroll: 0, tax: 0, cogs: 0, depreciation: 0 };
    (expenses || []).forEach(e => {
      const t = e.category?.type || "variable";
      m[t] = (m[t] || 0) + (e.amount || 0);
    });
    return m;
  }, [expenses]);

  const canSave = form.expense_date && form.category_id && form.description.trim() && Number(form.amount) > 0;

  const handleSave = () => {
    const isRec = !!form.is_recurring;
    const unit  = form.recurrence_unit || "monthly";
    const interval = isRec ? Math.max(1, Number(form.recurrence_interval) || 1) : null;
    const nextDate = isRec ? calculateNextDate(form.expense_date, unit, interval || 1) : null;
    addE.mutate({
      expense_date: form.expense_date,
      category_id: form.category_id,
      description: form.description.trim(),
      amount: toKobo(Number(form.amount)),
      vendor: form.vendor?.trim() || null,
      is_recurring: isRec,
      // Mirror to the legacy `recurrence` column for any downstream
      // readers that haven't migrated yet.
      recurrence: isRec ? unit : null,
      recurrence_unit: isRec ? unit : null,
      recurrence_interval: interval,
      recurrence_next_date: nextDate,
      recurrence_end_date: isRec ? (form.recurrence_end_date || null) : null,
      notes: form.notes?.trim() || null,
    } as any, {
      onSuccess: () => setForm({ ...form, description: "", amount: "", vendor: "", notes: "" }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PeriodSelector p={p} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
        {(["fixed","variable","payroll","tax","cogs"] as const).map(t => (
          <div key={t} className={`rounded-xl border border-border p-3 ${TYPE_BG[t]}`}>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-text-med">{t}</div>
            <div className="text-lg font-bold" style={{ color: TYPE_COLORS[t] }}>{fmtNaira(typeSummary[t] || 0)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Log an expense</h3>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
                <option value="">Select category…</option>
                {Object.entries(groupBy(categories || [], "type")).map(([type, cats]) => (
                  <optgroup key={type} label={type.toUpperCase()}>
                    {(cats as any[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Amount (₦)</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inputCls} placeholder="e.g. 50000" />
            </div>
            <div>
              <label className={labelCls}>Vendor (optional)</label>
              <input type="text" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })} />
              Recurring expense
            </label>
            {form.is_recurring && (
              <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
                <div>
                  <label className={labelCls}>Frequency</label>
                  <div className="flex flex-wrap gap-1">
                    {RECURRENCE_UNITS.map(u => (
                      <button
                        key={u.v}
                        type="button"
                        onClick={() => setForm({ ...form, recurrence_unit: u.v, recurrence_interval: 1 })}
                        className={`px-3 py-1.5 rounded-pill text-[11px] font-semibold border ${
                          form.recurrence_unit === u.v
                            ? "bg-forest text-primary-foreground border-forest"
                            : "bg-background text-text-med border-input hover:border-forest/60"
                        }`}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
                {form.recurrence_unit === "daily" && (
                  <div>
                    <label className={labelCls}>Every (days)</label>
                    <input type="number" min={1} max={365} value={form.recurrence_interval}
                      onChange={e => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                      className={inputCls} />
                  </div>
                )}
                {form.recurrence_unit === "weekly" && (
                  <div>
                    <label className={labelCls}>Every (weeks)</label>
                    <input type="number" min={1} max={52} value={form.recurrence_interval}
                      onChange={e => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                      className={inputCls} />
                  </div>
                )}
                {form.recurrence_unit === "custom" && (
                  <div>
                    <label className={labelCls}>Custom interval (days)</label>
                    <input type="number" min={1} max={365} value={form.recurrence_interval}
                      onChange={e => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                      className={inputCls} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Stop recurring after (optional)</label>
                  <input type="date" value={form.recurrence_end_date}
                    onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })}
                    className={inputCls} />
                  <p className="text-[10px] text-text-light mt-1">Leave blank to recur indefinitely.</p>
                </div>
                <div className="text-[11px] text-text-light">
                  Next auto-entry: <b className="text-foreground">{form.expense_date ? fmtLongDate(calculateNextDate(form.expense_date, form.recurrence_unit, Number(form.recurrence_interval) || 1)) : "—"}</b>
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={2} />
            </div>
            <button disabled={!canSave || addE.isPending} onClick={handleSave} className={btnPrimary + " w-full justify-center"}>
              <Save className="w-4 h-4" /> {addE.isPending ? "Saving…" : "Save expense"}
            </button>
          </div>
        </div>

        <div className={cardCls + " lg:col-span-2"}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="font-semibold text-sm mr-auto">Expense list ({filtered.length})</h3>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-xs">
              <option value="">All types</option>
              {["fixed","variable","payroll","tax","cogs","depreciation"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-xs">
              <option value="">All categories</option>
              {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Category</th>
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2">Vendor</th>
                  <th className="py-2 pr-2 text-right">Amount</th>
                  <th className="py-2 pr-2">Recurring</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-text-light">No expenses this period</td></tr>
                )}
                {filtered.map(e => {
                  const t = e.category?.type || "";
                  const isAuto = !!(e as any).is_auto_generated;
                  const recUnit = (e as any).recurrence_unit ?? e.recurrence;
                  const recInterval = (e as any).recurrence_interval ?? 1;
                  const cadence = e.is_recurring && recUnit ? cadenceLabel(recUnit, recInterval) : "";
                  const nextEntry = (e as any).recurrence_next_date as string | null;
                  return (
                    <tr key={e.id} className={`border-b border-border hover:bg-muted/30 ${t ? TYPE_BG[t] || "" : ""} ${isAuto ? "bg-muted/20 text-text-med" : ""}`}>
                      <td className="py-1.5 pr-2">{fmtDate(e.expense_date)}</td>
                      <td className="py-1.5 pr-2">{e.category?.name || "—"}</td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span>{e.description}</span>
                          {isAuto && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-text-light bg-background border border-border rounded-pill px-1.5 py-0.5">
                              Auto
                            </span>
                          )}
                        </div>
                        {e.is_recurring && nextEntry && !isAuto && (
                          <div className="text-[10px] text-text-light mt-0.5">Next entry: {fmtLongDate(nextEntry)}</div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">{e.vendor || "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{fmtNaira(e.amount)}</td>
                      <td className="py-1.5 pr-2">
                        {e.is_recurring && cadence && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-pill px-1.5 py-0.5">
                            🔄 {cadence}
                          </span>
                        )}
                        {isAuto && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-text-med bg-muted border border-border rounded-pill px-1.5 py-0.5" title="Auto-generated from a recurring expense — edit the original to make changes">
                            Auto-generated
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {!isAuto ? (
                          <>
                            <button onClick={() => setEditing(e)} className="text-forest hover:underline text-[11px] font-semibold mr-2">Edit</button>
                            <button onClick={() => { if (confirm("Delete this expense?")) delE.mutate(e.id); }}
                              className="text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <span className="text-[10px] text-text-light italic" title="This was auto-generated from a recurring expense. Edit the original to make changes.">read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2 border-border">
                  <td colSpan={4} className="py-2 pr-2">Total</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(sumKobo(filtered, "amount"))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <EditExpenseModal
          expense={editing}
          categories={categories || []}
          onClose={() => setEditing(null)}
          onSave={async patch => { await updE.mutateAsync({ id: editing.id, ...patch }); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal — recurring template editor with Stop Recurring action.
// ---------------------------------------------------------------------------

function EditExpenseModal({
  expense, categories, onClose, onSave,
}: {
  expense: any;
  categories: Array<{ id: string; name: string; type: string }>;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const isRecurring = !!expense.is_recurring;
  const [form, setForm] = useState({
    expense_date: expense.expense_date,
    category_id: expense.category_id || "",
    description: expense.description || "",
    amount: String(Math.round((expense.amount || 0) / 100)),
    vendor: expense.vendor || "",
    notes: expense.notes || "",
    is_recurring: isRecurring,
    recurrence_unit: (expense.recurrence_unit ?? expense.recurrence ?? "monthly") as "daily" | "weekly" | "monthly" | "annually" | "custom",
    recurrence_interval: Number(expense.recurrence_interval) || 1,
    recurrence_end_date: expense.recurrence_end_date || "",
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const isRec = !!form.is_recurring;
    const unit = form.recurrence_unit;
    const interval = isRec ? Math.max(1, Number(form.recurrence_interval) || 1) : null;
    const nextDate = isRec ? calculateNextDate(form.expense_date, unit, interval || 1) : null;
    try {
      await onSave({
        expense_date: form.expense_date,
        category_id: form.category_id || null,
        description: form.description.trim(),
        amount: toKobo(Number(form.amount)),
        vendor: form.vendor?.trim() || null,
        notes: form.notes?.trim() || null,
        is_recurring: isRec,
        recurrence: isRec ? unit : null,
        recurrence_unit: isRec ? unit : null,
        recurrence_interval: interval,
        recurrence_next_date: nextDate,
        recurrence_end_date: isRec ? (form.recurrence_end_date || null) : null,
      });
    } finally { setBusy(false); }
  };

  const stopRecurring = async () => {
    if (!confirm("Are you sure? No more entries will be auto-generated. Existing entries are kept.")) return;
    setBusy(true);
    try {
      await onSave({
        is_recurring: false,
        recurrence: null,
        recurrence_unit: null,
        recurrence_interval: null,
        recurrence_next_date: null,
        recurrence_end_date: null,
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[92svh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-sm">Edit expense</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted inline-flex items-center justify-center"><span className="text-base leading-none">×</span></button>
        </div>
        <div className="p-5 space-y-3">
          {isRecurring && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs leading-relaxed">
              This is a recurring expense. Editing the amount, category, or description will apply to future auto-generated entries only. Past entries are not affected.
            </div>
          )}

          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
              <option value="">Select category…</option>
              {Object.entries(groupBy(categories, "type")).map(([type, cats]) => (
                <optgroup key={type} label={type.toUpperCase()}>
                  {(cats as any[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Amount (₦)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Vendor (optional)</label>
            <input type="text" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className={inputCls} />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })} />
            Recurring expense
          </label>

          {form.is_recurring && (
            <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
              <div>
                <label className={labelCls}>Frequency</label>
                <div className="flex flex-wrap gap-1">
                  {RECURRENCE_UNITS.map(u => (
                    <button
                      key={u.v}
                      type="button"
                      onClick={() => setForm({ ...form, recurrence_unit: u.v, recurrence_interval: 1 })}
                      className={`px-3 py-1.5 rounded-pill text-[11px] font-semibold border ${
                        form.recurrence_unit === u.v
                          ? "bg-forest text-primary-foreground border-forest"
                          : "bg-background text-text-med border-input hover:border-forest/60"
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.recurrence_unit === "daily" && (
                <div>
                  <label className={labelCls}>Every (days)</label>
                  <input type="number" min={1} max={365} value={form.recurrence_interval}
                    onChange={e => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputCls} />
                </div>
              )}
              {form.recurrence_unit === "weekly" && (
                <div>
                  <label className={labelCls}>Every (weeks)</label>
                  <input type="number" min={1} max={52} value={form.recurrence_interval}
                    onChange={e => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputCls} />
                </div>
              )}
              {form.recurrence_unit === "custom" && (
                <div>
                  <label className={labelCls}>Custom interval (days)</label>
                  <input type="number" min={1} max={365} value={form.recurrence_interval}
                    onChange={e => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>Stop recurring after (optional)</label>
                <input type="date" value={form.recurrence_end_date}
                  onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })}
                  className={inputCls} />
              </div>
              {expense.recurrence_next_date && (
                <div className="text-[11px] text-text-light">
                  Next auto-entry: <b className="text-foreground">{fmtLongDate(expense.recurrence_next_date)}</b>
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {isRecurring ? (
              <button onClick={stopRecurring} disabled={busy} className="inline-flex items-center gap-1.5 text-destructive border border-destructive/40 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-destructive/10">
                Stop recurring
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
              <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
                <Save className="w-3.5 h-3.5" /> Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((m: Record<string, T[]>, item) => {
    const k = String(item[key]);
    (m[k] = m[k] || []).push(item);
    return m;
  }, {});
}

// ================================================================
// PAGE 4 — COGS
// ================================================================
function CogsTab() {
  const p = usePeriod("this_month");
  const { data: cogs } = useFinanceCogs(p.resolved.year, p.resolved.month);
  const { data: products } = useFinanceProducts();
  const { data: plRow } = useFinancePL(p.resolved.year, p.resolved.month);
  const addC = useAddCogs();
  const delC = useDeleteCogs();

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    product_id: "", product_name: "", supplier: "", unit_cost: "", quantity: "1",
    purchase_date: today, notes: "",
  });

  const total = Number(form.unit_cost || 0) * Number(form.quantity || 0);
  const canSave = form.product_name.trim() && Number(form.unit_cost) > 0 && Number(form.quantity) > 0 && form.purchase_date;

  const revCur = plRowKobo(plRow?.[0], "gross_revenue_ngn");
  const cogsCur = sumKobo(cogs, "total_cost");
  const gp = revCur - cogsCur;
  const margin = revCur > 0 ? (gp / revCur) * 100 : 0;

  // Group by product
  const byProduct = useMemo(() => {
    const m: Record<string, { name: string; total: number; qty: number }> = {};
    (cogs || []).forEach(c => {
      const n = c.product_name;
      if (!m[n]) m[n] = { name: n, total: 0, qty: 0 };
      m[n].total += c.total_cost || 0;
      m[n].qty += c.quantity || 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [cogs]);

  const handleSave = () => {
    const p = (products || []).find(x => x.id === form.product_id);
    addC.mutate({
      product_id: form.product_id || null,
      product_name: p?.name || form.product_name.trim(),
      supplier: form.supplier?.trim() || null,
      unit_cost: toKobo(Number(form.unit_cost)),
      quantity: Number(form.quantity),
      purchase_date: form.purchase_date,
      notes: form.notes?.trim() || null,
    }, {
      onSuccess: () => setForm({ ...form, product_id: "", product_name: "", supplier: "", unit_cost: "", quantity: "1", notes: "" }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PeriodSelector p={p} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard title="Revenue" value={fmtNaira(revCur)} />
        <KpiCard title="COGS" value={fmtNaira(cogsCur)} subtitle={revCur > 0 ? `${((cogsCur/revCur)*100).toFixed(1)}% of revenue` : "—"} />
        <KpiCard title="Gross Margin" value={fmtPct(margin)} badge={fmtNaira(gp)} negative={gp < 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Record product cost</h3>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>Product</label>
              <select value={form.product_id}
                onChange={e => {
                  const pid = e.target.value;
                  const match = (products || []).find(x => x.id === pid);
                  setForm({ ...form, product_id: pid, product_name: match?.name || "" });
                }}
                className={inputCls}>
                <option value="">— Custom (type name) —</option>
                {(products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {!form.product_id && (
              <div>
                <label className={labelCls}>Product name</label>
                <input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Supplier</label>
              <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Unit Cost (₦)</label>
                <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Quantity</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Total (auto)</label>
              <input readOnly value={fmtNaira(toKobo(total))} className={inputCls + " bg-muted"} />
            </div>
            <div>
              <label className={labelCls}>Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
            </div>
            <button disabled={!canSave || addC.isPending} onClick={handleSave} className={btnPrimary + " w-full justify-center"}>
              <Save className="w-4 h-4" /> Save COGS entry
            </button>
          </div>
        </div>

        <div className={cardCls + " lg:col-span-2"}>
          <h3 className="font-semibold text-sm mb-3">COGS entries ({cogs?.length || 0})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Product</th>
                  <th className="py-2 pr-2">Supplier</th>
                  <th className="py-2 pr-2 text-right">Unit</th>
                  <th className="py-2 pr-2 text-right">Qty</th>
                  <th className="py-2 pr-2 text-right">Total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(cogs || []).length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-text-light">No COGS entries</td></tr>
                )}
                {(cogs || []).map(c => (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-1.5 pr-2">{fmtDate(c.purchase_date)}</td>
                    <td className="py-1.5 pr-2">{c.product_name}</td>
                    <td className="py-1.5 pr-2">{c.supplier || "—"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(c.unit_cost)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{c.quantity}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{fmtNaira(c.total_cost)}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => { if (confirm("Delete entry?")) delC.mutate(c.id); }}
                        className="text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2 border-border">
                  <td colSpan={5} className="py-2 pr-2">Total COGS</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(cogsCur)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {byProduct.length > 0 && (
            <div className="mt-4">
              <div className={sectionCls}>By product</div>
              <div className="space-y-1">
                {byProduct.map(p => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <span>{p.name} <span className="text-text-light">×{p.qty}</span></span>
                    <span className="tabular-nums font-semibold">{fmtNaira(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// PAGE 5 — PAYROLL
// ================================================================
function PayrollTab() {
  const p = usePeriod("this_month");
  const { data: payroll } = useFinancePayroll(p.resolved.year, p.resolved.month);
  const { data: settings } = useFinanceTaxSettings();
  const addP = useAddPayroll();
  const delP = useDeletePayroll();

  const now = new Date();
  // Primary input is now the target NET salary. Basic / housing / transport
  // are reverse-derived via binary search. `other_allowances` remains an
  // explicit input (paid on top of the derived gross) and the displayed
  // net shifts up when it's populated.
  const [form, setForm] = useState<any>({
    employee_name: "", role: "",
    pay_month: now.getMonth() + 1, pay_year: now.getFullYear(),
    target_net: "",
    other_allowances: "",
    include_nhf: false,
    notes: "",
  });
  const [employerExpanded, setEmployerExpanded] = useState(false);

  const bands = settings?.paye_bands || NTA_2025_PAYE_BANDS;
  const empPensionRate = Number(settings?.employee_pension_rate ?? 8);
  const erPensionRate = Number(settings?.employer_pension_rate ?? 10);
  const nhfRate = Number(settings?.nhf_rate ?? 2.5);
  const nsitfRate = Number(settings?.nsitf_rate ?? 1);
  const itfRate = Number(settings?.itf_rate ?? 1);

  // Debounce the target-net input by 300 ms so we don't recompute on every
  // keystroke.
  const [debouncedNet, setDebouncedNet] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedNet(String(form.target_net)), 300);
    return () => clearTimeout(t);
  }, [form.target_net]);

  const targetNetK = toKobo(Number(debouncedNet) || 0);
  const otherK = toKobo(Number(form.other_allowances) || 0);

  // Reverse-calculate basic salary so that computePayroll(basic).net ≈ target.
  const reversed = useMemo(
    () => reverseCalculatePayrollK(targetNetK, !!form.include_nhf, bands, {
      empPensionRate, erPensionRate, nhfRate, nsitfRate, itfRate,
    }),
    [targetNetK, form.include_nhf, bands, empPensionRate, erPensionRate, nhfRate, nsitfRate, itfRate],
  );

  // If admin added other allowances, keep basic / housing / transport fixed
  // and re-run a single forward pass with the extra allowance added to gross
  // (and only `other` excluded from the pension base, per spec).
  const final = useMemo(
    () => computePayrollWithOtherK(reversed.basicK, otherK, !!form.include_nhf, bands, {
      empPensionRate, erPensionRate, nhfRate, nsitfRate, itfRate,
    }),
    [reversed.basicK, otherK, form.include_nhf, bands, empPensionRate, erPensionRate, nhfRate, nsitfRate, itfRate],
  );

  const {
    basicK, housingK, transportK, grossK, pensionableK,
    empPensionK, nhfK, monthlyPayeK, totalDeductionsK, netK,
    employerPensionK, nsitfK, itfK, totalEmployerCostK,
  } = final;

  const netAdjusted = otherK > 0;

  const canSave = form.employee_name.trim() && basicK > 0 && targetNetK > 0;

  const handleSave = () => {
    // NOTE: All fields below are required by the DB — finance_payroll
    // has no generated columns. Every calculated amount is sent as an
    // integer kobo value.
    const payload = {
      employee_name: form.employee_name.trim(),
      role: form.role?.trim() || null,
      pay_month: Number(form.pay_month),
      pay_year: Number(form.pay_year),
      basic_salary: basicK,
      housing_allowance: housingK,
      transport_allowance: transportK,
      other_allowances: otherK,
      gross_salary: grossK,
      employee_pension: empPensionK,
      nhf_deduction: nhfK,
      paye_tax: monthlyPayeK,
      total_employee_deductions: totalDeductionsK,
      net_salary: netK,
      employer_pension: employerPensionK,
      nsitf: nsitfK,
      itf: itfK,
      total_employer_cost: totalEmployerCostK,
      notes: form.notes?.trim() || null,
    };
    addP.mutate(payload, {
      onSuccess: () => setForm({
        ...form,
        employee_name: "", role: "",
        target_net: "", other_allowances: "",
        notes: "",
      }),
    });
  };

  // Summaries
  const totals = useMemo(() => {
    const rows = payroll || [];
    return {
      gross: sumKobo(rows, "gross_salary"),
      paye: sumKobo(rows, "paye_tax"),
      empPension: sumKobo(rows, "employee_pension"),
      erPension: sumKobo(rows, "employer_pension"),
      nsitf: sumKobo(rows, "nsitf"),
      itf: sumKobo(rows, "itf"),
      erCost: sumKobo(rows, "total_employer_cost"),
      net: sumKobo(rows, "net_salary"),
    };
  }, [payroll]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PeriodSelector p={p} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add payroll entry</h3>
          <div className="space-y-3">
            {/* Employee + period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Employee Name</label>
                <input value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pay Month</label>
                <select value={form.pay_month} onChange={e => setForm({ ...form, pay_month: Number(e.target.value) })} className={inputCls}>
                  {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Pay Year</label>
                <input type="number" value={form.pay_year} onChange={e => setForm({ ...form, pay_year: Number(e.target.value) })} className={inputCls} />
              </div>
            </div>

            {/* Primary input: desired NET salary */}
            <div className="bg-forest/5 border border-forest/20 rounded-xl p-3">
              <label className={labelCls + " flex items-center gap-1.5"}>
                Desired Net (Take-Home) Pay
                <span title="Enter the exact take-home pay the employee should receive. We'll calculate basic salary and all statutory deductions for you." className="text-text-light">
                  <Info className="w-3 h-3" />
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-med font-semibold">₦</span>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={form.target_net}
                  onChange={e => setForm({ ...form, target_net: e.target.value })}
                  placeholder="e.g. 200000"
                  className="w-full border border-input rounded-lg pl-7 pr-3 py-2.5 text-base bg-background font-semibold"
                />
              </div>
              <label className="flex items-center gap-2 text-xs mt-2">
                <input type="checkbox" checked={form.include_nhf} onChange={e => setForm({ ...form, include_nhf: e.target.checked })} />
                Include NHF ({nhfRate}% of basic — optional for private employees)
              </label>
            </div>

            {/* Breakdown of Gross */}
            <div className={sectionCls}>Breakdown of Gross</div>
            <AutoField label="Basic Salary" kobo={basicK} />
            <AutoField label="Housing Allowance (30% of basic)" kobo={housingK} />
            <AutoField label="Transport Allowance (20% of basic)" kobo={transportK} />
            <div>
              <label className={labelCls}>Other Allowances (₦) <span className="ml-1 text-[9px] font-normal normal-case text-text-light">(editable)</span></label>
              <input
                type="number" min="0"
                value={form.other_allowances}
                onChange={e => setForm({ ...form, other_allowances: e.target.value })}
                placeholder="Optional — bonuses, etc."
                className={inputCls}
              />
            </div>
            <AutoField label="Gross Salary" kobo={grossK} strong />

            {/* Deductions */}
            <div className={sectionCls}>Deductions</div>
            <AutoField label={`Employee Pension (${empPensionRate}% of pensionable)`} kobo={empPensionK} />
            {form.include_nhf && <AutoField label={`NHF (${nhfRate}% of basic)`} kobo={nhfK} />}
            <AutoField label="PAYE Tax (NTA 2025 bands)" kobo={monthlyPayeK} />
            <AutoField label="Total Deductions" kobo={totalDeductionsK} tone="red" strong />

            {/* Net pay */}
            <AutoField label="NET PAY" kobo={netK} tone="green" big />
            {netAdjusted && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                Net adjusted to ₦{Math.round(fromKobo(netK)).toLocaleString()} due to additional allowances.
              </div>
            )}

            {/* Employer costs (collapsible) */}
            <button
              type="button"
              onClick={() => setEmployerExpanded(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-med hover:text-forest"
            >
              {employerExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Employer Costs (for your records)
            </button>
            {employerExpanded && (
              <div className="space-y-2 pl-5 border-l-2 border-border">
                <AutoField label={`Employer Pension (${erPensionRate}%)`} kobo={employerPensionK} />
                <AutoField label={`NSITF (${nsitfRate}%)`} kobo={nsitfK} />
                <AutoField label={`ITF (${itfRate}% monthly equiv)`} kobo={itfK} />
                <AutoField label="Total Employer Cost" kobo={totalEmployerCostK} strong />
              </div>
            )}

            <button disabled={!canSave || addP.isPending} onClick={handleSave} className={btnPrimary + " w-full justify-center mt-2"}>
              <Save className="w-4 h-4" /> {addP.isPending ? "Saving…" : "Save payslip"}
            </button>
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Payslip preview</h3>
          <div className="space-y-1 text-sm">
            <Row l="Gross Salary" v={grossK} />
            <Row l="Pensionable Emoluments" v={pensionableK} muted />
            <div className={sectionCls}>Employee deductions</div>
            <Row l={`Employee Pension (${empPensionRate}%)`} v={empPensionK} />
            {form.include_nhf && <Row l={`NHF (${nhfRate}%)`} v={nhfK} />}
            <Row l="PAYE Tax (NTA 2025 bands)" v={monthlyPayeK} />
            <Row l="Total Deductions" v={totalDeductionsK} bold />
            <Row l="Net Salary" v={netK} bold highlight />
            <div className={sectionCls}>Employer cost</div>
            <Row l={`Employer Pension (${erPensionRate}%)`} v={employerPensionK} />
            <Row l={`NSITF (${nsitfRate}%)`} v={nsitfK} />
            <Row l={`ITF (${itfRate}%)`} v={itfK} />
            <Row l="Total Employer Cost" v={totalEmployerCostK} bold highlight />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Payroll entries ({payroll?.length || 0})</h3>
          {(payroll || []).length > 0 && (
            <button
              onClick={() => generateAllPayslips(payroll || [])}
              className="inline-flex items-center gap-1.5 border border-forest/30 text-forest hover:bg-forest/5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" /> Download All
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-2">Employee</th>
                <th className="py-2 pr-2">Role</th>
                <th className="py-2 pr-2 text-right">Gross</th>
                <th className="py-2 pr-2 text-right">PAYE</th>
                <th className="py-2 pr-2 text-right">Pension</th>
                <th className="py-2 pr-2 text-right">NSITF</th>
                <th className="py-2 pr-2 text-right">Net</th>
                <th className="py-2 pr-2 text-right">Total Cost</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(payroll || []).length === 0 && (
                <tr><td colSpan={9} className="text-center py-6 text-text-light">No payroll entries for this period</td></tr>
              )}
              {(payroll || []).map(r => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                  <td className="py-1.5 pr-2">{r.employee_name}</td>
                  <td className="py-1.5 pr-2">{r.role || "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.gross_salary)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.paye_tax)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.employee_pension)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.nsitf)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{fmtNaira(r.net_salary)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.total_employer_cost)}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => generatePayslip(r)}
                      className="inline-flex items-center gap-1 border border-forest/30 text-forest hover:bg-forest/5 px-2 py-1 rounded-lg text-[11px] font-semibold mr-1"
                      title="Download payslip"
                    >
                      <Download className="w-3.5 h-3.5" /> Payslip
                    </button>
                    <button onClick={() => { if (confirm("Delete entry?")) delP.mutate(r.id); }}
                      className="text-red-600 hover:text-red-800 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-border">
                <td colSpan={2} className="py-2 pr-2">Totals</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totals.gross)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totals.paye)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totals.empPension)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totals.nsitf)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totals.net)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totals.erCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="font-semibold text-sm mb-3">Remittance Summary (current period)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="border border-border rounded-lg p-3">
            <div className="font-semibold">State IRS (PAYE)</div>
            <div className="text-lg font-bold text-forest tabular-nums">{fmtNaira(totals.paye)}</div>
            <div className="text-[10px] text-text-light">Due by 10th of following month</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="font-semibold">PenCom (Pension)</div>
            <div className="text-lg font-bold text-forest tabular-nums">{fmtNaira(totals.empPension + totals.erPension)}</div>
            <div className="text-[10px] text-text-light">Within 7 days of payroll run</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="font-semibold">NSITF</div>
            <div className="text-lg font-bold text-forest tabular-nums">{fmtNaira(totals.nsitf)}</div>
            <div className="text-[10px] text-text-light">Due by 16th of following month</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, v, bold, highlight, muted }: { l: string; v: number; bold?: boolean; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 border-b border-border/50 ${bold ? "font-bold" : ""} ${highlight ? "text-forest" : ""} ${muted ? "text-text-light" : ""}`}>
      <span>{l}</span>
      <span className="tabular-nums">{fmtNaira(v)}</span>
    </div>
  );
}

// ---------- Reverse payroll calculation ----------
// These helpers operate purely in kobo. Rates come from the tax settings
// with sensible fallbacks so the form still works before settings load.
interface PayrollRates {
  empPensionRate: number;
  erPensionRate: number;
  nhfRate: number;
  nsitfRate: number;
  itfRate: number;
}
const DEFAULT_RATES: PayrollRates = {
  empPensionRate: 8, erPensionRate: 10, nhfRate: 2.5, nsitfRate: 1, itfRate: 1,
};

function computePayrollK(basicK: number, includeNhf: boolean, bands: PayeBand[], rates: PayrollRates = DEFAULT_RATES) {
  return computePayrollWithOtherK(basicK, 0, includeNhf, bands, rates);
}

/**
 * Forward pass with an optional other-allowances amount layered on top.
 * `other` is added to gross for PAYE / NSITF / ITF but is NOT pensionable.
 */
function computePayrollWithOtherK(basicK: number, otherK: number, includeNhf: boolean, bands: PayeBand[], rates: PayrollRates = DEFAULT_RATES) {
  const b = Math.max(0, Math.round(basicK));
  const housingK = Math.round(b * 0.30);
  const transportK = Math.round(b * 0.20);
  const pensionableK = b + housingK + transportK;
  const grossK = pensionableK + Math.max(0, Math.round(otherK));
  const empPensionK = Math.round(pensionableK * (rates.empPensionRate / 100));
  const nhfK = includeNhf ? Math.round(b * (rates.nhfRate / 100)) : 0;

  // PAYE — bands are defined in NGN; go via NGN then convert back to kobo.
  const annualChargeableNgn = Math.max(0, fromKobo(grossK - empPensionK - nhfK) * 12);
  const annualPayeNgn = computeAnnualPaye(annualChargeableNgn, bands);
  const monthlyPayeK = Math.round(toKobo(annualPayeNgn) / 12);

  const totalDeductionsK = empPensionK + nhfK + monthlyPayeK;
  const netK = grossK - totalDeductionsK;

  const employerPensionK = Math.round(pensionableK * (rates.erPensionRate / 100));
  const nsitfK = Math.round(grossK * (rates.nsitfRate / 100));
  const itfK = Math.round(grossK * (rates.itfRate / 100));
  const totalEmployerCostK = grossK + employerPensionK + nsitfK + itfK;

  return {
    basicK: b, housingK, transportK, otherK: Math.max(0, Math.round(otherK)),
    grossK, pensionableK,
    empPensionK, nhfK, monthlyPayeK, totalDeductionsK, netK,
    employerPensionK, nsitfK, itfK, totalEmployerCostK,
  };
}

/**
 * Binary-search for the basic salary that produces the entered net pay.
 * Works purely in kobo so PAYE rounding stays consistent with the forward
 * computation used for display + insert.
 */
function reverseCalculatePayrollK(targetNetK: number, includeNhf: boolean, bands: PayeBand[], rates: PayrollRates = DEFAULT_RATES) {
  if (targetNetK <= 0) return computePayrollK(0, includeNhf, bands, rates);

  let lo = 0;
  let hi = targetNetK * 3; // basic is never > 3× net under these bands
  let closest = computePayrollK(0, includeNhf, bands, rates);
  let closestDiff = Math.abs(closest.netK - targetNetK);

  for (let i = 0; i < 100; i++) {
    const mid = Math.round((lo + hi) / 2);
    const attempt = computePayrollK(mid, includeNhf, bands, rates);
    const diff = Math.abs(attempt.netK - targetNetK);
    if (diff < closestDiff) { closest = attempt; closestDiff = diff; }
    if (diff <= 100) return attempt; // within ₦1 tolerance
    if (attempt.netK < targetNetK) lo = mid + 1;
    else hi = mid - 1;
    if (lo > hi) break;
  }
  return closest;
}

/** Read-only amount field with an "auto" badge. */
function AutoField({ label, kobo, strong, big, tone }: {
  label: string; kobo: number; strong?: boolean; big?: boolean; tone?: "red" | "green";
}) {
  const bgCls = tone === "green"
    ? "bg-emerald-50 border-emerald-200"
    : tone === "red"
    ? "bg-red-50 border-red-200"
    : "bg-muted/60 border-border";
  const textCls = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-foreground";
  return (
    <div>
      <div className={labelCls + " flex items-center gap-1"}>
        {label}
        <span className="inline-flex items-center text-[9px] font-semibold text-text-light bg-muted px-1.5 py-0.5 rounded uppercase tracking-wider">auto</span>
      </div>
      <div className={`w-full border rounded-lg px-3 py-2 tabular-nums ${bgCls} ${textCls} ${strong ? "font-bold" : ""} ${big ? "text-lg font-bold py-3" : "text-sm"}`}>
        {fmtNaira(kobo)}
      </div>
    </div>
  );
}

// ---------- Payslip download helpers ----------

/** Cached data-URL of the green logo so we only fetch once per session. */
let _logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const res = await fetch(bmLogoGreen);
    const blob = await res.blob();
    const url = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    _logoDataUrl = url;
    return url;
  } catch {
    return "";
  }
}

/** Format kobo → "₦NN,NNN" for payslip lines. */
function ps(kobo: number | null | undefined): string {
  const n = Math.round((kobo || 0) / 100);
  return `₦${n.toLocaleString()}`;
}

/** Build the payslip HTML string for a single payroll record. */
function buildPayslipHtml(r: PayrollEntry, logoDataUrl: string): { html: string; filename: string; title: string } {
  const monthName = MONTHS[(r.pay_month - 1) % 12];
  const periodLabel = `${monthName} ${r.pay_year}`;
  const safeName = (r.employee_name || "Employee").replace(/[^a-zA-Z0-9]+/g, "");
  const filename = `Payslip_${safeName}_${monthName}${r.pay_year}.pdf`;
  const title = `Payslip_${safeName}_${monthName}${r.pay_year}`;
  const now = new Date();
  const payDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const genStamp = `${payDate} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const hasNhf = (r.nhf_deduction || 0) > 0;
  const hasOther = (r.other_allowances || 0) > 0;
  const hasEmployer = (r.employer_pension || 0) + (r.nsitf || 0) + (r.itf || 0) > 0;

  const row = (label: string, amount: number | null | undefined, cls = "") =>
    `<tr class="${cls}"><td class="lbl">${label}</td><td class="amt">${ps(amount)}</td></tr>`;

  const brand = "#2D6A4F";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
  .sheet { background: #fff; margin: 20mm auto; padding: 14mm 16mm; max-width: 190mm; min-height: 257mm; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid ${brand}; }
  .brand img { max-height: 40px; display: block; }
  .brand .url { font-size: 10px; color: #666; margin-top: 4px; letter-spacing: 0.5px; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 26px; letter-spacing: 3px; color: ${brand}; font-weight: 700; }
  .title .sub { font-size: 10px; color: #666; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0; padding-bottom: 14px; border-bottom: 1px solid #e5e5e5; }
  .meta .col .k { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #999; font-weight: 600; margin-bottom: 4px; }
  .meta .col .v { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  .meta .col .v2 { font-size: 11px; color: #666; margin-top: 2px; }
  .section { margin-top: 14px; }
  .section h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: ${brand}; font-weight: 700; margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 0; font-size: 12px; }
  td.lbl { color: #333; }
  td.amt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  tr.line td { border-bottom: 1px solid #eee; }
  tr.total td { border-top: 1px solid #ccc; padding-top: 8px; font-weight: 700; }
  tr.netpay td { border-top: 2px solid ${brand}; border-bottom: 2px solid ${brand}; padding: 12px 0; font-weight: 700; font-size: 16px; color: ${brand}; }
  .note { margin-top: 22px; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 9.5px; color: #888; line-height: 1.5; text-align: center; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; padding: 20mm; box-shadow: none; max-width: none; min-height: auto; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="brand">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="BundledMum">` : `<div style="font-size:18px;font-weight:700;color:${brand};letter-spacing:1px;">BundledMum</div>`}
        <div class="url">bundledmum.com</div>
      </div>
      <div class="title">
        <h1>PAYSLIP</h1>
        <div class="sub">Pay period ${periodLabel}</div>
      </div>
    </div>

    <div class="meta">
      <div class="col">
        <div class="k">Employee</div>
        <div class="v">${escapeHtml(r.employee_name)}</div>
        <div class="v2">${escapeHtml(r.role || "—")}</div>
      </div>
      <div class="col" style="text-align:right;">
        <div class="k">Pay Period</div>
        <div class="v">${periodLabel}</div>
        <div class="v2">Pay date: ${payDate}</div>
      </div>
    </div>

    <div class="section">
      <h2>Earnings</h2>
      <table>
        ${row("Basic Salary", r.basic_salary, "line")}
        ${row("Housing Allowance", r.housing_allowance, "line")}
        ${row("Transport Allowance", r.transport_allowance, "line")}
        ${hasOther ? row("Other Allowances", r.other_allowances, "line") : ""}
        ${row("GROSS SALARY", r.gross_salary, "total")}
      </table>
    </div>

    <div class="section">
      <h2>Deductions</h2>
      <table>
        ${row("Employee Pension (8%)", r.employee_pension, "line")}
        ${hasNhf ? row("NHF (2.5%)", r.nhf_deduction, "line") : ""}
        ${row("PAYE Tax", r.paye_tax, "line")}
        ${row("TOTAL DEDUCTIONS", r.total_employee_deductions, "total")}
      </table>
    </div>

    <div class="section">
      <table>
        <tr class="netpay"><td class="lbl">NET PAY</td><td class="amt">${ps(r.net_salary)}</td></tr>
      </table>
    </div>

    ${hasEmployer ? `
    <div class="section">
      <h2>Employer Contributions (for your records)</h2>
      <table>
        ${row("Employer Pension (10%)", r.employer_pension, "line")}
        ${row("NSITF (1%)", r.nsitf, "line")}
        ${row("ITF", r.itf, "line")}
        ${row("Total Employer Cost", r.total_employer_cost, "total")}
      </table>
    </div>` : ""}

    <div class="note">
      This payslip is computer-generated and valid without a signature.<br>
      Generated: ${genStamp} · Confidential — for recipient only.
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
  </script>
</body>
</html>`;

  return { html, filename, title };
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Open the payslip in a new window and trigger the browser print dialog. */
async function generatePayslip(r: PayrollEntry): Promise<void> {
  const logo = await getLogoDataUrl();
  const { html, title } = buildPayslipHtml(r, logo);
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    alert("Popup blocked — please allow popups for this site to download payslips.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  try { win.document.title = title; } catch { /* cross-origin noop */ }
}

async function generateAllPayslips(rows: PayrollEntry[]): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await generatePayslip(rows[i]);
    // eslint-disable-next-line no-await-in-loop
    await new Promise(res => setTimeout(res, 500));
  }
}

// ================================================================
// PAGE 6 — TAX POSITION
// ================================================================
function TaxTab() {
  const year = new Date().getFullYear();
  const { data: position } = useFinanceTaxPosition(year);
  const { data: settings } = useFinanceTaxSettings();
  const { data: plAll } = useFinancePL(year);
  const { data: payrollAll } = useFinancePayroll(year);

  const small = position?.company_size === "small" || position?.is_small_company;
  const revenueYtd = Number(position?.revenue_ytd || position?.annual_revenue_ytd || 0);
  const threshold = 100_000_000;
  const revPct = Math.min(100, (revenueYtd / threshold) * 100);
  const assessableProfit = Number(position?.assessable_profit || 0);
  const citRate = Number(settings?.cit_rate ?? 0);
  const devRate = Number(settings?.development_levy_rate ?? 0);
  const citLiability = small ? 0 : assessableProfit * (citRate / 100);
  const devLiability = small ? 0 : assessableProfit * (devRate / 100);

  const vatReg = !!settings?.vat_registered;
  const vatRate = Number(settings?.vat_rate ?? 7.5);
  const totalRevenue = (plAll || []).reduce((s, r) => s + (Number(r.gross_revenue_ngn) || 0), 0);
  const totalCogs = (plAll || []).reduce((s, r) => s + (Number(r.cogs_ngn) || 0), 0);
  const vatOutput = vatReg ? totalRevenue * (vatRate / 100) : 0;
  const vatInput = vatReg ? totalCogs * (vatRate / 100) : 0;
  const vatNet = vatOutput - vatInput;

  // Tax calendar per month
  const calendar = useMemo(() => {
    const rows: Array<{ month: number; label: string; paye: number; pension: number; nsitf: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const entries = (payrollAll || []).filter(p => p.pay_month === m);
      rows.push({
        month: m,
        label: MONTHS[m - 1],
        paye: sumKobo(entries, "paye_tax"),
        pension: sumKobo(entries, "employee_pension") + sumKobo(entries, "employer_pension"),
        nsitf: sumKobo(entries, "nsitf"),
      });
    }
    return rows;
  }, [payrollAll]);

  const totalPaye = calendar.reduce((s, r) => s + r.paye, 0);
  const totalPension = calendar.reduce((s, r) => s + r.pension, 0);
  const totalNsitf = calendar.reduce((s, r) => s + r.nsitf, 0);
  const totalItf = sumKobo(payrollAll, "itf");

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <h3 className="font-semibold text-sm mb-3">Company Status ({year})</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className={labelCls}>Classification</div>
            <div className={`text-lg font-bold ${small ? "text-emerald-600" : "text-amber-600"}`}>{small ? "Small Company" : "Large Company"}</div>
            <div className="text-[10px] text-text-light">Threshold ₦100M annual turnover</div>
          </div>
          <div>
            <div className={labelCls}>Annual Revenue YTD</div>
            <div className="text-lg font-bold text-forest tabular-nums">₦{Math.round(revenueYtd).toLocaleString()}</div>
            <div className="w-full h-2 rounded-full bg-muted mt-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${revPct}%`, background: revPct > 90 ? "#EF4444" : "#2D6A4F" }} />
            </div>
            <div className="text-[10px] text-text-light mt-1">{revPct.toFixed(1)}% of ₦100M threshold</div>
          </div>
          <div>
            <div className={labelCls}>VAT Registration</div>
            <div className="text-lg font-bold">{vatReg ? "Registered" : "Not registered"}</div>
            {!vatReg && revenueYtd >= 25_000_000 * 0.8 && (
              <div className="text-[10px] text-amber-700 mt-1">⚠ Approaching ₦25M — register before crossing.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Corporate Income Tax (CIT)</h3>
          <div className="space-y-1 text-sm">
            <Row l="Assessable profit YTD" v={ngnToKoboNum(assessableProfit)} />
            <Row l={`CIT Rate (${citRate}%)`} v={ngnToKoboNum(citLiability)} />
            <Row l={`Development Levy (${devRate}%)`} v={ngnToKoboNum(devLiability)} />
            <Row l="Estimated CIT Liability" v={ngnToKoboNum(citLiability + devLiability)} bold highlight />
          </div>
          {small && (
            <div className="mt-3 text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-emerald-800">
              ✓ Exempt — Small companies (turnover &lt; ₦100M) pay 0% CIT and 0% Development Levy under the Nigeria Tax Act 2025.
            </div>
          )}
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Value Added Tax (VAT)</h3>
          <div className="space-y-1 text-sm">
            <Row l={`VAT Output (${vatRate}% of revenue)`} v={ngnToKoboNum(vatOutput)} />
            <Row l={`VAT Input credit (${vatRate}% of COGS)`} v={ngnToKoboNum(vatInput)} />
            <Row l="Net VAT Payable" v={ngnToKoboNum(vatNet)} bold highlight />
          </div>
          <div className="mt-3 text-[10px] text-text-light">
            Filing deadline: 21st of each following month. Some maternity / baby essentials may be zero-rated — verify with a tax consultant.
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">PAYE ({year})</h3>
          <div className="space-y-1 text-sm">
            <Row l="Total PAYE deducted YTD" v={totalPaye} bold highlight />
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Pension ({year})</h3>
          <div className="space-y-1 text-sm">
            <Row l="Total Pension (employee + employer)" v={totalPension} bold highlight />
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">Other Levies</h3>
          <div className="space-y-1 text-sm">
            <Row l="NSITF YTD (1% monthly payroll)" v={totalNsitf} />
            <Row l="ITF YTD (1% annual payroll)" v={totalItf} />
            <Row l="Total Levies" v={totalNsitf + totalItf} bold />
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3">WHT Tracking</h3>
          <div className="text-xs text-text-light">Track WHT withheld from vendor payments — log each as a tax expense from the Expenses tab.</div>
          <div className="mt-2 text-sm">Goods: {settings?.wht_rate_goods ?? 5}% · Services: {settings?.wht_rate_services ?? 10}%</div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="font-semibold text-sm mb-3">Tax Calendar ({year})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-2">Month</th>
                <th className="py-2 pr-2 text-right">PAYE Due</th>
                <th className="py-2 pr-2 text-right">Pension Due</th>
                <th className="py-2 pr-2 text-right">NSITF Due</th>
                <th className="py-2 pr-2">Deadlines</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map(r => (
                <tr key={r.month} className="border-b border-border">
                  <td className="py-1.5 pr-2">{r.label}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.paye)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.pension)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(r.nsitf)}</td>
                  <td className="py-1.5 pr-2 text-[10px] text-text-light">PAYE 10th · Pension 7d · NSITF 16th</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-border">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totalPaye)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totalPension)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNaira(totalNsitf)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// PAGE 7 — ASSETS
// ================================================================
function AssetsTab() {
  const { data: assets } = useFinanceAssets();
  const addA = useAddAsset();
  const delA = useDeleteAsset();

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    asset_name: "", asset_type: "equipment", purchase_date: today, purchase_cost: "",
    useful_life_years: "5", depreciation_method: "straight_line", residual_value: "", notes: "",
  });

  const cost = Number(form.purchase_cost) || 0;
  const life = Math.max(1, Number(form.useful_life_years) || 1);
  const residual = Number(form.residual_value) || 0;
  const annualDep = Math.max(0, (cost - residual) / life);
  const monthlyDep = annualDep / 12;

  const canSave = form.asset_name.trim() && cost > 0 && life > 0 && form.purchase_date;

  const handleSave = () => {
    addA.mutate({
      asset_name: form.asset_name.trim(),
      asset_type: form.asset_type,
      purchase_date: form.purchase_date,
      purchase_cost: toKobo(cost),
      useful_life_years: life,
      depreciation_method: form.depreciation_method,
      residual_value: toKobo(residual),
      is_active: true,
      notes: form.notes?.trim() || null,
    }, {
      onSuccess: () => setForm({ ...form, asset_name: "", purchase_cost: "", residual_value: "", notes: "" }),
    });
  };

  const totalMonthlyDep = sumKobo(assets, "monthly_depreciation");
  const totalCost = sumKobo(assets, "purchase_cost");
  const totalBV = (assets || []).reduce((s, a) => s + bookValue(a), 0);

  // Show depreciation schedule for first selected asset
  const [selId, setSelId] = useState<string>("");
  const selected = (assets || []).find(a => a.id === selId) || (assets || [])[0];

  const schedule = useMemo(() => {
    if (!selected) return [];
    const rows: Array<{ year: number; dep: number; book: number }> = [];
    const residual = selected.residual_value || 0;
    const annual = selected.annual_depreciation || 0;
    const startYear = new Date(selected.purchase_date).getFullYear();
    let bv = selected.purchase_cost;
    for (let y = 0; y < selected.useful_life_years; y++) {
      bv = Math.max(residual, bv - annual);
      rows.push({ year: startYear + y, dep: annual, book: bv });
    }
    return rows;
  }, [selected]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard title="Total Asset Cost" value={fmtNaira(totalCost)} />
        <KpiCard title="Current Book Value" value={fmtNaira(totalBV)} />
        <KpiCard title="Monthly Depreciation" value={fmtNaira(totalMonthlyDep)} subtitle="Feeds into P&L" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={cardCls}>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add asset</h3>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>Asset Name</label>
              <input value={form.asset_name} onChange={e => setForm({ ...form, asset_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Asset Type</label>
              <select value={form.asset_type} onChange={e => setForm({ ...form, asset_type: e.target.value })} className={inputCls}>
                {["equipment","furniture","computer","vehicle","software","other"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Purchase Cost (₦)</label>
              <input type="number" min="0" value={form.purchase_cost} onChange={e => setForm({ ...form, purchase_cost: e.target.value })} className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Useful Life (yrs)</label>
                <input type="number" min="1" value={form.useful_life_years} onChange={e => setForm({ ...form, useful_life_years: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Residual Value (₦)</label>
                <input type="number" min="0" value={form.residual_value} onChange={e => setForm({ ...form, residual_value: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Depreciation Method</label>
              <select value={form.depreciation_method} onChange={e => setForm({ ...form, depreciation_method: e.target.value })} className={inputCls}>
                <option value="straight_line">Straight Line</option>
                <option value="declining_balance">Declining Balance</option>
              </select>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Annual dep:</span><span className="tabular-nums font-semibold">{fmtNaira(toKobo(annualDep))}</span></div>
              <div className="flex justify-between"><span>Monthly dep:</span><span className="tabular-nums font-semibold">{fmtNaira(toKobo(monthlyDep))}</span></div>
            </div>
            <button disabled={!canSave || addA.isPending} onClick={handleSave} className={btnPrimary + " w-full justify-center"}>
              <Save className="w-4 h-4" /> Save asset
            </button>
          </div>
        </div>

        <div className={cardCls + " lg:col-span-2"}>
          <h3 className="font-semibold text-sm mb-3">Asset Register ({assets?.length || 0})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Asset</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2 text-right">Cost</th>
                  <th className="py-2 pr-2 text-center">Life</th>
                  <th className="py-2 pr-2 text-right">Annual</th>
                  <th className="py-2 pr-2 text-right">Monthly</th>
                  <th className="py-2 pr-2 text-right">Book Value</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(assets || []).length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-text-light">No assets recorded</td></tr>
                )}
                {(assets || []).map(a => (
                  <tr key={a.id} onClick={() => setSelId(a.id)} className={`border-b border-border cursor-pointer hover:bg-muted/30 ${selId === a.id ? "bg-forest/5" : ""}`}>
                    <td className="py-1.5 pr-2">{a.asset_name}</td>
                    <td className="py-1.5 pr-2 capitalize">{a.asset_type}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(a.purchase_cost)}</td>
                    <td className="py-1.5 pr-2 text-center">{a.useful_life_years}y</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(a.annual_depreciation)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNaira(a.monthly_depreciation)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{fmtNaira(bookValue(a))}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete asset?")) delA.mutate(a.id); }}
                        className="text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="mt-4">
              <div className={sectionCls}>Depreciation schedule — {selected.asset_name}</div>
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="text-left border-b border-border">
                    <th className="py-1 pr-2">Year</th>
                    <th className="py-1 pr-2 text-right">Depreciation</th>
                    <th className="py-1 pr-2 text-right">Book Value</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(s => (
                    <tr key={s.year} className="border-b border-border/50">
                      <td className="py-1 pr-2">{s.year}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmtNaira(s.dep)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmtNaira(s.book)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// PAGE 8 — SETTINGS
// ================================================================
function SettingsTab() {
  const { data: settings } = useFinanceTaxSettings();
  const upd = useUpdateTaxSettings();
  const [draft, setDraft] = useState<TaxSettings | null>(null);

  // Sync draft
  useMemo(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  if (!draft) {
    return <div className={cardCls}><div className="text-center text-xs text-text-light py-6">Loading settings…</div></div>;
  }

  const save = () => upd.mutate(draft);
  const autoSmall = Number(draft.annual_turnover_threshold) >= 100_000_000_000 /* kobo */ ? true : true; // placeholder
  const setBands = (bands: PayeBand[]) => setDraft({ ...draft, paye_bands: bands });

  const addBand = () => {
    const last = draft.paye_bands[draft.paye_bands.length - 1];
    setBands([...draft.paye_bands, { from: last?.to ?? 0, to: null, rate: 0 }]);
  };

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Company Tax Classification</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-light">Fiscal Year</span>
            <input type="number" value={draft.fiscal_year} onChange={e => setDraft({ ...draft, fiscal_year: Number(e.target.value) })}
              className="border border-border rounded-lg px-2 py-1 text-xs w-24 bg-background" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Company Size</label>
            <select value={draft.company_size} onChange={e => {
              const sz = e.target.value;
              setDraft({ ...draft, company_size: sz, cit_rate: sz === "small" ? 0 : 25, development_levy_rate: sz === "small" ? 0 : 4 });
            }} className={inputCls}>
              <option value="small">Small ({"< ₦100M"})</option>
              <option value="large">Large (≥ ₦100M)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Turnover Threshold (₦)</label>
            <input type="number" value={Number(draft.annual_turnover_threshold) / 100} onChange={e => setDraft({ ...draft, annual_turnover_threshold: ngnToKoboNum(Number(e.target.value)) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CIT Rate (%)</label>
            <input type="number" step="0.01" value={Number(draft.cit_rate)} onChange={e => setDraft({ ...draft, cit_rate: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Development Levy Rate (%)</label>
            <input type="number" step="0.01" value={Number(draft.development_levy_rate)} onChange={e => setDraft({ ...draft, development_levy_rate: Number(e.target.value) })} className={inputCls} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="font-semibold text-sm mb-3">VAT Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.vat_registered} onChange={e => setDraft({ ...draft, vat_registered: e.target.checked })} />
            VAT Registered with FIRS
          </label>
          <div>
            <label className={labelCls}>VAT Rate (%)</label>
            <input type="number" step="0.01" value={Number(draft.vat_rate)} onChange={e => setDraft({ ...draft, vat_rate: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>WHT Goods (%)</label>
            <input type="number" step="0.01" value={Number(draft.wht_rate_goods)} onChange={e => setDraft({ ...draft, wht_rate_goods: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>WHT Services (%)</label>
            <input type="number" step="0.01" value={Number(draft.wht_rate_services)} onChange={e => setDraft({ ...draft, wht_rate_services: Number(e.target.value) })} className={inputCls} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="font-semibold text-sm mb-3">Payroll Rates</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className={labelCls}>Employee Pension (%)</label>
            <input type="number" step="0.01" value={Number(draft.employee_pension_rate)} onChange={e => setDraft({ ...draft, employee_pension_rate: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Employer Pension (%)</label>
            <input type="number" step="0.01" value={Number(draft.employer_pension_rate)} onChange={e => setDraft({ ...draft, employer_pension_rate: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>NHF (%)</label>
            <input type="number" step="0.01" value={Number(draft.nhf_rate)} onChange={e => setDraft({ ...draft, nhf_rate: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>NSITF (%)</label>
            <input type="number" step="0.01" value={Number(draft.nsitf_rate)} onChange={e => setDraft({ ...draft, nsitf_rate: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>ITF (%)</label>
            <input type="number" step="0.01" value={Number(draft.itf_rate)} onChange={e => setDraft({ ...draft, itf_rate: Number(e.target.value) })} className={inputCls} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">PAYE Bands (NTA 2025)</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setBands(NTA_2025_PAYE_BANDS)} className={btnGhost}>Reset to NTA 2025 defaults</button>
            <button onClick={addBand} className={btnGhost}><Plus className="w-3.5 h-3.5" /> Add band</button>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-2">From (₦)</th>
              <th className="py-2 pr-2">To (₦)</th>
              <th className="py-2 pr-2">Rate %</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.paye_bands.map((b, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-1.5 pr-2">
                  <input type="number" value={b.from} onChange={e => {
                    const bands = [...draft.paye_bands];
                    bands[i] = { ...bands[i], from: Number(e.target.value) };
                    setBands(bands);
                  }} className={inputCls} />
                </td>
                <td className="py-1.5 pr-2">
                  <input type="number" value={b.to ?? ""} placeholder="(no cap)" onChange={e => {
                    const bands = [...draft.paye_bands];
                    bands[i] = { ...bands[i], to: e.target.value ? Number(e.target.value) : null };
                    setBands(bands);
                  }} className={inputCls} />
                </td>
                <td className="py-1.5 pr-2">
                  <input type="number" step="0.01" value={b.rate} onChange={e => {
                    const bands = [...draft.paye_bands];
                    bands[i] = { ...bands[i], rate: Number(e.target.value) };
                    setBands(bands);
                  }} className={inputCls} />
                </td>
                <td className="py-1.5 text-right">
                  <button onClick={() => setBands(draft.paye_bands.filter((_, j) => j !== i))}
                    className="text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="font-semibold text-sm mb-3">Remittance Reminders</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className={labelCls}>PAYE reminder</div>
            <div>Default: 8th of month (2 days before deadline)</div>
          </div>
          <div>
            <div className={labelCls}>Pension reminder</div>
            <div>Default: 5 days after payroll run</div>
          </div>
          <div>
            <div className={labelCls}>NSITF reminder</div>
            <div>Default: 14th of month</div>
          </div>
        </div>
        <div className="text-[10px] text-text-light mt-2">Email / in-app toggles coming soon — reminders currently shown on Dashboard + Tax Position pages.</div>
      </div>

      <div className="flex justify-end">
        <button disabled={upd.isPending} onClick={save} className={btnPrimary}>
          <Save className="w-4 h-4" /> {upd.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>

    </div>
  );
}

// ================================================================
// PAGE 9 — COMPLIANCE DEADLINES
// ================================================================

interface ComplianceDeadline {
  id: string;
  name: string;
  description: string | null;
  regulatory_body: string | null;
  due_date: string;
  is_recurring: boolean | null;
  recurrence_months: number | null;
  status: "pending" | "filed" | "overdue" | "not_applicable" | string;
  penalty_description: string | null;
  notes: string | null;
  filed_at: string | null;
  filed_by: string | null;
  created_at?: string;
  updated_at?: string;
}

function fmtDueDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(iso: string): number {
  // Positive = days until due (in the future), negative = days overdue.
  const due = new Date(iso + (iso.includes("T") ? "" : "T00:00:00"));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

const BODY_COLORS: Record<string, string> = {
  CAC: "bg-blue-100 text-blue-700",
  FIRS: "bg-purple-100 text-purple-700",
  LIRS: "bg-emerald-100 text-emerald-700",
  PENCOM: "bg-indigo-100 text-indigo-700",
  NSITF: "bg-amber-100 text-amber-700",
  ITF: "bg-rose-100 text-rose-700",
  NAFDAC: "bg-orange-100 text-orange-700",
  SON: "bg-teal-100 text-teal-700",
};

function ComplianceTab() {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance-compliance-deadlines"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_compliance_deadlines")
        .select("*")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as ComplianceDeadline[];
    },
    staleTime: 30_000,
  });

  const { data: unreadNotifs } = useQuery({
    queryKey: ["finance-compliance-notifications"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_notifications")
        .select("id")
        .eq("type", "compliance_deadline")
        .eq("is_read", false);
      if (error) throw error;
      return (data || []) as Array<{ id: string }>;
    },
    staleTime: 30_000,
  });

  const markFiled = useMutation({
    mutationFn: async (payload: { id: string; filedDate: string; notes: string | null; existingNotes: string | null }) => {
      const { error } = await (supabase as any)
        .from("finance_compliance_deadlines")
        .update({
          status: "filed",
          filed_at: payload.filedDate,
          notes: payload.notes || payload.existingNotes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-compliance-deadlines"] });
      toast.success("Deadline marked as filed.");
    },
    onError: (e: any) => toast.error(e?.message || "Could not mark as filed"),
  });

  const dismissNotifs = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("type", "compliance_deadline")
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-compliance-notifications"] }),
  });

  // Summary counts — derived client-side from the already-fetched list.
  const summary = useMemo(() => {
    const out = { filed: 0, pending: 0, overdue: 0, nextDue: null as string | null };
    let nextTs = Infinity;
    (rows || []).forEach(r => {
      const s = r.status;
      // Compute dynamic overdue on client even if the DB hasn't flipped it yet.
      const days = daysBetween(r.due_date);
      const isOverdueNow = s === "overdue" || (s === "pending" && days < 0);
      if (s === "filed") out.filed += 1;
      if (s === "pending" && !isOverdueNow) out.pending += 1;
      if (isOverdueNow) out.overdue += 1;
      if (s === "pending" && !isOverdueNow) {
        const t = new Date(r.due_date).getTime();
        if (t < nextTs) { nextTs = t; out.nextDue = r.due_date; }
      }
    });
    return out;
  }, [rows]);

  const unreadCount = unreadNotifs?.length || 0;

  return (
    <div className="space-y-4">
      {/* Notifications banner */}
      {unreadCount > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Bell className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-xs text-amber-900">
            You have <b>{unreadCount}</b> compliance reminder{unreadCount === 1 ? "" : "s"} — check your notifications.
          </div>
          <button
            onClick={() => dismissNotifs.mutate()}
            disabled={dismissNotifs.isPending}
            className="text-[11px] font-semibold text-amber-700 hover:underline disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <SummaryPill label="Filed" value={String(summary.filed)} tone="green" />
        <SummaryPill label="Pending" value={String(summary.pending)} tone="amber" />
        <SummaryPill
          label="Overdue"
          value={String(summary.overdue)}
          tone={summary.overdue > 0 ? "red" : "grey"}
        />
        <SummaryPill
          label="Next due"
          value={summary.nextDue ? fmtDueDate(summary.nextDue) : "—"}
          tone="grey"
        />
      </div>

      {isLoading ? (
        <div className="text-center text-xs text-text-light py-8">Loading deadlines…</div>
      ) : !rows || rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <FileCheck className="w-6 h-6 mx-auto text-text-light mb-2" />
          <p className="font-semibold text-sm">No compliance deadlines recorded.</p>
          <p className="text-[11px] text-text-light mt-1">Deadlines are managed by your system administrator.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <ComplianceCard
              key={r.id}
              deadline={r}
              onFile={(filedDate, notes) => markFiled.mutate({ id: r.id, filedDate, notes, existingNotes: r.notes })}
              busy={markFiled.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" | "red" | "grey" }) {
  const toneCls = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red:   "bg-red-50 border-red-200 text-red-700",
    grey:  "bg-muted/50 border-border text-text-med",
  }[tone];
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${toneCls}`}>
      <span className="text-[10px] uppercase tracking-widest font-semibold">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ComplianceCard({ deadline: d, onFile, busy }: {
  deadline: ComplianceDeadline;
  onFile: (filedDate: string, notes: string | null) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filedDate, setFiledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const days = daysBetween(d.due_date);
  const isOverdueNow = d.status === "overdue" || (d.status === "pending" && days < 0);
  const showFile = !open && (d.status === "pending" || isOverdueNow);

  const statusMeta = (() => {
    if (d.status === "filed")          return { cls: "bg-emerald-100 text-emerald-700", label: "Filed" };
    if (d.status === "not_applicable") return { cls: "bg-muted text-text-med",           label: "N/A" };
    if (isOverdueNow)                  return { cls: "bg-red-100 text-red-700",         label: "Overdue" };
    return { cls: "bg-amber-100 text-amber-800", label: "Pending" };
  })();

  const countdown = (() => {
    if (d.status === "filed" || d.status === "not_applicable") return null;
    if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`, cls: "text-red-700 font-bold" };
    if (days === 0) return { text: "TODAY", cls: "text-red-700 font-bold" };
    if (days <= 7) return { text: `in ${days} day${days === 1 ? "" : "s"}`, cls: "text-red-600 font-semibold" };
    if (days <= 30) return { text: `in ${days} days`, cls: "text-amber-600" };
    return { text: `in ${days} days`, cls: "text-text-med" };
  })();

  const bodyCls = d.regulatory_body
    ? (BODY_COLORS[d.regulatory_body] || "bg-muted text-text-med")
    : "bg-muted text-text-med";

  const submit = () => {
    onFile(filedDate || new Date().toISOString().slice(0, 10), notes.trim() || null);
    setOpen(false);
    setNotes("");
  };

  return (
    <article className="bg-card border border-border rounded-xl p-3 md:p-4">
      <div className="flex items-start gap-3 flex-wrap md:flex-nowrap">
        {/* Left block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {d.regulatory_body && (
              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill ${bodyCls}`}>
                {d.regulatory_body}
              </span>
            )}
            {d.is_recurring && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-text-med bg-muted/60 px-1.5 py-0.5 rounded">
                ↻ {d.recurrence_months === 12 ? "Annual" : `Every ${d.recurrence_months}mo`}
              </span>
            )}
          </div>
          <div className="font-semibold text-sm">{d.name}</div>
          {d.description && (
            <p className="text-text-med text-xs mt-0.5 leading-relaxed">{d.description}</p>
          )}
          <div className="text-[11px] text-text-light mt-1">Due: <span className="font-semibold text-text-med">{fmtDueDate(d.due_date)}</span></div>
          {d.penalty_description && (
            <p className="text-[11px] text-amber-700 mt-1">⚠ {d.penalty_description}</p>
          )}
          {d.status === "filed" && d.filed_at && (
            <p className="text-[11px] text-emerald-700 mt-1">✓ Filed on {fmtDueDate(d.filed_at)}{d.notes ? ` — ${d.notes}` : ""}</p>
          )}
        </div>

        {/* Right block: status + countdown + action */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-pill ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
          {countdown && <span className={`text-[11px] ${countdown.cls}`}>{countdown.text}</span>}
          {showFile && (
            <button
              onClick={() => setOpen(true)}
              className="mt-1 inline-flex items-center gap-1 border border-forest/40 text-forest hover:bg-forest/5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
            >
              Mark as Filed
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Filed date</label>
              <input
                type="date"
                value={filedDate}
                onChange={e => setFiledDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Filed via CAC portal, ref #…"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="text-xs text-text-med hover:text-foreground px-3 py-1.5">Cancel</button>
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

