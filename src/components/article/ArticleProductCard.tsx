import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, ArrowRight, Minus, Plus } from "lucide-react";
import { fmt, useCart } from "@/lib/cart";
import { getBrandImage } from "@/lib/brandImage";
import BrandPickerModal from "@/components/article/BrandPickerModal";

// Stage 2: the interactive product card that replaces the Stage 1
// placeholder inside articles. Shows the product image (cheapest
// in-stock brand), display name, why_needed, a "from ₦X" price, and an
// Add-to-cart button that opens the brand picker modal.

export interface ArticleBrand {
  id: string;
  brand_name: string | null;
  price: number | null;
  in_stock: boolean | null;
  image_url?: string | null;
  stored_image_url?: string | null;
  sku?: string | null;
}

export interface ArticleSize {
  id: string;
  size_label: string;
  size_code?: string | null;
  in_stock?: boolean | null;
  display_order?: number | null;
}

export interface ArticleColor {
  id: string;
  color_name: string;
  color_hex?: string | null;
  in_stock?: boolean | null;
  display_order?: number | null;
}

export interface ProductWithBrands {
  id: string;
  slug: string;
  name: string;
  image_url?: string | null;
  brands: ArticleBrand[];
  product_sizes?: ArticleSize[];
  product_colors?: ArticleColor[];
}

// Cheapest brand: sort by price asc, prefer in-stock; fall back to the
// cheapest of all when every brand is out of stock.
export function cheapestBrand(brands: ArticleBrand[]): ArticleBrand | null {
  const sorted = [...(brands || [])].sort((a, b) => (a.price || 0) - (b.price || 0));
  return sorted.find((b) => b.in_stock) || sorted[0] || null;
}

interface Props {
  productSlug: string;
  displayName: string;
  whyNeeded: string;
  productData?: ProductWithBrands;
  onAdded?: () => void;
}

export default function ArticleProductCard({ productSlug, displayName, whyNeeded, productData, onAdded }: Props) {
  const { cart, addToCart, updateQty } = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "change">("add");

  // The card's in-cart state derives from the cart (single source of
  // truth): the most-recently-added line matching this product, if any.
  const cartLine = useMemo(() => {
    if (!productData) return null;
    const matches = (cart || []).filter((i: any) => i.id === productData.id);
    return matches.length ? matches[matches.length - 1] : null;
  }, [cart, productData]);

  // Re-adding the same product+brand hits the cart's variant-aware merge
  // key, so qty increments. Bump the cart icon (additions only).
  const handleIncrement = () => {
    if (!cartLine) return;
    // Preserve the line's full variant tuple so the cart's variant-aware
    // _key matches and qty increments (rather than creating a new row).
    addToCart({
      ...productData,
      selectedBrand: cartLine.selectedBrand,
      price: cartLine.selectedBrand?.price ?? cartLine.price,
      name: cartLine.name,
      selectedSize: cartLine.selectedSize ?? null,
      selectedColor: cartLine.selectedColor ?? null,
    });
    onAdded?.();
  };

  // updateQty auto-removes the line when newQty <= 0. No bump on decrement.
  const handleDecrement = () => {
    if (!cartLine) return;
    updateQty(cartLine._key, cartLine.qty - 1);
  };

  const handleChangeBrand = () => {
    setModalMode("change");
    setPickerOpen(true);
  };

  const closeModal = () => {
    setPickerOpen(false);
    setModalMode("add");
  };

  // Loading skeleton while the parent's bulk product fetch resolves.
  if (productData === undefined) {
    return (
      <div className="rounded-2xl border border-coral-blush/30 bg-card p-4 flex gap-3 animate-pulse min-h-[140px]">
        <div className="w-20 h-20 rounded-xl bg-muted flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-5/6 bg-muted rounded" />
          <div className="h-8 w-28 bg-muted rounded-pill mt-3" />
        </div>
      </div>
    );
  }

  const brands = productData?.brands || [];
  const best = cheapestBrand(brands);
  const img = best ? getBrandImage(best) : null;

  return (
    <div className="rounded-2xl border border-coral-blush/30 bg-card p-4">
      <div className="flex flex-row gap-3">
        {/* Image */}
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-forest-light to-coral-blush flex-shrink-0">
          {img && (
            <img
              src={img}
              alt={productData.name}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground leading-snug break-words">{displayName}</p>
          {whyNeeded && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{whyNeeded}</p>}
          {best?.price != null && (
            <p className="text-sm text-coral font-semibold mt-2">from {fmt(best.price)}</p>
          )}
        </div>
      </div>

      {/* Action — stepper once in cart, otherwise Add-to-cart / View product */}
      {cartLine ? (
        <div className="mt-3 flex flex-col gap-1.5 sm:items-end">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDecrement}
              aria-label="Decrease quantity"
              className="h-9 w-9 rounded-full bg-warm-cream flex items-center justify-center interactive"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="font-body font-bold text-sm w-6 text-center">{cartLine.qty}</span>
            <button
              type="button"
              onClick={handleIncrement}
              aria-label="Increase quantity"
              className="h-9 w-9 rounded-full bg-warm-cream flex items-center justify-center interactive"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleChangeBrand}
            className="text-xs text-forest underline-offset-2 hover:underline self-start sm:self-end min-h-7 px-1"
          >
            Change brand ({cartLine.selectedBrand?.brand_name || cartLine.selectedBrand?.label || "selected"})
          </button>
        </div>
      ) : (
        <div className="mt-3 flex sm:justify-end">
          {best ? (
            <button
              type="button"
              onClick={() => { setModalMode("add"); setPickerOpen(true); }}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-pill bg-coral text-primary-foreground px-5 text-sm font-semibold hover:bg-coral-dark transition-colors min-h-9"
            >
              <ShoppingBag className="w-4 h-4" /> Add to cart
            </button>
          ) : (
            <Link
              to={`/products/${productSlug}`}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-pill border border-border text-foreground px-5 text-sm font-semibold hover:border-forest/60 transition-colors min-h-9"
            >
              View product <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}

      {best && (
        <BrandPickerModal
          open={pickerOpen}
          onClose={closeModal}
          productData={productData}
          onAdded={onAdded}
          mode={modalMode}
          existingItem={modalMode === "change" ? cartLine : null}
        />
      )}
    </div>
  );
}
