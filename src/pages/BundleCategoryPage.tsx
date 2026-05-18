import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BundleSection } from "@/components/BundleSections";

/**
 * Standalone bundle-category page (e.g. /bundles/baby-shower-gift-boxes).
 *
 * Reuses the same <BundleSection> component the /bundles page uses, so
 * the card design and grid match exactly. The difference is this page
 * is dedicated — no "See all" link, all products shown.
 *
 * sectionKey identifies which shop_sections.bundle_group row drives
 * the title/subtitle/filter. Three thin route wrappers below export
 * pre-bound variants for the App router.
 */

interface ShopSection {
  id: string;
  section_key: string;
  title: string;
  subtitle: string | null;
  filter_value: string;
  standalone_page_slug: string | null;
}

interface BundleProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_gift_box: boolean;
  bundle_label: string | null;
  shop_section_order: number | null;
  brands: { id: string; sku: string | null; brand_name: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null; images?: string[] | null }[];
}

interface EnrichedBundle extends BundleProduct {
  item_count: number;
  computed_price: number;
  is_maternity: boolean;
}

export default function BundleCategoryPage({ sectionKey }: { sectionKey: string }) {
  // ── Load the section row that defines title/subtitle/filter. ──────
  const sectionQuery = useQuery({
    queryKey: ["bundle-category-section", sectionKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shop_sections")
        .select("id, section_key, title, subtitle, filter_value, standalone_page_slug")
        .eq("section_key", sectionKey)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as ShopSection | null;
    },
    staleTime: 60_000,
  });

  const section = sectionQuery.data;
  const filterValue = section?.filter_value || "";

  useEffect(() => {
    document.title = section?.title
      ? `${section.title} | BundledMum`
      : "Bundles | BundledMum";
  }, [section?.title]);

  // ── Load every active bundle product matching the filter prefix. ──
  const productsQuery = useQuery({
    queryKey: ["bundle-category-products", filterValue],
    enabled: !!filterValue,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`id, name, slug, description, is_gift_box, bundle_label, shop_section_order,
                 brands:brands_public ( id, sku, brand_name, price, tier, in_stock, image_url, images )`)
        .eq("is_gift_box", true)
        .eq("is_active", true)
        .ilike("name", `${filterValue}%`)
        .order("shop_section_order", { ascending: true, nullsFirst: false })
        .order("slug");
      if (error) throw error;
      return (data || []) as BundleProduct[];
    },
    staleTime: 60_000,
  });

  // ── Enrich each product with item_count + freshest computed price.
  // Mirrors the BundleSections pipeline so cards display consistent
  // pricing across both pages.
  const productsKey = (productsQuery.data || []).map(p => p.id).join(",");
  const matIds = (productsQuery.data || [])
    .filter(p => /^Maternity Bundle/i.test(p.name))
    .map(p => p.id);

  const matSnapshotsQuery = useQuery({
    queryKey: ["bundle-category-snapshots", matIds.join(",")],
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

  const enrichedQuery = useQuery({
    queryKey: ["bundle-category-enriched", productsKey, JSON.stringify(matSnapshotsQuery.data || {})],
    enabled: !!productsQuery.data,
    queryFn: async () => {
      const products = productsQuery.data || [];
      const matMap = matSnapshotsQuery.data || {};
      const out: EnrichedBundle[] = await Promise.all(products.map(async p => {
        const isMaternity = /^Maternity Bundle/i.test(p.name);
        if (isMaternity) {
          const snap = matMap[p.id];
          return {
            ...p,
            is_maternity: true,
            item_count: snap?.item_count ?? 0,
            computed_price: snap?.sell_price || Number(p.brands?.[0]?.price ?? 0),
          };
        }
        try {
          const { data } = await (supabase as any).rpc("get_gift_box_price", { p_gift_box_id: p.id });
          return {
            ...p,
            is_maternity: false,
            item_count: Number((data as any)?.item_count ?? 0),
            computed_price: Number((data as any)?.sell_price ?? p.brands?.[0]?.price ?? 0),
          };
        } catch {
          return {
            ...p,
            is_maternity: false,
            item_count: 0,
            computed_price: Number(p.brands?.[0]?.price ?? 0),
          };
        }
      }));
      return out;
    },
    staleTime: 60_000,
  });

  const loading = sectionQuery.isLoading
    || productsQuery.isLoading
    || (matIds.length > 0 && matSnapshotsQuery.isLoading)
    || enrichedQuery.isLoading;

  const isMaternity = sectionKey === "bundle_maternity_lists";
  const gridCols: "1-2-3" | "1-2-4" = isMaternity ? "1-2-4" : "1-2-3";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <div
        className="pt-[68px]"
        style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1A3D2E 100%)" }}
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12">
          {/* Breadcrumb + back link */}
          <nav className="flex items-center gap-1.5 text-xs text-primary-foreground/60 mb-3 font-body">
            <Link to="/" className="hover:text-primary-foreground/90">Home</Link>
            <span>/</span>
            <Link to="/bundles" className="hover:text-primary-foreground/90">Bundles</Link>
            <span>/</span>
            <span className="text-primary-foreground/90 font-semibold">
              {section?.title || "Loading…"}
            </span>
          </nav>
          <h1 className="pf text-3xl md:text-[46px] text-primary-foreground mb-2.5">
            {section?.title || "Bundles"}
          </h1>
          {section?.subtitle && (
            <p className="text-primary-foreground/70 text-sm md:text-base max-w-[620px] leading-relaxed">
              {section.subtitle}
            </p>
          )}
          <div className="mt-4">
            <Link
              to="/bundles"
              className="inline-flex items-center text-primary-foreground/70 hover:text-primary-foreground text-xs font-semibold"
            >
              ← Back to all Bundles
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12">
        <BundleSection
          heading={section?.title || ""}
          subtitle=""
          items={enrichedQuery.data || []}
          loading={loading}
          variant="bundles"
          gridCols={gridCols}
        />
      </div>
    </div>
  );
}

// Route-friendly wrappers — App.tsx mounts these so each URL resolves
// to a single fixed sectionKey without needing route params.
export function BundleCategoryGiftBoxesPage()    { return <BundleCategoryPage sectionKey="bundle_gift_boxes" />; }
export function BundleCategoryRecoveryKitsPage() { return <BundleCategoryPage sectionKey="bundle_recovery_kits" />; }
export function BundleCategoryMaternityPage()    { return <BundleCategoryPage sectionKey="bundle_maternity_lists" />; }
