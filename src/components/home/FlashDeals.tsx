import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, ShoppingBag, X, ZoomIn } from "lucide-react";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";
import { useBrandPromoDisplay } from "@/hooks/useBrandPricing";

/**
 * Deals rail + shared deal card. Deals are an admin-curated list served by the
 * get_deal_products() RPC (active + in-stock already applied, ordered by
 * display_order). A strike-through "was" price renders IF AND ONLY IF the
 * brand's compare_at_price is greater than its price. There is no invented
 * discount and no fake urgency: no fabricated countdown, no fabricated
 * "selling fast" bar. The countdown only appears when site_settings.deals_ends_at
 * is set to a real future time.
 */

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Curated deal item: the full adapted product plus the specific brand the deal
// is for (so add-to-cart uses the right variant), PLUS the promo fields straight
// from get_deal_products (the single source of truth — effective price, strike,
// promo label and per-brand end time). Display uses the RPC values; the frontend
// never recomputes a promo price.
export type DealItem = {
  dealId: string;             // one row PER BRAND — unique key, never dedup by product
  product: any;
  productName: string;
  brandId: string;
  brandName: string | null;
  sku: string | null;
  price: number;              // EFFECTIVE price after promo (from the RPC)
  compareAt: number | null;   // strike-through
  promoType: string | null;
  promoLabel: string | null;
  promoEndsAt: string | null;
};

// Fetch the admin-curated deal list and resolve each row to the full adapted
// product (so add-to-cart stays cart/checkout compatible), preserving the RPC's
// display_order AND its promo pricing. Rows whose product isn't shoppable are dropped.
export function useDealProducts() {
  const { data: allProducts } = useAllProducts();
  const rpc = useQuery({
    queryKey: ["deal_products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_deal_products");
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const items: DealItem[] = useMemo(() => {
    const byId = new Map((allProducts || []).map((p: any) => [p.id, p]));
    return (rpc.data || [])
      .map((r: any) => {
        const product = byId.get(r.product_id);
        return product
          ? {
              dealId: (r.deal_id ?? `${r.product_id}:${r.brand_id}`) as string,
              product,
              productName: (r.product_name ?? product.name) as string,
              brandId: r.brand_id as string,
              brandName: r.brand_name ?? null,
              sku: r.sku ?? null,
              price: Number(r.price) || 0,
              compareAt: r.compare_at_price != null ? Number(r.compare_at_price) : null,
              promoType: r.promo_type ?? null,
              promoLabel: r.promo_label ?? null,
              promoEndsAt: r.promo_ends_at ?? null,
            }
          : null;
      })
      .filter(Boolean) as DealItem[];
  }, [rpc.data, allProducts]);
  return { items, isLoading: rpc.isLoading };
}

// Pricing for one deal card. Real sale only: `was` is set purely from
// compare_at_price when it is greater than price. Never invented.
export function getDealPricing(product: any, brandId?: string) {
  const brand = (brandId && (product.brands || []).find((b: any) => b.id === brandId)) || getBrandForBudget(product, "standard");
  if (!brand) return null;
  const was: number | null = brand.compareAtPrice && brand.compareAtPrice > brand.price ? brand.compareAtPrice : null;
  const onSale = !!was;
  const savePct = onSale ? Math.round(((was! - brand.price) / was!) * 100) : 0;
  return { brand, was, onSale, savePct, price: brand.price };
}

// Countdown to a real end time. Returns null when there is no valid future
// end time, so callers render no countdown at all.
export function useCountdown(endsAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const diff = end - now;
  if (diff <= 0) return null;
  // At 48 hours or more, split off whole DAYS and show hours-within-day (0..23).
  // Under 48 hours, `d` is 0 and `h` stays the TOTAL hours — byte-identical to
  // the previous behaviour, so nothing below the threshold changes.
  const useDays = diff >= 48 * 3_600_000;
  return {
    d: useDays ? Math.floor(diff / 86_400_000) : 0,
    h: useDays ? Math.floor((diff % 86_400_000) / 3_600_000) : Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
}

// Layout-agnostic card: no width/shrink/snap classes of its own, so it drops
// cleanly into either a horizontal snap rail (the homepage) or a CSS grid
// (the /deals page) -- the caller controls sizing via `className`.
//
// zoomable=false (default, homepage rail): tapping the product image
//   navigates to the product page.
// zoomable=true (deals grid): tapping the image opens a lightbox.
export function FlashDealCard({ product, brandId, brandName, sku, price: dealPrice, compareAt, promoLabel, promoEndsAt, className = "", zoomable = false }: { product: any; brandId?: string; brandName?: string | null; sku?: string | null; price?: number; compareAt?: number | null; promoLabel?: string | null; promoEndsAt?: string | null; className?: string; zoomable?: boolean }) {
  const navigate = useNavigate();
  const { cart, addToCart, updateQty } = useCart();
  const [zoomed, setZoomed] = useState(false);
  // Per-brand promo countdown (from get_deal_products.promo_ends_at). When it
  // passes the RPC simply stops applying the promo — nothing to clear here.
  const promoCountdown = useCountdown(promoEndsAt);
  // DISPLAY headline (buy-X-get-Y / gift / % off). Names the gift and stays
  // hidden for an out-of-stock gift. Falls back to the RPC's promoLabel when a
  // display row isn't available.
  const promoDisplay = useBrandPromoDisplay(brandId);
  const pricing = getDealPricing(product, brandId);
  if (!pricing) return null;
  const { brand } = pricing;
  // DISPLAY comes from the RPC (single source of truth) when provided; fall back
  // to the brand's compare_at only if the deal fields weren't passed.
  const price = dealPrice != null ? dealPrice : pricing.price;
  const was = compareAt != null && compareAt > price ? compareAt : pricing.was;
  const onSale = was != null && was > price;
  const save = onSale ? Math.round(((was - price) / was) * 100) : 0;
  const stock: number | null = brand.stockQuantity ?? null;
  const needsSize = product.sizes && product.sizes.length > 0;

  const cartKey = cartItemKey(product.id, brand.id, null, null, null);
  const cartItem = cart.find((c: any) => c._key === cartKey);

  const add = () => {
    if (needsSize) { navigate(`/products/${product.slug}`); return; }
    addToCart({ ...product, selectedBrand: brand, price: brand.price, name: `${product.name} (${brand.label})`, selectedSize: "", selectedColor: "" });
  };

  const imageUrl = brand.imageUrl || product.imageUrl;
  // Deep-link each card to its specific brand via ?sku so the PDP opens on it.
  const productHref = `/products/${product.slug}${sku ? `?sku=${encodeURIComponent(sku)}` : ""}`;
  const displayName = brandName ? `${product.name}` : product.name;

  // Promo headline wins (names the gift / states the BOGO); then the RPC's
  // promoLabel, then the discount percent for a plain price drop.
  const badgeText = promoDisplay?.headline || promoLabel;
  const badges = badgeText ? (
    <span className="absolute top-2 left-2 rounded-pill bg-coral text-white text-[10px] font-bold px-2 py-0.5 max-w-[90%] truncate">{badgeText}</span>
  ) : onSale ? (
    <span className="absolute top-2 left-2 rounded-pill bg-coral text-white text-[10px] font-bold px-2 py-0.5">-{save}%</span>
  ) : null;

  const cardImage = (
    <ProductImage imageUrl={imageUrl} emoji={brand.img} alt={product.name} className="w-full h-full" emojiClassName="text-5xl" />
  );

  return (
    <>
      <div className={`rounded-[14px] border border-border bg-card overflow-hidden card-hover flex flex-col ${className}`}>
        {zoomable ? (
          <button
            onClick={() => setZoomed(true)}
            aria-label="Zoom image"
            className="aspect-square bg-warm-cream relative overflow-hidden w-full group"
          >
            {cardImage}
            {badges}
            <span className="absolute bottom-2 right-2 bg-white/85 backdrop-blur-sm rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn className="w-3 h-3 text-foreground" />
            </span>
          </button>
        ) : (
          <Link to={productHref} className="aspect-square bg-warm-cream relative overflow-hidden block">
            {cardImage}
            {badges}
          </Link>
        )}

        <div className="p-2.5 flex flex-col gap-1.5 flex-1">
          <Link
            to={productHref}
            className="font-semibold text-xs text-foreground line-clamp-2 leading-snug hover:text-forest transition-colors"
          >
            {displayName}
          </Link>
          {brandName && (
            <span className="text-coral text-[11px] font-semibold -mt-0.5 truncate">{brandName}</span>
          )}
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono-price text-coral font-bold text-sm">{fmt(price)}</span>
            {onSale && <span className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(was!)}</span>}
          </div>
          {promoCountdown && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-coral">
              <Clock className="w-3 h-3" />
              <span className="font-mono-price">{promoCountdown.d > 0 && `${promoCountdown.d}d `}{pad(promoCountdown.h)}:{pad(promoCountdown.m)}:{pad(promoCountdown.s)}</span>
            </span>
          )}
          <div className="mt-auto pt-0.5">
            {cartItem ? (
              <QtyControl qty={cartItem.qty} onUpdate={(q: number) => updateQty(cartItem._key, q)} maxQty={stock ?? undefined} />
            ) : (
              <button
                onClick={add}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-coral text-white text-xs font-semibold py-2 hover:bg-coral-dark transition-colors min-h-[38px]"
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Add
              </button>
            )}
          </div>
        </div>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-midnight/80 animate-fade-in"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative bg-card rounded-[20px] overflow-hidden shadow-2xl max-w-[400px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomed(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 bg-card/90 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center shadow"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
            <div className="aspect-square bg-warm-cream overflow-hidden">
              <ProductImage imageUrl={imageUrl} emoji={brand.img} alt={product.name} className="w-full h-full" emojiClassName="text-8xl" />
            </div>
            <div className="p-4">
              <p className="font-semibold text-sm text-foreground leading-snug">{product.name}</p>
              {brandName && <p className="text-coral text-xs font-semibold mb-1">{brandName}</p>}
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-mono-price text-coral font-bold text-lg">{fmt(price)}</span>
                {onSale && <span className="font-mono-price text-muted-foreground text-xs line-through">{fmt(was!)}</span>}
                {badgeText ? <span className="text-xs font-bold text-coral">{badgeText}</span> : onSale ? <span className="text-xs font-bold text-coral">Save {save}%</span> : null}
              </div>
              <Link
                to={productHref}
                onClick={() => setZoomed(false)}
                className="block text-center rounded-pill bg-forest text-white py-2.5 text-sm font-semibold hover:bg-forest-deep transition-colors"
              >
                View product
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Homepage deals rail. Heading/subtitle come from the caller (admin settings).
// The countdown only shows when a real endsAt is passed.
export default function FlashDeals({ items, heading, subtitle, endsAt }: { items: DealItem[]; heading?: string; subtitle?: string; endsAt?: string | null }) {
  const countdown = useCountdown(endsAt);
  if (!items?.length) return null;

  return (
    <section className="py-5">
      <div className="px-4 md:px-6 flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg md:text-xl font-bold text-foreground inline-flex items-center gap-1.5 shrink-0">
              {heading || "Deals"}
            </h2>
            {countdown && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-foreground text-white text-[11px] font-semibold px-2.5 py-1">
                <Clock className="w-3 h-3" />
                <span className="font-mono-price">{countdown.d > 0 && `${countdown.d}d `}{pad(countdown.h)}<span className="opacity-60">:</span>{pad(countdown.m)}<span className="opacity-60">:</span>{pad(countdown.s)}</span>
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <Link to="/deals" className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-0.5 shrink-0">
          See all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 md:px-6 pb-1 snap-x scrollbar-none">
        {items.map((d) => <FlashDealCard key={d.dealId} product={d.product} brandId={d.brandId} brandName={d.brandName} sku={d.sku} price={d.price} compareAt={d.compareAt} promoLabel={d.promoLabel} promoEndsAt={d.promoEndsAt} className="snap-start shrink-0 w-[172px]" />)}
      </div>
    </section>
  );
}
