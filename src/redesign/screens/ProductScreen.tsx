/**
 * PRODUCT screen — redesign prototype v1.
 * Audit buckets wired here:
 *  (a) badge        -> products.badge
 *  (a) title        -> products.name
 *  (a) price/compare/save% -> brands_public.price / compare_at_price
 *  (a) tier/brand selector -> brands_public rows (brand_name, price) for the product
 *  (a) description  -> products.description
 *  (a) feature bullets -> products.contents (comma-split via adapter)  [TODO fallback if empty]
 *  (a) related rail -> sibling products (see TODO: no curated "related products" relationship exists today)
 *  (c) header title "Product", thumbnail rail, "You might also like" heading, "Add to cart" -> hardcoded
 *
 * For the isolated preview this binds to the first active product; the
 * production page (src/pages/ProductPage.tsx) already resolves by slug.
 */
import React, { useMemo, useState } from "react";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import type { Product, Brand } from "@/lib/supabaseAdapters";
import { BottomNav, PhotoTile, C, serif, naira, NavProps, IconBack, IconCart, IconHeart, IconCheck } from "../shared";

export default function ProductScreen({ go }: NavProps) {
  const { data: allProducts } = useAllProducts();
  const { addToCart } = useCart();
  const products: Product[] = allProducts || [];
  const product = products.find((p) => (p.brands || []).length > 0) || products[0];

  const brands: Brand[] = useMemo(
    () => [...((product?.brands as Brand[]) || [])].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0)),
    [product]
  );
  const [brandId, setBrandId] = useState<string | null>(null);
  const selected = brands.find((b) => b.id === brandId) || brands[0];

  // (a) feature bullets from products.contents; (b) fallback flagged when absent.
  const bullets = (product?.contents && product.contents.length
    ? product.contents
    : ["See full product details on the live product page"]).slice(0, 3);
  if (typeof window !== "undefined" && !(product?.contents && product.contents.length)) {
    // eslint-disable-next-line no-console
    console.warn("[redesign:product] TODO(bucket-b): no products.contents for feature bullets; using placeholder copy.");
  }

  // (b) NOTE: current site has no curated related-products relationship.
  // Showing same-category siblings as a stand-in; flagged for backend decision.
  const related = products.filter((p) => p.id !== product?.id && p.category === product?.category).slice(0, 3);
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn("[redesign:product] TODO(bucket-b): 'You might also like' has no curated relationship column; using same-category siblings.");
  }

  if (!product) {
    return <div style={{ background: "#fff", padding: 40, textAlign: "center", color: C.body }}>No products available.</div>;
  }

  const price = selected?.price ?? 0;
  const compare = selected?.compareAtPrice ?? null;
  const savePct = compare && compare > price ? Math.round(((compare - price) / compare) * 100) : null;

  const onAdd = () => {
    addToCart({ id: product.id, name: product.name, price, img: product.imageUrl, baseImg: product.baseImg, brands, selectedBrand: selected });
    toast.success(`${product.name} added`);
    go("cart");
  };

  return (
    <div style={{ background: "#fff" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", borderBottom: "1px solid #F0E8DA" }}>
        <button onClick={() => go("shop")} style={{ background: "none", border: "none", cursor: "pointer" }}><IconBack color="#2A2A26" strokeWidth={1.9} /></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Product</span>
        <button onClick={() => go("cart")} style={{ background: "none", border: "none", cursor: "pointer", position: "relative" }}>
          <IconCart color="#2A2A26" />
        </button>
      </header>

      <div style={{ position: "relative" }}>
        <PhotoTile label="Product photo" src={product.imageUrl} height={300} radius={0} />
        {product.badge && <span style={{ position: "absolute", top: 13, left: 13, background: C.coral, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 999 }}>{product.badge}</span>}
        <div style={{ position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconHeart size={17} color="#A99A85" strokeWidth={2} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px 4px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 54, height: 54, borderRadius: 10, border: i === 0 ? `2px solid ${C.green}` : `1px solid ${C.line}`, background: "#EDE5D6" }} />
        ))}
      </div>

      <div style={{ padding: "14px 18px 6px" }}>
        <h1 style={{ fontFamily: serif, fontSize: 23, fontWeight: 700, color: C.ink, lineHeight: 1.15, marginBottom: 8 }}>{product.name}</h1>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 14 }}>
          <span style={{ fontSize: 25, fontWeight: 700, color: C.green }}>{naira(price)}</span>
          {compare && compare > price && <span style={{ fontSize: 14, color: "#A39A8A", textDecoration: "line-through" }}>{naira(compare)}</span>}
          {savePct && <span style={{ background: C.coralWash, color: C.coralInk, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 7 }}>Save {savePct}%</span>}
        </div>

        {brands.length > 1 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.greenDark, marginBottom: 9 }}>Choose your option</div>
            <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap" }}>
              {brands.map((b) => {
                const active = b.id === (selected?.id);
                return (
                  <button key={b.id} onClick={() => setBrandId(b.id)} style={{ flex: "1 0 28%", background: active ? C.greenWash : "#fff", borderWidth: active ? 2 : 1, borderStyle: "solid", borderColor: active ? C.green : C.line, borderRadius: 13, padding: 11, textAlign: "center", cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{b.label}</div>
                    <div style={{ fontSize: 11, color: active ? C.green : "#8A8576", fontWeight: 600 }}>{naira(b.price)}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: C.body, marginBottom: 14 }}>{product.description}</p>

        <div style={{ borderTop: "1px solid #F0E8DA", borderBottom: "1px solid #F0E8DA", padding: "14px 0", marginBottom: 12 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < bullets.length - 1 ? 10 : 0 }}>
              <IconCheck size={16} color={C.green} strokeWidth={1.8} />
              <span style={{ fontSize: 13, color: C.greenDark }}>{b}</span>
            </div>
          ))}
        </div>

        <h2 style={{ fontFamily: serif, fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 11 }}>You might also like</h2>
      </div>

      <div style={{ display: "flex", gap: 11, overflowX: "auto", padding: "0 18px 18px" }}>
        {related.map((r) => {
          const rp = Math.min(...((r.brands || []).map((b) => b.price).filter(Boolean)), Infinity);
          return (
            <button key={r.id} onClick={() => go("product")} style={{ flex: "0 0 138px", textAlign: "left", background: "#fff", border: `1px solid ${C.cardLine}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0 }}>
              <PhotoTile src={r.imageUrl} height={110} radius={0} />
              <div style={{ padding: "10px 11px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 5, minHeight: 31 }}>{r.name}</div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.green }}>{Number.isFinite(rp) ? naira(rp) : ""}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ position: "sticky", bottom: 0, zIndex: 60, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
        <div>
          <div style={{ fontSize: 10, color: "#8A8576" }}>Total</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{naira(price)}</div>
        </div>
        <button onClick={onAdd} style={{ flex: 1, background: C.green, color: "#fff", border: "none", fontSize: 15, fontWeight: 600, padding: 14, borderRadius: 14, cursor: "pointer" }}>Add to cart</button>
      </div>

      <BottomNav current="shop" go={go} />
    </div>
  );
}
