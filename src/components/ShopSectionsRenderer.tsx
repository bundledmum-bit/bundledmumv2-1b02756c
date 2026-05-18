import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/cart";

/**
 * Single shop-page section pipeline driven by the shop_sections table.
 *
 *   1. Loads every is_visible row from shop_sections in display_order.
 *   2. Loads bundle products (is_gift_box=true) + regular products
 *      (is_gift_box=false) once each.
 *   3. Iterates the section list and renders either a bundle block
 *      or a category block per row, in the admin-configured order.
 *
 * Hidden sections and empty sections render nothing. There is no
 * hardcoded ordering — flipping the admin Shop Sections list reorders
 * /shop on the next load.
 */

interface ShopSection {
  id: string;
  section_key: string;
  title: string;
  subtitle: string | null;
  section_type: "bundle_group" | "category";
  filter_value: string;
  display_order: number;
  is_visible: boolean;
}

interface BundleProductRow {
  id: string;
  name: string;
  slug: string;
  bundle_label: string | null;
  shop_section_order: number | null;
  description: string | null;
  is_gift_box: boolean;
  brands: { id: string; sku: string | null; brand_name?: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null; images?: string[] | null }[];
}

interface RegularProductRow {
  id: string;
  name: string;
  slug: string;
  subcategory: string | null;
  display_order: number | null;
  brands: { id: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null }[];
}

function tierBadgeClasses(tier: string | null | undefined): string {
  if (tier === "premium") return "bg-purple-100 text-purple-800";
  if (tier === "standard") return "bg-blue-100 text-blue-800";
  return "bg-green-100 text-green-800";
}

function abbreviatePrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "";
  return `₦${Math.round(price / 1000)}k`;
}

function pickCheapestInStock<T extends { price: number; in_stock: boolean }>(brands: T[]): T | undefined {
  const shoppable = brands.filter(b => b.in_stock !== false && (b.price || 0) > 0);
  return shoppable.sort((a, b) => (a.price || 0) - (b.price || 0))[0];
}

export default function ShopSectionsRenderer() {
  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ["shop-sections-storefront"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shop_sections")
        .select("id, section_key, title, subtitle, section_type, filter_value, display_order, is_visible")
        .eq("is_visible", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as ShopSection[];
    },
    staleTime: 30_000,
  });

  const { data: bundleProducts } = useQuery({
    queryKey: ["shop-bundle-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`id, name, slug, bundle_label, shop_section_order, description, is_gift_box,
                 brands:brands_public ( id, sku, brand_name, price, tier, in_stock, image_url, images )`)
        .eq("is_gift_box", true)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as BundleProductRow[];
    },
    staleTime: 60_000,
  });

  // Enrich maternity bundles with their snapshot sell_price so the
  // displayed price + tag tracks the nightly refresh.
  const matIds = (bundleProducts || []).filter(p => /^Maternity Bundle/i.test(p.name)).map(p => p.id);
  const matKey = matIds.join(",");
  const { data: matSnapshotMap } = useQuery({
    queryKey: ["shop-maternity-snapshots", matKey],
    enabled: matIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("maternity_bundle_snapshots")
        .select("bundle_id, item_count, sell_price, snapped_at")
        .in("bundle_id", matIds)
        .order("snapped_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, { item_count: number; sell_price: number }> = {};
      (data || []).forEach((s: any) => {
        if (!map[s.bundle_id]) {
          map[s.bundle_id] = { item_count: Number(s.item_count ?? 0), sell_price: Number(s.sell_price ?? 0) };
        }
      });
      return map;
    },
    staleTime: 60_000,
  });

  const { data: regularProducts } = useQuery({
    queryKey: ["shop-regular-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`id, name, slug, subcategory, display_order,
                 brands:brands_public ( id, price, tier, in_stock, image_url )`)
        .eq("is_active", true)
        .eq("is_gift_box", false)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as RegularProductRow[];
    },
    staleTime: 60_000,
  });

  if (sectionsLoading) {
    return (
      <div className="space-y-8">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-card rounded-card shadow-card h-56 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 mb-8">
      {(sections || []).map(section => {
        if (section.section_type === "bundle_group") {
          const products = (bundleProducts || [])
            .filter(p => (p.name || "").startsWith(section.filter_value || ""))
            .sort((a, b) => (a.shop_section_order ?? 99) - (b.shop_section_order ?? 99));
          if (products.length === 0) return null;
          const isMaternity = section.filter_value === "Maternity Bundle";
          return (
            <BundleBlock
              key={section.section_key}
              title={section.title || section.section_key}
              subtitle={section.subtitle}
              products={products}
              matSnapshotMap={matSnapshotMap || {}}
              isMaternity={isMaternity}
            />
          );
        }
        if (section.section_type === "category") {
          const products = (regularProducts || [])
            .filter(p => p.subcategory === section.filter_value);
          if (products.length === 0) return null;
          return (
            <CategoryBlock
              key={section.section_key}
              title={section.title || section.section_key}
              subtitle={section.subtitle}
              products={products}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function BundleBlock({ title, subtitle, products, matSnapshotMap, isMaternity }: {
  title: string;
  subtitle: string | null;
  products: BundleProductRow[];
  matSnapshotMap: Record<string, { item_count: number; sell_price: number }>;
  isMaternity: boolean;
}) {
  // Maternity bundles get a 4-up grid (8 cards lay out cleanly); the
  // other two families are 3-up.
  const gridClass = isMaternity
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5"
    : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-5";
  return (
    <section>
      <div className="flex items-end justify-between mb-3 md:mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="pf font-bold text-xl md:text-2xl">{title}</h2>
          {subtitle && <p className="text-text-med text-sm">{subtitle}</p>}
        </div>
        <Link to="/bundles" className="text-forest text-sm font-semibold hover:underline whitespace-nowrap">
          View all →
        </Link>
      </div>
      <div className={gridClass}>
        {products.map(p => {
          const brand = p.brands?.[0];
          const tier = brand?.tier ?? null;
          const image = brand?.image_url
            || (Array.isArray(brand?.images) ? brand!.images![0] : null)
            || null;
          const snap = matSnapshotMap[p.id];
          const displayPrice = snap?.sell_price || Number(brand?.price ?? 0);
          const isMat = /^Maternity Bundle/i.test(p.name);
          return (
            <Link
              key={p.id}
              to={`/products/${p.slug}`}
              className="bg-card rounded-card shadow-card overflow-hidden border border-border hover:shadow-card-hover transition-all group flex flex-col"
            >
              <div className="relative aspect-square bg-warm-cream">
                {image ? (
                  <img src={image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center px-4"
                    style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }}
                  >
                    <span className="text-primary-foreground font-bold text-center text-sm md:text-base leading-snug">
                      {p.bundle_label || p.name}
                    </span>
                  </div>
                )}
                <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill ${tierBadgeClasses(tier)}`}>
                  {p.bundle_label || (tier === "premium" ? "Premium" : tier === "standard" ? "Standard" : "Basic")}
                </span>
                {isMat && displayPrice > 0 && (
                  <span
                    className="absolute bottom-3 left-3"
                    style={{
                      background: "#F4845F", color: "#FFFFFF",
                      fontFamily: "Nunito, sans-serif", fontWeight: 900, fontSize: 14,
                      padding: "4px 12px", borderRadius: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {abbreviatePrice(displayPrice)}
                  </span>
                )}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-sm text-foreground mb-1 leading-snug">{p.name}</h3>
                <div className="pf font-bold text-forest text-lg mt-1">
                  {fmt(displayPrice)}
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-pill bg-coral text-primary-foreground font-semibold px-4 py-2 text-xs hover:bg-coral-dark transition-colors"
                >
                  Shop Now
                </button>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CategoryBlock({ title, subtitle, products }: {
  title: string;
  subtitle: string | null;
  products: RegularProductRow[];
}) {
  // Cap each category at a sensible row count on the storefront; the
  // admin can promote rows via display_order. "View more" links to the
  // dedicated category page.
  const slug = products[0]?.subcategory || "";
  const visible = products.slice(0, 8);
  const hasMore = products.length > visible.length;
  return (
    <section>
      <div className="flex items-end justify-between mb-3 md:mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="pf font-bold text-xl md:text-2xl">{title}</h2>
          {subtitle && <p className="text-text-med text-sm">{subtitle}</p>}
        </div>
        {slug && (
          <Link to={`/shop/${slug}`} className="text-forest text-sm font-semibold hover:underline whitespace-nowrap">
            View all →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
        {visible.map(p => {
          const cheapest = pickCheapestInStock(p.brands || []);
          const image = cheapest?.image_url || (p.brands || []).find(b => b.image_url)?.image_url || null;
          const price = cheapest?.price ?? 0;
          return (
            <Link
              key={p.id}
              to={`/products/${p.slug}`}
              className="bg-card rounded-card shadow-card overflow-hidden border border-border hover:shadow-card-hover transition-all flex flex-col"
            >
              <div className="aspect-square bg-warm-cream relative">
                {image ? (
                  <img src={image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">🛍️</div>
                )}
              </div>
              <div className="p-3 flex flex-col flex-1">
                <h3 className="text-xs font-semibold leading-snug line-clamp-2 flex-1">{p.name}</h3>
                {price > 0 && (
                  <div className="pf font-bold text-forest text-sm mt-2">{fmt(price)}</div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {hasMore && slug && (
        <div className="mt-3 text-center">
          <Link to={`/shop/${slug}`} className="text-forest text-xs font-semibold hover:underline">
            See all {products.length} →
          </Link>
        </div>
      )}
    </section>
  );
}
