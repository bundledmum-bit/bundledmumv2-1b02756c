import { useState } from "react";
import { X } from "lucide-react";
import { fmt } from "@/lib/cart";
import ProductImage from "@/components/ProductImage";

/**
 * Upfront variant collector for "Add bundle to cart".
 *
 * The root cause of the May 2026 NULL-size orders was BundleDetailPage adding
 * every bundle child as its own cart row WITHOUT a `selectedSize` — relying on
 * the CheckoutPage safety net to catch it. This modal closes that gap: when a
 * bundle contains items that ship in multiple sizes (nursing bra, hospital
 * slippers, compression socks, …) or colours, the customer must pick them
 * before the bundle can be added. The CTA stays disabled until every required
 * size/colour is chosen.
 *
 * Variant axes are resolved upstream in BundleDetailPage (one batched
 * product_sizes/product_colors fetch over the bundle's productIds) and passed
 * in as `needs`. Pill styling mirrors EditCartItemModal so the storefront feels
 * consistent.
 */
export interface BundleVariantOption {
  label: string;
  inStock: boolean;
}

export interface BundleVariantNeed {
  /** Index into the bundle's flattened allItems list. */
  index: number;
  productId: string;
  name: string;
  brand: string;
  price: number;
  imageUrl?: string | null;
  emoji?: string;
  sizes: BundleVariantOption[];
  colors: BundleVariantOption[];
}

export type VariantSelection = Record<number, { size?: string; color?: string }>;

function isComplete(needs: BundleVariantNeed[], sel: VariantSelection): boolean {
  return needs.every(n => {
    const picked = sel[n.index] || {};
    if (n.sizes.length > 0 && !picked.size) return false;
    if (n.colors.length > 0 && !picked.color) return false;
    return true;
  });
}

export default function BundleVariantPickerModal({
  bundleName,
  needs,
  onClose,
  onConfirm,
}: {
  bundleName: string;
  needs: BundleVariantNeed[];
  onClose: () => void;
  onConfirm: (selections: VariantSelection) => void;
}) {
  const [selections, setSelections] = useState<VariantSelection>({});

  const pick = (index: number, axis: "size" | "color", value: string) => {
    setSelections(prev => ({ ...prev, [index]: { ...prev[index], [axis]: value } }));
  };

  const complete = isComplete(needs, selections);

  return (
    <div
      className="fixed inset-0 z-[950] flex justify-center items-center max-md:items-end bg-foreground/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-card shadow-2xl w-full md:max-w-[480px] max-h-[88vh] flex flex-col rounded-2xl max-md:rounded-b-none animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="pf text-lg font-bold leading-tight">Pick sizes for your bundle</h3>
            <p className="text-muted-foreground text-xs mt-0.5">
              {bundleName} · {needs.length} item{needs.length === 1 ? "" : "s"} need{needs.length === 1 ? "s" : ""} a choice
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center hover:bg-foreground/20 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — one row per item that needs a variant */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {needs.map(n => {
            const picked = selections[n.index] || {};
            const sizeMissing = n.sizes.length > 0 && !picked.size;
            const colorMissing = n.colors.length > 0 && !picked.color;
            return (
              <div key={n.index} className="flex flex-col gap-3 pb-5 border-b border-border/40 last:border-0 last:pb-0">
                {/* Item header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                    <ProductImage
                      imageUrl={n.imageUrl}
                      emoji={n.emoji}
                      alt={n.name}
                      className="w-full h-full"
                      emojiClassName="text-xl"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-tight truncate">{n.name}</p>
                    <p className="text-muted-foreground text-[11px]">{n.brand}</p>
                    <p className="text-forest font-bold text-[12px] mt-0.5">{fmt(n.price)}</p>
                  </div>
                </div>

                {/* Size pills */}
                {n.sizes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      Choose size <span className="text-coral">*</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {n.sizes.map(s => {
                        const active = picked.size === s.label;
                        const oos = !s.inStock;
                        return (
                          <button
                            key={s.label}
                            onClick={() => { if (!oos) pick(n.index, "size", s.label); }}
                            disabled={oos}
                            title={oos ? "Out of stock" : ""}
                            className={`px-3 h-9 min-h-9 rounded-lg border-2 text-xs font-semibold transition-all ${
                              active
                                ? "border-forest bg-forest text-primary-foreground"
                                : oos
                                  ? "border-border bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed line-through"
                                  : "border-border bg-card text-foreground hover:border-forest/40"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                    {sizeMissing && (
                      <p className="text-[11px] text-coral mt-2">Please choose a size to continue</p>
                    )}
                  </div>
                )}

                {/* Colour pills */}
                {n.colors.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      Choose colour <span className="text-coral">*</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {n.colors.map(c => {
                        const active = picked.color === c.label;
                        const oos = !c.inStock;
                        return (
                          <button
                            key={c.label}
                            onClick={() => { if (!oos) pick(n.index, "color", c.label); }}
                            disabled={oos}
                            title={oos ? "Out of stock" : ""}
                            className={`px-3 h-9 min-h-9 rounded-lg border-2 text-xs font-semibold transition-all ${
                              active
                                ? "border-forest bg-forest text-primary-foreground"
                                : oos
                                  ? "border-border bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed line-through"
                                  : "border-border bg-card text-foreground hover:border-forest/40"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                    {colorMissing && (
                      <p className="text-[11px] text-coral mt-2">Please choose a colour to continue</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer CTA — gated until every required size/colour is chosen */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => complete && onConfirm(selections)}
            disabled={!complete}
            className="w-full rounded-pill bg-forest text-primary-foreground py-3 font-semibold text-sm hover:bg-forest-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add bundle to cart
          </button>
        </div>
      </div>
    </div>
  );
}
