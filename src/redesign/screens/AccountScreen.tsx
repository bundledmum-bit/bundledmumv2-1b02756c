/**
 * ACCOUNT screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (a) user name + email -> useCustomerAuth() (auth.users / customers.full_name)
 *  (c) menu rows (My Orders / My Profile / Referrals / Settings), "Sign out" -> hardcoded (matches current AccountPage)
 *  (b) stat tiles (Orders / Wishlist / Referral credit): current AccountPage shows only total_orders.
 *      Wishlist count and referral-credit balance have no surfaced source today. Flagged.
 */
import React from "react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { BottomNav, C, serif, NavProps, IconBack, IconChevron, IconUser } from "../shared";

export default function AccountScreen({ go }: NavProps) {
  const { user, isLoggedIn } = useCustomerAuth();
  const email = user?.email || "";
  const name = (user?.user_metadata as any)?.full_name || (email ? email.split("@")[0] : "Guest");

  // (b) Wishlist + referral-credit stats have no surfaced backing today.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn("[redesign:account] TODO(bucket-b): Wishlist count and referral-credit stat tiles have no surfaced source; current AccountPage only shows total_orders.");
  }

  const menu = ["My Orders", "My Profile", "Referrals", "Settings"];

  return (
    <div style={{ background: C.cream }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", background: "#fff", borderBottom: "1px solid #F0E8DA" }}>
        <button onClick={() => go("home")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconBack color="#2A2A26" strokeWidth={1.9} /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>My Account</span>
        <span style={{ width: 22 }} />
      </header>

      <div style={{ background: "linear-gradient(135deg,#F4E8DB,#EEDFCD)", padding: "28px 20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#E7DAC7", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconUser size={28} color="#A99A85" strokeWidth={1.6} />
        </div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: C.ink, textTransform: "capitalize" }}>{name}</div>
          <div style={{ fontSize: 12.5, color: C.body }}>{isLoggedIn ? email : "Sign in to view your orders & rewards"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: C.line, marginBottom: 16 }}>
        {[["—", "Orders"], ["—", "Wishlist"], ["—", "Referral credit"]].map(([v, l], i) => (
          <div key={i} style={{ background: "#fff", padding: 16, textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: C.green }}>{v}</div>
            <div style={{ fontSize: 11.5, color: "#8A8576", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 16px" }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 11 }}>My account</div>
        <div style={{ background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 16, overflow: "hidden" }}>
          {menu.map((label, i) => (
            <button key={i} onClick={() => go("home")} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, border: "none", borderBottom: i < menu.length - 1 ? "1px solid #F0E8DA" : "none", background: "#fff", cursor: "pointer" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{label}</span>
              <IconChevron size={16} color={C.muted} strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <button onClick={() => go("home")} style={{ width: "100%", background: C.coralWash, color: C.coralInk, border: "none", fontSize: 14, fontWeight: 600, padding: 14, borderRadius: 14, cursor: "pointer" }}>Sign out</button>
      </div>

      <BottomNav current="account" go={go} />
    </div>
  );
}
