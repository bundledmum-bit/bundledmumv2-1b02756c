import { useState } from "react";
import { fmt } from "@/lib/cart";
import type { Product } from "@/lib/supabaseAdapters";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";
import { ChevronDown } from "lucide-react";
import type { RecommendedProduct } from "./types";

// Compact result row shared by HomeQuiz and GiftResultsPage. Brand and size are
// chosen through dropdowns (a single-brand product shows a static brand chip
// instead, since there is nothing to change). All add/remove/qty behaviour is
// unchanged; preAddQty + onPreAddQtyChange render a quantity stepper before Add.
export default function ResultProductCard({ item, onAdd, onRemove, isInCart, cartItem, onQtyUpdate, fullProduct, onViewDetail, preAddQty, onPreAddQtyChange, availableSizes, sizeRequired, selectedSize: selectedSizeProp, onSizeChange, colorOptions = [], selectedColor: selectedColorProp, onColorChange }: {
  item: RecommendedProduct;
  onAdd: (overrideBrand?: any, overrideSize?: string, overrideColor?: string) => void;
  onRemove: () => void;
  isInCart: boolean;
  cartItem?: { qty: number; _key: string } | null;
  onQtyUpdate?: (key: string, qty: number) => void;
  fullProduct?: Product | null;
  onViewDetail?: () => void;
  preAddQty?: number;
  onPreAddQtyChange?: (qty: number) => void;
  // ── Quiz size mode (opt-in) ────────────────────────────────────────
  // When `availableSizes` is provided (run_quiz_recommendation surfaces),
  // the card drives its size picker from the RPC's in-stock size list and
  // becomes a controlled input: the parent owns the selection via
  // `selectedSize` / `onSizeChange` so it can gate Add-all on required
  // sizes. Left undefined elsewhere (gift page), the card keeps its legacy
  // fullProduct.sizes behaviour untouched.
  availableSizes?: Array<{ label: string; code: string | null; in_stock: boolean; is_default: boolean }>;
  sizeRequired?: boolean;
  selectedSize?: string;
  onSizeChange?: (size: string) => void;
  // ── Colour (quiz only) ─────────────────────────────────────────────
  // The colours SHE ticked on the gender step, with their hexes. The engine's
  // item.selected_color is only a signal that this product HAS a colour axis
  // (null = unisex item, no picker at all); the value shown is always hers.
  colorOptions?: Array<{ name: string; hex: string }>;
  selectedColor?: string;
  onColorChange?: (color: string) => void;
}) {
  const brands = fullProduct?.brands || [];
  const legacySizes = fullProduct?.sizes || [];

  // Quiz size mode is active whenever the caller passes an availableSizes
  // array (even an empty one — that carries the "all sizes OOS" signal).
  const quizSizeMode = availableSizes !== undefined;
  const inStockSizes = (availableSizes || []).filter(s => s.in_stock !== false);
  // A size must be chosen when the product has a size axis. In quiz mode we
  // trust the RPC list first (any in-stock option means "needs a size"),
  // falling back to the product_sizes-backed sizeRequired flag so an
  // all-OOS product is still recognised as size-bearing.
  const needsSize = quizSizeMode ? (inStockSizes.length > 0 || !!sizeRequired) : legacySizes.length > 0;
  // Size-bearing product with zero in-stock options → cannot be added.
  const allSizesOos = quizSizeMode && needsSize && inStockSizes.length === 0;

  // Default to the recommended brand, allow switching
  const recommendedBrandId = item.brand?.id;
  const [selectedBrandId, setSelectedBrandId] = useState(recommendedBrandId || "");
  // Legacy mode keeps its own auto-selected size; quiz mode is controlled by
  // the parent and starts empty so the shopper must choose explicitly.
  const [legacySize, setLegacySize] = useState(legacySizes?.[0] || "");
  const selectedSize = quizSizeMode ? (selectedSizeProp || "") : legacySize;
  const setSelectedSize = (s: string) => { if (quizSizeMode) onSizeChange?.(s); else setLegacySize(s); };
  // In quiz mode, block Add until a required size is picked.
  const sizeUnmet = quizSizeMode && needsSize && !allSizesOos && !selectedSize;

  const selectedBrand = brands.find(b => b.id === selectedBrandId) || (brands.length > 0 ? brands[0] : null);
  const displayImage = selectedBrand?.imageUrl || item.brand?.image_url || item.image_url;
  const displayPrice = selectedBrand?.price ?? item.brand?.price ?? 0;
  // "Coming soon" — no purchasable brand variant exists for this SKU.
  // Distinct from out-of-stock (which has a brand but inStock=false).
  const comingSoon = !selectedBrand && !item.brand;
  const brandOos = !comingSoon && selectedBrand ? !selectedBrand.inStock : false;
  const isLowStock = selectedBrand?.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;
  const showSale = selectedBrand?.compareAtPrice && selectedBrand.compareAtPrice > (selectedBrand?.price || 0);

  const singleBrand = brands.length === 1 ? brands[0] : null;
  const showBrandSelect = brands.length > 1;
  // Quiz mode: show the picker whenever a size is required and at least one
  // in-stock option exists (even a single one — the shopper must confirm it).
  // Legacy mode keeps the "only when there's a real choice" rule.
  const showSizeSelect = quizSizeMode ? (needsSize && !allSizesOos) : legacySizes.length > 1;
  const sizeOptions = quizSizeMode ? inStockSizes.map(s => s.label) : legacySizes;

  // selected_color null => unisex item (wipes, nappy cream). No picker, and
  // nothing invented. Otherwise the value comes from HER ticked list, never
  // from the engine's first-of-palette guess.
  const hasColorAxis = !!item.selected_color && colorOptions.length > 0;
  const activeColor = hasColorAxis ? (selectedColorProp || colorOptions[0]?.name || "") : "";

  const handleAdd = () => {
    if (brandOos || comingSoon || allSizesOos || sizeUnmet) return;
    onAdd(selectedBrand, selectedSize, activeColor || undefined);
  };

  return (
    <div className={`bg-card rounded-2xl border p-2.5 shadow-card transition-all ${(brandOos || comingSoon) ? "opacity-60" : ""} ${isInCart ? "border-forest/50 bg-forest-light/25" : "border-border"}`}>
      <div className="flex gap-3 items-start">
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
          {/* No priority badge: 'essential' / 'recommended' / 'nice-to-have'
              are internal engine values. priority still drives the section
              grouping on the results page, it just isn't shown per card. */}
          <h3 className="pf text-[14px] font-bold leading-tight cursor-pointer hover:text-forest transition-colors line-clamp-2" onClick={onViewDetail}>{item.name}</h3>

          {/* Single-brand products just show the brand (nothing to choose) */}
          {singleBrand && (
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-pill text-[10px] font-semibold border border-forest/40 bg-forest-light text-forest">
              {singleBrand.label} {fmt(singleBrand.price)}{singleBrand.id === recommendedBrandId ? " ★" : ""}
            </span>
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

        {/* Controls — stepper over Add */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0 self-center">
          {comingSoon ? (
            <span className="rounded-pill bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 text-[10px] font-semibold font-body">Coming soon</span>
          ) : brandOos ? (
            <span className="rounded-pill bg-border px-3 py-1.5 text-[10px] font-semibold text-muted-foreground font-body">Sold Out</span>
          ) : allSizesOos ? (
            <span className="rounded-pill bg-border px-3 py-1.5 text-[10px] font-semibold text-muted-foreground font-body">Out of stock</span>
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
              <button
                onClick={handleAdd}
                disabled={sizeUnmet}
                aria-disabled={sizeUnmet}
                title={sizeUnmet ? "Select a size" : undefined}
                // min-h-44: this is the card's primary action, so it gets a
                // full-size touch target rather than the 30px pill it was.
                className={`rounded-pill px-4 min-h-[44px] text-[12px] font-bold text-primary-foreground transition-colors whitespace-nowrap ${sizeUnmet ? "bg-coral/40 cursor-not-allowed" : "bg-coral hover:bg-coral-dark"}`}
              >
                {sizeUnmet ? "Select a size" : "+ Add"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Why we included this — the engine's own reason for the pick, shown
          in full. Deliberately NOT clamped or truncated: the copy is written
          to fit, and a card that grows taller is the correct outcome (grid
          rows size to the tallest card, so nothing is clipped). Renders
          nothing at all when the engine sent no reason. */}
      {item.why_included?.trim() && (
        <div className="mt-2.5 pt-2.5 border-t border-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Why we included this</p>
          <p className="text-[12.5px] leading-relaxed text-foreground/80 mt-1">{item.why_included.trim()}</p>
        </div>
      )}

      {/* Brand / size dropdowns — shown only when there's a real choice.
          Native <select> elements (not a popover) so they always render and
          use the device-native picker — reliable on mobile, no portal/paint
          issues. */}
      {hasColorAxis && (
        <div className="mt-2.5 pt-2.5 border-t border-border/60">
          <p className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Colour</p>
          <div className="flex flex-wrap gap-1.5">
            {colorOptions.map((c) => {
              const on = activeColor === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onColorChange?.(c.name)}
                  aria-pressed={on}
                  title={c.name}
                  className={`inline-flex items-center gap-1.5 rounded-pill border-[1.5px] pl-1 pr-2.5 min-h-[36px] text-[11px] font-semibold transition-colors ${
                    on ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-text-med hover:border-forest/50"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden="true"
                  />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(showBrandSelect || showSizeSelect) && (
        <div className="flex flex-col sm:flex-row gap-2 mt-2.5 pt-2.5 border-t border-border/60">
          {showBrandSelect && (
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Brand</label>
              <div className="relative">
                <select
                  value={selectedBrandId}
                  onChange={(e) => setSelectedBrandId(e.target.value)}
                  aria-label="Choose brand"
                  className="w-full h-11 rounded-lg border border-border bg-card text-[16px] sm:text-[12px] font-semibold pl-3 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-forest/40"
                >
                  {!selectedBrandId && <option value="" disabled>Choose brand</option>}
                  {brands.map(b => (
                    <option key={b.id} value={b.id} disabled={!b.inStock}>
                      {b.label} · {fmt(b.price)}{b.id === recommendedBrandId ? " ★" : ""}{!b.inStock ? " (Out of stock)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          )}
          {showSizeSelect && (
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Size</label>
              <div className="relative">
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  aria-label="Choose size"
                  className={`w-full h-11 rounded-lg border bg-card text-[16px] sm:text-[12px] font-semibold pl-3 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-forest/40 ${sizeUnmet ? "border-coral" : "border-border"}`}
                >
                  <option value="" disabled>Choose size</option>
                  {sizeOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              {sizeUnmet && <p className="text-coral text-[10px] font-semibold mt-1">Select a size to add</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
