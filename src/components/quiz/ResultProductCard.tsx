import { useState } from "react";
import { fmt } from "@/lib/cart";
import type { Product } from "@/lib/supabaseAdapters";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";
import type { RecommendedProduct } from "./types";

// Extracted verbatim from QuizPage.tsx. No logic changes — just moved to a
// shared location so both QuizPage and HomeQuiz can render the same card.
// preAddQty + onPreAddQtyChange are optional additions: when supplied, the
// card renders a qty stepper between the "why included" blurb and the
// brand selector, letting the user choose how many to add before tapping
// Add to Cart. Omitting them is identical to the old behaviour.
export default function ResultProductCard({ item, onAdd, onRemove, isInCart, cartItem, onQtyUpdate, fullProduct, onViewDetail, preAddQty, onPreAddQtyChange }: {
  item: RecommendedProduct;
  onAdd: (overrideBrand?: any, overrideSize?: string) => void;
  onRemove: () => void;
  isInCart: boolean;
  cartItem?: { qty: number; _key: string } | null;
  onQtyUpdate?: (key: string, qty: number) => void;
  fullProduct?: Product | null;
  onViewDetail?: () => void;
  preAddQty?: number;
  onPreAddQtyChange?: (qty: number) => void;
}) {
  const brands = fullProduct?.brands || [];
  const sizes = fullProduct?.sizes || [];

  // Default to the recommended brand, allow switching
  const recommendedBrandId = item.brand?.id;
  const [selectedBrandId, setSelectedBrandId] = useState(recommendedBrandId || "");
  const [selectedSize, setSelectedSize] = useState(sizes?.[0] || "");

  const selectedBrand = brands.find(b => b.id === selectedBrandId) || (brands.length > 0 ? brands[0] : null);
  const displayImage = selectedBrand?.imageUrl || item.brand?.image_url || item.image_url;
  const displayPrice = selectedBrand?.price ?? item.brand?.price ?? 0;
  // "Coming soon" — no purchasable brand variant exists for this SKU.
  // Distinct from out-of-stock (which has a brand but inStock=false).
  // We hide the price, swap the Add button for a Coming Soon pill, and
  // upstream HomeQuiz.handleAddProduct refuses the cart insert.
  const comingSoon = !selectedBrand && !item.brand;
  const brandOos = !comingSoon && selectedBrand ? !selectedBrand.inStock : false;
  const isLowStock = selectedBrand?.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;
  const showSale = selectedBrand?.compareAtPrice && selectedBrand.compareAtPrice > (selectedBrand?.price || 0);

  const showAllBrands = brands.length <= 3;
  const visibleBrands = showAllBrands ? brands : brands.slice(0, 2);
  const hiddenCount = brands.length - visibleBrands.length;
  const [showMore, setShowMore] = useState(false);
  const displayBrands = showMore ? brands : visibleBrands;

  const handleAdd = () => {
    if (brandOos || comingSoon) return;
    onAdd(selectedBrand, selectedSize);
  };

  return (
    <div className={`bg-card rounded-card shadow-card overflow-hidden hover:shadow-card-hover transition-all group ${(brandOos || comingSoon) ? "opacity-60" : ""}`}>
      <div className="relative h-36 md:h-44 flex items-center justify-center overflow-hidden bg-muted/30 cursor-pointer" onClick={onViewDetail}>
        {item.priority === "essential" && (
          <span className="absolute top-2.5 left-2.5 bg-coral text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase tracking-wide z-10">Essential</span>
        )}
        {item.quantity > 1 && (
          <span className="absolute top-2.5 right-2.5 bg-forest text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-pill z-10">×{item.quantity}</span>
        )}
        {showSale && (
          <span className="absolute top-2.5 right-2.5 bg-destructive text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">
            Save {Math.round(((selectedBrand!.compareAtPrice! - selectedBrand!.price) / selectedBrand!.compareAtPrice!) * 100)}%
          </span>
        )}
        <ProductImage
          imageUrl={displayImage}
          emoji={item.emoji || "📦"}
          alt={item.name}
          className="w-full h-full group-hover:scale-110 transition-transform duration-300"
          emojiClassName="text-5xl md:text-6xl"
        />
      </div>
      <div className="p-3.5 md:p-4">
        <h3 className="pf text-sm md:text-[15px] font-bold leading-tight mb-1 cursor-pointer hover:text-forest transition-colors" onClick={onViewDetail}>{item.name}</h3>
        {item.selected_color && <p className="text-muted-foreground text-[10px] mb-1">Colour: {item.selected_color}</p>}
        <div className="text-forest bg-forest-light rounded-lg px-2 py-1.5 text-[10px] leading-relaxed italic mb-2 max-h-16 overflow-y-auto scrollbar-hide">💡 {item.why_included}</div>
        {fullProduct && fullProduct.packInfo && <p className="text-muted-foreground text-[10px] mb-1">📦 {fullProduct.packInfo}</p>}

        {/* Pre-add quantity stepper (only shown when managed externally and item isn't already in cart) */}
        {preAddQty != null && onPreAddQtyChange && !isInCart && !brandOos && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Quantity</span>
            <QtyControl
              qty={preAddQty}
              onUpdate={(newQty) => onPreAddQtyChange(Math.max(1, newQty))}
              maxQty={selectedBrand?.stockQuantity ?? undefined}
            />
          </div>
        )}

        {/* Brand selector */}
        {brands.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Brand</div>
            <div className="flex flex-wrap gap-1">
              {displayBrands.map(b => {
                const bOos = !b.inStock;
                return (
                  <button key={b.id} onClick={() => setSelectedBrandId(b.id)}
                    className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border-[1.5px] transition-all font-body ${bOos ? "opacity-50" : ""} ${selectedBrandId === b.id ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                    {b.label} {fmt(b.price)}
                    {b.id === recommendedBrandId && !bOos && <span className="text-coral ml-0.5">★</span>}
                  </button>
                );
              })}
              {hiddenCount > 0 && !showMore && (
                <button onClick={() => setShowMore(true)}
                  className="px-2 py-0.5 rounded-pill text-[10px] font-semibold border-[1.5px] border-border bg-card text-forest font-body hover:border-forest">
                  +{hiddenCount} more
                </button>
              )}
            </div>
          </div>
        )}

        {/* Size selector */}
        {sizes.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Size</div>
            <div className="flex flex-wrap gap-1">
              {sizes.map(s => (
                <button key={s} onClick={() => setSelectedSize(s)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border-[1.5px] transition-all font-body ${selectedSize === s ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLowStock && <p className="text-[#E65100] text-[9px] font-semibold mb-1">🔥 Only {selectedBrand?.stockQuantity} left!</p>}

        <div className="flex items-end justify-between mt-1">
          <div>
            {comingSoon ? (
              <p className="text-muted-foreground text-[11px] italic">Price not available</p>
            ) : (
              <>
                <p className="pf text-lg font-bold text-forest">{fmt(displayPrice * (item.quantity || 1))}</p>
                {showSale && <p className="text-muted-foreground text-[10px] line-through">{fmt(selectedBrand!.compareAtPrice!)}</p>}
                {!showSale && brands.length > 1 && <p className="text-muted-foreground text-[10px]">from {fmt(Math.min(...brands.map(b => b.price)))}</p>}
              </>
            )}
          </div>
          {comingSoon ? (
            <span className="rounded-pill bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 text-[10px] font-semibold font-body">Coming soon</span>
          ) : brandOos ? (
            <span className="rounded-pill bg-border px-3 py-1.5 text-[10px] font-semibold text-muted-foreground font-body">Sold Out</span>
          ) : isInCart && cartItem && onQtyUpdate ? (
            <QtyControl qty={cartItem.qty} onUpdate={(newQty) => onQtyUpdate(cartItem._key, newQty)} maxQty={selectedBrand?.stockQuantity ?? undefined} />
          ) : (
            <button onClick={handleAdd} className="rounded-pill px-3 py-1.5 text-[11px] font-semibold text-primary-foreground font-body interactive" style={{ backgroundColor: "#F4845F" }}>Add to Cart</button>
          )}
        </div>
      </div>
    </div>
  );
}
