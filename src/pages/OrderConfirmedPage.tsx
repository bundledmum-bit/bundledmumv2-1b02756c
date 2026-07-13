import { Link, useSearchParams } from "react-router-dom";
import { fmt, formatColor } from "@/lib/cart";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import ReferralSection from "@/components/ReferralSection";
import ShareModal from "@/components/ShareModal";
import { trackOnce as pixelTrackOnce, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { analytics, trackEcommerce } from "@/lib/ga";

export default function OrderConfirmedPage() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get("order") || "";
  // get-order-confirmation now requires the order's share_token. Prefer the URL
  // param; fall back to the copy stashed in sessionStorage at checkout time.
  const shareToken = searchParams.get("token")
    || (orderNumber ? sessionStorage.getItem(`share_token_${orderNumber}`) : null)
    || "";
  const [showShareModal, setShowShareModal] = useState(false);
  // Klump orders arrive here payment_status "pending" — the klump-webhook flips
  // them to "paid" server-side. We poll for that flip for a bounded window and
  // NEVER block the page on it: the confirmation renders immediately either way.
  const [paidViaPoll, setPaidViaPoll] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const { data: settings } = useSiteSettings();
  const whatsapp = settings?.whatsapp_number || "";
  const bankName = settings?.bank_name || "";
  const bankAccountName = settings?.bank_account_name || "";
  const bankAccountNumber = settings?.bank_account_number || "";
  const referralAmount = parseInt(settings?.referral_amount) || 0;

  useEffect(() => { document.title = "Order Confirmed | BundledMum"; }, []);

  const { data: orderData, isLoading } = useQuery({
    queryKey: ["order-confirmed", orderNumber, shareToken],
    enabled: !!orderNumber,
    queryFn: async () => {
      // Look the order up by order_number via the service-role edge function
      // (bypasses RLS). The share_token is passed when we have it, but is NOT
      // required — the endpoint resolves by order_number. Hard-requiring a token
      // here was the bug: place-order doesn't return one, so `shareToken` was
      // always "" and every paid customer saw "Order not found".
      const MAX_ATTEMPTS = 10;
      const DELAY = 2000;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const { data, error } = await supabase.functions.invoke("get-order-confirmation", {
          body: { order_number: orderNumber, share_token: shareToken },
        });
        if (data?.order) return { order: data.order, referral_code: data.referral_code || null };
        if (error) console.error("Order confirmation fetch error:", error);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, DELAY));
        }
      }
      return null;
    },
    retry: false,
    staleTime: Infinity,
  });

  const order = orderData?.order;
  const referralCode = orderData?.referral_code || null;

  // A Klump order awaiting its webhook confirmation. Bank transfer keeps its own
  // "complete your payment" banner and card is already paid by the time it lands
  // here, so this only applies to Klump-pending.
  const awaitingKlump = !!order && order.payment_method === "klump" && order.payment_status !== "paid" && !paidViaPoll;

  // Bounded poll (~24s) for the webhook to mark the order paid. If it does, we
  // upgrade the hero to the full confirmed state; if the window elapses we show
  // a reassuring "payment is being confirmed" message — never an infinite spin.
  useEffect(() => {
    if (!awaitingKlump || !orderNumber || !shareToken) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const MAX_ATTEMPTS = 8;
    const DELAY = 3000;
    const tick = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const { data } = await supabase.functions.invoke("get-order-confirmation", {
          body: { order_number: orderNumber, share_token: shareToken },
        });
        if (!cancelled && data?.order?.payment_status === "paid") { setPaidViaPoll(true); return; }
      } catch { /* transient — keep polling */ }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) { setPollExhausted(true); return; }
      timer = setTimeout(tick, DELAY);
    };
    timer = setTimeout(tick, DELAY);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [awaitingKlump, orderNumber, shareToken]);

  // Mark this browser as having placed an order — used by AnnouncementEngine
  // to distinguish new_visitor vs returning_visitor audience targeting.
  useEffect(() => {
    if (order) {
      try { localStorage.setItem("bm-has-ordered", "1"); } catch { /* ignore */ }
      // Meta Pixel Purchase — once per order number (via sessionStorage).
      const items = (order.order_items as any[]) || [];
      pixelTrackOnce(`purchase_${order.order_number || order.id}`, "Purchase", pixelMoney(Number(order.total) || 0, {
        content_ids: items.map(i => i.product_id).filter(Boolean),
        num_items: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
        contents: items.map(i => ({ id: i.product_id, quantity: Number(i.quantity) || 0 })),
      }));

      // GA4 purchase — fire once per order_number, dedup via localStorage so a
      // page refresh on the confirmation page never re-fires the event.
      try {
        const orderNum = (order.order_number || order.id) as string;
        const firedKey = `ga4_purchase_fired_${orderNum}`;
        if (orderNum && !localStorage.getItem(firedKey)) {
          localStorage.setItem(firedKey, "1");
          trackEcommerce("purchase", {
            transaction_id: orderNum,
            value: Number(order.total) || 0,
            tax: 0,
            shipping: Number(order.delivery_fee) || 0,
            currency: "NGN",
            coupon: order.coupon_code ?? "",
            payment_type: order.payment_method ?? "",
            items: items.map((it: any) => ({
              item_id: String(it.product_id ?? ""),
              item_name: it.product_name ?? "",
              item_brand: it.brand_name ?? "",
              item_variant: it.sku ?? "",
              item_category: it.category ?? "",
              item_category2: it.subcategory ?? "",
              price: Number(it.unit_price ?? it.line_total ?? 0),
              quantity: Number(it.quantity) || 1,
            })),
          });
          analytics.push({ event: "checkout_step", checkout_step: 4, checkout_step_name: "confirmation" });
        }
      } catch (e) {
        console.warn("[ga] purchase failed:", e);
      }
    }
  }, [order]);

  // Keep the viewport pinned to the top while async data arrives in waves
  // (order first, then site_settings — which may add the bank-transfer banner
  // above the hero and cause the browser's scroll-anchoring to shift the page
  // downward). Scroll to top whenever any meaningful layout-affecting data
  // resolves during the initial load.
  useEffect(() => {
    if (order) window.scrollTo({ top: 0, left: 0 });
  }, [order, bankName, bankAccountNumber]);

  // ── Klump reference capture (the reliable landing point) ─────────────
  // RUNTIME-VERIFIED: Klump's onLoad/onOpen callbacks carry no transaction
  // reference (only {status,type}), so capturing at the checkout widget never
  // had one to grab. Klump sends the customer back to our redirect_url after
  // payment with its reference in the query string — THIS page. Read it here and
  // persist it via set_order_klump_reference (order UUID comes from the loaded
  // order). Fire-and-forget; a false/failed write is logged LOUDLY, never
  // blocks. The webhook/reconciler still owns marking the order paid.
  useEffect(() => {
    // Fully defensive: this is a best-effort capture, never allowed to throw and
    // break the confirmation page. Everything is wrapped in try/catch.
    try {
      if (!order || order.payment_method !== "klump" || !order.id) return;
      if (order.payment_reference) return; // already captured (webhook or a prior visit)
      const params = new URLSearchParams(window.location.search);
      let reference: string | null = null;
      for (const [k, v] of params.entries()) {
        if (k === "order" || k === "token" || !v) continue;
        // Any reference-like param Klump may append, excluding our merchant ref.
        if (/reference|(^|_|-)ref($|_|-)|trxref|txn|transaction_id/i.test(k) && !/merchant/i.test(k)) {
          reference = String(v).trim();
          break;
        }
      }
      if (!reference) return;
      void (async () => {
        try {
          const { data, error } = await (supabase as any).rpc("set_order_klump_reference", {
            p_order_id: order.id,
            p_reference: reference,
          });
          if (error) {
            console.error("[order-confirmed][klump] set_order_klump_reference ERRORED:", error);
          } else if (data === false) {
            console.error("[order-confirmed][klump] set_order_klump_reference returned FALSE — wrote NOTHING for", order.id);
          } else {
            console.log("[order-confirmed][klump] reference saved:", reference);
          }
        } catch (e) {
          console.error("[order-confirmed][klump] set_order_klump_reference EXCEPTION:", e);
        }
      })();
    } catch (e) {
      // A capture failure must never affect the confirmation page.
      console.error("[order-confirmed][klump] reference-capture setup failed (ignored):", e);
    }
  }, [order]);

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center"><div className="mx-auto h-14 w-14 border-4 border-border border-t-forest rounded-full animate-spin mb-4" /><p className="text-muted-foreground">Loading your order details...</p></div>
    </div>
  );

  // We could not resolve the order from the URL yet. NEVER imply the order
  // failed — a paying customer must not think their money vanished. Reassure
  // and route them to their email / WhatsApp instead.
  if (!order) return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-3">✅</div>
        <h1 className="text-2xl font-bold mb-2">We're still confirming your order</h1>
        <p className="text-muted-foreground mb-5">
          Your payment went through. We're finalising the details now — your confirmation email is on its way{orderNumber ? <> (order <span className="font-semibold">#{orderNumber}</span>)</> : null}. If you don't see it shortly, message us on WhatsApp and we'll sort it out right away.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hi BundledMum! I just placed an order${orderNumber ? ` (${orderNumber})` : ""} and want to confirm it. Thank you!`)}`}
              target="_blank" rel="noopener noreferrer"
              className="rounded-pill bg-[#25D366] text-primary-foreground px-6 py-3 font-semibold text-sm inline-flex items-center justify-center"
            >
              💬 Confirm on WhatsApp
            </a>
          )}
          <Link to="/" className="rounded-pill border-2 border-forest text-forest px-6 py-3 font-semibold text-sm inline-flex items-center justify-center hover:bg-forest/5">Go Home</Link>
        </div>
      </div>
    </div>
  );

  const orderId = order.order_number || orderNumber;
  const items = order.order_items || [];
  const isBankTransfer = order.payment_method === "transfer";
  const [firstName] = (order.customer_name || "").split(" ");
  const payLabels: Record<string, string> = { card: "Card Payment via Paystack", transfer: "Bank Transfer", ussd: "USSD / Mobile Money" };

  const deliveryDate = () => {
    const from = order.estimated_delivery_start ? new Date(order.estimated_delivery_start) : new Date();
    const to = order.estimated_delivery_end ? new Date(order.estimated_delivery_end) : new Date();
    const f = (d: Date) => d.toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" });
    return `${f(from)} – ${f(to)}`;
  };

  const handleDownload = () => {
    const lines = [
      `BundledMum Order Summary`, `Order #${orderId}`, `Date: ${new Date(order.created_at).toLocaleDateString("en-NG")}`, ``,
      `Customer: ${order.customer_name}`, `Email: ${order.customer_email}`, `Phone: ${order.customer_phone}`,
      `Address: ${order.delivery_address}, ${order.delivery_city}, ${order.delivery_state}`, ``,
      `Items:`,
      ...items.map((i: any) => `  ${i.bundle_name ? `[${i.bundle_name}] ` : ""}${i.product_name} × ${i.quantity} — ${fmt(i.line_total)}${i.brand_name ? ` (${i.brand_name})` : ""}${i.size ? ` Size: ${i.size}` : ""}`),
      ``, `Subtotal: ${fmt(order.subtotal)}`, `Delivery: ${order.is_express_order ? "Will be communicated" : (order.delivery_fee === 0 ? "FREE" : fmt(order.delivery_fee))}`,
      `Service & Packaging: ${fmt(order.service_fee)}`,
      ...(order.gift_wrapping ? [`Gift wrapping: ${fmt(order.gift_wrap_fee || 0)}`] : []),
      `Total: ${fmt(order.total)}`, ``, `Payment: ${payLabels[order.payment_method] || ""}`,
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `BundledMum-${orderId}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const whatsappMsg = `Hi BundledMum! I just placed order ${orderId}. Please confirm my order. Thank you!`;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0" style={{ overflowAnchor: "none" }}>
      {/* Bank transfer: urgent action banner — shown first, above the success hero */}
      {isBankTransfer && bankName && bankAccountNumber && (
        <div className="pt-20 bg-[#FFF4D6]">
          <div className="max-w-[860px] mx-auto px-4 md:px-10 py-6 md:py-8">
            <div className="bg-gradient-to-br from-[#FFF8E1] to-[#FFE9A8] border-2 border-[#F59E0B] rounded-card shadow-card p-5 md:p-7">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-3xl md:text-4xl flex-shrink-0 animate-pulse-scale">⏳</div>
                <div>
                  <h2 className="pf text-lg md:text-2xl text-[#92400E] font-bold leading-tight">Action Required — Complete Your Payment</h2>
                  <p className="text-[#78350F] text-sm md:text-[15px] mt-1">Transfer the exact amount below within <span className="font-bold">12 hours</span> to confirm your order.</p>
                </div>
              </div>
              <div className="bg-card rounded-xl border border-[#F59E0B]/40 p-4 md:p-5 space-y-2.5">
                {[["Bank", bankName], ["Account Name", bankAccountName], ["Account Number", bankAccountNumber]].map(([k, v]) => (
                  <div key={k} className="flex gap-3 items-center">
                    <span className="text-text-light text-xs md:text-sm min-w-[120px] md:min-w-[140px]">{k}</span>
                    <span className="font-semibold text-sm md:text-base break-all">{v}</span>
                  </div>
                ))}
                <div className="flex gap-3 items-center pt-2.5 border-t border-border">
                  <span className="text-text-light text-xs md:text-sm min-w-[120px] md:min-w-[140px]">Amount</span>
                  <span className="font-bold text-lg md:text-xl text-coral">{fmt(order.total)}</span>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-[13px] md:text-sm text-[#78350F]">
                <div className="flex gap-2"><span>📌</span><span>Use your phone number as the transfer reference.</span></div>
                <div className="flex gap-2"><span>⏱️</span><span>Your order will be confirmed within 30 minutes to 1 hour of payment.</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={`${isBankTransfer && bankName && bankAccountNumber ? "" : "pt-20"} relative overflow-hidden`} style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="absolute top-[-60px] left-[10%] w-[200px] h-[200px] rounded-full bg-coral/[0.07]" />
        <div className="absolute bottom-[-40px] right-[8%] w-[160px] h-[160px] rounded-full bg-primary-foreground/[0.04]" />
        <div className="max-w-[860px] mx-auto px-4 md:px-10 py-12 md:py-20 text-center">
          <div className="w-[72px] h-[72px] bg-primary-foreground/[0.12] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl animate-pulse-scale">{awaitingKlump ? "⏳" : "✅"}</div>
          <h1 className="pf text-3xl md:text-5xl text-primary-foreground mb-2.5">{awaitingKlump ? "Payment Received 🎉" : "Order Confirmed! 🎉"}</h1>
          <p className="text-primary-foreground/70 text-sm md:text-[17px] mb-1.5">
            {awaitingKlump
              ? (pollExhausted
                  ? `Thank you, ${firstName}! Your order is placed and we're confirming your payment — you'll get a confirmation email shortly.`
                  : `Thank you, ${firstName}! We're confirming your payment now…`)
              : `Thank you, ${firstName}! Your bundle is on its way.`}
          </p>
          <div className="inline-flex items-center gap-2 bg-coral/20 border border-coral/40 rounded-pill px-5 py-2 mt-2.5">
            <span className="text-coral font-bold text-sm">Order #{orderId}</span>
          </div>
        </div>
      </div>

      <div className="max-w-[860px] mx-auto px-4 md:px-10 py-8 md:py-14">
        {/* Express Order banner — only when this order skipped checkout
            delivery and is awaiting an admin-issued WhatsApp quote. */}
        {order.is_express_order && (() => {
          // Pull the admin-controlled display name + SLA so this banner
          // matches whatever the customer saw on checkout.
          const displayName = typeof settings?.express_order_display_name === "string" && settings.express_order_display_name.trim()
            ? settings.express_order_display_name
            : "Express Order";
          const slaHours = Number.isFinite(Number(settings?.express_order_sla_hours))
            ? Math.trunc(Number(settings.express_order_sla_hours))
            : 24;
          const slaLabel = `within ${slaHours} hour${slaHours === 1 ? "" : "s"}`;
          return (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-card p-5 md:p-6 mb-5">
              <h2 className="pf text-xl md:text-2xl text-amber-900 flex items-center gap-2 mb-2">
                ⚡ {displayName} Submitted
              </h2>
              <p className="text-amber-900 text-sm md:text-base leading-relaxed">
                Thank you! Our team will calculate your delivery fee and contact you via WhatsApp {slaLabel} with your quote. Your order will be processed once delivery payment is received.
              </p>
            </div>
          );
        })()}
        {/* Customer Details */}
        <div className="bg-card rounded-card shadow-card p-5 md:p-8 mb-4">
          <h3 className="pf text-lg md:text-xl text-forest mb-4">📋 Your Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-body">
            <div><span className="text-text-light">Name:</span> <span className="font-semibold">{order.customer_name}</span></div>
            <div><span className="text-text-light">Email:</span> <span className="font-semibold break-words">{order.customer_email}</span></div>
            <div><span className="text-text-light">Phone:</span> <span className="font-semibold">{order.customer_phone}</span></div>
            <div><span className="text-text-light">Payment:</span> <span className="font-semibold">{payLabels[order.payment_method] || ""}</span></div>
            <div className="md:col-span-2"><span className="text-text-light">Address:</span> <span className="font-semibold break-words">{order.delivery_address}, {order.delivery_city}, {order.delivery_state}</span></div>
          </div>
        </div>

        {/* Order Items */}
        {items.length > 0 && (
          <div className="bg-card rounded-card shadow-card p-5 md:p-8 mb-4">
            <h3 className="pf text-lg md:text-xl text-forest mb-4">🛒 Your Order</h3>
            <div className="space-y-2.5 mb-4">
              {items.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 pb-2.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-warm-cream rounded-lg flex items-center justify-center text-lg flex-shrink-0">📦</div>
                    <div>
                      {item.bundle_name && <div className="text-[10px] font-bold text-coral">📦 {item.bundle_name}</div>}
                      <div className="text-sm font-semibold">{item.product_name}</div>
                      <div className="text-text-light text-xs flex flex-wrap gap-2">
                        {item.brand_name && <span>Brand: {item.brand_name}</span>}
                        {item.size && <span>Size / Age: {item.size}</span>}
                        {item.color && <span>Colour: {formatColor(item.color)}</span>}
                        <span>Qty: {item.quantity}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold flex-shrink-0">{fmt(item.line_total)}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 text-sm font-body border-t border-border pt-3">
              <div className="flex justify-between"><span className="text-text-med">Subtotal</span><span>{fmt(order.subtotal)}</span></div>
              <div className="flex justify-between items-baseline">
                <span className="text-text-med">Delivery</span>
                {order.is_express_order ? (
                  <span className="italic text-text-light text-[13px]">Will be communicated to you</span>
                ) : (
                  <span className={order.delivery_fee === 0 ? "text-forest" : ""}>{order.delivery_fee === 0 ? "FREE" : fmt(order.delivery_fee)}</span>
                )}
              </div>
              <div className="flex justify-between"><span className="text-text-med">Service & Packaging</span><span>{fmt(order.service_fee)}</span></div>
              {order.gift_wrapping && (
                <div className="flex justify-between"><span className="text-text-med">Gift wrapping</span><span>{fmt(order.gift_wrap_fee || 0)}</span></div>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-bold text-base"><span>Total</span><span className="text-forest">{fmt(order.total)}</span></div>
            </div>
          </div>
        )}

        {/* Download / Share / WhatsApp */}
        <div className="flex gap-3 flex-col sm:flex-row mb-4">
          <button onClick={handleDownload} className="rounded-pill border-2 border-forest text-forest px-5 py-2.5 font-body font-semibold text-sm hover:bg-forest/5 interactive w-full sm:w-auto text-center">📥 Download Order Summary</button>
          <button onClick={() => setShowShareModal(true)} className="rounded-pill bg-coral text-primary-foreground px-5 py-2.5 font-body font-semibold text-sm interactive w-full sm:w-auto text-center">📱 Share Your Bundle</button>
          {whatsapp && <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(whatsappMsg)}`} target="_blank" rel="noopener noreferrer"
            className="rounded-pill bg-[#25D366] text-primary-foreground px-5 py-2.5 font-body font-semibold text-sm interactive w-full sm:w-auto text-center">💬 Confirm on WhatsApp</a>}
        </div>

        {/* What Happens Next */}
        <div className="bg-card rounded-card shadow-card p-5 md:p-8 mb-4">
          <h3 className="pf text-lg md:text-xl text-forest mb-4">What Happens Next</h3>
          <div className="flex flex-col">
            {[
              { icon: "📧", title: "Confirmation Email Sent", desc: `We've sent order details to ${order.customer_email}.`, done: true },
              { icon: "🔍", title: "Order Being Processed", desc: "Our team is picking and packing your items", done: true },
              { icon: "📦", title: "Dispatched for Delivery", desc: `To ${order.delivery_address}, ${order.delivery_city}, ${order.delivery_state}`, done: false },
              { icon: "🏠", title: "Delivered to Your Door", desc: `Expected delivery: ${deliveryDate()}`, done: false },
            ].map((s, i, arr) => (
              <div key={i} className="flex gap-3 pb-3">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg flex-shrink-0 ${s.done ? "bg-forest-light border-forest" : "bg-warm-cream border-border"}`}>{s.icon}</div>
                  {i < arr.length - 1 && <div className={`w-0.5 h-4 my-0.5 ${s.done ? "bg-forest" : "bg-border"}`} />}
                </div>
                <div className="pb-3"><div className={`font-bold text-sm ${s.done ? "text-forest" : ""}`}>{s.title}</div><div className="text-text-med text-[13px] mt-0.5">{s.desc}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4"><ReferralSection referralCode={referralCode} paymentMethod={order.payment_method} paymentStatus={order.payment_status} /></div>

        <div className="bg-forest rounded-card p-5 md:p-8 flex flex-col md:flex-row justify-between items-center gap-3.5 mb-4 text-center md:text-left">
          <div>
            <h4 className="pf text-primary-foreground text-lg mb-1">💬 Questions About Your Order?</h4>
            <p className="text-primary-foreground/65 text-[13px]">Chat with us on WhatsApp — we reply within minutes.</p>
          </div>
          {whatsapp && <a href={`https://wa.me/${whatsapp}?text=Hi! My order number is ${orderId}`} target="_blank" rel="noopener noreferrer"
            className="bg-[#25D366] text-primary-foreground px-5 py-3 rounded-pill font-semibold text-sm whitespace-nowrap w-full md:w-auto text-center">Chat on WhatsApp 💬</a>}
        </div>

        <div className="flex gap-3 justify-center flex-col md:flex-row">
          <Link to="/" className="rounded-pill bg-forest px-7 py-3.5 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-center text-[15px]">Continue Shopping →</Link>
          <Link to="/quiz" className="rounded-pill border-2 border-forest text-forest px-7 py-3.5 font-body font-semibold hover:bg-forest/5 interactive text-center text-[15px]">Build Another Bundle</Link>
        </div>
      </div>

      {showShareModal && (
        <ShareModal onClose={() => setShowShareModal(false)} title="Order Placed!" subtitle={`Order #${orderId}`}
          items={items.map((i: any) => ({ name: i.product_name, price: i.line_total }))} totalPrice={order.total}
          badge="ORDER PLACED ✅" shareUrl={`https://bundledmum.com/?ref=${referralCode}`}
          shareText={`I just packed my hospital bag with BundledMum! 🎁 Use my link for ${fmt(referralAmount)} off: https://bundledmum.com/?ref=${referralCode}`}
          itemCount={items.length} />
      )}
    </div>
  );
}
