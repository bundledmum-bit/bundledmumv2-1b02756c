import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, ChevronDown, ChevronRight, Download, AlertCircle,
} from "lucide-react";

// Currency formatter — matches AdminOrders.tsx so the two pages feel
// like siblings. All values from the views are in naira (not kobo).
const fmt = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "₦0";

// Signed money for margin/profit cells — adds an explicit minus and
// keeps "₦0" instead of an empty cell when the value rounds to zero.
const fmtSigned = (n: number | null | undefined) => {
  if (typeof n !== "number" || !isFinite(n)) return "₦0";
  const r = Math.round(n);
  if (r < 0) return `-₦${Math.abs(r).toLocaleString()}`;
  return `₦${r.toLocaleString()}`;
};

const fmtPct = (n: number | null | undefined) => {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
};

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  refunded: "bg-orange-100 text-orange-700",
  cancelled: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

// Date-range presets — value is { since, until } ISO strings. `null`
// means "no upper bound".
function rangePreset(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  return { since: since.toISOString(), until: until.toISOString() };
}

const DATE_PRESETS = [
  { key: "7d", label: "Last 7 days", get: () => rangePreset(7) },
  { key: "30d", label: "Last 30 days", get: () => rangePreset(30) },
  { key: "90d", label: "Last 90 days", get: () => rangePreset(90) },
  { key: "365d", label: "Last 12 months", get: () => rangePreset(365) },
  { key: "all", label: "All time", get: () => ({ since: "", until: "" }) },
];

const PAGE_SIZE = 25;

type OrderRow = {
  order_id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string;
  payment_status: string | null;
  order_status: string | null;
  gross_revenue: number | null;
  refund_amount: number | null;
  net_revenue: number | null;
  items_cogs: number | null;
  delivery_cost: number | null;
  paystack_fee: number | null;
  packaging_cost: number | null;
  gross_margin: number | null;
  gross_margin_pct: number | null;
  cash_profit: number | null;
  cash_profit_pct: number | null;
  cogs_quality_pct: number | null;
};

type ItemRow = {
  order_id: string;
  order_item_id: string;
  product_name: string | null;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number | null;
  cost_price: number | null;
  line_revenue: number | null;
  line_cost: number | null;
  line_margin: number | null;
  line_margin_pct: number | null;
  item_created_at: string;
};

type SortKey =
  | "recent"
  | "cash_profit_desc"
  | "cash_profit_asc"
  | "revenue_desc"
  | "margin_pct_asc";

export default function AdminProfitPerOrder() {
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("paid");
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const range = useMemo(
    () => DATE_PRESETS.find((p) => p.key === datePreset)!.get(),
    [datePreset],
  );

  // ── Main list query ──────────────────────────────────────────────
  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ["admin-profit-per-order", { paymentFilter, range, sortKey, search, page }],
    queryFn: async () => {
      let q = (supabase as any)
        .from("admin_order_profit_view")
        .select("*", { count: "exact" });

      if (paymentFilter !== "all") q = q.eq("payment_status", paymentFilter);
      if (range.since) q = q.gte("created_at", range.since);
      if (range.until) q = q.lte("created_at", range.until);
      const s = search.trim();
      if (s.length >= 2) {
        // Postgrest .or with comma-separated filters. ilike uses %.
        const esc = s.replace(/[%_,]/g, "");
        q = q.or(`order_number.ilike.%${esc}%,customer_name.ilike.%${esc}%`);
      }

      // Sort
      switch (sortKey) {
        case "cash_profit_desc": q = q.order("cash_profit", { ascending: false, nullsFirst: false }); break;
        case "cash_profit_asc":  q = q.order("cash_profit", { ascending: true, nullsFirst: false }); break;
        case "revenue_desc":     q = q.order("gross_revenue", { ascending: false, nullsFirst: false }); break;
        case "margin_pct_asc":   q = q.order("gross_margin_pct", { ascending: true, nullsFirst: false }); break;
        case "recent":
        default:                 q = q.order("created_at", { ascending: false });
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data || []) as OrderRow[], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  // ── Aggregate summary — sums the SAME filter set, full set (not
  // paginated), so the cards reflect what the table is filtered to.
  const { data: aggregates } = useQuery({
    queryKey: ["admin-profit-per-order-agg", { paymentFilter, range, search }],
    queryFn: async () => {
      let q = (supabase as any)
        .from("admin_order_profit_view")
        .select("gross_revenue, net_revenue, items_cogs, delivery_cost, paystack_fee, packaging_cost, cash_profit");
      if (paymentFilter !== "all") q = q.eq("payment_status", paymentFilter);
      if (range.since) q = q.gte("created_at", range.since);
      if (range.until) q = q.lte("created_at", range.until);
      const s = search.trim();
      if (s.length >= 2) {
        const esc = s.replace(/[%_,]/g, "");
        q = q.or(`order_number.ilike.%${esc}%,customer_name.ilike.%${esc}%`);
      }
      const { data, error } = await q.limit(10_000);
      if (error) throw error;
      const rows = (data || []) as Partial<OrderRow>[];
      const sum = (k: keyof OrderRow) =>
        rows.reduce((acc, r) => acc + (Number((r as any)[k]) || 0), 0);
      const revenue = sum("net_revenue");
      const cash = sum("cash_profit");
      return {
        revenue,
        cogs: sum("items_cogs"),
        delivery: sum("delivery_cost"),
        otherCosts: sum("paystack_fee") + sum("packaging_cost"),
        cash,
        cashPct: revenue > 0 ? (cash / revenue) * 100 : 0,
        count: rows.length,
      };
    },
    staleTime: 30_000,
  });

  // ── Expanded items query (cached per order) ──────────────────────
  const { data: expandedItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["admin-profit-per-order-items", expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const { data, error } = await (supabase as any)
        .from("admin_order_item_profit_view")
        .select("*")
        .eq("order_id", expandedId)
        .order("item_created_at");
      if (error) throw error;
      return (data || []) as ItemRow[];
    },
    enabled: !!expandedId,
    staleTime: 60_000,
  });

  const totalCount = pageData?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);

  // ── CSV export — current filter, ignores pagination ──────────────
  const handleExport = async () => {
    let q = (supabase as any)
      .from("admin_order_profit_view")
      .select("order_number, created_at, customer_name, payment_status, gross_revenue, refund_amount, net_revenue, items_cogs, delivery_cost, paystack_fee, packaging_cost, gross_margin, gross_margin_pct, cash_profit, cash_profit_pct, cogs_quality_pct");
    if (paymentFilter !== "all") q = q.eq("payment_status", paymentFilter);
    if (range.since) q = q.gte("created_at", range.since);
    if (range.until) q = q.lte("created_at", range.until);
    const s = search.trim();
    if (s.length >= 2) {
      const esc = s.replace(/[%_,]/g, "");
      q = q.or(`order_number.ilike.%${esc}%,customer_name.ilike.%${esc}%`);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(10_000);
    if (error) { alert(error.message); return; }
    const rows = (data || []) as OrderRow[];
    const headers = [
      "Order #", "Date", "Customer", "Payment", "Gross Revenue", "Refund",
      "Net Revenue", "Items COGS", "Delivery Cost", "Paystack Fee",
      "Packaging", "Gross Margin", "Margin %", "Cash Profit", "Cash %",
      "COGS Quality %",
    ];
    const escape = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map(r => [
        r.order_number, r.created_at, r.customer_name, r.payment_status,
        r.gross_revenue, r.refund_amount, r.net_revenue, r.items_cogs,
        r.delivery_cost, r.paystack_fee, r.packaging_cost,
        r.gross_margin, r.gross_margin_pct,
        r.cash_profit, r.cash_profit_pct, r.cogs_quality_pct,
      ].map(escape).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-per-order-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Profit per Order</h1>
          <p className="text-xs sm:text-sm text-text-med mt-1">
            Per-order P&amp;L showing what each customer's money becomes after costs.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <section className="bg-card border border-border rounded-xl p-3 sm:p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-text-med block mb-1">Date range</label>
            <select
              value={datePreset}
              onChange={(e) => { setDatePreset(e.target.value); setPage(0); }}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-text-med block mb-1">Payment status</label>
            <select
              value={paymentFilter}
              onChange={(e) => { setPaymentFilter(e.target.value); setPage(0); }}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-text-med block mb-1">Sort</label>
            <select
              value={sortKey}
              onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(0); }}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="recent">Most recent</option>
              <option value="cash_profit_desc">Highest cash profit</option>
              <option value="cash_profit_asc">Lowest cash profit</option>
              <option value="revenue_desc">Highest revenue</option>
              <option value="margin_pct_asc">Lowest margin %</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-text-med block mb-1">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Order # or customer"
                className="w-full border border-input rounded-lg pl-8 pr-3 py-2 text-sm bg-background"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Aggregate cards */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <AggCard label="Revenue" value={fmt(aggregates?.revenue)} sub={`${aggregates?.count ?? 0} orders`} />
        <AggCard label="COGS" value={fmt(aggregates?.cogs)} />
        <AggCard label="Delivery cost" value={fmt(aggregates?.delivery)} />
        <AggCard label="Paystack + Packaging" value={fmt(aggregates?.otherCosts)} />
        <AggCard
          label="Cash profit"
          value={fmtSigned(aggregates?.cash)}
          sub={fmtPct(aggregates?.cashPct)}
          tone={(aggregates?.cash ?? 0) >= 0 ? "positive" : "negative"}
        />
      </section>

      {/* Table */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-muted/40 text-[11px] font-semibold text-text-med uppercase tracking-wide">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="text-left px-2 py-2">Order / Customer</th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-right px-2 py-2">Revenue</th>
                <th className="text-right px-2 py-2">COGS</th>
                <th className="text-right px-2 py-2">Delivery</th>
                <th className="text-right px-2 py-2">Other</th>
                <th className="text-right px-2 py-2">Gross margin</th>
                <th className="text-right px-2 py-2">Cash profit</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="text-center py-10 text-xs text-text-med">Loading…</td></tr>
              )}
              {error && (
                <tr><td colSpan={10} className="text-center py-10 text-xs text-red-600">
                  Could not load orders: {(error as any).message}
                </td></tr>
              )}
              {!isLoading && !error && (pageData?.rows || []).length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-xs text-text-med">
                  No orders match the current filters.
                </td></tr>
              )}
              {(pageData?.rows || []).map((r) => {
                const isCancelled = r.payment_status === "cancelled" || r.order_status === "cancelled";
                const isRefunded = r.payment_status === "refunded" || (r.refund_amount || 0) > 0;
                const isExpanded = expandedId === r.order_id;
                const cashTone =
                  (r.cash_profit || 0) > 0 ? "text-green-700"
                  : (r.cash_profit || 0) < 0 ? "text-red-700"
                  : "text-yellow-700";
                return (
                  <RowGroup
                    key={r.order_id}
                    row={r}
                    isExpanded={isExpanded}
                    isCancelled={isCancelled}
                    isRefunded={isRefunded}
                    cashTone={cashTone}
                    items={isExpanded ? (expandedItems || []) : []}
                    itemsLoading={isExpanded && itemsLoading}
                    onToggle={() => setExpandedId(isExpanded ? null : r.order_id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
          <span className="text-text-med">
            {totalCount === 0 ? "0 orders" : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={pageSafe === 0}
              onClick={() => setPage(Math.max(0, pageSafe - 1))}
              className="px-3 py-1.5 border border-border rounded text-xs font-semibold hover:bg-muted disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-text-med">Page {pageSafe + 1} of {pageCount}</span>
            <button
              disabled={pageSafe >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, pageSafe + 1))}
              className="px-3 py-1.5 border border-border rounded text-xs font-semibold hover:bg-muted disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function AggCard({
  label, value, sub, tone,
}: {
  label: string; value: string; sub?: string; tone?: "positive" | "negative";
}) {
  const valTone =
    tone === "positive" ? "text-green-700"
    : tone === "negative" ? "text-red-700"
    : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="text-[11px] font-semibold text-text-med uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-base sm:text-lg font-bold ${valTone}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-med mt-0.5">{sub}</div>}
    </div>
  );
}

function RowGroup({
  row, isExpanded, isCancelled, isRefunded, cashTone, items, itemsLoading, onToggle,
}: {
  row: OrderRow;
  isExpanded: boolean;
  isCancelled: boolean;
  isRefunded: boolean;
  cashTone: string;
  items: ItemRow[];
  itemsLoading: boolean;
  onToggle: () => void;
}) {
  const rowDim = isCancelled ? "opacity-50" : "";
  return (
    <>
      <tr className={`border-t border-border ${rowDim}`}>
        <td className="px-2 py-2 align-top">
          <button
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="p-1 rounded hover:bg-muted"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-2 py-2 align-top">
          <RouterLink
            to={`/admin/orders?search=${encodeURIComponent(row.order_number)}`}
            className="font-semibold text-forest hover:underline"
          >
            {row.order_number}
          </RouterLink>
          <div className="text-[11px] text-text-med truncate max-w-[180px]" title={row.customer_name || ""}>
            {row.customer_name || "—"}
          </div>
        </td>
        <td className="px-2 py-2 align-top text-xs text-text-med whitespace-nowrap">
          {new Date(row.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
        </td>
        <td className="px-2 py-2 align-top">
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_BADGE[row.payment_status || ""] || "bg-gray-100 text-gray-700"}`}>
              {row.payment_status || "—"}
            </span>
            <CogsQualityDot pct={row.cogs_quality_pct} />
          </div>
        </td>
        <td className="px-2 py-2 align-top text-right tabular-nums">
          {isRefunded && (row.gross_revenue || 0) !== (row.net_revenue || 0) ? (
            <>
              <div className="font-semibold">{fmt(row.net_revenue)}</div>
              <div className="text-[11px] text-text-light line-through">{fmt(row.gross_revenue)}</div>
            </>
          ) : (
            <div className="font-semibold">{fmt(row.gross_revenue)}</div>
          )}
        </td>
        <td className="px-2 py-2 align-top text-right tabular-nums">{fmt(row.items_cogs)}</td>
        <td className="px-2 py-2 align-top text-right tabular-nums">{fmt(row.delivery_cost)}</td>
        <td className="px-2 py-2 align-top text-right tabular-nums">{fmt((row.paystack_fee || 0) + (row.packaging_cost || 0))}</td>
        <td className="px-2 py-2 align-top text-right tabular-nums">
          <div className="font-semibold">{fmt(row.gross_margin)}</div>
          <div className="text-[11px] text-text-med">{fmtPct(row.gross_margin_pct)}</div>
        </td>
        <td className={`px-2 py-2 align-top text-right tabular-nums ${cashTone} ${isCancelled ? "line-through" : ""}`}>
          <div className="font-bold">{fmtSigned(row.cash_profit)}</div>
          <div className="text-[11px] opacity-80">{fmtPct(row.cash_profit_pct)}</div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/20">
          <td></td>
          <td colSpan={9} className="px-2 py-3">
            {itemsLoading ? (
              <div className="text-xs text-text-med text-center py-3">Loading items…</div>
            ) : items.length === 0 ? (
              <div className="text-xs text-text-med text-center py-3">No items on this order.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] font-semibold text-text-med uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-2 py-1">Product / Brand</th>
                      <th className="text-left px-2 py-1">Variant</th>
                      <th className="text-center px-2 py-1">Qty</th>
                      <th className="text-right px-2 py-1">Unit price</th>
                      <th className="text-right px-2 py-1">Cost price</th>
                      <th className="text-right px-2 py-1">Line revenue</th>
                      <th className="text-right px-2 py-1">Line cost</th>
                      <th className="text-right px-2 py-1">Line margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const noCost = !it.cost_price || it.cost_price <= 0;
                      const variant = [it.size && `Size: ${it.size}`, it.color && `Colour: ${it.color}`]
                        .filter(Boolean).join(" · ");
                      return (
                        <tr key={it.order_item_id} className="border-t border-border/60">
                          <td className="px-2 py-1.5">
                            <div className="font-semibold">{it.product_name || "—"}</div>
                            {it.brand_name && <div className="text-[10px] text-text-med">{it.brand_name}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-text-med">{variant || "—"}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">×{it.quantity}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(it.unit_price)}</td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums ${noCost ? "bg-yellow-50 text-yellow-800" : ""}`}
                            title={noCost ? "No cost captured" : undefined}
                          >
                            {noCost ? (
                              <span className="inline-flex items-center gap-1 justify-end">
                                <AlertCircle className="w-3 h-3" /> {fmt(0)}
                              </span>
                            ) : fmt(it.cost_price)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(it.line_revenue)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(it.line_cost)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            <div className="font-semibold">{fmtSigned(it.line_margin)}</div>
                            <div className="text-[10px] text-text-med">{fmtPct(it.line_margin_pct)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CogsQualityDot({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  const v = Number(pct);
  if (v >= 100) return <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="All items have cost captured" />;
  if (v >= 80) return (
    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title={`Some items missing cost price (${v.toFixed(0)}% captured)`} />
  );
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-red-500" title={`Most items missing cost price (${v.toFixed(0)}% captured) — profit estimate unreliable`} />
  );
}
