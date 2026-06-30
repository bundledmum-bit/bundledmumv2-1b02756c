/**
 * RedesignPreview — isolated preview of the BundledMum mobile redesign
 * (imported Claude Design prototype "BundledMum - Prototype.dc.html").
 *
 * Mounted at /redesign only. It reproduces the prototype's phone frame and
 * screen-picker strip and renders the eight redesigned screens, each wired to
 * live Supabase data for every (a)-bucket text element. This is a NON-PRODUCTION
 * preview on branch redesign/bundledmum-prototype-v1 — it does not replace any
 * existing storefront route.
 */
import React, { useEffect, useRef, useState } from "react";
import { C, Screen } from "./shared";
import HomeScreen from "./screens/HomeScreen";
import ShopScreen from "./screens/ShopScreen";
import ProductScreen from "./screens/ProductScreen";
import CartScreen from "./screens/CartScreen";
import CheckoutScreen from "./screens/CheckoutScreen";
import ConfirmationScreen from "./screens/ConfirmationScreen";
import QuizScreen from "./screens/QuizScreen";
import AccountScreen from "./screens/AccountScreen";

const PICKER: { key: Screen; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "shop", label: "Shop" },
  { key: "product", label: "Product" },
  { key: "cart", label: "Cart" },
  { key: "checkout", label: "Checkout" },
  { key: "quiz", label: "Quiz" },
  { key: "confirm", label: "Confirmation" },
  { key: "account", label: "Account" },
];

export default function RedesignPreview() {
  const [screen, setScreen] = useState<Screen>("home");
  const scrollRef = useRef<HTMLDivElement>(null);
  const go = (s: Screen) => setScreen(s);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [screen]);

  const Active = () => {
    switch (screen) {
      case "shop": return <ShopScreen go={go} />;
      case "product": return <ProductScreen go={go} />;
      case "cart": return <CartScreen go={go} />;
      case "checkout": return <CheckoutScreen go={go} />;
      case "confirm": return <ConfirmationScreen go={go} />;
      case "quiz": return <QuizScreen go={go} />;
      case "account": return <AccountScreen go={go} />;
      default: return <HomeScreen go={go} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#E7DFD0", display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 16px 40px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7, marginBottom: 18, maxWidth: 520 }}>
        {PICKER.map((b) => {
          const on = b.key === screen;
          return (
            <button key={b.key} onClick={() => setScreen(b.key)} style={{ background: on ? C.green : "#fff", color: on ? "#fff" : C.greenDark, border: `1.5px solid ${on ? C.green : "#D9D1C2"}`, fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 999, cursor: "pointer" }}>
              {b.label}
            </button>
          );
        })}
      </div>

      <div style={{ width: 390, height: 844, position: "relative", overflow: "hidden", borderRadius: 44, boxShadow: "0 40px 100px -30px rgba(20,30,20,0.45)", border: "1px solid #D4CABD" }}>
        <div ref={scrollRef} style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#fff" }}>
          <Active />
        </div>
      </div>

      <p style={{ marginTop: 20, maxWidth: 520, textAlign: "center", fontSize: 12, color: "#6E6B5F", lineHeight: 1.6 }}>
        Non-production preview · branch redesign/bundledmum-prototype-v1 · live Supabase data.
        Sections without a backing column are flagged in the browser console (search "TODO(bucket-b)").
      </p>
    </div>
  );
}
