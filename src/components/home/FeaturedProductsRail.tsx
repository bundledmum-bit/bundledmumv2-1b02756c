import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useMemo } from "react";
import { useCart, fmt, getBrandForBudget } from "@/lib/cart";
import ProductImage from "@/components/ProductImage";
import { useFeaturedProducts, useBestsellers } from "@/hooks/useHomepage";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrandImage } from "@/lib/brandImage";

interface Props {
  title?: string | null;
  subtitle?: string | null;
  maxItems?: number;
}

/**
 * Mobile: horizontal snap-scroll rail.
 * Desktop: 4-column grid up to maxItems.
 *
 * Falls back from `is_featured` → `is_bestseller` products if the
 * featured list is empty.
 */
export default function FeaturedProductsRail({ title, subtitle, maxItems = 8 }: Props) {
  const { data: featured, isLoading: loadingFeatured } = useFeaturedProducts();
  const { data: bestsellers, isLoading: loadingBest } = useBestsellers();
  const { addToCart } = useCart();

  const products = useMemo(() => {
    const base = (featured && featured.length > 0) ? featured : (bestsellers || []);
    return base.slice(0, maxItems);
  }, [featured, bestsellers, maxItems]);

  const isLoading = loadingFeatured || (featured?.length === 0 && loadingBest);

  if (!isLoading && products.length === 0) return null;

  return (
    <section className="px-4 md:px-10 py-6 md:py-10">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="pf text-xl md:text-2xl font-bold">{title || "Bestsellers Right Now"}</h2>
            {subtitle && <p className="text-text-med text-xs mt-0.5">{subtitle}</p>}
          </div>
          <Link to="/shop" className="text-xs font-semibold text-forest hover:underline whitespace-nowrap">View all →</Link>
        </div>

        {isLoading ? (
          <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible -mx-4 md:mx-0 px-4 md:px-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="min-w-[160px] md:min-w-0 h-[220px] rounded-card flex-shrink-0" />
            ))}
          </div>
        ) : (
          <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible -mx-4 md:mx-0 px-4 md:px-0 scrollbar-none">
            {products.map((p: any) => {
              const brand = getBrandForBudget(p, "standard") as any;
              const displayPrice = brand?.price || 0;
              const cheapest = (p.brands || []).length > 0
                ? Math.min(...p.brands.map((b: any) => Number(b.price) || 0).filter(Boolean))
                : displayPrice;
              return (
                <div key={p.id} className="snap-start flex-shrink-0 w-[160px] md:w-auto bg-card rounded-card shadow-card overflow-hidden flex flex-col">
                  <Link to={`/shop?q=${encodeURIComponent(p.name)}`} className="block aspect-square bg-warm-cream overflow-hidden">
                    <ProductImage
                      imageUrl={getBrandImage(brand) || brand?.thumbnail_url || null}
                      emoji="📦"
                      alt={p.name}
                      className="w-full h-full"
                      emojiClassName="text-3xl"
                    />
                  </Link>
                  <div className="p-3 flex-1 flex flex-col">
                    {p.badge_label && (
                      <span className="inline-block self-start text-[9px] font-semibold bg-coral/10 text-coral px-1.5 py-0.5 rounded mb-1">{p.badge_label}</span>
                    )}
                    <h3 className="text-[12px] font-semibold leading-tight line-clamp-2 mb-1">{p.name}</h3>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <div>
                        <div className="text-forest font-bold text-sm tabular-nums">{fmt(cheapest)}</div>
                        {p.brands?.length > 1 && <div className="text-text-light text-[9px]">from</div>}
                      </div>
                      <button
                        onClick={() => {
                          addToCart({ ...p, selectedBrand: brand, price: brand.price, name: `${p.name} (${brand.label || brand.brand_name || "Standard"})` });
                          toast.success(`${p.name} added`);
                        }}
                        className="text-[11px] font-semibold bg-forest text-primary-foreground rounded-full px-2.5 py-1 hover:bg-forest-deep"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
