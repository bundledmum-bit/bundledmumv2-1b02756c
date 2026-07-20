import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adaptProducts, hasInStockBrand } from "@/lib/supabaseAdapters";
import { useProductCategories } from "@/hooks/useProductCategories";
import { useMerchandisedRanking } from "@/hooks/useMerchandising";
import Seo from "@/components/Seo";
import ProductCard from "@/components/shop/ProductCard";
import ShopPageHeader from "@/components/shop/ShopPageHeader";
import CategoryNav from "@/components/shop/CategoryNav";
import { ChevronLeft } from "lucide-react";

const BRAND_COLS =
  "id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, stored_image_url, thumbnail_url, logo_url, compare_at_price, weight_range_kg, pack_count, diaper_type";
const PRODUCT_COLS = `*, brands:brands_public!brands_product_id_fkey(${BRAND_COLS}), product_sizes(*), product_colors(*), product_tags(*), product_images(*)`;

function useSubcategoryProducts(categorySlug: string) {
  return useQuery({
    queryKey: ["subcat_products", categorySlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLS)
        .eq("subcategory", categorySlug)
        .eq("is_active", true)
        .is("deleted_at", null)
        // display_order is the canonical ordering across the whole shop
        // (populated on all active products); stage_order is only partially
        // populated, so it can't be the ranking column.
        .order("display_order");
      if (error) throw error;
      const rows = (data || []) as any[];
      // Hide products with no in-stock brand at all.
      return adaptProducts(rows).filter(hasInStockBrand);
    },
    enabled: !!categorySlug,
    staleTime: 5 * 60 * 1000,
  });
}

export default function SubcategoryPage({ tab }: { tab: "baby" | "mum" }) {
  const { category } = useParams<{ category: string }>();
  const { data: categories } = useProductCategories();
  const { data: rawProducts, isLoading } = useSubcategoryProducts(category || "");

  // Order via the merchandising ranking for this subcategory scope (pinned
  // 1..25, then daily seeded shuffle). Restrict to the RPC's membership; the
  // resolved lead brand drives each card's brand + price.
  const { orderIndex: merchOrder, brandByProduct: merchBrand, ready: merchReady } = useMerchandisedRanking(
    category ? `sub:${category}` : null,
  );
  const products = useMemo(() => {
    const list = rawProducts || [];
    if (!merchReady || merchOrder.size === 0) return list;
    return list
      .filter((p) => merchOrder.has(p.id))
      .sort((a, b) => (merchOrder.get(a.id)! - merchOrder.get(b.id)!));
  }, [rawProducts, merchOrder, merchReady]);

  const catInfo = useMemo(
    () => (categories || []).find((c) => c.slug === category),
    [categories, category]
  );

  // Sibling subcategories in this section for the chip strip.
  const siblings = useMemo(
    () =>
      (categories || []).filter(
        (c) => c.parent_category === tab || c.parent_category === "both"
      ),
    [categories, tab]
  );

  const shopLabel = tab === "baby" ? "Baby Shop" : "Mum Shop";
  const shopHref = tab === "baby" ? "/shop/baby" : "/shop/mum";
  const name = catInfo?.name || category || "";

  return (
    <div className="min-h-screen bg-background pb-16">
      <Seo
        title={`${name} | ${shopLabel} | BundledMum`}
        description={`Shop ${name} for your ${tab === "baby" ? "baby" : "postpartum and maternity"} needs.`}
      />

      <ShopPageHeader
        accent={tab}
        eyebrow={shopLabel}
        title={name}
        icon={catInfo?.icon}
        count={products?.length}
        breadcrumbs={[{ label: shopLabel, href: shopHref }, { label: name }]}
      />

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-5">
        {/* Sibling category quick-nav */}
        <div className="mb-6">
          <CategoryNav
            categories={siblings}
            linkFor={(c) => `${shopHref}/${c.slug}`}
            activeSlug={category}
            all={{ label: `All ${tab === "baby" ? "Baby" : "Mum"}`, href: shopHref, icon: tab === "baby" ? "👶" : "💛" }}
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
        ) : !products?.length ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">{catInfo?.icon || "🛍️"}</div>
            <h2 className="pf text-xl font-bold mb-2">No products yet</h2>
            <p className="text-muted-foreground text-sm mb-6">
              We are adding products to this category soon.
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
              <ProductCard key={product.id} product={product} leadBrandId={merchBrand.get(product.id)} brandChoiceLabel />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
