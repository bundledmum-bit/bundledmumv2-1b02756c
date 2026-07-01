import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adaptProducts, isProductOOS, type Product } from "@/lib/supabaseAdapters";
import { useProductCategories } from "@/hooks/useProductCategories";
import { fmt } from "@/lib/cart";
import Seo from "@/components/Seo";
import Breadcrumb from "@/components/Breadcrumb";
import ProductImage from "@/components/ProductImage";
import { Truck, Shield, RotateCcw, ChevronRight, ChevronLeft } from "lucide-react";

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

function SubcatProductCard({ product, catIcon }: { product: Product; catIcon?: string | null }) {
  const brands = product.brands || [];
  const prices = brands.map(b => b.price || 0).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const img = brands[0]?.imageUrl || null;
  const oos = isProductOOS(product);

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex flex-col bg-card rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        {img ? (
          <ProductImage
            imageUrl={img}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
            {catIcon || "🛍️"}
          </div>
        )}
        {oos && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold bg-black/60 rounded-full px-2.5 py-1">
              Out of stock
            </span>
          </div>
        )}
        {brands.length > 1 && (
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-forest text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm">
            {brands.length} brands
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-foreground line-clamp-2 leading-snug">
          {product.name}
        </p>
        <div className="flex items-center justify-between mt-auto pt-1.5">
          {minPrice > 0 ? (
            <span className="text-[14px] font-bold text-coral">
              {brands.length > 1 ? "from " : ""}
              {fmt(minPrice)}
            </span>
          ) : (
            <span className="text-[12px] text-muted-foreground">See options</span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>
        {brands.length > 1 && (
          <p className="text-[11px] text-muted-foreground">{brands.length} brands available</p>
        )}
      </div>
    </Link>
  );
}

export default function SubcategoryPage({ tab }: { tab: "baby" | "mum" }) {
  const { category } = useParams<{ category: string }>();
  const { data: categories } = useProductCategories();
  const { data: products, isLoading } = useSubcategoryProducts(category || "");

  const catInfo = useMemo(
    () => (categories || []).find(c => c.slug === category),
    [categories, category]
  );

  const shopLabel = tab === "baby" ? "Baby Shop" : "Mum Shop";
  const shopHref = tab === "baby" ? "/shop/baby" : "/shop/mum";
  const subtitle =
    tab === "baby"
      ? "Curated baby essentials for Nigerian families"
      : "Maternity and postpartum essentials for new mums";

  const breadcrumbs = [
    { label: shopLabel, href: shopHref },
    { label: catInfo?.name || category || "" },
  ];

  const seoTitle = `${catInfo?.name || category} | ${shopLabel} | BundledMum`;

  return (
    <div className="min-h-screen bg-background pb-16 pt-[68px]">
      <Seo title={seoTitle} description={`Shop ${catInfo?.name || category} — ${subtitle}`} />

      {/* Deals-style category header */}
      <div className="bg-gradient-to-r from-forest-deep to-forest">
        <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-5 md:py-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="pf text-white font-bold text-[22px] md:text-[30px] inline-flex items-center gap-2.5">
              {catInfo?.icon && <span className="text-[1.1em]">{catInfo.icon}</span>}
              {catInfo?.name || category}
            </h1>
            <p className="mt-1 text-white/75 text-sm">{subtitle}</p>
          </div>
          <Link
            to={shopHref}
            className="flex-shrink-0 inline-flex items-center gap-1 text-white/70 text-[13px] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {shopLabel}
          </Link>
        </div>
      </div>

      {/* Trust strip */}
      <div className="border-b border-border bg-card">
        <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs md:text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-forest" /> Fast Lagos delivery
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-forest" /> Quality guaranteed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-forest" /> Easy returns
          </span>
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-5">
        <Breadcrumb items={breadcrumbs} className="mb-5" />

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border overflow-hidden">
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
              className="inline-flex items-center gap-1.5 bg-forest text-white rounded-pill px-6 py-3 text-sm font-semibold hover:bg-forest-deep transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Browse {shopLabel}
            </Link>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm mb-4">
              {products.length} product{products.length === 1 ? "" : "s"}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {products.map(product => (
                <SubcatProductCard key={product.id} product={product} catIcon={catInfo?.icon} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
