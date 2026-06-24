import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, Search } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

// ── Money / rate formatting ─────────────────────────────────────────────────
// Money is NAIRA (no /100); rates are already percentages.
const naira = (n: unknown) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
const pct = (n: unknown) => (n == null ? "—" : `${(Number(n) || 0).toFixed(2)}%`);
const intf = (n: unknown) => (Number(n) || 0).toLocaleString("en-NG");

// ── Africa/Lagos (UTC+1, no DST) date-range math ────────────────────────────
const LAGOS_OFFSET = "+01:00";
const pad = (n: number) => String(n).padStart(2, "0");

function lagosYmd(d = new Date()): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}
// A Date pinned to Lagos midnight of (today + offsetDays). Safe to shift by
// whole days because Lagos has no DST.
function lagosMidnight(offsetDays = 0): Date {
  const { y, m, day } = lagosYmd();
  const base = new Date(`${y}-${pad(m)}-${pad(day)}T00:00:00${LAGOS_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base;
}
function lagosMonthStart(monthsBack = 0): Date {
  const { y, m } = lagosYmd();
  let yy = y, mm = m - monthsBack;
  while (mm <= 0) { mm += 12; yy -= 1; }
  return new Date(`${yy}-${pad(mm)}-01T00:00:00${LAGOS_OFFSET}`);
}
function lagosYearStart(): Date {
  const { y } = lagosYmd();
  return new Date(`${y}-01-01T00:00:00${LAGOS_OFFSET}`);
}
// Custom date input (YYYY-MM-DD) → Lagos-local instant; +1 day makes the end inclusive.
function lagosDateInput(value: string, addDays = 0): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00${LAGOS_OFFSET}`);
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + addDays);
  return d;
}

type RangeKey = "lifetime" | "today" | "yesterday" | "last7" | "mtd" | "lastmonth" | "ytd" | "custom";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "lifetime", label: "Lifetime" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "mtd", label: "Month to Date" },
  { key: "lastmonth", label: "Last Month" },
  { key: "ytd", label: "Year to Date" },
  { key: "custom", label: "Custom" },
];

function resolveRange(key: RangeKey, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  const now = new Date();
  switch (key) {
    case "lifetime": return { start: null, end: null };
    case "today": return { start: lagosMidnight(0).toISOString(), end: now.toISOString() };
    case "yesterday": return { start: lagosMidnight(-1).toISOString(), end: lagosMidnight(0).toISOString() };
    case "last7": return { start: lagosMidnight(-6).toISOString(), end: now.toISOString() };
    case "mtd": return { start: lagosMonthStart(0).toISOString(), end: now.toISOString() };
    case "lastmonth": return { start: lagosMonthStart(1).toISOString(), end: lagosMonthStart(0).toISOString() };
    case "ytd": return { start: lagosYearStart().toISOString(), end: now.toISOString() };
    case "custom": {
      const s = lagosDateInput(customStart, 0);
      const e = lagosDateInput(customEnd, 1); // inclusive end
      return { start: s ? s.toISOString() : null, end: e ? e.toISOString() : null };
    }
  }
}

const fmtCaption = (iso: string | null, fallback: string) => {
  if (!iso) return fallback;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return fallback; }
};

// ── UI atoms ────────────────────────────────────────────────────────────────
const Kpi = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-card border border-border rounded-xl p-4 text-center">
    <div className="text-lg md:text-xl font-bold text-forest">{value}</div>
    <div className="text-muted-foreground text-[10px] uppercase tracking-wide mt-0.5">{label}</div>
  </div>
);

const Card = ({ title, children, caption }: { title: string; children: React.ReactNode; caption?: string }) => (
  <div className="bg-card border border-border rounded-xl p-5">
    <h3 className="font-bold text-sm mb-1">{title}</h3>
    {caption && <p className="text-[11px] text-muted-foreground mb-3">{caption}</p>}
    {children}
  </div>
);

// ── Product table columns ───────────────────────────────────────────────────
type ColType = "text" | "num" | "pct" | "naira" | "days";
const COLUMNS: { key: string; label: string; type: ColType }[] = [
  { key: "product_name", label: "Product", type: "text" },
  { key: "category", label: "Category", type: "text" },
  { key: "detail_views", label: "Views", type: "num" },
  { key: "add_to_cart", label: "Add to Cart", type: "num" },
  { key: "atc_rate", label: "ATC %", type: "pct" },
  { key: "orders", label: "Orders", type: "num" },
  { key: "units", label: "Units", type: "num" },
  { key: "revenue", label: "Revenue", type: "naira" },
  { key: "asp", label: "ASP", type: "naira" },
  { key: "conversion_rate", label: "Conv %", type: "pct" },
  { key: "cart_to_purchase_rate", label: "Cart→Buy %", type: "pct" },
  { key: "attach_rate", label: "Attach %", type: "pct" },
  { key: "avg_days_to_repurchase", label: "Days to Repurchase", type: "days" },
  { key: "subscription_starts", label: "Sub Starts", type: "num" },
];
const renderCell = (type: ColType, v: unknown) => {
  if (type === "naira") return naira(v);
  if (type === "pct") return pct(v);
  if (type === "days") return v == null ? "—" : `${(Number(v) || 0).toFixed(1)}`;
  if (type === "num") return intf(v);
  return (v as string) || "—";
};

export default function ProductsAnalyticsTab() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("lifetime");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { start, end } = useMemo(() => resolveRange(rangeKey, customStart, customEnd), [rangeKey, customStart, customEnd]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["product-analytics", start, end],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_product_analytics", { p_start: start, p_end: end });
      if (error) throw error;
      return data as any;
    },
  });

  // table state
  const [sortKey, setSortKey] = useState("revenue");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const overview = data?.overview || {};
  const funnel = data?.funnel || {};
  const subs = data?.subscriptions || {};
  const products: any[] = data?.products || [];

  const topRevenue = useMemo(
    () => [...products].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)).slice(0, 10)
      .map((p) => ({ name: p.product_name, revenue: Number(p.revenue) || 0 })),
    [products],
  );
  const topAtc = useMemo(
    () => products.filter((p) => (Number(p.detail_views) || 0) >= 20)
      .sort((a, b) => (Number(b.atc_rate) || 0) - (Number(a.atc_rate) || 0)).slice(0, 10)
      .map((p) => ({ name: p.product_name, atc_rate: Number(p.atc_rate) || 0 })),
    [products],
  );

  const filteredSorted = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = s ? products.filter((p) => String(p.product_name || "").toLowerCase().includes(s) || String(p.category || "").toLowerCase().includes(s)) : products;
    const col = COLUMNS.find((c) => c.key === sortKey);
    const numeric = col && col.type !== "text";
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (numeric) {
        const an = av == null ? -Infinity : Number(av);
        const bn = bv == null ? -Infinity : Number(bv);
        return sortAsc ? an - bn : bn - an;
      }
      const as = String(av || ""), bs = String(bv || "");
      return sortAsc ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [products, search, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const rangeCaption = start
    ? `${fmtCaption(start, "")} → ${end ? fmtCaption(end, "now") : "now"} · Africa/Lagos`
    : "All time (lifetime)";

  return (
    <div className="space-y-6">
      {/* 1) Date range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-forest">Product Analytics</h2>
          <p className="text-[11px] text-muted-foreground">{rangeCaption}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {rangeKey === "custom" && (
            <>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-auto text-sm" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-auto text-sm" />
            </>
          )}
        </div>
      </div>

      {isError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          Couldn’t load product analytics. Try a different range or reload.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* 2) Snapshot overview */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Kpi label="Orders" value={intf(overview.orders)} />
            <Kpi label="Units Sold" value={intf(overview.units_sold)} />
            <Kpi label="Revenue" value={naira(overview.revenue)} />
            <Kpi label="Avg Selling Price" value={naira(overview.avg_selling_price)} />
            <Kpi label="Conversion Rate" value={pct(overview.product_conversion_rate)} />
            <Kpi label="Add-to-Cart Rate" value={pct(overview.add_to_cart_rate)} />
          </div>

          {/* 3) Conversion funnel */}
          <Card title="Conversion Funnel" caption="Storefront-wide — checkout/session events are cart-level, not per-product.">
            <Funnel funnel={funnel} />
          </Card>

          {/* 4) Subscriptions strip */}
          <div className="relative">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Subscription Starts" value={intf(subs.subscription_starts)} />
              <Kpi label="Active Subscriptions" value={intf(subs.active_subscriptions)} />
              <Kpi label="Churned (period)" value={intf(subs.churned_in_period)} />
              <Kpi label="Churn Rate" value={pct(subs.churn_rate)} />
            </div>
            {subs.has_active === false && (
              <div className="absolute inset-0 rounded-xl bg-warm-cream/70 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                <span className="text-xs font-semibold text-text-med bg-card border border-border rounded-full px-3 py-1 shadow-sm">
                  No active subscriptions yet
                </span>
              </div>
            )}
          </div>

          {/* 5) Graphs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Top 10 Products by Revenue">
              {topRevenue.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={topRevenue} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                    <Tooltip formatter={(v: number) => naira(v)} />
                    <Bar dataKey="revenue" fill="#2D6A4F" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Top 10 by Add-to-Cart Rate" caption="Min 20 product views to qualify — surfaces high-intent products.">
              {topAtc.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Not enough view data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={topAtc} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                    <Tooltip formatter={(v: number) => `${(Number(v) || 0).toFixed(2)}%`} />
                    <Bar dataKey="atc_rate" fill="#F4845F" radius={[0, 4, 4, 0]}>
                      {topAtc.map((_, i) => <Cell key={i} fill="#F4845F" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* 6) Product performance table */}
          <Card title="Product Performance">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or category" className="h-9 pl-8 text-sm" />
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {filteredSorted.length} of {products.length} products
              </span>
            </div>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No product data in this range.</p>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                    <tr className="text-left">
                      {COLUMNS.map((c) => (
                        <th
                          key={c.key}
                          onClick={() => toggleSort(c.key)}
                          className={`py-2 px-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-forest ${c.type !== "text" ? "text-right" : ""}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
                            {sortKey === c.key && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSorted.map((p, idx) => (
                      <tr key={p.product_id || idx} className="border-t border-border/50 hover:bg-muted/20">
                        {COLUMNS.map((c) => (
                          <td key={c.key} className={`py-2 px-3 whitespace-nowrap ${c.type !== "text" ? "text-right tabular-nums" : "font-medium"} ${c.key === "revenue" ? "text-forest font-semibold" : ""}`}>
                            {renderCell(c.type, p[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// Horizontal funnel — proportional bars + step rates.
function Funnel({ funnel }: { funnel: any }) {
  const stages = [
    { label: "Product Views", value: Number(funnel.detail_views) || 0 },
    { label: "Add to Cart", value: Number(funnel.add_to_cart) || 0, rateLabel: "ATC Rate", rate: funnel.atc_rate },
    { label: "Checkout Started", value: Number(funnel.checkout_started) || 0, rateLabel: "Checkout Rate", rate: funnel.checkout_rate },
    { label: "Purchased", value: Number(funnel.purchased) || 0, rateLabel: "Purchase Rate", rate: funnel.purchase_rate },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-3">
      {stages.map((s, i) => (
        <div key={s.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-text-med">{s.label}</span>
            <span className="font-bold">{intf(s.value)}</span>
          </div>
          <div className="h-6 rounded-md bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-md"
              style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: i === 3 ? "#2D6A4F" : "#F4845F" }}
            />
          </div>
          {s.rateLabel && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {s.rateLabel}: <span className="font-semibold text-text-med">{pct(s.rate)}</span> from previous step
            </div>
          )}
        </div>
      ))}
      <div className="pt-1 text-xs">
        Buy-to-Detail Rate: <span className="font-bold text-forest">{pct(funnel.buy_to_detail_rate)}</span>
        <span className="text-muted-foreground"> (purchases ÷ product views)</span>
      </div>
    </div>
  );
}
