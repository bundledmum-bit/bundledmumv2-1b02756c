/**
 * HOME screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (a) announcement strip  -> site_settings.announcement_text / announcement_enabled
 *  (a) hero headline       -> site_settings.hero_title
 *  (a) hero subtitle       -> site_settings.hero_subtitle
 *  (a) popular bundles rail -> products.name + brands_public.price (useFeaturedProducts/useAllProducts)
 *  (a) deals grid          -> products.name + brands_public.price/compare_at_price
 *  (c) hero CTA labels, "Shop by Category" tiles, search placeholder  -> hardcoded (matches current ShopShortcuts)
 *  (b) free-delivery progress banner copy -> see TODO below
 */
import React from "react";
import { useSiteSettings, useAllProducts } from "@/hooks/useSupabaseData";
import { useFeaturedProducts } from "@/hooks/useHomepage";
import type { Product } from "@/lib/supabaseAdapters";
import {
  BottomNav, PhotoTile, Logo, C, serif, naira, NavProps,
  IconCart, IconMenu, IconSearch, IconTruck, IconArrow,
} from "../shared";

const strip = (s?: string) => (typeof s === "string" ? s.replace(/^"|"$/g, "") : s);

function minPrice(p: Product): number {
  const prices = (p.brands || []).map((b) => b.price).filter((n) => typeof n === "number");
  return prices.length ? Math.min(...prices) : 0;
}
function maxCompare(p: Product): number | null {
  const c = (p.brands || []).map((b) => b.compareAtPrice || 0).filter(Boolean);
  return c.length ? Math.max(...c) : null;
}

// (c) Category tiles — hardcoded today in ShopShortcuts.tsx, kept hardcoded here.
const CATEGORIES = [
  { label: "Maternity", icon: <path d="M12 9c-2.5 0-4 2-4 5 0 1.5.5 2.6 1.6 3.1L9 21h5l-.6-3.9c1.1-.5 1.6-1.6 1.6-3.1 0-3-1.5-5-3-5z" /> },
  { label: "Baby", icon: <path d="M8.5 4L5 7l2 2 1.2-1.1V20h7.6V7.9L17 9l2-2-3.5-3a3.5 3.5 0 0 1-7 0z" /> },
  { label: "Bundles", icon: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 9h16M12 9v11" /></> },
  { label: "Gifts", icon: <path d="M12 20s-7-4.6-9.3-8.6C1 8.5 2.5 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.5 0 5 3.5 3.3 6.4C19 15.4 12 20 12 20z" /> },
];

export default function HomeScreen({ go }: NavProps) {
  const { data: settings } = useSiteSettings();
  const { data: allProducts } = useAllProducts();
  const { data: featured } = useFeaturedProducts();

  const products: Product[] = allProducts || [];
  const bundles = products.slice(0, 3);
  const deals = products.slice(0, 4);

  const announcementOn = settings?.announcement_enabled !== false;
  const announcementText = strip(settings?.announcement_text) || "Free delivery on orders above ₦500k";
  const heroTitle = strip(settings?.hero_title) || "Everything for Baby & Mum, In One Place.";
  const heroSubtitle =
    strip(settings?.hero_subtitle) || "Thoughtfully sourced essentials, bundles & gifts for every stage.";

  // (b) The "You're ₦X away from free delivery" progress banner has NO single
  // backing column. Threshold below is the real site_settings value, but the
  // remaining-amount + bar percentage need live cart total. Flagged for backend
  // decision (see audit report bucket b). Not shipped as permanent hardcoded copy.
  const freeDeliveryThreshold = Number(strip(settings?.free_delivery_nationwide_threshold_naira)) || 500000;
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      "[redesign:home] TODO(bucket-b): free-delivery progress banner copy has no backing column; using site_settings.free_delivery_nationwide_threshold_naira =",
      freeDeliveryThreshold
    );
  }

  return (
    <div>
      {announcementOn && (
        <div style={{ background: C.greenBar, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, height: 38, padding: "0 12px" }}>
          <IconTruck size={16} color="#4A5840" strokeWidth={1.7} />
          <span style={{ fontSize: 11.5, color: "#4A5840", fontWeight: 500, textAlign: "center" }}>{announcementText}</span>
        </div>
      )}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 18px", background: "#fff" }}>
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => go("cart")} style={{ background: "none", border: "none", cursor: "pointer", position: "relative" }}>
            <IconCart color="#2A2A26" />
            <span style={{ position: "absolute", top: -6, right: -7, background: C.coral, color: "#fff", fontSize: 9, fontWeight: 700, width: 15, height: 15, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>
          </button>
          <IconMenu color="#2A2A26" />
        </div>
      </header>

      <div style={{ padding: "8px 18px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F3EFE6", border: `1px solid ${C.line}`, borderRadius: 14, padding: "0 14px", height: 46 }}>
          <IconSearch size={17} color={C.muted} strokeWidth={1.9} />
          <span style={{ fontSize: 13.5, color: C.muted }}>Search for products, bundles &amp; gifts…</span>
        </div>
      </div>

      <section style={{ padding: "12px 18px 6px" }}>
        <div style={{ background: "linear-gradient(135deg,#F4E8DB 0%,#EEDFCD 100%)", borderRadius: 22, padding: "24px 20px", display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
          <div style={{ flex: 1.3 }}>
            <h1 style={{ fontFamily: serif, fontSize: 24, lineHeight: 1.12, fontWeight: 700, color: heroDark, marginBottom: 10 }}>{heroTitle}</h1>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body, marginBottom: 16 }}>{heroSubtitle}</p>
            <button onClick={() => go("quiz")} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: C.green, color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 18px", borderRadius: 12, border: "none", cursor: "pointer" }}>
              Build my bundle <IconArrow size={16} color="#fff" strokeWidth={2} />
            </button>
            <button onClick={() => go("shop")} style={{ display: "block", marginTop: 11, fontSize: 12.5, fontWeight: 600, color: C.greenDark, background: "none", border: "none", cursor: "pointer" }}>Shop now →</button>
          </div>
          <div style={{ flex: 1, alignSelf: "stretch", minHeight: 170 }}>
            <PhotoTile label="Hero product" height="100%" radius={16} style={{ minHeight: 170 }} />
          </div>
        </div>
      </section>

      <section style={{ padding: "16px 18px 6px" }}>
        <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: heroDark, marginBottom: 14 }}>Shop by Category</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
          {CATEGORIES.map((cat, i) => (
            <button key={i} onClick={() => go("shop")} style={{ color: "inherit", border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 5px", textAlign: "center", background: "#fff", cursor: "pointer" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.tileBg, margin: "0 auto 9px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth={1.6}>{cat.icon}</svg>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.25, color: "#33332E" }}>{cat.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section style={{ padding: "18px 0 6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px", marginBottom: 14 }}>
          <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: heroDark }}>Shop Popular Bundles</h2>
          <button onClick={() => go("shop")} style={{ fontSize: 12.5, fontWeight: 600, color: C.green, background: "none", border: "none", cursor: "pointer" }}>View all →</button>
        </div>
        <div style={{ display: "flex", gap: 13, overflowX: "auto", padding: "0 18px 4px" }}>
          {bundles.map((b) => (
            <button key={b.id} onClick={() => go("product")} style={{ flex: "0 0 178px", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
              <PhotoTile label="Bundle photo" src={b.imageUrl} height={150} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: heroDark, lineHeight: 1.25, marginBottom: 4 }}>{b.name}</div>
              <div style={{ fontSize: 13, color: C.body }}>{naira(minPrice(b))}</div>
            </button>
          ))}
        </div>
      </section>

      <div style={{ margin: "16px 18px", background: C.coralWash, border: "1px solid #F6D9CB", borderRadius: 14, padding: "11px 13px", display: "flex", alignItems: "center", gap: 11 }}>
        <IconTruck size={20} color={C.coral} strokeWidth={1.7} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1B1B1A", marginBottom: 6 }}>
            Free delivery on orders over {naira(freeDeliveryThreshold)}
          </div>
          <div style={{ height: 5, background: "#F3DACB", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: "62%", height: "100%", background: C.coral, borderRadius: 99 }} />
          </div>
        </div>
      </div>

      <section style={{ padding: "4px 18px 22px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 13 }}>
          <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: heroDark }}>Deals for you</h2>
          <button onClick={() => go("shop")} style={{ fontSize: 12.5, fontWeight: 600, color: C.coral, background: "none", border: "none", cursor: "pointer" }}>See all</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
          {deals.map((p) => {
            const price = minPrice(p);
            const was = maxCompare(p);
            const off = was && was > price ? `-${Math.round(((was - price) / was) * 100)}%` : null;
            return (
              <button key={p.id} onClick={() => go("product")} style={{ textAlign: "left", background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0 }}>
                <div style={{ position: "relative" }}>
                  <PhotoTile label="Product" src={p.imageUrl} height={128} radius={0} />
                  {off && <span style={{ position: "absolute", top: 8, left: 8, background: C.coral, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 7 }}>{off}</span>}
                </div>
                <div style={{ padding: "10px 11px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, marginBottom: 6, minHeight: 33 }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: C.green }}>{naira(price)}</span>
                    {was && was > price && <span style={{ fontSize: 10.5, color: "#A39A8A", textDecoration: "line-through" }}>{naira(was)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <BottomNav current="home" go={go} />
    </div>
  );
}

const heroDark = C.ink;
