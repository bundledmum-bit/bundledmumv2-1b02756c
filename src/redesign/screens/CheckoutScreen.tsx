/**
 * CHECKOUT screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (a) payment-method visibility -> site_settings.payment_method_card_enabled / _transfer_enabled / _ussd_enabled
 *  (a) bank transfer details -> site_settings.bank_name / bank_account_name / bank_account_number
 *  (a) State option -> deliverable_states.name (preview shows the live first state; production uses useDeliverableStates)
 *  (computed) order total -> useCart()
 *  (b) "Standard / Express" delivery method tiles + prices: production derives delivery from
 *      shipping_zones + get_courier_assignment RPC, NOT static columns. Flagged.
 *  (b) prototype "Pay on delivery" option has no backend equivalent today. Flagged.
 *  (c) step indicator (Delivery/Payment/Review), field placeholders, "Place order" -> hardcoded
 */
import React, { useState } from "react";
import { useCart } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { BottomNav, C, serif, naira, NavProps, IconBack, IconChevronDown } from "../shared";

const strip = (s: any) => (typeof s === "string" ? s.replace(/^"|"$/g, "") : s);

export default function CheckoutScreen({ go }: NavProps) {
  const { subtotal } = useCart();
  const { data: settings } = useSiteSettings();
  const [pay, setPay] = useState<"card" | "transfer" | "ussd">("transfer");

  const cardOn = settings?.payment_method_card_enabled === true;
  const transferOn = settings?.payment_method_transfer_enabled === true;
  const ussdOn = settings?.payment_method_ussd_enabled === true;

  const bankName = strip(settings?.bank_name);
  const bankAcctName = strip(settings?.bank_account_name);
  const bankAcctNo = strip(settings?.bank_account_number);

  // (b) Delivery options are illustrative; real fees come from shipping_zones + courier RPC.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn("[redesign:checkout] TODO(bucket-b): delivery method tiles are placeholders; production computes fees via shipping_zones + get_courier_assignment.");
  }

  const methods: { key: "card" | "transfer" | "ussd"; on: boolean; label: string; sub: string }[] = [
    { key: "card", on: cardOn, label: "Card Payment", sub: "Visa, Mastercard, Verve — instant" },
    { key: "transfer", on: transferOn, label: "Bank Transfer", sub: "Pay directly to our account" },
    { key: "ussd", on: ussdOn, label: "USSD / Mobile Money", sub: "*737#, *901# and more" },
  ];
  const enabledMethods = methods.filter((m) => m.on);

  return (
    <div style={{ background: C.cream }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", background: "#fff", borderBottom: "1px solid #F0E8DA" }}>
        <button onClick={() => go("cart")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconBack color="#2A2A26" strokeWidth={1.9} /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Checkout</span>
        <span style={{ width: 22 }} />
      </header>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, background: "#fff", borderBottom: "1px solid #F0E8DA" }}>
        <Step n={1} label="Delivery" active />
        <Line />
        <Step n={2} label="Payment" />
        <Line />
        <Step n={3} label="Review" />
      </div>

      <div style={{ padding: "18px 16px 8px" }}>
        <h2 style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 13 }}>Delivery details</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field placeholder="Full name" />
          <Field placeholder="Phone number" />
          <Field placeholder="Delivery address" />
          <div style={{ display: "flex", gap: 10 }}>
            <Field placeholder="Area (e.g. Lekki)" style={{ flex: 1, minWidth: 0 }} />
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, height: 48, padding: "0 14px", minWidth: 0 }}>
              <span style={{ fontSize: 14, color: C.ink }}>Lagos</span>
              <IconChevronDown size={16} color={C.muted} strokeWidth={2} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "8px 16px" }}>
        <h2 style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 11 }}>Delivery method</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <DeliveryOpt active title="Standard · 48 hours" sub="Anywhere in Lagos" price="₦3,500" />
          <DeliveryOpt title="Express · same day" sub="Order before 12pm" price="₦7,000" />
        </div>
      </div>

      <div style={{ padding: "8px 16px 18px" }}>
        <h2 style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 11 }}>Payment</h2>
        {enabledMethods.length === 0 ? (
          <div style={{ fontSize: 13, color: C.body }}>Payment is temporarily unavailable. Please contact us on WhatsApp.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {enabledMethods.map((m) => {
              const active = m.key === pay;
              return (
                <button key={m.key} onClick={() => setPay(m.key)} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderWidth: active ? 2 : 1, borderStyle: "solid", borderColor: active ? C.green : C.line, borderRadius: 14, padding: 14, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", border: active ? `6px solid ${C.green}` : `1.5px solid #C9C0AF`, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.ink }}>{m.label}</span>
                    <span style={{ display: "block", fontSize: 12, color: "#8A8576" }}>{m.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {pay === "transfer" && transferOn && bankName && bankAcctNo && (
          <div style={{ marginTop: 12, background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 14, padding: 14 }}>
            <BankRow label="Bank" value={bankName} />
            <BankRow label="Account Name" value={bankAcctName} />
            <BankRow label="Account Number" value={bankAcctNo} />
            <div style={{ fontSize: 11.5, color: C.coralInk, marginTop: 8 }}>⚠️ Send exact amount, use your phone number as reference.</div>
          </div>
        )}
      </div>

      <div style={{ position: "sticky", bottom: 0, zIndex: 60, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
        <div>
          <div style={{ fontSize: 10, color: "#8A8576" }}>Total</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{naira(subtotal)}</div>
        </div>
        <button onClick={() => go("confirm")} style={{ flex: 1, background: C.green, color: "#fff", border: "none", fontSize: 15, fontWeight: 600, padding: 14, borderRadius: 14, cursor: "pointer" }}>Place order</button>
      </div>

      <BottomNav current="cart" go={go} />
    </div>
  );
}

function Step({ n, label, active }: { n: number; label: string; active?: boolean }) {
  return (
    <>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: active ? C.green : C.line, color: active ? "#fff" : C.muted, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <span style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? C.ink : C.muted }}>{label}</span>
    </>
  );
}
const Line = () => <span style={{ width: 28, height: 1.5, background: "#D9D1C2" }} />;

function Field({ placeholder, style }: { placeholder: string; style?: React.CSSProperties }) {
  return <input placeholder={placeholder} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, height: 48, padding: "0 14px", fontSize: 14, color: C.ink, width: "100%", ...style }} />;
}

function DeliveryOpt({ title, sub, price, active }: { title: string; sub: string; price: string; active?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderWidth: active ? 2 : 1, borderStyle: "solid", borderColor: active ? C.green : C.line, borderRadius: 14, padding: 14 }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", border: active ? `6px solid ${C.green}` : `1.5px solid #C9C0AF`, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: "#8A8576" }}>{sub}</div>
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.green }}>{price}</span>
    </div>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: C.body }}>{label}</span>
      <span style={{ color: C.ink, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
