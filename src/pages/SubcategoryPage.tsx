import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adaptProducts } from "@/lib/supabaseAdapters";
import { useProductCategories } from "@/hooks/useProductCategories";
import Seo from "@/components/Seo";
import ProductCard from "@/components/shop/ProductCard";
import ShopPageHeader from "@/components/shop/ShopPageHeader";
import SubcategoryChips from "@/components/shop/SubcategoryChips";
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
        .is("deleted_at", null);
      if (error) throw error;
      const rows = (data || []) as any[];
      rows.sort((a, b) => {
        const aSO = a.stage_order == null ? Number.POSITIVE_INFINITY : a.stage_order;
        const bSO = b.stage_order == null ? Number.POSITIVE_INFINITY : b.stage_order;
        if (aSO !== bSO) return aSO - bSO;
        return (a.name || "").localeCompare(b.name || "");
      });
      return adaptProducts(rows);
    },
    enabled: !!categorySlug,
    staleTime: 5 * 60 * 1000,
  });
}

export default function SubcategoryPage({ tab }: { tab: "baby" | "mum" }) {
  const { category } = useParams<{ category: string }>();
  const { data: categories } = useProductCategories();
  const { data: products, isLoading } = useSubcategoryProducts(category || "");

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
          <SubcategoryChips
            categories={siblings}
            hrefBase={shopHref}
            activeSlug={category}
            allLabel={`All ${tab === "baby" ? "Baby" : "Mum"}`}
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
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
