/**
 * SHOP screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (a) category filter chips -> product_categories.name / icon (useProductCategories)
 *  (a) product cards (name, price, compare price, discount, rating, reviews, badge)
 *        -> products.name/rating/review_count/badge + brands_public.price/compare_at_price
 *  (computed) product count, discount %
 *  (c) search placeholder, "Sort & Filter" button, "All" chip -> hardcoded (matches current ShopPage)
 */
import React from "react";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { useProductCategories } from "@/hooks/useProductCategories";
import type { Product } from "@/lib/supabaseAdapters";
import { BottomNav, PhotoTile, Logo, C, naira, NavProps, IconCart, IconMenu, IconSearch, IconStar, IconHeart } from "../shared";

function minPrice(p: Product): number {
  const prices = (p.brands || []).map((b) => b.price).filter((n) => typeof n === "number");
  return prices.length ? Math.min(...prices) : 0;
}
function maxCompare(p: Product): number | null {
  const c = (p.brands || []).map((b) => b.compareAtPrice || 0).filter(Boolean);
  return c.length ? Math.max(...c) : null;
}

export default function ShopScreen({ go }: NavProps) {
  const { data: allProducts } = useAllProducts();
  const { data: categories } = useProductCategories();
  const products: Product[] = allProducts || [];
  const chips = ["All", ...((categories || []).slice(0, 4).map((c) => c.name))];

  return (
    <div>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 18px", borderBottom: `1px solid #F0E8DA`, background: "#fff" }}>
        <Logo />
        <div style={{ display: "flex", gap: 15 }}>
          <button onClick={() => go("cart")} style={{ background: "none", border: "none", cursor: "pointer", position: "relative" }}>
            <IconCart color="#2A2A26" />
            <span style={{ position: "absolute", top: -6, right: -7, background: C.coral, color: "#fff", fontSize: 9, fontWeight: 700, width: 15, height: 15, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>
          </button>
          <IconMenu color="#2A2A26" />
        </div>
      </header>

      <div style={{ padding: "10px 18px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F3EFE6", border: `1px solid ${C.line}`, borderRadius: 14, padding: "0 14px", height: 44 }}>
          <IconSearch size={17} color={C.muted} strokeWidth={1.9} />
          <span style={{ fontSize: 13.5, color: C.muted }}>Search for products…</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 18px 10px" }}>
        {chips.map((label, i) => (
          <span key={i} style={i === 0
            ? { flex: "0 0 auto", background: C.green, color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 999 }
            : { flex: "0 0 auto", background: "#fff", color: "#5C5C52", fontSize: 12.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999, border: `1px solid ${C.line}` }}>{label}</span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px 12px" }}>
        <span style={{ fontSize: 12.5, color: "#8A8576" }}>
          <span style={{ fontWeight: 700, color: C.ink }}>{products.length}</span> products
        </span>
        <button style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: C.greenDark, cursor: "pointer" }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth={1.9}><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="8" r="2.2" /><circle cx="15" cy="16" r="2.2" /></svg>
          Sort &amp; Filter
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 18px 10px" }}>
        {products.map((p) => {
          const price = minPrice(p);
          const was = maxCompare(p);
          const off = was && was > price ? `-${Math.round(((was - price) / was) * 100)}%` : null;
          return (
            <button key={p.id} onClick={() => go("product")} style={{ textAlign: "left", background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0 }}>
              <div style={{ position: "relative" }}>
                <PhotoTile label="Product" src={p.imageUrl} height={140} radius={0} />
                {off && <span style={{ position: "absolute", top: 8, left: 8, background: C.coral, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 7 }}>{off}</span>}
                <div style={{ position: "absolute", top: 7, right: 7, width: 27, height: 27, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconHeart size={14} color="#A99A85" strokeWidth={2} />
                </div>
              </div>
              <div style={{ padding: "10px 11px 12px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, marginBottom: 6, minHeight: 33 }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 7 }}>
                  <IconStar />
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.ink }}>{p.rating}</span>
                  <span style={{ fontSize: 10.5, color: "#A39A8A" }}>({p.reviews})</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: C.green }}>{naira(price)}</span>
                    {was && was > price && <span style={{ fontSize: 10.5, color: "#A39A8A", textDecoration: "line-through", marginLeft: 5 }}>{naira(was)}</span>}
                  </div>
                  <div style={{ background: C.green, color: "#fff", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>+</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <BottomNav current="shop" go={go} />
    </div>
  );
}
