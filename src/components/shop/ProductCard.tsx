import { Link } from "react-router-dom";
import ProductImage from "@/components/ProductImage";
import { fmt } from "@/lib/cart";
import { isProductOOS, type Product } from "@/lib/supabaseAdapters";
import { useBrandPromo } from "@/hooks/useBrandPricing";

// Shared premium product card for every listing surface (Shop, category,
// subcategory, search). One card == one product. When a product carries more
// than one brand we show a "from" price and a brand-count cue, and the card
// routes to the product group page where the shopper picks a brand. Single
// brand products go straight to their standalone detail page.
export default function ProductCard({ product, className = "", leadBrandId }: { product: Product; className?: string; leadBrandId?: string | null }) {
  const brands = product.brands || [];
  const inStockBrands = brands.filter((b) => b.inStock !== false);
  const pricePool = (inStockBrands.length ? inStockBrands : brands)
    .map((b) => b.price)
    .filter((p): p is number => typeof p === "number" && p > 0);
  // A pinned/resolved lead brand (from merchandising) fixes exactly which brand
  // and price the card shows; otherwise fall back to the cheapest in-stock brand.
  const leadBrand = leadBrandId ? brands.find((b) => b.id === leadBrandId) || null : null;
  const cheapestBrand =
    (inStockBrands.length ? inStockBrands : brands)
      .slice()
      .sort((a, b) => (a.price || 0) - (b.price || 0))[0] || null;
  const displayBrand = leadBrand || cheapestBrand;
  // Effective (promo) price for the displayed brand — single source of truth.
  const promo = useBrandPromo(leadBrand?.id);
  const promoLive = !!promo?.promoLabel;
  const multiBrand = brands.length > 1 && !leadBrand;
  const minPrice = leadBrand
    ? (promoLive ? promo!.unitPrice : (displayBrand?.price || 0))
    : (pricePool.length ? Math.min(...pricePool) : 0);

  const strike = leadBrand
    ? (promoLive ? (promo!.compareAt ?? promo!.listPrice) : displayBrand?.compareAtPrice)
    : cheapestBrand?.compareAtPrice;
  const onSale = strike != null && strike > (minPrice || 0);
  const savingsPct = onSale && strike ? Math.round(((strike - minPrice) / strike) * 100) : 0;

  const oos = isProductOOS(product);
  // Prefer the product image, then the first brand that actually carries one
  // (the cheapest brand may have no photo even when siblings do).
  const image =
    (leadBrand?.imageUrl) ||
    product.imageUrl ||
    displayBrand?.imageUrl ||
    brands.find((b) => b.imageUrl)?.imageUrl ||
    null;
  const emoji = displayBrand?.img || product.baseImg;

  return (
    <Link
      to={`/products/${product.slug}`}
      className={`group flex flex-col rounded-[14px] border border-border bg-card overflow-hidden card-hover ${className}`}
    >
      <div className="relative aspect-square bg-warm-cream overflow-hidden">
        <ProductImage
          imageUrl={image}
          emoji={emoji}
          alt={product.name}
          className="w-full h-full"
          emojiClassName="text-5xl"
        />
        {oos ? (
          <span className="absolute top-2 left-2 rounded-pill bg-midnight/80 text-primary-foreground text-[10px] font-bold px-2 py-0.5">
            Sold out
          </span>
        ) : promoLive ? (
          <span className="absolute top-2 left-2 rounded-pill bg-coral text-primary-foreground text-[10px] font-bold px-2 py-0.5 max-w-[92%] truncate">
            {promo!.promoLabel}
          </span>
        ) : onSale ? (
          <span className="absolute top-2 left-2 rounded-pill bg-coral text-primary-foreground text-[10px] font-bold px-2 py-0.5">
            Save {savingsPct}%
          </span>
        ) : product.badge ? (
          <span className="absolute top-2 left-2 rounded-pill bg-forest text-primary-foreground text-[10px] font-bold px-2 py-0.5">
            {product.badge}
          </span>
        ) : null}
        {multiBrand && (
          <span className="absolute bottom-2 right-2 rounded-pill bg-card/90 backdrop-blur-sm text-forest text-[10px] font-semibold px-2 py-0.5 border border-border">
            {brands.length} brands
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
          {product.name}
        </p>
        <div className="mt-auto pt-1.5 flex items-baseline gap-1.5">
          {minPrice > 0 ? (
            <>
              {multiBrand && (
                <span className="text-[11px] text-muted-foreground">from</span>
              )}
              <span className="font-mono-price text-forest font-bold text-[15px]">
                {fmt(minPrice)}
              </span>
              {onSale && !multiBrand && strike != null && (
                <span className="font-mono-price text-muted-foreground text-[10px] line-through">
                  {fmt(strike)}
                </span>
              )}
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground">See options</span>
          )}
        </div>
      </div>
    </Link>
  );
}
