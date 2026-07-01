import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Flame, Clock, ShoppingBag, X, ZoomIn } from "lucide-react";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";

/**
 * Interactive Flash Deals rail. Real FOMO from real data: a live countdown to
 * the end of the day, "Save X%" from compareAtPrice, and low-stock nudges from
 * stockQuantity. Each card adds to the cart in place with a quantity stepper.
 *
 * TODO(backend): a true sale window and "claimed" metric have no field yet.
 * Proposed: site_settings.deals_ends_at (timestamptz) + deals_heading, and a
 * real sold/stock signal per brand. Until then the countdown runs to midnight
 * and the urgency bar is derived from stockQuantity. See the backend audit.
 */

// PREVIEW ONLY. No product in the DB has a compare_at_price set yet (0 of 518),
// so there is nothing real to slash. To let the owner evaluate the flash-deal
// design, show an illustrative "was" price (a varied, deterministic discount).
// This is NOT real pricing. Set this to false, or set real compare_at_price
// values in admin, and the cards use genuine sale data instead. See the audit
// (proposed: deals_product_ids / a sale rule + deals_ends_at).
export const PREVIEW_DEMO_SALES = true;

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Deterministic 10-30% illustrative discount keyed off the id, so demo prices
// look varied and stay stable across renders.
export function demoDiscountPct(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 10 + (h % 21);
}

// Shared deal-product selection: real on-sale products (compareAtPrice >
// price) first; falls back to the given pool so the section always populates
// in preview. Used by both the homepage rail and the full /deals page so the
// two stay in sync.
export function selectDealProducts(products: any[], limit = 10) {
  const onSale = (products || []).filter((p) => {
    const b = getBrandForBudget(p, "standard");
    return b && b.compareAtPrice && b.compareAtPrice > b.price;
  });
  return (onSale.length > 0 ? onSale : (products || [])).slice(0, limit);
}

// Shared pricing derivation for one deal product: real sale from
// compare_at_price when present, else the flagged preview demo discount.
// Both FlashDealCard and the /deals page (for sorting) read from here so the
// displayed price and the sort order never disagree.
export function getDealPricing(product: any) {
  const brand = getBrandForBudget(product, "standard");
  if (!brand) return null;
  const demoWas = PREVIEW_DEMO_SALES && brand.price > 0
    ? Math.round((brand.price / (1 - demoDiscountPct(product.id) / 100)) / 50) * 50
    : null;
  const was: number | null = (brand.compareAtPrice && brand.compareAtPrice > brand.price) ? brand.compareAtPrice : demoWas;
  const onSale = !!was && was > brand.price;
  const savePct = onSale ? Math.round(((was! - brand.price) / was!) * 100) : 0;
  const stock: number | null = brand.stockQuantity ?? null;
  return { brand, was, onSale, savePct, price: brand.price, stock };
}

export function useCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // End of the current day, local time.
  const end = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);
  const diff = Math.max(0, end - now);
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
// zoomable=true (deals grid): tapping the image opens a lightbox so the
//   shopper can inspect the product before adding to cart. "View product"
//   inside the lightbox handles navigation.
export function FlashDealCard({ product, className = "", zoomable = false }: { product: any; className?: string; zoomable?: boolean }) {
  const navigate = useNavigate();
  const { cart, addToCart, updateQty } = useCart();
  const [zoomed, setZoomed] = useState(false);
  const pricing = getDealPricing(product);
  if (!pricing) return null;
  const { brand, was, onSale, savePct: save, stock } = pricing;
  const lowStock = stock != null && stock > 0 && stock <= 10;
  const needsSize = product.sizes && product.sizes.length > 0;

  const cartKey = cartItemKey(product.id, brand.id, null, null, null);
  const cartItem = cart.find((c: any) => c._key === cartKey);

  // Urgency bar: derived from real stock when known (lower stock = fuller bar),
  // otherwise a soft default so the flash-card treatment reads consistently.
  const soldPct = lowStock ? Math.min(94, Math.round((1 - stock! / 12) * 100)) : 62;

  const add = () => {
    if (needsSize) { navigate(`/products/${product.slug}`); return; }
    addToCart({ ...product, selectedBrand: brand, price: brand.price, name: `${product.name} (${brand.label})`, selectedSize: "", selectedColor: "" });
  };

  const imageUrl = brand.imageUrl || product.imageUrl;

  // Badges rendered inside both the card image and the lightbox.
  const badges = (
    <>
      {onSale && (
        <span className="absolute top-2 left-2 rounded-pill bg-coral text-white text-[10px] font-bold px-2 py-0.5">-{save}%</span>
      )}
      <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-pill bg-foreground/80 text-white text-[9px] font-bold px-1.5 py-0.5">
        <Flame className="w-2.5 h-2.5 text-coral" /> HOT
      </span>
    </>
  );

  const cardImage = (
    <ProductImage imageUrl={imageUrl} emoji={brand.img} alt={product.name} className="w-full h-full" emojiClassName="text-5xl" />
  );

  return (
    <>
      <div className={`rounded-[14px] border border-border bg-card overflow-hidden card-hover flex flex-col ${className}`}>
        {/* Image area: navigates to product on the homepage rail; opens
            lightbox zoom on the /deals grid. */}
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
          <div>
            <div className="h-1.5 rounded-pill bg-muted overflow-hidden">
              <div className="h-full rounded-pill bg-coral transition-all" style={{ width: `${soldPct}%` }} />
            </div>
            <p className="mt-1 text-[10px] font-semibold text-coral-dark">{lowStock ? `Only ${stock} left` : "Selling fast"}</p>
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

      {/* Lightbox: only rendered when zoomable=true and user tapped the image */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-midnight/80 animate-fade-in"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative bg-card rounded-[20px] overflow-hidden shadow-2xl max-w-[400px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setZoomed(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 bg-card/90 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center shadow"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>

            {/* Full image */}
            <div className="aspect-square bg-warm-cream overflow-hidden">
              <ProductImage imageUrl={imageUrl} emoji={brand.img} alt={product.name} className="w-full h-full" emojiClassName="text-8xl" />
            </div>

            {/* Info + CTA */}
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

export default function FlashDeals({ products, heading }: { products: any[]; heading?: string }) {
  const { h, m, s } = useCountdown();
  if (!products?.length) return null;

  return (
    <section className="py-5">
      <div className="px-4 md:px-6 flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-lg md:text-xl font-bold text-foreground inline-flex items-center gap-1.5 shrink-0">
            <Flame className="w-5 h-5 text-coral" /> {heading || "Flash Deals"}
          </h2>
          <span className="inline-flex items-center gap-1 rounded-pill bg-foreground text-white text-[11px] font-semibold px-2.5 py-1">
            <Clock className="w-3 h-3" />
            <span className="font-mono-price">{pad(h)}<span className="opacity-60">:</span>{pad(m)}<span className="opacity-60">:</span>{pad(s)}</span>
          </span>
        </div>
        <Link to="/deals" className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-0.5 shrink-0">
          See all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 md:px-6 pb-1 snap-x scrollbar-none">
        {products.map((p: any) => <FlashDealCard key={p.id} product={p} className="snap-start shrink-0 w-[172px]" />)}
      </div>
    </section>
  );
}
