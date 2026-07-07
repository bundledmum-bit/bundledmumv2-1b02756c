import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adaptProducts, type Product } from "@/lib/supabaseAdapters";
import { trackEcommerce } from "@/lib/ga";
import { useProductCategories } from "@/hooks/useProductCategories";
import { useCategoryPagePins } from "@/hooks/useMerchandising";
import Seo from "@/components/Seo";
import ProductCard from "@/components/shop/ProductCard";
import ShopPageHeader from "@/components/shop/ShopPageHeader";
import SubcategoryChips from "@/components/shop/SubcategoryChips";
import { ChevronLeft } from "lucide-react";

const BRAND_COLS =
  "id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, stored_image_url, thumbnail_url, logo_url, compare_at_price, images, weight_range_kg, pack_count, diaper_type";
const PRODUCT_COLS = `*, brands:brands_public!brands_product_id_fkey(${BRAND_COLS}), product_sizes(*), product_colors(*), product_tags(*), product_images(*)`;

function useCategoryProducts(slug: string) {
  return useQuery({
    queryKey: ["category_products", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLS)
        .eq("subcategory", slug)
        .eq("is_active", true)
        .is("deleted_at", null);
      if (error) throw error;
      const rows = data || [];
      rows.sort((a: any, b: any) => {
        const aSO = a.stage_order == null ? Number.POSITIVE_INFINITY : a.stage_order;
        const bSO = b.stage_order == null ? Number.POSITIVE_INFINITY : b.stage_order;
        if (aSO !== bSO) return aSO - bSO;
        return (a.name || "").localeCompare(b.name || "");
      });
      return adaptProducts(rows);
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

export default function CategoryPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { data: allProducts, isLoading: loadingAll } = useCategoryProducts(slug);
  const { data: pinnedProducts, isLoading: loadingPins } = useCategoryPagePins(slug);
  const { data: categories } = useProductCategories();
  const category = (categories || []).find((c) => c.slug === slug);

  const heading = category?.merch_page_label?.trim() || category?.name || slug;

  // Section this category belongs to, for chips + breadcrumb + accent.
  const parent = category?.parent_category === "mum" ? "mum" : "baby";
  const shopLabel = parent === "mum" ? "Mum Shop" : "Baby Shop";
  const shopHref = parent === "mum" ? "/shop/mum" : "/shop/baby";
  const siblings = useMemo(
    () =>
      (categories || []).filter(
        (c) => c.parent_category === parent || c.parent_category === "both"
      ),
    [categories, parent]
  );

  // Honour admin merchandising order: pinned products first (in their pin
  // order), then the rest of the category, deduped by id. Each renders as one
  // standard product card.
  const products = useMemo<Product[]>(() => {
    const pins = pinnedProducts || [];
    const rest = allProducts || [];
    const seen = new Set<string>();
    const merged: Product[] = [];
    for (const pin of pins) {
      if (!seen.has(pin.product.id)) {
        seen.add(pin.product.id);
        merged.push(pin.product);
      }
    }
    for (const p of rest) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        merged.push(p);
      }
    }
    return merged;
  }, [pinnedProducts, allProducts]);

  const isLoading = loadingAll || loadingPins;

  // GA4 view_item_list.
  const listId = `category_${slug}`;
  const listName = heading || slug;
  useEffect(() => {
    if (!products.length) return;
    trackEcommerce("view_item_list", {
      item_list_id: listId,
      item_list_name: listName,
      items: products.map((p, index) => ({
        item_id: p.id,
        item_name: p.name,
        item_brand: p.brands?.[0]?.label ?? "",
        item_category: p.category ?? "",
        item_category2: p.subcategory ?? "",
        price: p.brands?.[0]?.price ?? 0,
        index,
        item_list_id: listId,
        item_list_name: listName,
      })),
    });
  }, [listId, listName, products]);

  return (
    <div className="min-h-screen bg-background pb-16">
      <Seo title={`${heading} | ${shopLabel} | BundledMum`} description={`Shop ${heading} at BundledMum.`} />

      <ShopPageHeader
        accent={parent}
        eyebrow={shopLabel}
        title={heading}
        icon={category?.icon}
        count={products.length}
        breadcrumbs={[{ label: shopLabel, href: shopHref }, { label: heading }]}
      />

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-5">
        <div className="mb-6">
          <SubcategoryChips
            categories={siblings}
            hrefBase={shopHref}
            activeSlug={slug}
            allLabel={`All ${parent === "mum" ? "Mum" : "Baby"}`}
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-[14px] border border-border bg-card overflow-hidden">
                <div className="aspect-square bg-muted animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">{category?.icon || "🔍"}</div>
            <h2 className="pf text-xl font-bold mb-2">No products in this category yet</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Check back soon, we are constantly adding new items.
            </p>
            <Link
              to={shopHref}
              className="inline-flex items-center gap-1.5 rounded-pill border border-forest text-forest px-5 py-2.5 text-sm font-semibold hover:bg-forest/5 transition-colors min-h-[44px]"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to {shopLabel}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
