import { useState, useEffect } from "react";
import Seo from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";

export default function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState("");

  const { data: settings } = useSiteSettings();
  const whatsapp = settings?.whatsapp_number || "";
  useEffect(() => { document.title = "Track Order | BundledMum"; }, []);

  const handleTrack = async () => {
    const id = orderId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const { data, error: err } = await supabase
        .from("orders")
        .select("order_number, customer_name, order_status, payment_status, total, subtotal, delivery_fee, service_fee, is_express_order, estimated_delivery_start, estimated_delivery_end, created_at, order_items(product_name, brand_name, quantity, line_total, size)")
        .eq("order_number", id)
        .single();
      if (err || !data) { setError("Order not found. Please check your order number and try again."); return; }
      setOrder(data);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  };

  const statusSteps = ["confirmed", "packed", "shipped", "delivered"];
  const currentStep = order ? statusSteps.indexOf(order.order_status) : -1;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Track Your Order | BundledMum"
        description="Enter your order number to see the latest status of your BundledMum delivery."
      />
      <div className="pt-20" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[700px] mx-auto px-4 md:px-10 py-10 md:py-16">
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground mb-2">📦 Track Your Order</h1>
          <p className="text-primary-foreground/65 text-sm md:text-base">Enter your order number (e.g. BM-20260411-001) to check status.</p>
        </div>
      </div>
      <div className="max-w-[600px] mx-auto px-4 md:px-10 py-10">
        <div className="bg-card rounded-card shadow-card p-6 md:p-8">
          <label className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2 block">Order Number</label>
          <input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="e.g. BM-20260411-001"
            onKeyDown={e => e.key === "Enter" && handleTrack()}
            className="w-full rounded-[10px] border-[1.5px] border-border px-4 py-3 text-sm bg-card font-body focus:border-forest outline-none mb-4" />
          <button onClick={handleTrack} disabled={loading}
            className="w-full rounded-pill bg-forest py-3 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-sm disabled:opacity-50">
            {loading ? "Looking up..." : "Track Order"}
          </button>
          {error && <p className="text-destructive text-xs text-center mt-3">{error}</p>}
        </div>

        {order && (
          <div className="bg-card rounded-card shadow-card p-6 md:p-8 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="pf text-lg text-forest font-bold">Order #{order.order_number}</h3>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                order.order_status === "delivered" ? "bg-green-100 text-green-700" :
                order.order_status === "cancelled" ? "bg-red-100 text-red-700" :
                order.order_status === "returned" ? "bg-orange-100 text-orange-700" :
                "bg-blue-100 text-blue-700"
              }`}>{order.order_status}</span>
            </div>

            <div className="text-sm space-y-1 mb-4">
              <div><span className="text-text-light">Customer:</span> <span className="font-semibold">{order.customer_name}</span></div>
              <div><span className="text-text-light">Placed:</span> <span className="font-semibold">{new Date(order.created_at).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span></div>
              {order.estimated_delivery_start && order.estimated_delivery_end && (
                <div><span className="text-text-light">Expected Delivery:</span> <span className="font-semibold">
                  {new Date(order.estimated_delivery_start).toLocaleDateString("en-NG", { month: "short", day: "numeric" })} – {new Date(order.estimated_delivery_end).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                </span></div>
              )}
            </div>

            {/* Status timeline */}
            {!["cancelled", "returned"].includes(order.order_status) && (
              <div className="flex items-center gap-1 mb-4">
                {statusSteps.map((step, i) => (
                  <div key={step} className="flex items-center flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i <= currentStep ? "bg-forest text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                    {i < statusSteps.length - 1 && <div className={`h-0.5 flex-1 ${i < currentStep ? "bg-forest" : "bg-border"}`} />}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-[10px] text-muted-foreground mb-4">
              {statusSteps.map(s => <span key={s} className="capitalize">{s}</span>)}
            </div>

            {/* Items */}
            <h4 className="text-xs font-semibold text-text-med mb-2">Items</h4>
            <div className="space-y-2 mb-3">
              {(order.order_items || []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.product_name} {item.brand_name ? `(${item.brand_name})` : ""} × {item.quantity}{item.size ? ` — ${item.size}` : ""}</span>
                  <span className="font-semibold">{fmt(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-text-med">Subtotal</span><span>{fmt(order.subtotal)}</span></div>
              <div className="flex justify-between items-baseline">
                <span className="text-text-med">Delivery</span>
                {(order as any).is_express_order ? (
                  <span className="italic text-text-light text-[13px]">Will be communicated to you</span>
                ) : (
                  <span>{order.delivery_fee === 0 ? "FREE" : fmt(order.delivery_fee)}</span>
                )}
              </div>
              <div className="flex justify-between"><span className="text-text-med">Service Fee</span><span>{fmt(order.service_fee)}</span></div>
              {order.gift_wrapping && (
                <div className="flex justify-between"><span className="text-text-med">Gift wrapping</span><span>{fmt(order.gift_wrap_fee || 0)}</span></div>
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-border"><span>Total</span><span className="text-forest">{fmt(order.total)}</span></div>
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <p className="text-text-med text-sm mb-2">Need help?</p>
          <p className="text-text-light text-xs">
            {whatsapp ? <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi! I need help with my order.")}`} target="_blank" rel="noopener noreferrer" className="text-forest font-semibold hover:underline">Chat with us on WhatsApp</a> : <span className="text-forest font-semibold">Contact us on WhatsApp</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
