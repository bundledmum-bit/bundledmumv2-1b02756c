import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart, ChevronDown, ChevronRight, MessageCircle, Check, X,
  AlertTriangle, Loader2, PackageOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Money is INTEGER NAIRA everywhere. Never divide by 100.
const fmtNaira = (n: unknown): string => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;

const fmtDate = (d: unknown): string => {
  if (!d) return "Unknown";
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const ERROR_POINT_LABEL: Record<string, string> = {
  cart: "Cart",
  checkout: "Checkout",
  payment: "Payment",
  place_order: "Place order",
  verify_payment: "Verify payment",
};
const ERROR_TYPE_LABEL: Record<string, string> = {
  unavailable_unpriced: "Unavailable / unpriced",
  payment_failed: "Payment failed",
  technical: "Technical",
  validation: "Validation",
  other: "Other",
};

type CartItem = { qty?: number; name?: string; price?: number; size?: string | null };

function ItemList({ items }: { items: unknown }) {
  const list: CartItem[] = Array.isArray(items) ? (items as CartItem[]) : [];
  if (list.length === 0) return <p className="text-xs text-text-light">No cart items captured.</p>;
  return (
    <ul className="space-y-1">
      {list.map((it, i) => (
        <li key={i} className="text-xs text-text-med flex items-center justify-between gap-3">
          <span>
            {(it.qty || 1)}x {it.name || "Item"}
            {it.size ? <span className="text-text-light"> ({it.size})</span> : null}
          </span>
          <span className="font-semibold text-foreground whitespace-nowrap">{fmtNaira(it.price)}</span>
        </li>
      ))}
    </ul>
  );
}

function CaptureRow({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const name = (row.customer_name || "").trim() || "No name";
  const fullAddress = [row.delivery_address, row.delivery_city, row.delivery_state].filter(Boolean).join(", ");
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        {open ? <ChevronDown className="w-4 h-4 text-text-light flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-light flex-shrink-0" />}
        <div className="min-w-0 flex-1 grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-0.5 items-center">
          <span className="font-semibold text-sm truncate">{name}</span>
          <span className="text-xs text-text-med truncate">{row.email || "No email"}</span>
          <span className="text-xs text-text-med truncate">{row.phone || "No phone"}</span>
          <span className="text-xs text-text-med">{row.item_count || 0} item{(row.item_count || 0) === 1 ? "" : "s"} · {fmtNaira(row.cart_total)}</span>
          <span className="text-xs text-text-light md:text-right">{fmtDate(row.last_activity_at || row.created_at)}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20 space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-light mb-1">Delivery address</p>
            <p className="text-xs text-text-med">{fullAddress || "Not provided"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-light mb-1">Cart ({fmtNaira(row.cart_total)})</p>
            <ItemList items={row.cart_items} />
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorRow({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const point = ERROR_POINT_LABEL[row.error_point] || row.error_point || "Unknown";
  const type = ERROR_TYPE_LABEL[row.error_type] || row.error_type || "Other";
  const who = [row.customer_name, row.email, row.phone].filter(Boolean).join(" · ");
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        {open ? <ChevronDown className="w-4 h-4 text-text-light flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-light flex-shrink-0" />}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-forest-light text-forest">{point}</span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-coral-blush text-coral-dark">{type}</span>
            {row.whatsapp_modal_triggered && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#25D366]/15 text-[#128C7E]">
                <MessageCircle className="w-3 h-3" /> WhatsApp shown
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${row.whatsapp_clicked ? "bg-[#25D366]/15 text-[#128C7E]" : "bg-muted text-text-light"}`}>
              {row.whatsapp_clicked ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} WhatsApp clicked
            </span>
          </div>
          <p className="text-xs text-text-med truncate">{row.error_message || "No message"}</p>
          {who && <p className="text-[11px] text-text-light truncate">{who}</p>}
        </div>
        <span className="text-[11px] text-text-light whitespace-nowrap self-start">{fmtDate(row.created_at)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20 space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-light mb-1">Full error ({point})</p>
            <p className="text-xs text-text-med whitespace-pre-wrap break-words">{row.error_message || "No message"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-light mb-1">Cart at time of error ({fmtNaira(row.cart_total)})</p>
            <ItemList items={row.cart_items} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg bg-card px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-light">{label}</p>
      <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function StateBlock({ loading, error, empty, emptyText, children }: {
  loading: boolean; error: unknown; empty: boolean; emptyText: string; children: React.ReactNode;
}) {
  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-text-med text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading...
    </div>
  );
  if (error) return (
    <div className="flex items-center gap-2 py-10 px-4 text-sm text-coral-dark">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Could not load this data. Please refresh and try again.
    </div>
  );
  if (empty) return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-light text-sm">
      <PackageOpen className="w-6 h-6" /> {emptyText}
    </div>
  );
  return <>{children}</>;
}

const LIMIT = 100;

export default function AdminCartData() {
  const summaryQ = useQuery({
    queryKey: ["admin-cart-summary"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_cart_intelligence_summary");
      if (error) throw error;
      return (typeof data === "string" ? JSON.parse(data) : data) || {};
    },
  });

  const abandonedCartQ = useQuery({
    queryKey: ["admin-cart-captures", "cart", "abandoned"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_get_cart_captures", {
        p_furthest_stage: "cart", p_status: "abandoned", p_limit: LIMIT, p_offset: 0,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const abandonedCheckoutQ = useQuery({
    queryKey: ["admin-cart-captures", "checkout", "abandoned"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_get_cart_captures", {
        p_furthest_stage: "checkout", p_status: "abandoned", p_limit: LIMIT, p_offset: 0,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const errorsQ = useQuery({
    queryKey: ["admin-checkout-errors"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_get_checkout_errors", {
        p_error_point: null, p_limit: LIMIT, p_offset: 0,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const s = summaryQ.data || {};
  const count = (n: unknown) => (Number.isFinite(Number(n)) ? String(Number(n)) : "0");

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2.5 mb-1">
        <ShoppingCart className="w-6 h-6 text-forest" />
        <h1 className="text-xl md:text-2xl font-bold">Cart Data</h1>
      </div>
      <p className="text-sm text-text-med mb-5">
        Abandoned carts, checkout drop-offs, and checkout errors, captured for recovery.
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-6">
        <StatCard label="Abandoned carts" value={count(s.abandoned_cart)} />
        <StatCard label="Checkout drop-offs" value={count(s.abandoned_checkout)} />
        <StatCard label="Errors" value={count(s.total_errors)} />
        <StatCard label="Recovered" value={count(s.converted)} />
        <StatCard label="Abandoned value" value={fmtNaira(s.abandoned_value)} />
      </div>

      <Tabs defaultValue="cart">
        <TabsList className="mb-4">
          <TabsTrigger value="cart">Abandoned Cart ({count(s.abandoned_cart)})</TabsTrigger>
          <TabsTrigger value="checkout">Checkout Abandonment ({count(s.abandoned_checkout)})</TabsTrigger>
          <TabsTrigger value="errors">Errors ({count(s.total_errors)})</TabsTrigger>
        </TabsList>

        <TabsContent value="cart">
          <StateBlock
            loading={abandonedCartQ.isLoading}
            error={abandonedCartQ.error}
            empty={(abandonedCartQ.data || []).length === 0}
            emptyText="No abandoned carts yet."
          >
            <div className="space-y-2">
              {(abandonedCartQ.data || []).map((row: any) => <CaptureRow key={row.id} row={row} />)}
              {(abandonedCartQ.data || []).length === LIMIT && (
                <p className="text-[11px] text-text-light text-center pt-2">Showing the first {LIMIT}.</p>
              )}
            </div>
          </StateBlock>
        </TabsContent>

        <TabsContent value="checkout">
          <StateBlock
            loading={abandonedCheckoutQ.isLoading}
            error={abandonedCheckoutQ.error}
            empty={(abandonedCheckoutQ.data || []).length === 0}
            emptyText="No checkout abandonments yet."
          >
            <div className="space-y-2">
              {(abandonedCheckoutQ.data || []).map((row: any) => <CaptureRow key={row.id} row={row} />)}
              {(abandonedCheckoutQ.data || []).length === LIMIT && (
                <p className="text-[11px] text-text-light text-center pt-2">Showing the first {LIMIT}.</p>
              )}
            </div>
          </StateBlock>
        </TabsContent>

        <TabsContent value="errors">
          <StateBlock
            loading={errorsQ.isLoading}
            error={errorsQ.error}
            empty={(errorsQ.data || []).length === 0}
            emptyText="No errors logged, that's a good sign."
          >
            <div className="space-y-2">
              {(errorsQ.data || []).map((row: any) => <ErrorRow key={row.id} row={row} />)}
              {(errorsQ.data || []).length === LIMIT && (
                <p className="text-[11px] text-text-light text-center pt-2">Showing the first {LIMIT}.</p>
              )}
            </div>
          </StateBlock>
        </TabsContent>
      </Tabs>
    </div>
  );
}
