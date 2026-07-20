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
    <div className={`flex gap-3 items-start bg-card rounded-2xl border p-2.5 shadow-card transition-all ${(brandOos || comingSoon) ? "opacity-60" : ""} ${isInCart ? "border-forest/50 bg-forest-light/25" : "border-border"}`}>
      {/* Thumbnail */}
      <div className="relative w-[78px] h-[78px] md:w-[88px] md:h-[88px] flex-shrink-0 rounded-xl overflow-hidden bg-muted/30 cursor-pointer" onClick={onViewDetail}>
        {item.quantity > 1 && (
          <span className="absolute top-1 right-1 z-10 bg-forest text-primary-foreground text-[10px] font-bold px-1.5 rounded-pill">×{item.quantity}</span>
        )}
        {showSale && (
          <span className="absolute top-1 left-1 z-10 bg-destructive text-primary-foreground text-[9px] font-bold px-1.5 rounded-pill">
            -{Math.round(((selectedBrand!.compareAtPrice! - selectedBrand!.price) / selectedBrand!.compareAtPrice!) * 100)}%
          </span>
        )}
        <ProductImage
          imageUrl={displayImage}
          emoji={item.emoji || "📦"}
          alt={item.name}
          className="w-full h-full"
          emojiClassName="text-3xl md:text-4xl"
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <h3 className="pf text-[14px] font-bold leading-tight cursor-pointer hover:text-forest transition-colors line-clamp-2" onClick={onViewDetail}>{item.name}</h3>
        {item.priority === "essential" && (
          <span className="inline-block mt-0.5 text-coral text-[9.5px] font-bold uppercase tracking-wider">Essential</span>
        )}
        {item.selected_color && <span className="text-muted-foreground text-[10px] ml-2">Colour: {item.selected_color}</span>}
        <p className="text-muted-foreground text-[11.5px] leading-snug mt-1 line-clamp-2">💡 {item.why_included}</p>

        {/* Brand switcher (preserved) */}
        {brands.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {displayBrands.map(b => {
              const bOos = !b.inStock;
              return (
                <button key={b.id} onClick={() => setSelectedBrandId(b.id)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border transition-all font-body ${bOos ? "opacity-50" : ""} ${selectedBrandId === b.id ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  {b.label} {fmt(b.price)}
                  {b.id === recommendedBrandId && !bOos && <span className="text-coral ml-0.5">★</span>}
                </button>
              );
            })}
            {hiddenCount > 0 && !showMore && (
              <button onClick={() => setShowMore(true)}
                className="px-2 py-0.5 rounded-pill text-[10px] font-semibold border border-border bg-card text-forest font-body hover:border-forest">
                +{hiddenCount} more
              </button>
            )}
          </div>
        )}

        {/* Size switcher (preserved) */}
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sizes.map(s => (
              <button key={s} onClick={() => setSelectedSize(s)}
                className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border transition-all font-body ${selectedSize === s ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {isLowStock && <p className="text-[#E65100] text-[9.5px] font-semibold mt-1">🔥 Only {selectedBrand?.stockQuantity} left</p>}

        {/* Price */}
        <div className="mt-2">
          {comingSoon ? (
            <span className="text-muted-foreground text-[11px] italic">Price not available</span>
          ) : (
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono-price text-forest font-bold text-[15px]">{fmt(displayPrice * (item.quantity || 1))}</span>
              {showSale && <span className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(selectedBrand!.compareAtPrice!)}</span>}
              {!showSale && brands.length > 1 && <span className="text-muted-foreground text-[10px]">from {fmt(Math.min(...brands.map(b => b.price)))}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Controls — stacked (stepper over Add), matches the row layout */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0 self-center">
        {comingSoon ? (
          <span className="rounded-pill bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 text-[10px] font-semibold font-body">Coming soon</span>
        ) : brandOos ? (
          <span className="rounded-pill bg-border px-3 py-1.5 text-[10px] font-semibold text-muted-foreground font-body">Sold Out</span>
        ) : isInCart && cartItem && onQtyUpdate ? (
          <QtyControl qty={cartItem.qty} onUpdate={(newQty) => onQtyUpdate(cartItem._key, newQty)} maxQty={selectedBrand?.stockQuantity ?? undefined} size="sm" />
        ) : (
          <>
            {preAddQty != null && onPreAddQtyChange && (
              <QtyControl
                qty={preAddQty}
                onUpdate={(newQty) => onPreAddQtyChange(Math.max(1, newQty))}
                maxQty={selectedBrand?.stockQuantity ?? undefined}
                size="sm"
              />
            )}
            <button onClick={handleAdd} className="rounded-pill px-4 py-1.5 text-[12px] font-bold text-primary-foreground bg-coral hover:bg-coral-dark transition-colors whitespace-nowrap">+ Add</button>
          </>
        )}
      </div>
    </div>
  );
}
