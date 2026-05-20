import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import BundleShopRow from "@/components/BundleShopRow";
import { CuratedSection, HEADER_PALETTE } from "@/components/CuratedSections";
import type { ShopVariant } from "@/hooks/useMerchandising";
import type { Product } from "@/lib/supabaseAdapters";

/**
 * Single shop-page section pipeline driven by the shop_sections table.
 *
 *   1. Load every is_visible row from shop_sections in display_order.
 *   2. Load all is_gift_box=true products (used by bundle_group rows).
 *      Maternity bundles enrich from maternity_bundle_snapshots so
 *      the storefront price tracks the nightly refresh.
 *   3. Iterate the section list and delegate to the original
 *      <BundleSection> and <CuratedSection> components per row so
 *      the previous visual design is preserved exactly. Only the
 *      outer loop is data-driven; the section markup is untouched.
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
  is_visible_on_all: boolean;
  is_visible_on_mum: boolean;
  is_visible_on_baby: boolean;
}

interface BundleProductRow {
  id: string;
  name: string;
  slug: string;
  bundle_label: string | null;
  shop_section_order: number | null;
  description: string | null;
  is_gift_box: boolean;
  category: string | null;
  brands: { id: string; sku: string | null; brand_name?: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null; images?: string[] | null }[];
}

interface EnrichedBundle extends BundleProductRow {
  is_maternity: boolean;
  item_count: number;
  computed_price: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  "diapers-nappies": "🧷",
  "wipes-diaper-care": "🧻",
  "baby-formula": "🍼",
  "baby-clothing": "👕",
  "feeding-equipment": "🥄",
  "bath-grooming": "🛁",
  "baby-skincare-toiletries": "🧴",
  "bedding-blankets": "🛏️",
  "nursery-furniture": "🪑",
  "breastfeeding-equipment": "🤱",
  "travel-gear": "🚗",
  "toys-learning": "🧸",
  "health-safety-baby": "🩹",
  "maternity-postpartum": "💪",
  "maternity-clothing": "👗",
  "laundry-household": "🧺",
  "accessories-misc": "🛍️",
  "mum-gifts-keepsakes": "🎁",
};

export default function ShopSectionsRenderer({
  shop,
  onOpenDetail,
}: {
  shop: ShopVariant;
  onOpenDetail: (product: Product) => void;
}) {
  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ["shop-sections-storefront"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shop_sections")
        .select("id, section_key, title, subtitle, section_type, filter_value, display_order, is_visible, is_visible_on_all, is_visible_on_mum, is_visible_on_baby")
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
        .select(`id, name, slug, bundle_label, shop_section_order, description, is_gift_box, category,
                 brands:brands_public ( id, sku, brand_name, price, tier, in_stock, image_url, images )`)
        .eq("is_gift_box", true)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as BundleProductRow[];
    },
    staleTime: 60_000,
  });

  const matIds = (bundleProducts || []).filter(p => /^Maternity( \+ Baby Items)? Bundle/i.test(p.name)).map(p => p.id);
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

  // Enrich for the BundleSection shape (it expects EnrichedBundle items
  // with item_count, computed_price, is_maternity). Fixed bundles get
  // their RPC price; maternity uses the snapshot value with a brand-price
  // fallback. RPC failures fall through to the brand price.
  const [enriched, setEnriched] = useState<EnrichedBundle[] | null>(null);
  useEffect(() => {
    if (!bundleProducts || bundleProducts.length === 0) { setEnriched([]); return; }
    let cancelled = false;
    (async () => {
      const out = await Promise.all(bundleProducts.map(async p => {
        const isMaternity = /^Maternity( \+ Baby Items)? Bundle/i.test(p.name);
        if (isMaternity) {
          const snap = matSnapshotMap?.[p.id];
          return {
            ...p,
            is_maternity: true,
            item_count: snap?.item_count ?? 0,
            computed_price: snap?.sell_price || Number(p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        }
        try {
          const { data } = await (supabase as any).rpc("get_gift_box_price", { p_gift_box_id: p.id });
          return {
            ...p,
            is_maternity: false,
            item_count: Number((data as any)?.item_count ?? 0),
            computed_price: Number((data as any)?.sell_price ?? p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        } catch {
          return {
            ...p,
            is_maternity: false,
            item_count: 0,
            computed_price: Number(p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        }
      }));
      if (!cancelled) setEnriched(out);
    })();
    return () => { cancelled = true; };
  }, [bundleProducts, matSnapshotMap]);

  const loading = sectionsLoading || enriched === null;

  if (loading) {
    return (
      <div className="space-y-5 md:space-y-6 mb-10">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl shadow-sm overflow-hidden bg-card">
            <div className="h-10 bg-muted animate-pulse" />
            <div className="p-4 md:p-6 flex gap-3 overflow-hidden">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="w-[35vw] md:w-[220px] h-[260px] bg-muted/60 rounded-card animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Bundle and category rows share one palette rotation so the colour
  // cadence on /shop matches what the legacy CuratedSections produced —
  // a flat top-to-bottom alternation, regardless of section type.
  let paletteIdx = 0;

  return (
    <div className="space-y-5 md:space-y-6 mb-10">
      {(sections || []).map(section => {
        const palette = HEADER_PALETTE[paletteIdx % HEADER_PALETTE.length];
        if (section.section_type === "bundle_group") {
          // Per-shop visibility flags from shop_sections drive which
          // rows appear on which /shop variant.
          if (shop === "all"  && !section.is_visible_on_all)  return null;
          if (shop === "mum"  && !section.is_visible_on_mum)  return null;
          if (shop === "baby" && !section.is_visible_on_baby) return null;
          // Filter by name prefix, then by the active /shop variant.
          // /shop/mum  → only category='mum' bundles (Maternity Bundles,
          //               Postpartum Recovery Kits).
          // /shop/baby → only category='baby' bundles (currently none —
          //               Baby Shower Gift Boxes are category='push-gift').
          // /shop      → everything.
          let items = (enriched || [])
            .filter(p => (p.name || "").startsWith(section.filter_value || ""))
            .sort((a, b) => (a.shop_section_order ?? 99) - (b.shop_section_order ?? 99));
          if (shop === "mum" || shop === "baby") {
            items = items.filter(p => p.category === shop);
          }
          if (items.length === 0) return null;
          paletteIdx += 1;
          return (
            <BundleShopRow
              key={section.section_key}
              heading={section.title || section.section_key}
              subtitle={section.subtitle}
              items={items as any}
              palette={palette}
            />
          );
        }
        if (section.section_type === "category") {
          // Per-shop visibility flags from shop_sections drive which
          // category rows appear on which /shop variant.
          if (shop === "all"  && !section.is_visible_on_all)  return null;
          if (shop === "mum"  && !section.is_visible_on_mum)  return null;
          if (shop === "baby" && !section.is_visible_on_baby) return null;
          paletteIdx += 1;
          return (
            <CuratedSection
              key={section.section_key}
              shop={shop}
              slug={section.filter_value}
              label={section.title || section.section_key}
              icon={CATEGORY_ICONS[section.filter_value] || null}
              palette={palette}
              onOpenDetail={onOpenDetail}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
