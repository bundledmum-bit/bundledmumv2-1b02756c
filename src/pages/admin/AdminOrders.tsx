import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link as RouterLink } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Download, ChevronDown, ChevronUp, Printer, MessageSquare, Clock, Send, ExternalLink, ArrowLeft, Truck, CheckCircle2, Package, X as XIcon, RotateCcw, Plus } from "lucide-react";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import { openBrandedInvoice } from "@/components/admin/PrintInvoice";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Skeleton } from "@/components/ui/skeleton";
import bmLogoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";

// Couriers that should always appear in the filter even before any
// orders have been assigned to them. Anything else the backend reports
// on existing orders is merged in at render time (see courierOptions
// below).
const DEFAULT_COURIER_PARTNERS = ["Brain Express", "eFTD Africa"];

const ORDER_STATUSES = ["pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned", "refunded", "failed"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];
const PAYMENT_METHODS = ["card", "transfer", "ussd"];
const CANCEL_REASONS = ["customer_request", "out_of_stock", "payment_failed", "fraud_suspected", "other"];
const RETURN_REASONS = ["wrong_item", "damaged", "changed_mind", "not_as_described", "quality_issue", "other"];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700", confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700", packed: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700", delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700", returned: "bg-orange-100 text-orange-700",
  refunded: "bg-gray-200 text-gray-700", failed: "bg-red-100 text-red-700",
  paid: "bg-green-100 text-green-700",
};

const DATE_PRESETS = [
  { label: "Today", getValue: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }},
  { label: "Yesterday", getValue: () => { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d.toISOString(); }},
  { label: "This Week", getValue: () => { const d = new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d.toISOString(); }},
  { label: "This Month", getValue: () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); }},
];

const fmt = (n: number) => `₦${n.toLocaleString()}`;
const formatColor = (color: string | null | undefined): string => {
  if (!color) return "";
  if (color === "boy") return "Boy (Blue)";
  if (color === "girl") return "Girl (Pink)";
  if (color === "neutral") return "Neutral (White)";
  return color;
};

export default function AdminOrders() {
  const queryClient = useQueryClient();
  const { can, adminUser, isSuperAdmin } = usePermissions();
  const [search, setSearch] = useState("");
  const [urlParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("all");
  const [subsOnly, setSubsOnly] = useState(urlParams.get("filter") === "subscriptions");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  // Express Order filters — orderType narrows the table to standard / express
  // rows, expressStatusFilter narrows by express lifecycle step.
  const [orderTypeFilter, setOrderTypeFilter] = useState<"all" | "standard" | "express">("all");
  const [expressStatusFilter, setExpressStatusFilter] = useState<"all" | "pending_quote" | "quoted" | "accepted" | "declined" | "expired">("all");
  const [datePreset, setDatePreset] = useState("This Month");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailOrder, setDetailOrder] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);

  // Set of order ids with an existing picking session (any status). Used to
  // hide the "Start Picking" action on the row.
  const { data: pickedOrderIds = new Set<string>() } = useQuery({
    queryKey: ["picking-session-order-ids"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_picking_sessions")
        .select("order_id");
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.order_id).filter(Boolean));
    },
    staleTime: 30 * 1000,
  });

  // Honour ?order=<uuid> on mount: open detail for that order, and briefly
  // highlight the matching row if it's in the loaded page.
  useEffect(() => {
    const orderParam = urlParams.get("order");
    if (!orderParam) return;
    setDetailOrder(orderParam);
    setHighlightOrderId(orderParam);
    const t = setTimeout(() => setHighlightOrderId(null), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams]);

  useEffect(() => {
    const channel = supabase.channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const o = payload.new as any;
        toast.success(`New order received — ${o.order_number || "New Order"}`, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const dateFrom = useMemo(() => {
    const preset = DATE_PRESETS.find(p => p.label === datePreset);
    return preset ? preset.getValue() : new Date(0).toISOString();
  }, [datePreset]);

  const [currentPage, setCurrentPage] = useState(0);

  const { data: rpcResult, isLoading } = useQuery({
    queryKey: ["admin-orders", currentPage, statusFilter, paymentFilter, search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_orders", {
        p_limit: 50,
        p_offset: currentPage * 50,
        p_status: statusFilter !== "all" ? statusFilter : null,
        p_payment_status: paymentFilter !== "all" ? paymentFilter : null,
        p_search: search || null,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const orders = rpcResult?.orders || [];
  const totalCount = rpcResult?.total || 0;
  const isPaidOnlyRestricted = rpcResult?.paid_only_restricted || false;

  const filtered = useMemo(() => {
    const rows = (orders || []).filter((o: any) => {
      if (subsOnly && !o.is_subscription_order) return false;
      if (methodFilter !== "all" && o.payment_method !== methodFilter) return false;
      if (o.created_at < dateFrom) return false;
      if (courierFilter !== "all") {
        if (courierFilter === "unassigned") {
          if (o.delivery_partner) return false;
        } else if (o.delivery_partner !== courierFilter) {
          return false;
        }
      }
      if (orderTypeFilter === "express" && !o.is_express_order) return false;
      if (orderTypeFilter === "standard" && o.is_express_order) return false;
      if (expressStatusFilter !== "all" && o.express_status !== expressStatusFilter) return false;
      return true;
    });
    // Most-recent-first by default, but express orders awaiting a quote
    // bubble to the very top of the list since they're the most time-
    // sensitive surface for the fulfilment team (24h SLA).
    rows.sort((a: any, b: any) => {
      const aUrgent = a.is_express_order && a.express_status === "pending_quote" ? 1 : 0;
      const bUrgent = b.is_express_order && b.express_status === "pending_quote" ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });
    return rows;
  }, [orders, methodFilter, dateFrom, courierFilter, subsOnly, orderTypeFilter, expressStatusFilter]);

  const stats = useMemo(() => {
    const f = filtered;
    const paid = f.filter((o: any) => o.payment_status === "paid");
    const pending = f.filter((o: any) => o.payment_status === "pending");
    const cancelled = f.filter((o: any) => o.order_status === "cancelled");
    const returned = f.filter((o: any) => o.order_status === "returned");
    const gift = f.filter((o: any) => o.gift_wrapping);
    const gmv = f.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const revenue = paid.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const avg = paid.length > 0 ? Math.round(revenue / paid.length) : 0;
    return { total: f.length, paid: paid.length, pending: pending.length, gmv, revenue, cancelled: cancelled.length, returned: returned.length, avg, gift: gift.length };
  }, [filtered]);

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const allSelected = filtered.length > 0 && filtered.every((o: any) => selected.has(o.id));

  // Courier filter options — always include "All" + "Unassigned", plus
  // the default known partners, plus any other partner actually present
  // in the current orders list (so manually-set values still show up).
  const courierOptions = useMemo(() => {
    const seen = new Set<string>(DEFAULT_COURIER_PARTNERS);
    (orders || []).forEach((o: any) => {
      if (o.delivery_partner) seen.add(String(o.delivery_partner));
    });
    const partners = Array.from(seen).sort();
    return [
      { value: "all", label: "All Couriers" },
      ...partners.map(p => ({ value: p, label: p })),
      { value: "unassigned", label: "Unassigned" },
    ];
  }, [orders]);

  const bulkStatusUpdate = useMutation({
    mutationFn: async ({ ids, status, paymentStatus }: { ids: string[]; status?: string; paymentStatus?: string }) => {
      const update: any = {};
      if (status) update.order_status = status;
      if (paymentStatus) update.payment_status = paymentStatus;
      const { error } = await supabase.from("orders").update(update).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-orders"] }); setSelected(new Set()); toast.success("Bulk update done"); },
  });

  const exportCSV = () => {
    const rows = (selected.size > 0 ? filtered.filter((o: any) => selected.has(o.id)) : filtered).map((o: any) =>
      [o.order_number, o.customer_name, o.customer_phone, o.total, o.payment_status, o.order_status, o.payment_method, o.delivery_partner || "Unassigned", o.created_at].join(",")
    );
    const csv = "Order,Name,Phone,Total,Payment,Status,Method,Courier,Date\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "orders-export.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported!");
  };

  const handleBulkAction = (action: string) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "confirmed") bulkStatusUpdate.mutate({ ids, status: "confirmed" });
    if (action === "mark_paid") bulkStatusUpdate.mutate({ ids, paymentStatus: "paid" });
    if (action === "export") exportCSV();
  };

  // ---- Bulk shipping / delivery / label helpers ----
  const bulkMarkShipped = async () => {
    // Only applies to orders not already shipped or delivered.
    const eligible = filtered.filter((o: any) => selected.has(o.id) && o.order_status !== "shipped" && o.order_status !== "delivered");
    if (eligible.length === 0) { toast.message("No eligible orders (already shipped/delivered)"); return; }
    setBulkRunning(`Marking ${eligible.length} orders as shipped…`);
    const { error } = await supabase
      .from("orders")
      .update({ order_status: "shipped", shipped_at: new Date().toISOString() })
      .in("id", eligible.map((o: any) => o.id));
    setBulkRunning(null);
    if (error) { toast.error(error.message || "Bulk update failed"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    setSelected(new Set());
    toast.success(`${eligible.length} order${eligible.length === 1 ? "" : "s"} marked as shipped`);
  };

  const bulkMarkDelivered = async () => {
    const eligible = filtered.filter((o: any) => selected.has(o.id) && o.order_status !== "delivered");
    if (eligible.length === 0) { toast.message("No eligible orders (already delivered)"); return; }
    setBulkRunning(`Marking ${eligible.length} orders as delivered…`);
    const { error } = await supabase
      .from("orders")
      .update({ order_status: "delivered", delivered_at: new Date().toISOString() })
      .in("id", eligible.map((o: any) => o.id));
    setBulkRunning(null);
    if (error) { toast.error(error.message || "Bulk update failed"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    setSelected(new Set());
    toast.success(`${eligible.length} order${eligible.length === 1 ? "" : "s"} marked as delivered`);
  };

  const bulkPrintLabels = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkRunning(`Fetching ${ids.length} orders…`);
    // Pull full records so we have the delivery fields (address, phone, weight…)
    const { data, error } = await supabase.from("orders").select("*").in("id", ids);
    setBulkRunning(null);
    if (error) { toast.error(error.message || "Failed to fetch orders"); return; }
    const rows = (data || []) as any[];
    if (rows.length === 0) { toast.error("No orders found"); return; }
    try {
      await openDeliveryLabels(rows);
    } catch (e: any) {
      toast.error(e?.message || "Could not open labels window");
    }
  };

  const clearSelection = () => setSelected(new Set());

  const bulkActions = [
    ...(can("orders", "edit_status") ? [{ label: "Mark as confirmed", value: "confirmed" }, { label: "Mark transfers as paid", value: "mark_paid" }] : []),
    ...(can("orders", "export") ? [{ label: "Export selected CSV", value: "export" }] : []),
  ];

  // Fetch full order with items when detail view is open
  const { data: detailOrderData } = useQuery({
    queryKey: ["admin-order-detail", detailOrder],
    queryFn: async () => {
      if (!detailOrder) return null;
      const { data, error } = await supabase.from("orders").select("*, order_items(*)").eq("id", detailOrder).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!detailOrder,
  });

  if (detailOrder) {
    if (!detailOrderData) return <div className="flex justify-center py-20"><Skeleton className="h-8 w-48" /></div>;
    return <OrderDetailPage order={detailOrderData} adminUser={adminUser} can={can} isSuperAdmin={isSuperAdmin} onBack={() => setDetailOrder(null)} onPrint={() => openBrandedInvoice(detailOrderData, adminUser?.id)} />;
  }

  const showFinance = can("finance", "view");

  const statCards = [
    { label: "Total Orders", value: stats.total },
    { label: "Paid Orders", value: stats.paid },
    { label: "Pending Payment", value: stats.pending },
    ...(showFinance ? [
      { label: "GMV", value: fmt(stats.gmv) },
      { label: "Revenue", value: fmt(stats.revenue) },
    ] : []),
    { label: "Cancelled", value: stats.cancelled },
    { label: "Returned", value: stats.returned },
    ...(showFinance ? [{ label: "Avg Order Value", value: fmt(stats.avg) }] : []),
    { label: "Gift Wrapping", value: stats.gift },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="pf text-2xl font-bold">Orders</h1>
        {can("orders", "export") && (
          <button onClick={exportCSV} className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => setDatePreset(p.label)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${datePreset === p.label ? "border-forest bg-forest/10 text-forest" : "border-border text-muted-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-9 gap-2 mb-4">
        {statCards.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-lg font-bold pf">{c.value}</div>
            <div className="text-muted-foreground text-[9px]">{c.label}</div>
          </div>
        ))}
      </div>

      {isPaidOnlyRestricted && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
          🔒 Showing paid orders only
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, name, phone..."
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button
          onClick={() => setSubsOnly(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border ${
            subsOnly
              ? "bg-teal-100 text-teal-700 border-teal-300"
              : "bg-background text-text-med border-input hover:bg-muted"
          }`}
          aria-pressed={subsOnly}
        >
          🔄 Subscriptions{subsOnly ? " ✓" : ""}
        </button>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded-lg px-3 py-2 text-xs bg-background">
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {!isPaidOnlyRestricted && (
          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="border border-input rounded-lg px-3 py-2 text-xs bg-background">
            <option value="all">All payments</option>
            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="border border-input rounded-lg px-3 py-2 text-xs bg-background">
          <option value="all">All methods</option>
          {PAYMENT_METHODS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={orderTypeFilter} onChange={e => setOrderTypeFilter(e.target.value as any)} className="border border-input rounded-lg px-3 py-2 text-xs bg-background">
          <option value="all">All order types</option>
          <option value="standard">Standard only</option>
          <option value="express">⚡ Express only</option>
        </select>
        {orderTypeFilter !== "standard" && (
          <select value={expressStatusFilter} onChange={e => setExpressStatusFilter(e.target.value as any)} className="border border-input rounded-lg px-3 py-2 text-xs bg-background">
            <option value="all">All express statuses</option>
            <option value="pending_quote">Pending Quote</option>
            <option value="quoted">Quoted</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="expired">Expired</option>
          </select>
        )}
        <div className="relative inline-flex items-center">
          <Truck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <select value={courierFilter} onChange={e => setCourierFilter(e.target.value)}
            className="border border-input rounded-lg pl-7 pr-3 py-2 text-xs bg-background">
            {courierOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {courierFilter !== "all" && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-forest/10 text-forest text-[10px] font-semibold">
              {courierOptions.find(o => o.value === courierFilter)?.label} ({filtered.length})
            </span>
          )}
        </div>
      </div>

      {bulkActions.length > 0 && (
        <BulkActionsBar selectedCount={selected.size} actions={bulkActions} onApply={handleBulkAction}
          onSelectAll={() => setSelected(new Set(filtered.map((o: any) => o.id)))}
          onDeselectAll={() => setSelected(new Set())} totalCount={filtered.length} allSelected={allSelected} />
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border shadow-2xl rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap max-w-[96vw]">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-forest" />
            <span className="font-semibold">{selected.size} order{selected.size === 1 ? "" : "s"} selected</span>
          </div>
          {bulkRunning && <span className="text-xs text-muted-foreground">{bulkRunning}</span>}
          <div className="flex items-center gap-2 ml-1">
            {can("orders", "edit_status") && (
              <>
                <button onClick={bulkMarkShipped} disabled={!!bulkRunning}
                  className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
                  <Truck className="w-3.5 h-3.5" /> Mark Shipped
                </button>
                <button onClick={bulkMarkDelivered} disabled={!!bulkRunning}
                  className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
                  <Package className="w-3.5 h-3.5" /> Mark Delivered
                </button>
              </>
            )}
            <button onClick={bulkPrintLabels} disabled={!!bulkRunning}
              className="inline-flex items-center gap-1.5 border border-forest/30 text-forest hover:bg-forest/5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40">
              <Printer className="w-3.5 h-3.5" /> Print Labels
            </button>
            <button onClick={clearSelection}
              className="inline-flex items-center gap-1.5 text-text-med hover:text-foreground text-xs font-semibold px-2 py-1.5">
              <XIcon className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No data yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="p-2 text-left w-8"><Checkbox checked={allSelected} onCheckedChange={() => allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map((o:any)=>o.id)))} /></th>
                <th className="p-2 text-left">Order</th>
                {can("orders", "view_customer") && <th className="p-2 text-left">Customer</th>}
                {can("orders", "view_customer") && <th className="p-2 text-left">Phone</th>}
                {showFinance && <th className="p-2 text-right">Total</th>}
                <th className="p-2 text-center">Payment</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-center">Courier</th>
                <th className="p-2 text-center">Method</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: any) => (
                <tr key={o.id}
                  className={`border-b border-border hover:bg-muted/30 cursor-pointer transition-colors duration-1000 ${selected.has(o.id) ? "bg-emerald-50/60" : ""} ${highlightOrderId === o.id ? "bg-yellow-100" : ""}`}
                  onClick={() => setDetailOrder(o.id)}>
                  <td className="p-2" onClick={e => e.stopPropagation()}><Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleSelect(o.id)} /></td>
                  <td className="p-2 font-semibold">
                    {o.is_express_order && (
                      <span
                        title={`Express Order — ${o.express_status || "pending_quote"}`}
                        className="inline-block mr-1 text-amber-600"
                      >
                        ⚡
                      </span>
                    )}
                    {o.order_number || "—"}
                  </td>
                  {can("orders", "view_customer") && <td className="p-2">{o.customer_name}</td>}
                  {can("orders", "view_customer") && <td className="p-2 text-muted-foreground">{o.customer_phone}</td>}
                  {showFinance && <td className="p-2 text-right font-semibold">{fmt(o.total || 0)}</td>}
                  <td className="p-2 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[o.payment_status] || ""}`}>{o.payment_status}</span></td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${STATUS_COLORS[o.order_status] || ""}`}>{o.order_status}</span>
                    {o.order_status === "picked" && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-white" style={{ background: "#F4845F" }}>
                        PICKED
                      </span>
                    )}
                    {o.is_subscription_order && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-teal-100 text-teal-700">Subscription</span>
                    )}
                    {o.is_quiz_order ? (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-700">Quiz</span>
                    ) : !o.is_subscription_order && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">Direct</span>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    {o.delivery_partner ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-forest/10 text-forest"
                        title={stripProfitSegments(o.courier_note) || ""}
                      >
                        <Truck className="w-3 h-3" /> {o.delivery_partner}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="p-2 text-center capitalize text-muted-foreground">{o.payment_method}</td>
                  <td className="p-2 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</td>
                  <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setDetailOrder(o.id)} className="text-xs text-forest font-semibold hover:underline">View</button>
                      {o.payment_status === "paid"
                        && ["paid", "confirmed", "processing"].includes(o.order_status)
                        && !pickedOrderIds.has(o.id) && (
                        <RouterLink
                          to={`/admin/picking?order=${o.id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-coral font-semibold hover:underline"
                        >
                          Start Picking
                        </RouterLink>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════ ORDER DETAIL PAGE ═══════
function OrderDetailPage({ order: o, adminUser, can, isSuperAdmin, onBack, onPrint }: { order: any; adminUser: any; can: (m: string, a: string) => boolean; isSuperAdmin: boolean; onBack: () => void; onPrint: () => void }) {
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState(o.order_status);
  const [statusNote, setStatusNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showInitiateReturn, setShowInitiateReturn] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [issueRefund, setIssueRefund] = useState(false);
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [refundAmount, setRefundAmount] = useState(0);
  const [trackingNumber, setTrackingNumber] = useState(o.tracking_number || "");
  const [actualDelivery, setActualDelivery] = useState(o.actual_delivery_date || "");

  const { data: orderNotes } = useQuery({
    queryKey: ["admin-order-notes", o.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_notes").select("*, admin_users(display_name)").eq("order_id", o.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: statusHistory } = useQuery({
    queryKey: ["admin-order-history", o.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_status_history").select("*, admin_users(display_name)").eq("order_id", o.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = async () => {
    if (newStatus === "cancelled") { setShowCancel(true); return; }
    if (newStatus === "returned") { setShowReturn(true); return; }

    const updates: any = { order_status: newStatus };
    if (newStatus === "packed") updates.packed_at = new Date().toISOString();
    if (newStatus === "shipped") updates.shipped_at = new Date().toISOString();
    if (newStatus === "delivered") updates.delivered_at = new Date().toISOString();

    await supabase.from("orders").update(updates).eq("id", o.id);
    await supabase.from("order_status_history").insert({
      order_id: o.id, old_status: o.order_status, new_status: newStatus,
      changed_by: adminUser?.id || null, note: statusNote || null,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-history", o.id] });
    toast.success(`Status updated to ${newStatus}`);
    setStatusNote("");
  };

  const handleCancel = async () => {
    const updates: any = { order_status: "cancelled", cancellation_reason: cancelReason, cancelled_at: new Date().toISOString(), cancelled_by: adminUser?.id || null };
    if (issueRefund && o.payment_status === "paid") {
      updates.payment_status = "refunded";
      updates.refund_amount = o.total;
      updates.refunded_at = new Date().toISOString();
    }
    await supabase.from("orders").update(updates).eq("id", o.id);
    await supabase.from("order_status_history").insert({
      order_id: o.id, old_status: o.order_status, new_status: "cancelled",
      changed_by: adminUser?.id || null, note: `Reason: ${cancelReason}${issueRefund ? " (refund issued)" : ""}`,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-history", o.id] });
    toast.success("Order cancelled");
    setShowCancel(false);
  };

  const handleReturn = async () => {
    const updates: any = { order_status: "returned", return_reason: returnReason, returned_at: new Date().toISOString() };
    if (refundAmount > 0) {
      updates.payment_status = "refunded";
      updates.refund_amount = refundAmount;
      updates.refunded_at = new Date().toISOString();
    }
    await supabase.from("orders").update(updates).eq("id", o.id);
    await supabase.from("order_returns").insert({
      order_id: o.id, return_reason: returnReason, return_date: returnDate,
      refund_amount: refundAmount || 0, refund_issued: refundAmount > 0,
      refunded_at: refundAmount > 0 ? new Date().toISOString() : null,
      handled_by: adminUser?.id || null,
    });
    await supabase.from("order_status_history").insert({
      order_id: o.id, old_status: o.order_status, new_status: "returned",
      changed_by: adminUser?.id || null, note: `Return reason: ${returnReason}. Refund: ₦${refundAmount.toLocaleString()}`,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-history", o.id] });
    toast.success("Return processed");
    setShowReturn(false);
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await supabase.from("order_notes").insert({ order_id: o.id, admin_user_id: adminUser?.id || null, note: noteText, is_customer_note: false });
    queryClient.invalidateQueries({ queryKey: ["admin-order-notes", o.id] });
    setNoteText("");
    toast.success("Note added");
  };

  // updatePaymentStatus(...) was replaced by <PaymentStatusControl />
  // which renders one of four scenarios per the orders.confirm_transfer_payment
  // and orders.override_card_payment permissions and the order's method/status.

  const saveDeliveryInfo = async () => {
    await supabase.from("orders").update({ tracking_number: trackingNumber || null, actual_delivery_date: actualDelivery || null }).eq("id", o.id);
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success("Delivery info saved");
  };

  const showFinance = can("finance", "view");
  const showCustomer = can("orders", "view_customer");
  const showAddress = showCustomer && can("fulfilment", "view_address");
  const showPayRef = can("orders", "view_payment_ref") || can("finance", "view_paystack");
  const quizAnswers = o.quiz_answers as any;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-forest font-semibold hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Orders
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="pf text-2xl font-bold">{o.order_number || "Order"}</h1>
          <p className="text-muted-foreground text-xs">{new Date(o.created_at).toLocaleString()}</p>
          <p className="text-xs mt-0.5 inline-flex items-center gap-1 flex-wrap">
            <span>Source:</span>
            {o.is_subscription_order && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700">Subscription</span>
            )}
            {o.is_quiz_order ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">Quiz Order</span>
            ) : !o.is_subscription_order ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">Direct Order</span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded text-xs font-semibold ${STATUS_COLORS[o.order_status] || ""}`}>{o.order_status}</span>
          <span className={`px-3 py-1 rounded text-xs font-semibold ${STATUS_COLORS[o.payment_status] || ""}`}>{o.payment_status}</span>
        </div>
      </div>

      {/* Express Order — surfaces lifecycle actions only when the order
          was placed as express. Renders above subscription / courier
          blocks so the fulfilment team can't miss it. */}
      {o.is_express_order && (
        <ExpressOrderCard order={o} adminUser={adminUser} can={can} />
      )}

      {/* Subscription info — only for orders produced by process-subscriptions */}
      {o.is_subscription_order && <SubscriptionInfoSection order={o} />}

      {/* Courier Assignment — auto-populated when the order is placed */}
      <CourierAssignmentEditor order={o} />


      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Customer Info — gated */}
        {showCustomer && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-3">Customer Info</h3>
            <div className="space-y-1 text-sm">
              <div><span className="text-muted-foreground text-xs">Name:</span> {o.customer_name}</div>
              <div><span className="text-muted-foreground text-xs">Phone:</span> {o.customer_phone}</div>
              <div><span className="text-muted-foreground text-xs">Email:</span> {o.customer_email}</div>
              {showAddress && (
                <>
                  <div><span className="text-muted-foreground text-xs">Address:</span> {o.delivery_address}</div>
                  <div><span className="text-muted-foreground text-xs">City/State:</span> {o.delivery_city}, {o.delivery_state}</div>
                  {o.delivery_notes && <div><span className="text-muted-foreground text-xs">Notes:</span> {o.delivery_notes}</div>}
                </>
              )}
              {can("customers", "view") && (
                <a href="/admin/customers" className="text-xs text-forest font-semibold hover:underline mt-1 inline-block">View full profile →</a>
              )}
            </div>
          </div>
        )}

        {/* Payment Info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-3">Payment Info</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground text-xs">Method:</span> <span className="capitalize">{o.payment_method}</span></div>
            <PaymentStatusControl order={o} adminUser={adminUser} can={can} />
            {showPayRef && o.payment_reference && <div><span className="text-muted-foreground text-xs">Reference:</span> {o.payment_reference}</div>}
            {showPayRef && o.paystack_transaction_id && <div><span className="text-muted-foreground text-xs">Paystack ID:</span> {o.paystack_transaction_id}</div>}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-sm font-bold mb-3">Order Summary</h3>
        <div className="space-y-1">
          {(o.order_items || []).map((item: any) => (
            <div key={item.id} className="flex justify-between text-xs bg-muted/30 rounded p-2">
              <div className="min-w-0">
                {item.bundle_name && <div className="text-[10px] font-bold text-coral mb-0.5">📦 {item.bundle_name}</div>}
                <div className="font-semibold">{item.product_name} <span className="font-normal text-muted-foreground">× {item.quantity}</span></div>
                <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
                  {item.brand_name && <span>Brand: {item.brand_name}</span>}
                  {item.size && <span>Size / Age: {item.size}</span>}
                  {item.color && <span>Colour: {formatColor(item.color)}</span>}
                </div>
              </div>
              {showFinance && <span className="font-semibold flex-shrink-0 ml-2">{fmt(item.line_total || 0)}</span>}
            </div>
          ))}
        </div>
        {showFinance && (
          <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(o.subtotal || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery Fee</span><span>{fmt(o.delivery_fee || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Service Fee</span><span>{fmt(o.service_fee || 0)}</span></div>
            {(o.discount_amount || 0) > 0 && <div className="flex justify-between text-green-600"><span>Coupon Discount</span><span>-{fmt(o.discount_amount)}</span></div>}
            {(o.spend_discount_amount || 0) > 0 && <div className="flex justify-between text-green-600"><span>Spend Discount ({o.spend_discount_percent}%)</span><span>-{fmt(o.spend_discount_amount)}</span></div>}
            <div className="flex justify-between font-bold text-sm pt-2 border-t border-border"><span>Total</span><span>{fmt(o.total || 0)}</span></div>
          </div>
        )}
      </div>

      {/* Edit Order — additive add/remove/qty controls, locked once the
          order is shipped/delivered/cancelled. */}
      <EditOrderCard order={o} adminUser={adminUser} can={can} />

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Delivery Info */}
        {showAddress && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-3">Delivery Info</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground text-xs">Est. Delivery:</span> {o.estimated_delivery_start || "—"} to {o.estimated_delivery_end || "—"}</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Tracking #:</span>
                <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background flex-1" placeholder="Enter tracking number" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Actual Delivery:</span>
                <input type="date" value={actualDelivery} onChange={e => setActualDelivery(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background" />
              </div>
              <button onClick={saveDeliveryInfo} className="px-3 py-1.5 bg-forest text-primary-foreground rounded-lg text-xs font-semibold">Save</button>
            </div>
          </div>
        )}

        {/* Status Management */}
        {can("orders", "edit_status") && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-3">Status Management</h3>
            <div className="space-y-2">
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background capitalize">
                {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder={newStatus === "cancelled" || newStatus === "returned" ? "Reason (required)" : "Note (optional)"}
                className="w-full border border-input rounded-lg px-3 py-2 text-xs bg-background" />
              {(() => {
                // Block forward-fulfilment transitions on an Express Order
                // until the customer has paid the delivery fee. Cancel /
                // return paths are still allowed because admin may need
                // them mid-quote.
                const isForwardFulfilment = ["packed", "shipped", "delivered"].includes(newStatus);
                const expressBlocks = !!o.is_express_order
                  && o.express_status !== "accepted"
                  && isForwardFulfilment;
                return (
                  <>
                    <button
                      onClick={updateStatus}
                      disabled={newStatus === o.order_status || expressBlocks}
                      className="w-full px-3 py-2 bg-forest text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Update Status
                    </button>
                    {expressBlocks && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        Order cannot be fulfilled until express delivery is paid.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Order Flags */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-sm font-bold mb-3">Order Flags</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          {o.gift_wrapping && <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-semibold">🎀 Gift Wrapping</span>}
          {o.gift_message && <span className="bg-muted px-2 py-1 rounded">💌 {o.gift_message}</span>}
          {o.referral_code_used && <span className="bg-muted px-2 py-1 rounded">🔗 Referral: {o.referral_code_used}</span>}
          {quizAnswers && (
            <div className="flex gap-2 flex-wrap">
              {quizAnswers.hospital_type && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">🏥 {quizAnswers.hospital_type}</span>}
              {quizAnswers.delivery_method && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded">🚚 {quizAnswers.delivery_method}</span>}
              {quizAnswers.baby_gender && <span className="bg-pink-50 text-pink-700 px-2 py-1 rounded">👶 {quizAnswers.baby_gender}</span>}
              {quizAnswers.budget_tier && <span className="bg-green-50 text-green-700 px-2 py-1 rounded">💰 {quizAnswers.budget_tier}</span>}
            </div>
          )}
          {!o.gift_wrapping && !quizAnswers && !o.referral_code_used && <span className="text-muted-foreground">No flags</span>}
        </div>
      </div>

      {/* Status Timeline */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1"><Clock className="w-4 h-4" /> Status Timeline</h3>
        {(statusHistory || []).length === 0 ? <p className="text-xs text-muted-foreground">No data yet</p> : (
          <div className="relative pl-4 border-l-2 border-border space-y-3">
            {(statusHistory || []).map((h: any) => (
              <div key={h.id} className="relative">
                <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-forest border-2 border-card" />
                <div className="text-xs">
                  <span className="capitalize font-semibold">{(h.old_status || "created").replace("_", " ")}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="capitalize font-semibold">{h.new_status.replace("_", " ")}</span>
                  {h.note && <span className="text-muted-foreground ml-2">— {h.note}</span>}
                  <div className="text-muted-foreground mt-0.5">
                    {new Date(h.created_at).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {(h.admin_users as any)?.display_name && <span> by {(h.admin_users as any).display_name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Notes */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Admin Notes</h3>
        <div className="space-y-2 mb-3">
          {(orderNotes || []).map((n: any) => (
            <div key={n.id} className="text-xs rounded-lg p-2 bg-muted">
              <div className="flex justify-between mb-0.5">
                <span className="font-semibold">{(n.admin_users as any)?.display_name || "System"}</span>
                <span className="text-muted-foreground">{new Date(n.created_at).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div>{n.note}</div>
            </div>
          ))}
          {(!orderNotes || orderNotes.length === 0) && <p className="text-xs text-muted-foreground">No notes yet</p>}
        </div>
        {can("orders", "add_note") && (
          <div className="flex gap-2">
            <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..."
              className="flex-1 border border-input rounded-lg px-3 py-1.5 text-xs bg-background" />
            <button onClick={addNote} className="px-3 py-1.5 bg-forest text-primary-foreground rounded-lg text-xs font-semibold">
              <Send className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {(can("orders", "print_invoice") || can("fulfilment", "print_invoice")) && (
          <button onClick={onPrint} className="flex items-center gap-1 text-xs font-semibold text-forest hover:underline">
            <Printer className="w-3 h-3" /> Print Invoice
          </button>
        )}
        {o.is_subscription_order && (can("orders", "print_invoice") || can("fulfilment", "print_invoice")) && (
          <button onClick={() => printSubscriptionInvoice(o)} className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline">
            <Printer className="w-3 h-3" /> Print Subscription Invoice
          </button>
        )}
        {can("orders", "cancel") && o.order_status !== "cancelled" && (
          <button onClick={() => setShowCancel(true)} className="flex items-center gap-1 text-xs font-semibold text-destructive hover:underline">
            Cancel Order
          </button>
        )}
        {(can("orders", "refund") || can("finance", "process_refunds")) && o.order_status !== "returned" && (
          <button onClick={() => setShowReturn(true)} className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline">
            Process Return
          </button>
        )}
        {(can("orders", "refund") || can("finance", "process_refunds")) && ["delivered", "shipped"].includes(o.order_status) && (
          <button onClick={() => setShowInitiateReturn(true)} className="flex items-center gap-1 text-xs font-semibold text-forest hover:underline">
            <RotateCcw className="w-3 h-3" /> Initiate Return
          </button>
        )}
        {isSuperAdmin && (
          <button onClick={async () => { if (!confirm("Permanently delete this order?")) return; await supabase.from("orders").delete().eq("id", o.id); queryClient.invalidateQueries({ queryKey: ["admin-orders"] }); onBack(); toast.success("Order deleted"); }}
            className="flex items-center gap-1 text-xs font-semibold text-destructive hover:underline">
            Delete Order
          </button>
        )}
        {showCustomer && o.customer_phone && (
          <a href={`https://wa.me/${o.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${o.customer_name?.split(" ")[0]}! Your BundledMum order ${o.order_number} is now "${o.order_status}".`)}`}
            target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-[#25D366]">
            <ExternalLink className="w-3 h-3" /> WhatsApp
          </a>
        )}
      </div>

      {/* Cancel Modal */}
      {showCancel && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center" onClick={() => setShowCancel(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-4">Cancel Order</h3>
            <label className="text-xs font-semibold text-muted-foreground">Reason</label>
            <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background mb-3 capitalize">
              {CANCEL_REASONS.map(r => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </select>
            {o.payment_status === "paid" && (
              <label className="flex items-center gap-2 text-xs mb-4">
                <input type="checkbox" checked={issueRefund} onChange={e => setIssueRefund(e.target.checked)} />
                Issue refund ({fmt(o.total)})
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowCancel(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-xs font-semibold">Cancel</button>
              <button onClick={handleCancel} className="flex-1 px-3 py-2 bg-destructive text-destructive-foreground rounded-lg text-xs font-semibold">Confirm Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Initiate Return — opens the full return flow (admin approves,
          restores stock, issues refund). Writes to order_returns with
          status='requested' via the initiate_return RPC. */}
      {showInitiateReturn && (
        <InitiateReturnModal
          order={o}
          onClose={() => setShowInitiateReturn(false)}
          onSubmitted={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
            queryClient.invalidateQueries({ queryKey: ["admin_returns_view"] });
          }}
        />
      )}

      {/* Return Modal */}
      {showReturn && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center" onClick={() => setShowReturn(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm mb-4">Process Return</h3>
            <label className="text-xs font-semibold text-muted-foreground">Reason</label>
            <select value={returnReason} onChange={e => setReturnReason(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background mb-3 capitalize">
              {RETURN_REASONS.map(r => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </select>
            <label className="text-xs font-semibold text-muted-foreground">Return Date</label>
            <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background mb-3" />
            <label className="text-xs font-semibold text-muted-foreground">Refund Amount (optional)</label>
            <input type="number" value={refundAmount} onChange={e => setRefundAmount(Number(e.target.value))} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setShowReturn(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-xs font-semibold">Cancel</button>
              <button onClick={handleReturn} className="flex-1 px-3 py-2 bg-destructive text-destructive-foreground rounded-lg text-xs font-semibold">Process Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Delivery labels (print) ----------

let _labelLogoDataUrl: string | null = null;
async function getLabelLogo(): Promise<string> {
  if (_labelLogoDataUrl) return _labelLogoDataUrl;
  try {
    const res = await fetch(bmLogoGreen);
    const blob = await res.blob();
    const url = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    _labelLogoDataUrl = url;
    return url;
  } catch {
    return "";
  }
}

// Editable courier card shown above the order detail grid. Lets admin
// override the auto-assigned courier + log the actual delivery cost.
// ============================================================================
// PaymentStatusControl — renders the payment_status row in Payment Info,
// branching across four scenarios:
//   A. transfer + pending + can confirm_transfer_payment → green confirm dialog
//   B. card/ussd + no override permission → read-only + auto-paid notice
//   C. card/ussd + has override_card_payment + not paid → notice + red override
//   D. payment_status === 'paid' → green badge + "use Refund to reverse"
// All other admin order-detail behaviour is unchanged.
// ============================================================================
function PaymentStatusControl({
  order: o,
  adminUser,
  can,
}: {
  order: any;
  adminUser: any;
  can: (m: string, a: string) => boolean;
}) {
  const queryClient = useQueryClient();
  const [showTransferDlg, setShowTransferDlg] = useState(false);
  const [showOverrideDlg, setShowOverrideDlg] = useState(false);
  const [transferNote, setTransferNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideAck, setOverrideAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bank info pulled from site_settings if present; falls back to defaults.
  const { data: settingsRows } = useQuery({
    queryKey: ["site_settings_bank"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["bank_name", "bank_account_number"]);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
  const bank = (() => {
    const map: Record<string, any> = {};
    (settingsRows || []).forEach((r: any) => {
      let v = r.value;
      if (typeof v === "string") v = v.replace(/^"|"$/g, "");
      map[r.key] = v;
    });
    return {
      name: typeof map.bank_name === "string" && map.bank_name.trim() ? map.bank_name : "Kuda",
      account: typeof map.bank_account_number === "string" && map.bank_account_number.trim() ? map.bank_account_number : "3003758996",
    };
  })();

  const isTransfer = o.payment_method === "transfer";
  const isCardOrUssd = o.payment_method === "card" || o.payment_method === "ussd";
  const isPaid = o.payment_status === "paid";
  const canConfirmTransfer = can("orders", "confirm_transfer_payment");
  const canOverrideCard = can("orders", "override_card_payment");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-detail", o.id] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-history", o.id] });
  };

  const writePaid = async (overrideType: "transfer_confirmation" | "card_override", note: string) => {
    setSubmitting(true);
    try {
      const oldPayment = o.payment_status;
      const upd = await supabase.from("orders").update({ payment_status: "paid" }).eq("id", o.id);
      if (upd.error) throw upd.error;
      const ins = await supabase.from("order_status_history").insert({
        order_id: o.id,
        old_status: o.order_status,
        new_status: o.order_status,
        old_payment_status: oldPayment,
        new_payment_status: "paid",
        is_payment_update: true,
        override_type: overrideType,
        note: note || null,
        changed_by: adminUser?.id || null,
      } as any);
      if (ins.error) throw ins.error;
      refresh();
      if (overrideType === "transfer_confirmation") {
        toast.success("Payment confirmed. Order moved to processing.");
      } else {
        toast.success("Payment status overridden. This action has been logged.");
      }
      setShowTransferDlg(false);
      setShowOverrideDlg(false);
      setTransferNote("");
      setOverrideReason("");
      setOverrideAck(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update payment status");
    } finally {
      setSubmitting(false);
    }
  };

  const formatNaira = (n: number) => `₦${(n || 0).toLocaleString("en-NG")}`;

  // ---- SCENARIO D — already paid ----------------------------------------
  if (isPaid) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Status:</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS["paid"] || "bg-green-100 text-green-700"}`}>paid</span>
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          Payment confirmed. To reverse, use the Refund action.
        </p>
      </div>
    );
  }

  // ---- SCENARIO A — bank transfer, pending, can confirm -----------------
  if (isTransfer && canConfirmTransfer) {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Status:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[o.payment_status] || ""}`}>{o.payment_status}</span>
          </div>
          <button
            onClick={() => setShowTransferDlg(true)}
            className="self-start flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Payment Received
          </button>
        </div>
        {showTransferDlg && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => !submitting && setShowTransferDlg(false)}>
            <div className="bg-card border border-border rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-bold mb-2">Confirm Bank Transfer Payment</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Confirm you have received <span className="font-semibold text-foreground">{formatNaira(o.total)}</span> into your <span className="font-semibold">{bank.name}</span> account (<span className="font-mono">{bank.account}</span>) before marking this order as paid.
              </p>
              <label className="text-xs font-semibold text-text-med block mb-1">
                Payment reference or note <span className="text-destructive">*</span>
              </label>
              <input
                value={transferNote}
                onChange={e => setTransferNote(e.target.value)}
                placeholder="e.g. Transfer reference: T2025050112345"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowTransferDlg(false)}
                  disabled={submitting}
                  className="px-4 py-2 border border-border rounded-lg text-sm font-semibold disabled:opacity-50"
                >Cancel</button>
                <button
                  onClick={() => writePaid("transfer_confirmation", transferNote.trim())}
                  disabled={submitting || transferNote.trim().length < 5}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-700"
                >
                  {submitting ? "Saving..." : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ---- SCENARIO B / C — card or ussd ------------------------------------
  if (isCardOrUssd) {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Status:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[o.payment_status] || ""}`}>{o.payment_status}</span>
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            Card payments are confirmed automatically by Paystack. Manual changes are not permitted.
          </p>
          {/* SCENARIO C — override allowed */}
          {canOverrideCard && (
            <button
              onClick={() => setShowOverrideDlg(true)}
              className="self-start mt-1 flex items-center gap-1.5 border border-destructive text-destructive px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-destructive/10"
            >
              <XIcon className="w-3.5 h-3.5" /> Override Payment Status
            </button>
          )}
        </div>
        {showOverrideDlg && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => !submitting && setShowOverrideDlg(false)}>
            <div className="bg-card border border-border rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-bold mb-3 flex items-center gap-2 text-destructive">
                <XIcon className="w-5 h-5" /> Override Card Payment Status
              </h3>
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-xs mb-4">
                This order was paid by card. Paystack should confirm card payments automatically. Only override if you have independently verified this payment was successful.
              </div>
              <label className="text-xs font-semibold text-text-med block mb-1">
                Reason for override <span className="text-destructive">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Explain why you are manually overriding this payment..."
                rows={4}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background mb-3"
              />
              <label className="flex items-start gap-2 text-xs mb-4 cursor-pointer">
                <Checkbox
                  checked={overrideAck}
                  onCheckedChange={v => setOverrideAck(v === true)}
                  className="mt-0.5"
                />
                <span>
                  I confirm I have verified this payment externally and accept full responsibility for this override.
                </span>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowOverrideDlg(false)}
                  disabled={submitting}
                  className="px-4 py-2 border border-border rounded-lg text-sm font-semibold disabled:opacity-50"
                >Cancel</button>
                <button
                  onClick={() => writePaid("card_override", overrideReason.trim())}
                  disabled={submitting || !overrideAck || overrideReason.trim().length === 0}
                  className="px-4 py-2 bg-destructive text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-destructive/90"
                >
                  {submitting ? "Saving..." : "Override Payment Status"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ---- DEFAULT — transfer without permission, or unknown method ---------
  return (
    <div className="flex items-center gap-2" title="You don't have permission to confirm payments.">
      <span className="text-muted-foreground text-xs">Status:</span>
      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[o.payment_status] || ""}`}>{o.payment_status}</span>
    </div>
  );
}

// Read-only courier info block shown above the order detail grid.
// All assignment + cost edits moved out — this is just a summary.
function CourierAssignmentEditor({ order: o }: { order: any }) {
  const [noteOpen, setNoteOpen] = useState<boolean>(false);

  const partner: string = o.delivery_partner || "Not yet assigned";
  // orders.partner_cost is stored in NAIRA — no ÷100.
  const estCost = Number(o.partner_cost) > 0
    ? `₦${Number(o.partner_cost).toLocaleString("en-NG")}`
    : null;

  // Parse "N booking(s)" out of the dispatch note when present so we
  // don't have to roundtrip to the routing RPC for a display-only value.
  const bookings = (() => {
    if (!o.courier_note) return null;
    const m = String(o.courier_note).match(/(\d+)\s*booking/i);
    return m ? Number(m[1]) : null;
  })();

  return (
    <div className="rounded-lg border-2 border-forest/30 bg-forest-light p-3 mb-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚚</span>
        <span className="font-bold text-sm text-forest uppercase tracking-wide">Courier Assignment</span>
      </div>

      <dl className="text-xs space-y-1">
        <div className="flex items-baseline gap-2">
          <dt className="text-text-light w-20 flex-shrink-0">Partner:</dt>
          <dd className="font-semibold">{partner}</dd>
        </div>
        {estCost && (
          <div className="flex items-baseline gap-2">
            <dt className="text-text-light w-20 flex-shrink-0">Est. Cost:</dt>
            <dd className="font-semibold tabular-nums">
              {estCost} <span className="text-text-light font-normal">(what the system calculated)</span>
            </dd>
          </div>
        )}
        {bookings != null && (
          <div className="flex items-baseline gap-2">
            <dt className="text-text-light w-20 flex-shrink-0">Bookings:</dt>
            <dd className="font-semibold tabular-nums">{bookings}</dd>
          </div>
        )}
      </dl>

      {o.courier_note && (
        <div className="pt-1">
          <button onClick={() => setNoteOpen(v => !v)} className="text-[11px] font-semibold text-forest hover:underline inline-flex items-center gap-1">
            {noteOpen ? "Hide dispatch note ▲" : "Show dispatch note ▼"}
          </button>
          {noteOpen && (
            <p className="text-[11px] text-text-med leading-relaxed mt-1 bg-background/60 rounded p-2">
              {stripProfitSegments(o.courier_note)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Strip any "| Profit: NGN xxx" or "| Delivery profit: NGN xxx" or
 * "Profit on delivery: ..." segment from a legacy courier_note so the
 * admin list never exposes margin figures. Safe on null/undefined.
 */
function stripProfitSegments(note: string | null | undefined): string {
  if (!note) return "";
  return String(note)
    .replace(/\s*\|\s*(?:Delivery\s+p|P)rofit(?:\s+on\s+delivery)?:\s*(?:NGN|₦|N)\s*[-\d,.]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Open a new window with one A6 delivery label per order, 2 per A4 page. */
async function openDeliveryLabels(orders: any[]): Promise<void> {
  const logo = await getLabelLogo();
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const title = `DeliveryLabels_${dateStr}_${orders.length}orders`;
  const brand = "#2D6A4F";

  const labels = orders.map(o => {
    const cityLine = [o.delivery_city, o.delivery_state].filter(Boolean).join(", ");
    const weightStr = o.estimated_weight_kg != null ? `${Number(o.estimated_weight_kg).toFixed(1)}kg` : "—";
    return `
      <div class="label">
        <div class="brand">
          ${logo ? `<img src="${logo}" alt="BundledMum">` : `<span class="wordmark">BundledMum</span>`}
          <div class="url">bundledmum.com</div>
        </div>
        <div class="section">
          <div class="section-label">TO</div>
          <div class="to-name">${escapeHtml(o.customer_name)}</div>
          ${o.delivery_address ? `<div class="to-line">${escapeHtml(o.delivery_address)}</div>` : ""}
          ${cityLine ? `<div class="to-line">${escapeHtml(cityLine)}</div>` : ""}
          ${o.customer_phone ? `<div class="to-phone">${escapeHtml(o.customer_phone)}</div>` : ""}
        </div>
        <div class="meta">
          <div class="row"><span class="k">ORDER</span><span class="v">${escapeHtml(o.order_number || "—")}</span></div>
          <div class="row"><span class="k">COURIER</span><span class="v">${escapeHtml(o.delivery_partner || "Unassigned")}</span></div>
          <div class="row"><span class="k">WEIGHT</span><span class="v">${escapeHtml(weightStr)}</span></div>
        </div>
        ${o.delivery_notes ? `<div class="notes">${escapeHtml(o.delivery_notes)}</div>` : ""}
      </div>`;
  }).join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
  .sheet { display: flex; flex-direction: column; align-items: center; padding: 10mm 0; gap: 4mm; }
  .label {
    width: 105mm; height: 148mm;
    background: #fff; border: 1px solid #ccc;
    padding: 10mm; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    display: flex; flex-direction: column;
    page-break-inside: avoid;
  }
  .brand { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6mm; border-bottom: 2px solid ${brand}; }
  .brand img { max-height: 10mm; display: block; }
  .brand .wordmark { font-weight: 700; color: ${brand}; font-size: 14px; letter-spacing: 1px; }
  .brand .url { font-size: 9px; color: #666; letter-spacing: 0.5px; }
  .section { margin-top: 5mm; padding-bottom: 4mm; border-bottom: 1px solid #e5e5e5; flex: 1; }
  .section-label { font-size: 9px; letter-spacing: 2px; color: #999; font-weight: 600; margin-bottom: 2mm; }
  .to-name { font-size: 14px; font-weight: 700; margin-bottom: 1mm; }
  .to-line { font-size: 11px; color: #333; margin-bottom: 0.5mm; }
  .to-phone { font-size: 11px; color: #333; margin-top: 1.5mm; font-weight: 600; }
  .meta { margin-top: 4mm; border-bottom: 1px solid #e5e5e5; padding-bottom: 4mm; }
  .meta .row { display: flex; justify-content: space-between; font-size: 10px; padding: 1.2mm 0; }
  .meta .k { color: #999; font-weight: 600; letter-spacing: 1px; }
  .meta .v { font-weight: 600; color: #222; font-family: ui-monospace, Menlo, monospace; }
  .notes { margin-top: 3mm; font-size: 9.5px; color: #555; font-style: italic; line-height: 1.4; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { background: #fff; }
    .sheet { padding: 0; gap: 0; }
    .label { border: none; box-shadow: none; margin: 0 auto; }
  }
</style>
</head>
<body>
  <div class="sheet">
    ${labels}
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) { throw new Error("Popup blocked — please allow popups to print labels"); }
  win.document.open();
  win.document.write(html);
  win.document.close();
  try { win.document.title = title; } catch { /* cross-origin noop */ }
}

// ---------- Initiate Return modal ----------
// Full multi-item modal that writes via the initiate_return RPC. Admin
// picks type + reason, selects which items (with quantity + per-item
// refund), and submits — the return lands on /admin/returns for review.

const RETURN_TYPES: Array<{ key: string; label: string }> = [
  { key: "return_refund", label: "Return + Refund" },
  { key: "exchange",      label: "Exchange" },
  { key: "store_credit",  label: "Store Credit" },
  { key: "return_only",   label: "Return Only" },
];

const INITIATE_REASONS = ["wrong_item", "damaged", "changed_mind", "not_as_described", "quality_issue", "other"];

function InitiateReturnModal({ order: o, onClose, onSubmitted }: {
  order: any;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const orderItems: any[] = Array.isArray(o.order_items) ? o.order_items : (Array.isArray(o.items) ? o.items : []);
  const [returnType, setReturnType] = useState("return_refund");
  const [reason, setReason] = useState(INITIATE_REASONS[0]);
  const [adminNotes, setAdminNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Per-item selection state — keyed by item.id. Each holds
  // { selected, quantity, refund }.
  const [items, setItems] = useState<Record<string, { selected: boolean; quantity: number; refund: number }>>(() => {
    const m: Record<string, { selected: boolean; quantity: number; refund: number }> = {};
    orderItems.forEach(it => {
      m[it.id] = { selected: false, quantity: Number(it.quantity || 1), refund: Number(it.line_total || it.unit_price || 0) };
    });
    return m;
  });
  // Auto-sum across selected items, but the admin can override.
  const autoRefund = Object.entries(items).reduce((s, [, v]) => s + (v.selected ? v.refund : 0), 0);
  const [refundAmount, setRefundAmount] = useState<number>(autoRefund);
  const [refundTouched, setRefundTouched] = useState(false);
  // Keep refund total in sync with selection until admin edits it.
  if (!refundTouched && refundAmount !== autoRefund) setRefundAmount(autoRefund);

  const anySelected = Object.values(items).some(v => v.selected);

  const submit = async () => {
    if (!anySelected) { toast.error("Select at least one item to return."); return; }
    if (!reason.trim()) { toast.error("Reason is required."); return; }
    setSubmitting(true);
    try {
      const itemsPayload = orderItems
        .filter(it => items[it.id]?.selected)
        .map(it => ({
          order_item_id: it.id,
          product_name: it.product_name,
          brand_name: it.brand_name,
          quantity: items[it.id].quantity,
          refund_amount: items[it.id].refund,
        }));
      const { error } = await (supabase.rpc as any)("initiate_return", {
        p_order_id: o.id,
        p_return_reason: reason,
        p_return_type: returnType,
        p_items_returned: itemsPayload,
        p_refund_amount: refundAmount,
        p_admin_notes: adminNotes.trim() || null,
      });
      if (error) throw error;
      toast.success("Return initiated — review on /admin/returns");
      onSubmitted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not initiate return");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90svh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-sm flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /> Initiate Return — {o.order_number}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1">Return type</label>
              <select value={returnType} onChange={e => setReturnType(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                {RETURN_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1">Reason (required)</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background capitalize">
                {INITIATE_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Items returned</label>
              <button onClick={() => {
                const allSelected = orderItems.every(it => items[it.id]?.selected);
                const next = { ...items };
                orderItems.forEach(it => { next[it.id] = { ...next[it.id], selected: !allSelected }; });
                setItems(next);
                setRefundTouched(false);
              }} className="text-[10px] text-forest font-semibold hover:underline">Toggle all</button>
            </div>
            <div className="space-y-1">
              {orderItems.length === 0 && <p className="text-xs text-text-light">No items on this order.</p>}
              {orderItems.map(it => {
                const state = items[it.id] || { selected: false, quantity: Number(it.quantity || 1), refund: Number(it.line_total || 0) };
                return (
                  <label key={it.id} className={`flex items-center gap-2 text-xs p-2 rounded-lg border ${state.selected ? "border-forest bg-forest/5" : "border-border"}`}>
                    <input
                      type="checkbox"
                      checked={state.selected}
                      onChange={e => { setItems({ ...items, [it.id]: { ...state, selected: e.target.checked } }); setRefundTouched(false); }}
                    />
                    <span className="flex-1 truncate">{it.product_name} {it.brand_name ? `(${it.brand_name})` : ""}</span>
                    <input
                      type="number"
                      min={1}
                      max={Number(it.quantity || 1)}
                      value={state.quantity}
                      onChange={e => { setItems({ ...items, [it.id]: { ...state, quantity: Number(e.target.value) || 1 } }); setRefundTouched(false); }}
                      className="w-14 border border-input rounded px-1.5 py-0.5 text-xs bg-background tabular-nums"
                      aria-label="Quantity"
                    />
                    <div className="flex items-center gap-0.5">
                      <span className="text-text-light">₦</span>
                      <input
                        type="number"
                        min={0}
                        value={state.refund}
                        onChange={e => { setItems({ ...items, [it.id]: { ...state, refund: Number(e.target.value) || 0 } }); setRefundTouched(false); }}
                        className="w-20 border border-input rounded px-1.5 py-0.5 text-xs bg-background tabular-nums"
                        aria-label="Refund amount"
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1">Total refund (editable)</label>
            <div className="flex items-center gap-1">
              <span className="text-text-light text-xs">₦</span>
              <input
                type="number"
                min={0}
                value={refundAmount}
                onChange={e => { setRefundAmount(Number(e.target.value) || 0); setRefundTouched(true); }}
                className="w-40 border border-input rounded-lg px-3 py-2 text-sm bg-background tabular-nums"
              />
              {refundTouched && <button onClick={() => { setRefundAmount(autoRefund); setRefundTouched(false); }} className="text-[11px] text-forest font-semibold hover:underline ml-2">Reset to auto-sum</button>}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground block mb-1">Admin notes</label>
            <textarea
              rows={2}
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              placeholder="Optional internal notes"
              className="w-full border border-input rounded-lg px-3 py-2 text-xs bg-background"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={submitting} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={submit} disabled={submitting || !anySelected}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              <RotateCcw className="w-3.5 h-3.5" /> Submit return
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription add-ons — shows a small info section inside the order detail
// drawer and renders a branded subscription invoice for print/PDF export.
// ---------------------------------------------------------------------------

function extractFromNotes(notes: string | null | undefined, label: string): string | null {
  if (!notes) return null;
  const re = new RegExp(`${label}\\s*:\\s*([^\\n·]+)`, "i");
  const m = notes.match(re);
  return m ? m[1].trim() : null;
}
function extractDeliveryNumberAO(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Delivery\s+(\d+)\s+of\s+(\d+)/i);
  return m ? `Delivery ${m[1]} of ${m[2]}` : null;
}

function SubscriptionInfoSection({ order }: { order: any }) {
  const deliveryNumber = extractDeliveryNumberAO(order.notes);
  const frequency = extractFromNotes(order.notes, "Frequency");
  const deliveryDay = extractFromNotes(order.notes, "Delivery day") || extractFromNotes(order.notes, "Delivery Day");
  const customerEmail = order.customer_email;
  return (
    <section className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest font-bold text-teal-800 flex items-center gap-1.5">
            🔄 Subscription Delivery
          </h3>
          <dl className="mt-1 text-xs space-y-0.5">
            {deliveryNumber && <div><dt className="inline text-teal-900/70">Delivery: </dt><dd className="inline font-semibold">{deliveryNumber}</dd></div>}
            {frequency && <div><dt className="inline text-teal-900/70">Frequency: </dt><dd className="inline font-semibold">{frequency}</dd></div>}
            {deliveryDay && <div><dt className="inline text-teal-900/70">Delivery day: </dt><dd className="inline font-semibold capitalize">{deliveryDay}</dd></div>}
          </dl>
        </div>
        {customerEmail && (
          <a
            href={`/admin/subscriptions?email=${encodeURIComponent(customerEmail)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
          >
            View subscription →
          </a>
        )}
      </div>
    </section>
  );
}

/** Open a standalone window with the SubscriptionInvoice mounted and trigger print. */
async function printSubscriptionInvoice(order: any) {
  try {
    const html = await buildSubscriptionInvoiceHtml(order);
    const w = window.open("", "bm-sub-invoice", "width=900,height=1200");
    if (!w) { toast.error("Pop-up blocked. Allow pop-ups to print the invoice."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give the doc a beat to lay out, then print.
    w.onload = () => { w.focus(); w.print(); };
  } catch (e: any) {
    toast.error(e?.message || "Could not open the invoice.");
  }
}

async function buildSubscriptionInvoiceHtml(order: any): Promise<string> {
  // Try to look up the linked subscription for cycle_size / price_locked_date / next_charge_date.
  let sub: any = null;
  if (order.subscription_order_id) {
    const { data } = await (supabase as any)
      .from("subscription_orders")
      .select("subscription_id, subscriptions(frequency, delivery_day, cycle_size, price_locked_date, next_charge_date)")
      .eq("id", order.subscription_order_id)
      .maybeSingle();
    sub = data?.subscriptions ?? null;
  }

  const invoiceNumber = order.order_number || `SUB-${String(order.id).slice(0, 8).toUpperCase()}`;
  const delivery = extractDeliveryNumberAO(order.notes);
  const freq = sub?.frequency || extractFromNotes(order.notes, "Frequency") || "—";
  const day = sub?.delivery_day || extractFromNotes(order.notes, "Delivery day") || extractFromNotes(order.notes, "Delivery Day") || "—";
  const items: any[] = order.items || order.order_items || [];
  const subtotal = Number(order.subtotal) || items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
  const total = Number(order.total) || subtotal;
  const discount = Math.max(0, subtotal - total);
  const nairaFmt = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
  const createdLong = order.created_at ? new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const lockedDate = sub?.price_locked_date ? new Date(sub.price_locked_date).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : null;
  const nextDate = sub?.next_charge_date ? new Date(sub.next_charge_date).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : null;
  const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);

  const rows = items.map((it, i) => `
    <tr>
      <td style="padding:6px 8px;border-top:1px solid #eee;color:#888">${i + 1}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee">${esc(it.product_name || "—")}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee;color:#555">${esc(it.brand_name || "—")}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right">${it.quantity || 0}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right">${nairaFmt(it.unit_price)}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right">${nairaFmt(Number(it.unit_price || 0) * Number(it.quantity || 0))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Invoice ${esc(invoiceNumber)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 24px; background: #fff; }
  .wrap { max-width: 780px; margin: 0 auto; font-size: 13px; line-height: 1.45; }
  .brand { color: #F4845F; font-weight: 900; font-size: 24px; }
  .label { color:#666; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:12px; border-bottom:2px solid #2D6A4F; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; background:#2D6A4F; color:#fff; }
  .box { border:2px solid #2D6A4F; border-radius:8px; padding:10px 12px; background: rgba(45,106,79,0.04); min-width:260px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#f2f2f2; text-align:left; padding:6px 8px; font-size:11px; }
  .total-row { font-weight:900; color:#2D6A4F; }
  .pay { margin-top:14px; padding:10px 14px; border-radius:8px; background:rgba(45,106,79,0.06); font-size:12px; }
  @media print { @page { size: A4; margin: 14mm } body { padding:0 } }
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div><div class="brand">BundledMum</div><div style="font-size:11px;color:#666">hr@bundledmum.com · Lagos, Nigeria</div></div>
    <div style="text-align:right">
      <div class="label" style="color:#2D6A4F">Subscription Delivery Invoice</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">Invoice #${esc(invoiceNumber)}</div>
      <div style="font-size:11px;color:#666">${esc(createdLong)}</div>
      ${delivery ? `<div style="margin-top:4px"><span class="pill">${esc(delivery)}</span></div>` : ""}
    </div>
  </div>

  <div style="display:flex;gap:14px;margin:14px 0">
    <div style="flex:1">
      <div class="label">Bill to</div>
      <div style="font-weight:700">${esc(order.customer_name || "—")}</div>
      ${order.customer_email ? `<div style="color:#555">${esc(order.customer_email)}</div>` : ""}
      ${order.customer_phone ? `<div style="color:#555">${esc(order.customer_phone)}</div>` : ""}
      <div style="color:#555;white-space:pre-line;margin-top:6px">${esc([order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join("\n"))}</div>
    </div>
    <div class="box">
      <div class="label" style="color:#2D6A4F">Subscription details</div>
      <div style="font-size:12px"><span style="color:#666">Frequency:</span> <b>${esc(freq)}</b></div>
      <div style="font-size:12px"><span style="color:#666">Delivery Day:</span> <b>${esc(day).replace(/^./, c => c.toUpperCase())}</b></div>
      <div style="font-size:12px"><span style="color:#666">Courier:</span> <b>${esc(order.delivery_partner || "To be assigned")}</b></div>
      ${order.estimated_weight_kg != null ? `<div style="font-size:12px"><span style="color:#666">Est. Weight:</span> <b>${Number(order.estimated_weight_kg).toFixed(1)}kg</b></div>` : ""}
    </div>
  </div>

  <table>
    <thead><tr><th style="width:24px">#</th><th>Product</th><th>Brand</th><th style="text-align:right;width:50px">Qty</th><th style="text-align:right;width:90px">Unit Price</th><th style="text-align:right;width:90px">Line Total</th></tr></thead>
    <tbody>${rows || `<tr><td colSpan="6" style="padding:12px;text-align:center;color:#888">No items.</td></tr>`}</tbody>
  </table>

  <div style="margin-top:10px;display:flex;justify-content:flex-end">
    <table style="width:280px">
      <tbody>
        <tr><td style="padding:2px 0;color:#666">Subtotal</td><td style="text-align:right;padding:2px 0">${nairaFmt(subtotal)}</td></tr>
        ${discount > 0 ? `<tr><td style="padding:2px 0;color:#666">Subscription discount</td><td style="text-align:right;padding:2px 0">−${nairaFmt(discount)}</td></tr>` : ""}
        <tr><td style="padding:2px 0;color:#666">Delivery</td><td style="text-align:right;padding:2px 0;color:#2D6A4F;font-weight:700">FREE</td></tr>
        <tr class="total-row"><td style="padding:6px 0;border-top:2px solid #2D6A4F">TOTAL</td><td style="text-align:right;padding:6px 0;border-top:2px solid #2D6A4F">${nairaFmt(total)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="pay">
    <div><span class="label">Status</span> &nbsp; <span class="pill">${esc((order.payment_status || "paid").toUpperCase())}</span></div>
    ${sub?.cycle_size != null ? `<div style="margin-top:4px;color:#555">Payment covers ${sub.cycle_size} deliveries in this cycle.</div>` : ""}
    ${lockedDate ? `<div style="color:#555">Prices locked at rate on ${esc(lockedDate)}.</div>` : ""}
    ${nextDate ? `<div style="color:#555">Next delivery: ${esc(nextDate)}.</div>` : ""}
  </div>

  <div style="margin-top:22px;padding-top:8px;border-top:1px solid #eee;text-align:center;color:#777;font-size:10px">
    <div><b style="color:#F4845F">BundledMum</b> …making being a mum easier</div>
    <div>Thank you for subscribing. Manage your subscription at bundledmum.com/account/subscriptions</div>
  </div>
</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────
// Express Order management card — surfaces lifecycle actions when an
// order was placed with is_express_order=true. Drives the
// pending_quote → quoted → accepted/declined/expired transitions.
// ─────────────────────────────────────────────────────────────────────
function ExpressOrderCard({
  order: o,
  adminUser,
  can,
}: {
  order: any;
  adminUser: any;
  can: (m: string, a: string) => boolean;
}) {
  const queryClient = useQueryClient();
  const canEdit = can("orders", "edit_status") || can("orders", "edit");
  const status = (o.express_status || "pending_quote") as
    | "pending_quote" | "quoted" | "accepted" | "declined" | "expired";

  const [quoteInput, setQuoteInput] = useState<string>("");
  const [refInput, setRefInput] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [showWaTemplate, setShowWaTemplate] = useState(false);

  // SLA — hours since the relevant timestamp for the current status.
  const slaAnchor = status === "quoted" && o.express_quoted_at
    ? new Date(o.express_quoted_at).getTime()
    : o.created_at ? new Date(o.created_at).getTime() : Date.now();
  const hours = Math.max(0, Math.floor((Date.now() - slaAnchor) / 3_600_000));
  const slaTone: "normal" | "warn" | "breach" =
    status !== "pending_quote" && status !== "quoted"
      ? "normal"
      : hours >= 24 ? "breach" : hours >= 12 ? "warn" : "normal";

  const statusBadgeClass: Record<string, string> = {
    pending_quote: "bg-amber-100 text-amber-800 border border-amber-300",
    quoted: "bg-blue-100 text-blue-800 border border-blue-300",
    accepted: "bg-green-100 text-green-800 border border-green-300",
    declined: "bg-gray-100 text-gray-700 border border-gray-300",
    expired: "bg-red-100 text-red-800 border border-red-300",
  };
  const statusLabel: Record<string, string> = {
    pending_quote: "Pending Quote",
    quoted: "Quoted",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-history", o.id] });
    // The parent OrderDetailPage receives `o` from the parent list query,
    // so invalidating admin-orders is enough — but force a refetch of the
    // status_history feed too so the audit row appears immediately.
  };

  const writeStatusHistory = async (newStatus: string, note: string) => {
    await supabase.from("order_status_history").insert({
      order_id: o.id,
      old_status: status,
      new_status: `express:${newStatus}`,
      changed_by: adminUser?.id || null,
      note,
    });
  };

  const saveQuote = async () => {
    const amount = parseInt(quoteInput, 10);
    if (!amount || amount <= 0) { toast.error("Enter a quote amount"); return; }
    if (!confirm(`Send quote of ₦${amount.toLocaleString()} to ${o.customer_name || "this customer"}? You must contact them via WhatsApp after this.`)) return;
    setPending(true);
    const { error } = await supabase.from("orders").update({
      express_status: "quoted",
      express_delivery_quote: amount,
      express_quoted_at: new Date().toISOString(),
    }).eq("id", o.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await writeStatusHistory("quoted", `Delivery quote ₦${amount.toLocaleString()}`);
    toast.success("Quote saved. Now contact customer via WhatsApp.");
    setShowWaTemplate(true);
    invalidate();
    setPending(false);
  };

  const markAccepted = async () => {
    const ref = refInput.trim();
    if (!ref) { toast.error("Enter the Paystack reference"); return; }
    if (!confirm("Mark this Express Order as accepted? The order can then move to fulfilment.")) return;
    setPending(true);
    const { error } = await supabase.from("orders").update({
      express_status: "accepted",
      express_payment_reference: ref,
    }).eq("id", o.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await writeStatusHistory("accepted", `Paystack ref: ${ref}`);
    toast.success("Express Order accepted. Order can now be fulfilled.");
    invalidate();
    setPending(false);
  };

  const markDeclined = async () => {
    if (!confirm("Customer declined the delivery quote?")) return;
    setPending(true);
    const { error } = await supabase.from("orders").update({ express_status: "declined" }).eq("id", o.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await writeStatusHistory("declined", "Customer declined quote");
    toast.success("Marked declined. Consider refunding the product payment if applicable.");
    invalidate();
    setPending(false);
  };

  const markExpired = async () => {
    if (!confirm("Mark this Express Order as expired? This means 24h passed without a response.")) return;
    setPending(true);
    const { error } = await supabase.from("orders").update({ express_status: "expired" }).eq("id", o.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await writeStatusHistory("expired", "24h SLA elapsed without response");
    toast.success("Marked expired");
    invalidate();
    setPending(false);
  };

  const resumeQuote = async () => {
    if (!confirm("Reset to pending quote? This will allow you to send a new delivery quote.")) return;
    setPending(true);
    const { error } = await supabase.from("orders").update({
      express_status: "pending_quote",
      express_delivery_quote: null,
      express_quoted_at: null,
      express_payment_reference: null,
    }).eq("id", o.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await writeStatusHistory("pending_quote", "Reset to pending quote");
    toast.success("Reset to pending quote");
    invalidate();
    setPending(false);
  };

  const waTemplate = (() => {
    const first = (o.customer_name || "there").split(" ")[0];
    const amount = o.express_delivery_quote || parseInt(quoteInput, 10) || 0;
    return [
      `Hi ${first}, your BundledMum Express Order ${o.order_number || ""} is ready! Your delivery fee is ₦${amount.toLocaleString()}.`,
      ``,
      `To complete your order, please pay the delivery fee here:`,
      `[PAYSTACK LINK]`,
      ``,
      `Once paid, we will ship your order within 24-48 hours.`,
      ``,
      `Thank you!`,
      `The BundledMum Team`,
    ].join("\n");
  })();

  const copyWa = async () => {
    try {
      await navigator.clipboard.writeText(waTemplate);
      toast.success("WhatsApp template copied");
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
  };

  const slaLine = (() => {
    if (status !== "pending_quote" && status !== "quoted") return null;
    const verb = status === "quoted" ? "Quoted" : "Submitted";
    if (slaTone === "breach") {
      return <p className="text-sm font-bold text-red-700">🔴 {hours}h ago — SLA BREACHED</p>;
    }
    if (slaTone === "warn") {
      return <p className="text-sm font-semibold text-amber-700">⚠️ {hours}h ago — quote due soon</p>;
    }
    return <p className="text-sm text-text-med">{verb} {hours} hour{hours === 1 ? "" : "s"} ago</p>;
  })();

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50/40 p-4 md:p-5 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
          ⚡ EXPRESS ORDER
        </h2>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${statusBadgeClass[status] || statusBadgeClass.pending_quote}`}>
          {statusLabel[status] || status}
        </span>
      </div>

      {slaLine}
      <p className="text-xs text-amber-900/80 mt-1">
        Customer paid for products only. Delivery quote required.
      </p>

      {/* Pending quote — gather amount, send + show WhatsApp template */}
      {status === "pending_quote" && canEdit && (
        <div className="mt-4 bg-card border border-amber-200 rounded-lg p-3">
          <h3 className="text-sm font-bold mb-1">Enter Delivery Quote</h3>
          <p className="text-[12px] text-text-med mb-2">
            Use the courier admin tools to calculate the delivery cost, add your markup, then enter the final customer-facing amount.
          </p>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-text-med text-sm">₦</span>
            <input
              type="number" min={0}
              value={quoteInput}
              onChange={(e) => setQuoteInput(e.target.value)}
              placeholder="e.g. 15000"
              className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={saveQuote}
              disabled={pending || !quoteInput || parseInt(quoteInput, 10) <= 0}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50"
            >
              Mark as Quoted
            </button>
            <button
              onClick={markExpired}
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 border border-border px-3 py-2 rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              Mark as Expired
            </button>
          </div>
        </div>
      )}

      {/* Quoted — capture Paystack ref, accept / decline / expire */}
      {status === "quoted" && (
        <div className="mt-4 bg-card border border-amber-200 rounded-lg p-3">
          <p className="text-sm">
            Quoted <span className="font-bold">₦{Number(o.express_delivery_quote || 0).toLocaleString()}</span>
            {o.express_quoted_at && <> on {new Date(o.express_quoted_at).toLocaleString()}</>}
          </p>
          <p className="text-[12px] text-text-med mt-1">
            Waiting for customer to pay delivery fee separately via Paystack.
          </p>

          {/* WhatsApp template — visible after Mark as Quoted, and also
              reopenable while still in the quoted phase. */}
          {(showWaTemplate || true) && canEdit && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">📋 WhatsApp template</p>
                <button onClick={copyWa} className="text-[11px] font-semibold text-amber-900 hover:underline">Copy</button>
              </div>
              <pre className="text-[11px] text-amber-900 whitespace-pre-wrap font-body cursor-text" onClick={copyWa}>
                {waTemplate}
              </pre>
            </div>
          )}

          {canEdit && (
            <div className="mt-3 grid gap-2">
              <div className="flex items-center gap-2">
                <span className="text-text-med text-xs whitespace-nowrap">Paystack Reference:</span>
                <input
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="e.g. T1234567890ABC"
                  className="flex-1 border border-input rounded-lg px-3 py-1.5 text-xs bg-background"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={markAccepted}
                  disabled={pending || !refInput.trim()}
                  className="inline-flex items-center justify-center bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50"
                >
                  Mark as Accepted
                </button>
                <button
                  onClick={markDeclined}
                  disabled={pending}
                  className="inline-flex items-center justify-center border border-border px-3 py-2 rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Mark as Declined
                </button>
                <button
                  onClick={markExpired}
                  disabled={pending}
                  className="inline-flex items-center justify-center border border-red-300 text-red-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  Mark as Expired
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {status === "accepted" && (
        <div className="mt-3 bg-green-50 border border-green-300 rounded-lg p-3">
          <p className="font-bold text-green-800 text-sm">✅ Express Order Accepted</p>
          <p className="text-xs text-green-800 mt-1">
            Delivery quote: <span className="font-bold">₦{Number(o.express_delivery_quote || 0).toLocaleString()}</span>
            {o.express_quoted_at && <> · Quoted at {new Date(o.express_quoted_at).toLocaleString()}</>}
          </p>
          {o.express_payment_reference && (
            <p className="text-xs text-green-800">Paystack reference: <span className="font-mono">{o.express_payment_reference}</span></p>
          )}
          <p className="text-[12px] text-green-900 mt-2">
            → Order can now be fulfilled normally (use the standard <em>Mark as Packed</em> / <em>Mark as Shipped</em> controls below).
          </p>
        </div>
      )}

      {(status === "declined" || status === "expired") && (
        <div className={`mt-3 border rounded-lg p-3 ${status === "expired" ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-300"}`}>
          <p className={`font-bold text-sm ${status === "expired" ? "text-red-800" : "text-gray-800"}`}>
            {status === "expired" ? "🔴 Express Order Expired" : "Customer Declined"}
          </p>
          <p className="text-xs text-text-med mt-1">
            {status === "expired"
              ? "24 hours elapsed without the customer paying the delivery fee. Order cannot proceed to shipping."
              : "Customer declined the delivery quote. Consider refunding the product payment if applicable."}
          </p>
          {canEdit && (
            <button
              onClick={resumeQuote}
              disabled={pending}
              className="mt-3 inline-flex items-center justify-center border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              Resume Quote
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Edit Order — additive controls for adding / removing items on a paid
// order. Notify and refund flows are manual (admin must trigger the
// Paystack refund themselves after clicking "Items Removed").
// ─────────────────────────────────────────────────────────────────────
function EditOrderCard({
  order: o,
  adminUser,
  can,
}: {
  order: any;
  adminUser: any;
  can: (m: string, a: string) => boolean;
}) {
  const queryClient = useQueryClient();
  const canEdit = can("orders", "edit");
  const lockedStatuses = ["shipped", "delivered", "cancelled"];
  const isLocked = lockedStatuses.includes(o.order_status);

  const items: any[] = useMemo(
    () => (Array.isArray(o.order_items) ? o.order_items : []).slice().sort(
      (a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""),
    ),
    [o.order_items],
  );

  const [pending, setPending] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showItemsUpdatedConfirm, setShowItemsUpdatedConfirm] = useState(false);
  const [showItemsRemovedConfirm, setShowItemsRemovedConfirm] = useState(false);

  const refreshOrder = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-order-detail", o.id] });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  // After any items change, recompute the order's subtotal/total so the
  // header summary stays in sync. The order_items trigger doesn't
  // propagate up to orders, so we recompute client-side.
  const recomputeTotals = async () => {
    const { data: latest, error } = await supabase
      .from("order_items").select("line_total").eq("order_id", o.id);
    if (error) { toast.error(error.message); return; }
    const subtotal = (latest || []).reduce((s: number, r: any) => s + Number(r.line_total || 0), 0);
    const discount = Number(o.discount_amount || 0) + Number(o.spend_discount_amount || 0);
    const total = subtotal + Number(o.delivery_fee || 0) + Number(o.service_fee || 0) - discount;
    const { error: upErr } = await supabase
      .from("orders")
      .update({
        subtotal,
        total,
        last_edited_at: new Date().toISOString(),
        last_edited_by: adminUser?.email || null,
      })
      .eq("id", o.id);
    if (upErr) { toast.error(upErr.message); return; }
  };

  const handleQtyChange = async (item: any, nextQty: number) => {
    if (!canEdit) return;
    if (!Number.isFinite(nextQty) || nextQty < 1) {
      toast.error("Use the remove button to take an item off the order.");
      return;
    }
    if (nextQty > 99) nextQty = 99;
    if (nextQty === item.quantity) return;
    setPending(true);
    const newLineTotal = Number(item.unit_price || 0) * nextQty;
    const { error } = await supabase.from("order_items").update({
      quantity: nextQty, line_total: newLineTotal,
    }).eq("id", item.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await recomputeTotals();
    refreshOrder();
    toast.success("Quantity updated");
    setPending(false);
  };

  const handleRemove = async (item: any) => {
    if (!canEdit) return;
    if (items.length <= 1) {
      toast.error("Order must have at least one item. Cancel the order instead.");
      return;
    }
    if (!confirm(`Remove ${item.product_name} from this order?`)) return;
    setPending(true);
    const { error } = await supabase.from("order_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); setPending(false); return; }
    await recomputeTotals();
    refreshOrder();
    toast.success("Item removed");
    setPending(false);
  };

  const sendNotification = async (refundPending: boolean) => {
    setPending(true);
    try {
      const { data: customerRes, error: customerErr } = await (supabase as any)
        .functions.invoke("send-transactional-email", {
          body: { email_type: "order_updated", order_id: o.id, refund_pending: refundPending },
        });
      if (customerErr || (customerRes && customerRes.success === false)) {
        throw new Error(customerErr?.message || customerRes?.error || "Customer email failed");
      }
      const { data: internalRes, error: internalErr } = await (supabase as any)
        .functions.invoke("send-transactional-email", {
          body: {
            email_type: "internal_order_edited",
            order_id: o.id,
            refund_pending: refundPending,
            edited_by: adminUser?.email || null,
            notification_type: refundPending ? "Items removed — refund pending" : "Items updated",
          },
        });
      if (internalErr) console.warn("[EditOrder] internal email failed:", internalErr);
      void internalRes;
      await supabase.from("orders").update({ last_edit_notified_at: new Date().toISOString() }).eq("id", o.id);
      refreshOrder();
      if (refundPending) {
        toast.success("Customer notified about refund. Now process the refund in Paystack.");
        setTimeout(() => { window.open("https://dashboard.paystack.com/#/transactions", "_blank", "noopener"); }, 1000);
      } else {
        toast.success("Customer notified. Admin audit email sent.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Notification failed");
    } finally {
      setPending(false);
      setShowItemsUpdatedConfirm(false);
      setShowItemsRemovedConfirm(false);
    }
  };

  if (isLocked) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 mb-4 opacity-70">
        <h3 className="text-sm font-bold mb-1">Edit Order</h3>
        <p className="text-xs text-muted-foreground">
          Order cannot be edited — already {o.order_status}.
        </p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-sm font-bold mb-1">Edit Order</h3>
        <p className="text-xs text-muted-foreground">
          You need 'Orders' edit permission to modify this order.
        </p>
      </div>
    );
  }

  const lastEditedLine = (() => {
    if (!o.last_edited_at) return null;
    const ts = new Date(o.last_edited_at);
    return `Last edited ${ts.toLocaleString()}${o.last_edited_by ? ` by ${o.last_edited_by}` : ""}`;
  })();

  const lastNotifiedLine = (() => {
    if (!o.last_edit_notified_at) return "Never";
    const diffMin = Math.max(0, Math.floor((Date.now() - new Date(o.last_edit_notified_at).getTime()) / 60000));
    if (diffMin < 60) return `Last notified ${diffMin} min ago`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `Last notified ${h}h ago`;
    return `Last notified ${new Date(o.last_edit_notified_at).toLocaleString()}`;
  })();

  const notifyDisabled = pending || !o.last_edited_at;

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <div className="mb-3">
          <h3 className="text-sm font-bold">Edit Order</h3>
          <p className="text-xs text-muted-foreground">
            Add or remove items. Customer notification is separate from save.
          </p>
          {lastEditedLine && (
            <p className="text-[11px] text-text-light mt-1">{lastEditedLine}</p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-muted/40 text-text-med">
              <tr>
                <th className="text-left px-2 py-2 text-xs font-semibold">Product</th>
                <th className="text-center px-2 py-2 text-xs font-semibold w-20">Qty</th>
                <th className="text-right px-2 py-2 text-xs font-semibold w-28">Unit ₦</th>
                <th className="text-right px-2 py-2 text-xs font-semibold w-28">Line Total</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                    No items on this order.
                  </td>
                </tr>
              ) : items.map((item: any) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-2 py-2">
                    {item.bundle_name && <div className="text-[10px] font-bold text-coral mb-0.5">📦 {item.bundle_name}</div>}
                    <div className="font-semibold">{item.product_name}</div>
                    <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
                      {item.brand_name && <span>Brand: {item.brand_name}</span>}
                      {item.size && <span>Size: {item.size}</span>}
                      {item.color && <span>Colour: {formatColor(item.color)}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number" min={1} max={99}
                      defaultValue={item.quantity}
                      onBlur={(e) => handleQtyChange(item, parseInt(e.target.value, 10))}
                      className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-center"
                      disabled={pending}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(item.unit_price || 0)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{fmt(item.line_total || 0)}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => handleRemove(item)}
                      disabled={pending}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-40"
                      title="Remove from order"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          <button
            onClick={() => setShowAdd(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
        </div>

        <div className="border-t border-border mt-5 pt-4">
          <h4 className="text-sm font-bold mb-1">Notify Customer</h4>
          <p className="text-[11px] text-text-light mb-3 leading-relaxed">
            Sends the customer an email with the updated order summary. Use <strong>Refund Pending</strong> when items were removed — the customer is told their refund arrives within 30 min – 1 hour. You MUST then process the refund in Paystack.
          </p>
          <p className="text-[11px] text-text-light mb-2">{lastNotifiedLine}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setShowItemsUpdatedConfirm(true)}
              disabled={notifyDisabled}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50"
            >
              Items Updated
            </button>
            <button
              onClick={() => setShowItemsRemovedConfirm(true)}
              disabled={notifyDisabled}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-amber-500 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              Items Removed (Refund Pending)
            </button>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddItemDialog
          order={o}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            await recomputeTotals();
            refreshOrder();
            setShowAdd(false);
            toast.success("Item added");
          }}
        />
      )}

      {showItemsUpdatedConfirm && (
        <NotifyConfirmModal
          variant="updated"
          pending={pending}
          onClose={() => setShowItemsUpdatedConfirm(false)}
          onConfirm={() => sendNotification(false)}
        />
      )}
      {showItemsRemovedConfirm && (
        <NotifyConfirmModal
          variant="removed"
          pending={pending}
          onClose={() => setShowItemsRemovedConfirm(false)}
          onConfirm={() => sendNotification(true)}
        />
      )}
    </>
  );
}

function NotifyConfirmModal({
  variant, pending, onClose, onConfirm,
}: { variant: "updated" | "removed"; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const isRemoved = variant === "removed";
  return (
    <div className="fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4" onClick={() => !pending && onClose()}>
      <div className="bg-card border border-border rounded-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-base mb-2">
          {isRemoved ? "Notify customer about refund?" : "Notify customer about updated order?"}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isRemoved
            ? "Send the customer an updated order email WITH refund notice (30 min – 1 hour)? After sending, you MUST process the refund in the Paystack dashboard."
            : "Send the customer an updated order email? They will see the new item list with no refund note."}
        </p>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={pending} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 ${isRemoved ? "bg-amber-500 hover:bg-amber-600" : "bg-forest hover:bg-forest-deep"}`}
          >
            {pending ? "Sending…" : isRemoved ? "Send & Open Paystack" : "Send notification"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddItemDialog({
  order, onClose, onAdded,
}: { order: any; onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<any | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [adding, setAdding] = useState(false);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["admin-edit-order-product-search", query.trim()],
    enabled: query.trim().length >= 2 && !selectedProduct,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug")
        .eq("is_active", true)
        .ilike("name", `%${query.trim()}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["admin-edit-order-brands", selectedProduct?.id],
    enabled: !!selectedProduct,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brands_public")
        .select("id, brand_name, price, in_stock, stock_quantity")
        .eq("product_id", selectedProduct!.id)
        .eq("in_stock", true)
        .gt("price", 0)
        .order("price");
      if (error) throw error;
      return data || [];
    },
  });

  const linePreview = selectedBrand ? Number(selectedBrand.price || 0) * qty : 0;

  const handleAdd = async () => {
    if (!selectedProduct || !selectedBrand) return;
    if (!qty || qty < 1) { toast.error("Enter a quantity of at least 1"); return; }
    setAdding(true);
    const unitPrice = Number(selectedBrand.price || 0);
    const { error } = await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: selectedProduct.id,
      brand_id: selectedBrand.id,
      product_name: selectedProduct.name,
      brand_name: selectedBrand.brand_name,
      quantity: qty,
      unit_price: unitPrice,
      line_total: unitPrice * qty,
      size: null, color: null, bundle_name: null,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    onAdded();
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4" onClick={() => !adding && onClose()}>
      <div className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">Add Item to Order</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><XIcon className="w-4 h-4" /></button>
        </div>

        {/* Step 1 — product search */}
        {!selectedProduct && (
          <>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Search Product</label>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing a product name…"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
            {query.trim().length >= 2 && (
              <div className="mt-2 max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {(searchResults as any[]).length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">No products match "{query.trim()}"</p>
                ) : (
                  (searchResults as any[]).map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProduct(p); setSelectedBrand(null); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Step 2 — brand picker */}
        {selectedProduct && !selectedBrand && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Selected</p>
                <p className="text-sm font-semibold">{selectedProduct.name}</p>
              </div>
              <button onClick={() => { setSelectedProduct(null); setQuery(""); }} className="text-[11px] text-forest font-semibold hover:underline">
                ← Change product
              </button>
            </div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Choose Brand</label>
            <div className="space-y-1">
              {(brands as any[]).length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center border border-dashed border-border rounded-lg">
                  No in-stock brands for this product.
                </p>
              ) : (brands as any[]).map((b: any) => {
                const lowStock = b.stock_quantity != null && b.stock_quantity > 0 && b.stock_quantity <= 5;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBrand(b)}
                    className="w-full flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm hover:border-forest hover:bg-forest-light/40"
                  >
                    <span className="font-semibold">
                      {b.brand_name}
                      {lowStock && <span className="ml-2 text-[10px] text-amber-700 font-bold">⚠ {b.stock_quantity} left</span>}
                    </span>
                    <span className="font-semibold text-forest">{fmt(b.price)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Step 3 — qty + preview */}
        {selectedProduct && selectedBrand && (
          <>
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Selected</p>
              <p className="text-sm font-semibold">{selectedProduct.name}</p>
              <p className="text-xs text-text-med">{selectedBrand.brand_name} · {fmt(selectedBrand.price)}</p>
              <button
                onClick={() => setSelectedBrand(null)}
                className="text-[11px] text-forest font-semibold hover:underline mt-1 inline-block"
              >
                ← Change brand
              </button>
            </div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Quantity</label>
            <input
              type="number" min={1} max={99}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
            <div className="mt-3 rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm">
              Adding: <span className="font-semibold">{selectedBrand.brand_name} × {qty}</span> = <span className="font-bold text-forest">{fmt(linePreview)}</span>
            </div>
          </>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={adding} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedProduct || !selectedBrand || adding}
            className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add to Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
