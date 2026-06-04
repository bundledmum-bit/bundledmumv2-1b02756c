import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ChevronDown, ChevronRight, Package, Truck } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  packed: "bg-purple-100 text-purple-700",
  shipped: "bg-cyan-100 text-cyan-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-orange-100 text-orange-700",
  refunded: "bg-gray-200 text-gray-700",
  failed: "bg-red-100 text-red-700",
};

const fmt = (n: number | null | undefined) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;
const formatColor = (color: string | null | undefined): string => {
  if (!color) return "";
  if (color === "boy") return "Boy (Blue)";
  if (color === "girl") return "Girl (Pink)";
  if (color === "neutral") return "Neutral (White)";
  return color;
};

export default function AccountOrdersPage() {
  const { user } = useCustomerAuth();
  const email = user?.email || "";
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders", email],
    enabled: !!email,
    queryFn: async () => {
      // Order header rows. We deliberately DROP the previous
      // `order_items(*)` embed: that exposed cost/margin columns
      // (cost_price, cogs_amount, line_cost, net_sales) to the customer.
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("*")
        .eq("customer_email", email)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const orders = (data || []) as any[];

      // Line items now come from the cost-safe customer_order_items view
      // (own-orders only, filtered by JWT email internally). Fetched as a
      // separate query keyed by order_id and re-attached as `order_items`
      // so the existing render is unchanged.
      const ids = orders.map((o) => o.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: itemsData, error: itemsErr } = await (supabase as any)
          .from("customer_order_items")
          .select("*")
          .in("order_id", ids);
        if (itemsErr) throw itemsErr;
        const byOrder: Record<string, any[]> = {};
        (itemsData || []).forEach((it: any) => {
          (byOrder[it.order_id] ||= []).push(it);
        });
        orders.forEach((o) => { o.order_items = byOrder[o.id] || []; });
      } else {
        orders.forEach((o) => { o.order_items = []; });
      }
      return orders;
    },
  });

  const totalSpent = useMemo(() => (orders || []).reduce((s, o) => s + (Number(o.total) || 0), 0), [orders]);

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-20 md:pb-10 px-4">
      <div className="max-w-[680px] mx-auto pt-6">
        <Link to="/account" className="inline-flex items-center gap-1 text-xs text-text-med hover:text-forest mb-4">
          <ArrowLeft className="w-3 h-3" /> Back to account
        </Link>

        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="pf text-2xl font-bold flex items-center gap-2"><Package className="w-5 h-5" /> My Orders</h1>
            {orders && orders.length > 0 && (
              <p className="text-xs text-text-med mt-1">{orders.length} order{orders.length === 1 ? "" : "s"} · lifetime {fmt(totalSpent)}</p>
            )}
          </div>
          <Link to="/track-order" className="text-xs font-semibold text-forest hover:underline whitespace-nowrap">Track another order →</Link>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-card h-24 animate-pulse" />
            ))}
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="bg-card border border-border rounded-card p-8 text-center">
            <div className="text-3xl mb-2">🛍️</div>
            <h2 className="pf text-lg mb-1">No orders yet</h2>
            <p className="text-text-med text-sm mb-4">Start with our quiz — we'll build a personalised bundle for you.</p>
            <Link to="/quiz" className="inline-block rounded-pill bg-forest text-primary-foreground px-6 py-2.5 text-sm font-semibold hover:bg-forest-deep min-h-[44px]">
              Take the quiz →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(o => {
              const expanded = expandedId === o.id;
              const items: any[] = Array.isArray(o.order_items) ? o.order_items : [];
              return (
                <article key={o.id} className="bg-card border border-border rounded-card overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : o.id)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{o.order_number || "Order"}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-pill capitalize ${STATUS_COLORS[o.order_status] || "bg-muted text-text-med"}`}>
                          {o.order_status}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-light mt-0.5">
                        {new Date(o.created_at).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" })} ·
                        {" "}{items.length} item{items.length === 1 ? "" : "s"} ·
                        {" "}{fmt(o.total)}
                      </div>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-text-light" /> : <ChevronRight className="w-4 h-4 text-text-light" />}
                  </button>

                  {expanded && (
                    <div className="border-t border-border px-4 py-3 text-xs space-y-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-1">Items</div>
                        <ul className="space-y-1">
                          {items.map((it: any) => (
                            <li key={it.id} className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate">
                                  {it.bundle_name ? <span className="text-coral font-semibold mr-1">[{it.bundle_name}]</span> : null}
                                  {it.product_name}{it.brand_name ? ` (${it.brand_name})` : ""} × {it.quantity}
                                </div>
                                {(it.size || it.color) && (
                                  <div className="text-[11px] text-text-light flex flex-wrap gap-x-2">
                                    {it.size && <span>Size / Age: {it.size}</span>}
                                    {it.color && <span>Colour: {formatColor(it.color)}</span>}
                                  </div>
                                )}
                              </div>
                              <span className="tabular-nums text-text-med">{fmt(it.line_total || (it.unit_price * it.quantity))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Delivery</div>
                          <div className="mt-0.5 leading-snug">
                            {o.delivery_address || "—"}
                            {o.delivery_city ? `, ${o.delivery_city}` : ""}
                            {o.delivery_state ? `, ${o.delivery_state}` : ""}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light inline-flex items-center gap-1">
                            <Truck className="w-3 h-3" /> Courier
                          </div>
                          <div className="mt-0.5">{o.actual_courier_partner || o.delivery_partner || "Assigned at dispatch"}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-text-light">Total</span>
                        <span className="font-bold text-forest tabular-nums">{fmt(o.total)}</span>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
