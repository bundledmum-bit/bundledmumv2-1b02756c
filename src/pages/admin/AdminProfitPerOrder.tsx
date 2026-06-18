import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, ChevronDown, ChevronRight, Download, AlertCircle, Plus, Trash2, Loader2, HelpCircle, Info, Check,
} from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Free-text category options for manual extra costs (no DB constraint —
// just the dropdown choices). Value stored as-is; label shown in UI.
const EXTRA_COST_CATEGORIES: { value: string; label: string }[] = [
  { value: "delivery_overage", label: "Delivery overage" },
  { value: "replacement", label: "Replacement" },
  { value: "packaging", label: "Packaging" },
  { value: "compensation", label: "Compensation" },
  { value: "other", label: "Other" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EXTRA_COST_CATEGORIES.map((c) => [c.value, c.label]),
);

// Currency formatter — all values from order_profit_summary are in naira
// (integers). Never divide by 100.
const fmt = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "₦0";

// Signed money for profit cells — explicit minus, keeps "₦0" for zero.
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

// Order-level row — sourced from the refund-aware order_profit_summary
// view. All money columns are naira integers.
type OrderRow = {
  order_id: string;
  order_number: string;
  order_status: string | null;
  payment_status: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string;
  total: number | null;
  total_cogs: number | null;
  gross_profit_pre_cogs: number | null;
  profit_as_ordered: number | null;       // true profit before refunds
  refunded_units: number | null;
  refunded_lines: number | null;
  refunded_revenue: number | null;
  refunded_profit_removed: number | null;
  refund_adjusted_profit: number | null;   // profit after refunds, before extras
  extra_costs_total: number | null;        // sum of non-deleted manual extras
  net_profit: number | null;               // headline: refund_adjusted_profit − extras
  has_refund: boolean | null;
};

// Line-item detail still comes from the existing per-item view — the
// order-level profit is the only thing that moved to the refund-aware view.
type ItemRow = {
  order_id: string;
  item_id: string;
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
  | "profit_desc"
  | "profit_asc"
  | "revenue_desc";

// Refunded units are stored numeric; surface as a whole item count.
const fmtUnits = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  return Math.round(v);
};

export default function AdminProfitPerOrder() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("paid");
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [page, setPage] = useState(0);

  // After any extra-cost insert/soft-delete, force the view-backed
  // queries to re-read so the recomputed net_profit/extra_costs_total flow
  // through the row + aggregate cards. The view IS the calculation.
  const refreshProfitData = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-profit-per-order"] });
    queryClient.invalidateQueries({ queryKey: ["admin-profit-per-order-agg"] });
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const range = useMemo(
    () => DATE_PRESETS.find((p) => p.key === datePreset)!.get(),
    [datePreset],
  );

  // ── Main list query (refund-aware view) ──────────────────────────
  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ["admin-profit-per-order", { paymentFilter, range, sortKey, search, page }],
    queryFn: async () => {
      let q = (supabase as any)
        .from("order_profit_summary")
        .select("*", { count: "exact" });

      if (paymentFilter !== "all") q = q.eq("payment_status", paymentFilter);
      if (range.since) q = q.gte("created_at", range.since);
      if (range.until) q = q.lte("created_at", range.until);
      const s = search.trim();
      if (s.length >= 2) {
        const esc = s.replace(/[%_,]/g, "");
        q = q.or(`order_number.ilike.%${esc}%,customer_name.ilike.%${esc}%`);
      }

      // Sort — all profit sorting is on the refund-adjusted figure.
      switch (sortKey) {
        case "profit_desc": q = q.order("net_profit", { ascending: false, nullsFirst: false }); break;
        case "profit_asc":  q = q.order("net_profit", { ascending: true, nullsFirst: false }); break;
        case "revenue_desc": q = q.order("total", { ascending: false, nullsFirst: false }); break;
        case "recent":
        default:            q = q.order("created_at", { ascending: false });
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data || []) as OrderRow[], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  // ── Aggregate summary — refund-aware. Sums the SAME filter set across
  // the full (non-paginated) result so the cards reflect the filters.
  const { data: aggregates } = useQuery({
    queryKey: ["admin-profit-per-order-agg", { paymentFilter, range, search }],
    queryFn: async () => {
      let q = (supabase as any)
        .from("order_profit_summary")
        .select("total, total_cogs, extra_costs_total, profit_as_ordered, refunded_revenue, refund_adjusted_profit, net_profit");
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
      const revenue = sum("total");
      const refundAdjusted = sum("refund_adjusted_profit");
      const net = sum("net_profit");
      return {
        revenue,
        // total_cogs (sum of order_items.line_cost) + extra_costs_total
        // (sum of order_extra_costs) are exposed by the view again.
        cogs: sum("total_cogs"),
        profitAsOrdered: sum("profit_as_ordered"),
        refunded: sum("refunded_revenue"),
        refundAdjusted,
        extras: sum("extra_costs_total"),
        net,
        netPct: revenue > 0 ? (net / revenue) * 100 : 0,
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
      .from("order_profit_summary")
      .select("order_number, created_at, customer_name, payment_status, total, total_cogs, extra_costs_total, profit_as_ordered, refunded_units, refunded_lines, refunded_revenue, refunded_profit_removed, refund_adjusted_profit, has_refund, net_profit");
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
      "Order #", "Date", "Customer", "Payment", "Revenue",
      "COGS (₦)", "Extra Costs (₦)",
      "Profit (as ordered)", "Refunded Units",
      "Refunded Lines", "Refunded Revenue", "Refunded Profit Removed",
      "Refund-Adjusted Profit", "Has Refund", "Net Profit",
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
        r.total, r.total_cogs, r.extra_costs_total, r.profit_as_ordered,
        r.refunded_units, r.refunded_lines, r.refunded_revenue,
        r.refunded_profit_removed, r.refund_adjusted_profit, r.has_refund,
        r.net_profit,
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
            Per-order profit after all costs: product COGS, delivery, payment fees, packaging, and any extra order costs (overages, materials). Refund-adjusted.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <option value="profit_desc">Highest profit</option>
              <option value="profit_asc">Lowest profit</option>
              <option value="revenue_desc">Highest revenue</option>
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

      {/* Aggregate cards — refund-aware + extra costs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <AggCard label="Revenue" value={fmt(aggregates?.revenue)} sub={`${aggregates?.count ?? 0} orders`} />
        <AggCard label="COGS" value={fmt(aggregates?.cogs)} sub={`${aggregates?.count ?? 0} orders`} />
        <AggCard label="Refunded revenue" value={fmt(aggregates?.refunded)} />
        <AggCard label="Total extras" value={fmt(aggregates?.extras)} sub={`${aggregates?.count ?? 0} orders`} />
        <AggCard label="Profit before refunds" value={fmtSigned(aggregates?.profitAsOrdered)} />
        <AggCard
          label="Net profit"
          value={fmtSigned(aggregates?.net)}
          sub={fmtPct(aggregates?.netPct)}
          note={`Refund-adj: ${fmtSigned(aggregates?.refundAdjusted)}`}
          tone={(aggregates?.net ?? 0) >= 0 ? "positive" : "negative"}
        />
      </section>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 mb-4">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Profit figures include all extra order costs (delivery overages, packaging materials, etc.). Figures in individual order detail views show gross margin before these extras.
        </span>
      </div>

      {/* Table */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-muted/40 text-[11px] font-semibold text-text-med uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="text-left px-2 py-2">Order / Customer</th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-right px-2 py-2">Revenue</th>
                <th className="text-right px-2 py-2">COGS</th>
                <th className="text-right px-2 py-2">
                  <div className="flex items-center justify-end gap-1">
                    Profit
                    <Tooltip>
                      <TooltipTrigger className="inline-flex items-center justify-center h-5 w-5 -my-1">
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs normal-case font-normal tracking-normal">
                        Profit after deducting product cost, delivery, payment fees, packaging, and extra order costs (e.g. delivery overages, materials). More complete than the gross margin shown in order detail views.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-10 text-xs text-text-med">Loading…</td></tr>
              )}
              {error && (
                <tr><td colSpan={7} className="text-center py-10 text-xs text-red-600">
                  Could not load orders: {(error as any).message}
                </td></tr>
              )}
              {!isLoading && !error && (pageData?.rows || []).length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-xs text-text-med">
                  No orders match the current filters.
                </td></tr>
              )}
              {(pageData?.rows || []).map((r) => {
                const isCancelled = r.payment_status === "cancelled" || r.order_status === "cancelled";
                const isExpanded = expandedId === r.order_id;
                const profitTone =
                  (r.net_profit || 0) > 0 ? "text-green-700"
                  : (r.net_profit || 0) < 0 ? "text-red-700"
                  : "text-yellow-700";
                return (
                  <RowGroup
                    key={r.order_id}
                    row={r}
                    isExpanded={isExpanded}
                    isCancelled={isCancelled}
                    profitTone={profitTone}
                    items={isExpanded ? (expandedItems || []) : []}
                    itemsLoading={isExpanded && itemsLoading}
                    onToggle={() => setExpandedId(isExpanded ? null : r.order_id)}
                    onCostsChanged={refreshProfitData}
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
  label, value, sub, note, tone,
}: {
  label: string; value: string; sub?: string; note?: string; tone?: "positive" | "negative";
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
      {note && <div className="text-[10px] text-text-light mt-0.5">{note}</div>}
    </div>
  );
}

function RowGroup({
  row, isExpanded, isCancelled, profitTone, items, itemsLoading, onToggle, onCostsChanged,
}: {
  row: OrderRow;
  isExpanded: boolean;
  isCancelled: boolean;
  profitTone: string;
  items: ItemRow[];
  itemsLoading: boolean;
  onToggle: () => void;
  onCostsChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { adminUser } = usePermissions();
  const isAdmin = ["super_admin", "admin"].includes(String(adminUser?.role || "").trim().toLowerCase());

  // Update the edited line (from the set_order_item_cost RPC return) and refresh
  // the order's profit headline from the server — one round trip, no reload.
  const handleItemSaved = (data: any) => {
    queryClient.setQueryData(["admin-profit-per-order-items", row.order_id], (old: ItemRow[] | undefined) =>
      (old || []).map((i) =>
        i.item_id === data.item_id
          ? {
              ...i,
              cost_price: data.cost_price,
              line_cost: data.line_cost,
              line_margin: data.line_margin,
              line_margin_pct: Number(data.line_total) > 0 ? (Number(data.line_margin) / Number(data.line_total)) * 100 : null,
            }
          : i,
      ),
    );
    onCostsChanged(); // re-read net_profit / total_cogs from order_profit_summary
  };

  const someLineNoCost = (items || []).some((i) => !i.cost_price || i.cost_price <= 0);

  const rowDim = isCancelled ? "opacity-50" : "";
  const hasRefund = row.has_refund === true;
  // Partial refunds now stay payment_status='paid' (DB fix). That pairing
  // is the signal for "some items refunded" — distinct from a full refund.
  const partialRefund = hasRefund && row.payment_status === "paid";
  const netRevenue = (row.total || 0) - (row.refunded_revenue || 0);
  const hasExtras = (row.extra_costs_total || 0) > 0;
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
          <div className="flex flex-col items-start gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_BADGE[row.payment_status || ""] || "bg-gray-100 text-gray-700"}`}>
              {row.payment_status || "—"}
            </span>
            {partialRefund && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 whitespace-nowrap">
                {fmtUnits(row.refunded_units)} item{fmtUnits(row.refunded_units) === 1 ? "" : "s"} refunded
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 align-top text-right tabular-nums">
          {hasRefund && (row.refunded_revenue || 0) > 0 ? (
            <>
              <div className="font-semibold">{fmt(netRevenue)}</div>
              <div className="text-[11px] text-text-light line-through">{fmt(row.total)}</div>
            </>
          ) : (
            <div className="font-semibold">{fmt(row.total)}</div>
          )}
        </td>
        <td className="px-2 py-2 align-top text-right tabular-nums">
          {(row.total_cogs || 0) > 0 ? fmt(row.total_cogs) : <span className="text-text-light" title="Not recorded">—</span>}
        </td>
        <td className={`px-2 py-2 align-top text-right tabular-nums ${profitTone} ${isCancelled ? "line-through" : ""}`}>
          <div className="font-bold">{fmtSigned(row.net_profit)}</div>
          {hasExtras && (
            <div className="text-[11px] text-text-light" title="Refund-adjusted profit minus manual extra costs">
              RA: {fmtSigned(row.refund_adjusted_profit)} · Extras: −{fmt(row.extra_costs_total)}
            </div>
          )}
          {hasRefund && (
            <div className="text-[11px] text-text-light line-through" title="Profit before refunds">
              {fmtSigned(row.profit_as_ordered)}
            </div>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/20">
          <td></td>
          <td colSpan={6} className="px-2 py-3 space-y-4">
            {itemsLoading ? (
              <div className="text-xs text-text-med text-center py-3">Loading items…</div>
            ) : items.length === 0 ? (
              <div className="text-xs text-text-med text-center py-3">No items on this order.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] font-semibold text-text-med uppercase tracking-wide sticky top-0 z-10 bg-background">
                    <tr>
                      <th className="text-left px-2 py-1">Product / Brand</th>
                      <th className="text-left px-2 py-1">Variant</th>
                      <th className="text-center px-2 py-1">Qty</th>
                      <th className="text-right px-2 py-1">Unit price</th>
                      <th className="text-right px-2 py-1">Actual Cost</th>
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
                        <tr key={it.item_id} className="border-t border-border/60">
                          <td className="px-2 py-1.5">
                            <div className="font-semibold">{it.product_name || "—"}</div>
                            {it.brand_name && <div className="text-[10px] text-text-med">{it.brand_name}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-text-med">{variant || "—"}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">×{it.quantity}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(it.unit_price)}</td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums ${noCost ? "bg-yellow-50" : ""}`}
                            title={noCost ? "No cost captured" : undefined}
                          >
                            <ActualCostCell item={it} isAdmin={isAdmin} onSaved={handleItemSaved} />
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

            {someLineNoCost && (
              <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Some lines have no cost — order profit excludes COGS until all line costs are filled.</span>
              </div>
            )}

            {/* Manual extra costs — delivery overages, replacements, etc.
                The view recomputes net_profit; we just refetch after edits. */}
            <ExtraCosts orderId={row.order_id} onChanged={onCostsChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Editable per-line actual cost ───────────────────────────────────
// Admins get a naira-integer input that saves via the role-gated
// set_order_item_cost RPC (DB triggers recompute line_cost + order profit).
// Non-admins see read-only text. Never writes order_items directly and never
// computes profit on the client — the RPC return is the source of truth.
function ActualCostCell({ item, isAdmin, onSaved }: {
  item: ItemRow;
  isAdmin: boolean;
  onSaved: (data: any) => void;
}) {
  const [val, setVal] = useState(String(item.cost_price ?? 0));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Re-seed when the stored cost changes (after a save / refetch).
  useEffect(() => { setVal(String(item.cost_price ?? 0)); }, [item.cost_price]);

  if (!isAdmin) {
    const noCost = !item.cost_price || item.cost_price <= 0;
    return noCost
      ? <span className="inline-flex items-center gap-1 justify-end text-yellow-800"><AlertCircle className="w-3 h-3" /> {fmt(0)}</span>
      : <>{fmt(item.cost_price)}</>;
  }

  const save = async () => {
    setErr(null);
    const raw = val.trim();
    const parsed = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) { setErr("≥ 0"); return; }
    const n = Math.round(parsed); // integer naira, no /100
    if (n === (item.cost_price ?? 0)) return; // unchanged — skip the round trip
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("set_order_item_cost", {
        p_item_id: item.item_id,
        p_cost_price: n,
      });
      if (error || !data || data.authorized !== true || data.found !== true) {
        setErr(data?.authorized === false ? "Not authorized" : (error?.message || "Save failed"));
        return;
      }
      onSaved(data);
      setSaved(true);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="text-text-light">₦</span>
      <input
        type="number" min={0} step={1} inputMode="numeric" value={val}
        onChange={(e) => { setVal(e.target.value); setSaved(false); setErr(null); }}
        onBlur={save}
        disabled={saving}
        aria-label="Actual cost (naira)"
        className="w-20 border border-input rounded px-1.5 py-0.5 text-right text-xs bg-background disabled:opacity-50"
      />
      {saving && <Loader2 className="w-3 h-3 animate-spin text-text-med" />}
      {saved && !saving && <Check className="w-3 h-3 text-emerald-600" />}
      {err && <span className="text-[10px] text-red-600 whitespace-nowrap">{err}</span>}
    </div>
  );
}

// ── Extra costs editor (per order) ──────────────────────────────────
// Lists non-deleted order_extra_costs and lets an admin add or soft-delete
// them. created_by is set by the DB from auth.uid() — never sent here.
// Deletes set deleted_at (soft delete) — never a hard DELETE.
type ExtraCostRow = {
  id: string;
  amount: number | null;
  description: string | null;
  category: string | null;
  created_at: string;
};

function ExtraCosts({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: costs = [], isLoading, refetch } = useQuery({
    queryKey: ["order-extra-costs", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_extra_costs")
        .select("id, amount, description, category, created_at")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as ExtraCostRow[];
    },
    staleTime: 10_000,
  });

  const resetForm = () => { setAmount(""); setDescription(""); setCategory(""); setAdding(false); };

  const save = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount (naira)"); return; }
    if (!description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    try {
      // created_by intentionally omitted — DB sets it from auth.uid().
      const { error } = await (supabase as any).from("order_extra_costs").insert({
        order_id: orderId,
        amount: amt,
        description: description.trim(),
        category: category || null,
      });
      if (error) throw error;
      resetForm();
      await refetch();
      onChanged(); // re-read net_profit from the view
      toast.success("Extra cost added");
    } catch (e: any) {
      toast.error(e?.message || "Could not add extra cost");
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await (supabase as any)
        .from("order_extra_costs")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await refetch();
      onChanged();
      toast.success("Extra cost removed");
    } catch (e: any) {
      toast.error(e?.message || "Could not remove extra cost");
    } finally {
      setDeletingId(null);
    }
  };

  const total = costs.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

  return (
    <div className="border-t border-border/60 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold text-text-med uppercase tracking-wide">
          Extra costs{costs.length > 0 ? ` · ${fmt(total)}` : ""}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest hover:underline"
          >
            <Plus className="w-3 h-3" /> Add extra cost
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-text-med py-2">Loading extra costs…</div>
      ) : costs.length === 0 && !adding ? (
        <div className="text-xs text-text-light py-1">No extra costs recorded.</div>
      ) : (
        <div className="space-y-1.5">
          {costs.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs bg-card border border-border rounded-lg px-2.5 py-1.5">
              <span className="font-semibold tabular-nums w-20 text-right">{fmt(c.amount)}</span>
              <span className="flex-1 min-w-0">
                <span className="truncate">{c.description || "—"}</span>
                {c.category && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-muted text-text-med text-[10px]">
                    {CATEGORY_LABEL[c.category] || c.category}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-text-light whitespace-nowrap">
                {new Date(c.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <button
                onClick={() => softDelete(c.id)}
                disabled={deletingId === c.id}
                className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-40"
                title="Remove (soft delete)"
                aria-label="Remove extra cost"
              >
                {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-2 flex flex-wrap items-end gap-2 bg-card border border-border rounded-lg p-2.5">
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-med mb-0.5">Amount (₦) *</label>
            <input
              type="number" min={1} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-28 border border-input rounded px-2 py-1 text-xs bg-background"
            />
          </div>
          <div className="flex flex-col flex-1 min-w-[160px]">
            <label className="text-[10px] font-semibold text-text-med mb-0.5">Description *</label>
            <input
              type="text" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Replacement for damaged towel"
              className="w-full border border-input rounded px-2 py-1 text-xs bg-background"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-med mb-0.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-input rounded px-2 py-1 text-xs bg-background"
            >
              <option value="">—</option>
              {EXTRA_COST_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 bg-forest text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save
            </button>
            <button
              onClick={resetForm}
              disabled={saving}
              className="px-3 py-1.5 rounded text-xs font-semibold border border-border hover:bg-muted disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
