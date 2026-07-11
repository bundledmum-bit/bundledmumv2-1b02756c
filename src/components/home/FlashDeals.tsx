import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, ShoppingBag, X, ZoomIn } from "lucide-react";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";

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
// is for (so pricing and add-to-cart use the right variant).
export type DealItem = { product: any; brandId: string };

// Fetch the admin-curated deal list and resolve each row to the full adapted
// product (so add-to-cart stays cart/checkout compatible), preserving the RPC's
// display_order. Rows whose product isn't shoppable are dropped.
export function useDealProducts() {
  const { data: allProducts } = useAllProducts();
  const rpc = useQuery({
    queryKey: ["deal_products"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_deal_products");
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
        return product ? { product, brandId: r.brand_id as string } : null;
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
  return {
    h: Math.floor(diff / 3_600_000),
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
export function FlashDealCard({ product, brandId, className = "", zoomable = false }: { product: any; brandId?: string; className?: string; zoomable?: boolean }) {
  const navigate = useNavigate();
  const { cart, addToCart, updateQty } = useCart();
  const [zoomed, setZoomed] = useState(false);
  const pricing = getDealPricing(product, brandId);
  if (!pricing) return null;
  const { brand, was, onSale, savePct: save } = pricing;
  const stock: number | null = brand.stockQuantity ?? null;
  const needsSize = product.sizes && product.sizes.length > 0;

  const cartKey = cartItemKey(product.id, brand.id, null, null, null);
  const cartItem = cart.find((c: any) => c._key === cartKey);

  const add = () => {
    if (needsSize) { navigate(`/products/${product.slug}`); return; }
    addToCart({ ...product, selectedBrand: brand, price: brand.price, name: `${product.name} (${brand.label})`, selectedSize: "", selectedColor: "" });
  };

  const imageUrl = brand.imageUrl || product.imageUrl;

  // Real sale badge only.
  const badges = onSale ? (
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
          <Link to={`/products/${product.slug}`} className="aspect-square bg-warm-cream relative overflow-hidden block">
            {cardImage}
            {badges}
          </Link>
        )}

        <div className="p-2.5 flex flex-col gap-1.5 flex-1">
          <Link
            to={`/products/${product.slug}`}
            className="font-semibold text-xs text-foreground line-clamp-2 leading-snug min-h-[32px] hover:text-forest transition-colors"
          >
            {product.name}
          </Link>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono-price text-coral font-bold text-sm">{fmt(brand.price)}</span>
            {onSale && <span className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(was!)}</span>}
          </div>
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
              <p className="font-semibold text-sm text-foreground leading-snug mb-1">{product.name}</p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-mono-price text-coral font-bold text-lg">{fmt(brand.price)}</span>
                {onSale && <span className="font-mono-price text-muted-foreground text-xs line-through">{fmt(was!)}</span>}
                {onSale && <span className="text-xs font-bold text-coral">Save {save}%</span>}
              </div>
              <Link
                to={`/products/${product.slug}`}
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
                <span className="font-mono-price">{pad(countdown.h)}<span className="opacity-60">:</span>{pad(countdown.m)}<span className="opacity-60">:</span>{pad(countdown.s)}</span>
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
        {items.map((d) => <FlashDealCard key={d.product.id} product={d.product} brandId={d.brandId} className="snap-start shrink-0 w-[172px]" />)}
      </div>
    </section>
  );
}
