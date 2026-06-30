/**
 * CONFIRMATION screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (a) WhatsApp confirm link -> site_settings.whatsapp_number
 *  (computed) order summary + total -> useCart() snapshot (production reads orders/order_items via get-order-confirmation)
 *  (c) "Order placed!" heading, thank-you copy, delivery ETA line, "Continue shopping" -> hardcoded
 *
 * In production OrderConfirmedPage.tsx renders from the real `orders` row; this
 * preview shows the just-placed cart so the layout is reviewable end to end.
 */
import React from "react";
import { useCart, fmt } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { C, serif, naira, NavProps, IconClose, IconCheck, IconTruck } from "../shared";

const strip = (s: any) => (typeof s === "string" ? s.replace(/^"|"$/g, "") : s);

export default function ConfirmationScreen({ go }: NavProps) {
  const { cart, subtotal } = useCart();
  const { data: settings } = useSiteSettings();
  const whatsapp = strip(settings?.whatsapp_number) || "";
  const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}` : undefined;

  return (
    <div style={{ background: C.cream, minHeight: 844, display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: 56, padding: "0 16px", background: "#fff", borderBottom: "1px solid #F0E8DA" }}>
        <button onClick={() => go("home")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconClose color="#2A2A26" strokeWidth={1.9} /></button>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: C.greenWash, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <IconCheck size={40} color={C.green} strokeWidth={2} />
        </div>
        <h1 style={{ fontFamily: serif, fontSize: 28, fontWeight: 700, color: C.ink, lineHeight: 1.12, marginBottom: 9 }}>Order placed!</h1>
        <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, marginBottom: 22 }}>Thank you! Your bundle is being packed and will be with you soon.</p>

        <div style={{ background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 18, padding: 18, width: "100%", textAlign: "left", marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Order summary</div>
          {cart.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.body, marginBottom: 9 }}>Your order details will appear here.</div>
          ) : (
            cart.map((c) => (
              <div key={c._key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: C.ink, marginBottom: 9 }}>
                <span>{c.name} <span style={{ color: C.muted }}>×{c.qty}</span></span>
                <span style={{ fontWeight: 600 }}>{fmt(c.price * c.qty)}</span>
              </div>
            ))
          )}
          <div style={{ borderTop: "1px solid #F0E8DA", paddingTop: 11, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
            <span style={{ color: C.ink }}>Total paid</span>
            <span style={{ color: C.green }}>{naira(subtotal)}</span>
          </div>
        </div>

        <div style={{ background: C.greenBar, borderRadius: 14, padding: "14px 16px", width: "100%", display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
          <IconTruck size={20} color="#4A5840" strokeWidth={1.7} />
          <span style={{ fontSize: 13, color: C.greenDeep, fontWeight: 500 }}>Arriving soon — we'll text you tracking details.</span>
        </div>

        {waHref && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ width: "100%", textAlign: "center", background: "#25D366", color: "#fff", fontSize: 14, fontWeight: 600, padding: 14, borderRadius: 14, marginBottom: 12, textDecoration: "none" }}>💬 Confirm on WhatsApp</a>
        )}
        <button onClick={() => go("home")} style={{ width: "100%", background: C.green, color: "#fff", border: "none", fontSize: 15, fontWeight: 600, padding: 15, borderRadius: 14, cursor: "pointer" }}>Continue shopping</button>
      </div>
    </div>
  );
}
