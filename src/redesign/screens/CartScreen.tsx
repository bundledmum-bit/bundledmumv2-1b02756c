/**
 * CART screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (computed) title count, line items, subtotal, total -> useCart() (localStorage cart state)
 *  (a) free-delivery / spend progress banner -> spend_threshold_discounts (useSpendThresholds + getSpendPrompt)
 *  (a) service fee row -> site_settings.service_fee / service_fee_label / service_fee_enabled
 *  (b) promo-code box placement -> prototype puts it on CART; today it lives on CHECKOUT. Flagged.
 *  (b) in-cart delivery line -> today delivery is "calculated at checkout"; flagged.
 *  (c) "Order summary" / "Apply" / "Checkout" labels -> hardcoded
 */
import React from "react";
import { useCart, fmt } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { useSpendThresholds, getSpendPrompt } from "@/hooks/useSpendThresholds";
import { BottomNav, C, serif, naira, NavProps, IconBack, IconTruck, IconClose } from "../shared";

const num = (v: any, d = 0) => {
  const n = Number(typeof v === "string" ? v.replace(/[^0-9.]/g, "") : v);
  return Number.isFinite(n) ? n : d;
};

export default function CartScreen({ go }: NavProps) {
  const { cart, subtotal, totalItems, updateQty, removeFromCart } = useCart();
  const { data: settings } = useSiteSettings();
  const { data: thresholds } = useSpendThresholds();

  const prompt = getSpendPrompt(subtotal, thresholds || []);
  const serviceFeeEnabled = settings?.service_fee_enabled === true;
  const serviceFee = serviceFeeEnabled ? num(settings?.service_fee) : 0;
  const serviceLabel = (settings?.service_fee_label || "Service & Packaging").toString().replace(/^"|"$/g, "");
  const discount = prompt?.appliedDiscount || 0;
  const total = subtotal + serviceFee - discount;

  return (
    <div style={{ background: C.cream }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", background: "#fff", borderBottom: "1px solid #F0E8DA" }}>
        <button onClick={() => go("shop")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconBack color="#2A2A26" strokeWidth={1.9} /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Your Cart ({totalItems})</span>
        <span style={{ width: 22 }} />
      </header>

      {prompt && prompt.nextThreshold && (
        <div style={{ margin: "14px 16px", background: C.greenBar, borderRadius: 14, padding: "11px 13px", display: "flex", alignItems: "center", gap: 11 }}>
          <IconTruck size={20} color="#4A5840" strokeWidth={1.7} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.greenDeep, marginBottom: 6 }}>
              You're {naira(prompt.amountNeeded)} away from {prompt.nextThreshold.discount_percent}% off
            </div>
            <div style={{ height: 5, background: "#C7D6BD", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${prompt.progress}%`, height: "100%", background: C.green, borderRadius: 99 }} />
            </div>
          </div>
        </div>
      )}

      {cart.length === 0 ? (
        <div style={{ padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, color: C.body, marginBottom: 16 }}>Your cart is empty 🛍️</div>
          <button onClick={() => go("shop")} style={{ background: C.green, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, padding: "12px 22px", borderRadius: 12, cursor: "pointer" }}>Browse the shop</button>
        </div>
      ) : (
        <div style={{ padding: "0 16px" }}>
          {cart.map((c) => (
            <div key={c._key} style={{ display: "flex", gap: 12, background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 16, padding: 12, marginBottom: 11 }}>
              <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: "#EDE5D6" }}>
                {c.img && <img src={c.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{c.name}</div>
                  <button onClick={() => removeFromCart(c._key)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, color: "#B7A797" }}><IconClose size={16} strokeWidth={1.8} /></button>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9 }}>{c.selectedBrand?.label || c.bundleName || ""}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden" }}>
                    <button onClick={() => updateQty(c._key, c.qty - 1)} style={{ width: 28, height: 28, border: "none", background: "#F3EFE6", color: C.greenDark, fontSize: 16, cursor: "pointer" }}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 600, width: 28, textAlign: "center" }}>{c.qty}</span>
                    <button onClick={() => updateQty(c._key, c.qty + 1)} style={{ width: 28, height: 28, border: "none", background: "#F3EFE6", color: C.greenDark, fontSize: 15, cursor: "pointer" }}>+</button>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.green }}>{fmt(c.price * c.qty)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* (b) Promo box: prototype places this on CART; production has it on CHECKOUT. */}
      <div style={{ margin: "6px 16px 14px", display: "flex", gap: 9 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "0 13px", height: 44 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Promo code</span>
        </div>
        <button style={{ background: "#EDE9DF", color: C.greenDark, border: "none", fontSize: 13, fontWeight: 600, padding: "0 18px", borderRadius: 12, cursor: "pointer" }}>Apply</button>
      </div>

      <div style={{ margin: "0 16px 16px", background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 16, padding: 16 }}>
        <Row label="Subtotal" value={naira(subtotal)} />
        {/* (b) Delivery is calculated at checkout today, not in cart. */}
        <Row label="Delivery" value="Calculated at checkout" muted />
        {serviceFeeEnabled && <Row label={serviceLabel} value={naira(serviceFee)} />}
        <Row label="Discount" value={`−${naira(discount)}`} accent last />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Total</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.green }}>{naira(total)}</span>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, zIndex: 60, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", borderTop: `1px solid ${C.line}`, padding: "12px 16px" }}>
        <button onClick={() => go("checkout")} disabled={cart.length === 0} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: cart.length === 0 ? "#B6BCAA" : C.green, color: "#fff", border: "none", fontSize: 15, fontWeight: 600, padding: 15, borderRadius: 14, cursor: cart.length === 0 ? "not-allowed" : "pointer" }}>
          Checkout · {naira(total > 0 ? total : 0)}
        </button>
      </div>

      <BottomNav current="cart" go={go} />
    </div>
  );
}

function Row({ label, value, muted, accent, last }: { label: string; value: string; muted?: boolean; accent?: boolean; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: last ? 0 : 9, paddingBottom: last ? 12 : 0, borderBottom: last ? "1px solid #F0E8DA" : "none" }}>
      <span style={{ color: C.body }}>{label}</span>
      <span style={{ color: accent ? C.green : muted ? C.muted : C.ink, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
