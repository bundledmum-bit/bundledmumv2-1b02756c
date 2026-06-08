import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCart, fmt } from "@/lib/cart";
import { getBrandImage } from "@/lib/brandImage";
import { cn } from "@/lib/utils";
import { cheapestBrand, type ProductWithBrands, type ArticleBrand, type ArticleSize, type ArticleColor } from "@/components/article/ArticleProductCard";

const byOrder = <T extends { display_order?: number | null }>(a: T, b: T) =>
  (a.display_order ?? 0) - (b.display_order ?? 0);

// Brand picker opened from an article product card. Bottom-sheet on
// mobile (max-md:items-end / rounded-t-2xl), centered dialog on desktop
// — matching the codebase's existing customer-facing modal pattern.
// Adds the chosen brand to the cart via the existing useCart().addToCart
// contract (same shape ProductPage.handleAdd uses) — no cart-logic change.

interface Props {
  open: boolean;
  onClose: () => void;
  productData: ProductWithBrands;
  onAdded?: () => void;
  /** 'add' = first add; 'change' = swap the brand of an existing cart line. */
  mode?: "add" | "change";
  /** The cart line being swapped, when mode === 'change' (carries qty + current brand). */
  existingItem?: any;
}

export default function BrandPickerModal({ open, onClose, productData, onAdded, mode = "add", existingItem = null }: Props) {
  const { addToCart, removeFromCart } = useCart();
  const brands = productData?.brands || [];
  const sizes = [...(productData?.product_sizes || [])].sort(byOrder);
  const colors = [...(productData?.product_colors || [])].sort(byOrder);
  const requiresSize = sizes.length > 0;
  const requiresColor = colors.length > 0;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const isChange = mode === "change" && !!existingItem;
  const currentBrandId = existingItem?.selectedBrand?.id ?? null;

  // Pre-select on open. Brand: current in 'change' mode, else cheapest
  // in-stock. Size/colour: the existing line's values in 'change' mode,
  // otherwise NULL (no default — the customer must choose).
  useEffect(() => {
    if (!open) return;
    setSelectedId(isChange ? currentBrandId : (cheapestBrand(brands)?.id ?? null));
    setSelectedSize(isChange ? (existingItem?.selectedSize ?? null) : null);
    setSelectedColor(isChange ? (existingItem?.selectedColor ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes (parity with the other lightboxes/sheets).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selected = brands.find((b) => b.id === selectedId) || null;
  const variantsSatisfied = (!requiresSize || !!selectedSize) && (!requiresColor || !!selectedColor);
  // 'change' is a no-op only when brand AND size AND colour are unchanged.
  const isSameAsCurrent = isChange
    && selected?.id === currentBrandId
    && (selectedSize ?? null) === (existingItem?.selectedSize ?? null)
    && (selectedColor ?? null) === (existingItem?.selectedColor ?? null);
  const canAdd = !!selected && selected.in_stock !== false && variantsSatisfied && !isSameAsCurrent;
  const ctaLabel = isChange
    ? (isSameAsCurrent ? "Already selected" : `Switch to ${selected?.brand_name || "brand"}`)
    : "Add to cart";

  // Build the addToCart payload for a brand (matches ProductPage's shape).
  // selectedSize/selectedColor feed the cart's variant-aware _key so S/M
  // of the same brand are distinct cart rows.
  const buildItem = (brand: ArticleBrand) => {
    const label = brand.brand_name || "Brand";
    return {
      id: productData.id,
      name: `${productData.name} (${label})`,
      price: brand.price ?? 0,
      img: getBrandImage(brand) || undefined,
      selectedSize: selectedSize ?? null,
      selectedColor: selectedColor ?? null,
      selectedBrand: {
        id: brand.id,
        label,
        brand_name: label,
        price: brand.price ?? 0,
        sku: brand.sku ?? null,
        image_url: brand.image_url ?? null,
        imageUrl: getBrandImage(brand),
        inStock: brand.in_stock !== false,
      },
    };
  };

  const handleAdd = () => {
    if (!canAdd || !selected) return;
    const label = selected.brand_name || "Brand";

    if (isChange) {
      // Atomic swap: remove the old line, re-add the new variant preserving qty.
      const preservedQty = Math.max(1, Number(existingItem.qty) || 1);
      removeFromCart(existingItem._key);
      for (let i = 0; i < preservedQty; i++) addToCart(buildItem(selected));
      toast.success(`Switched to ${label}${selectedSize ? ` · ${selectedSize}` : ""}`);
      onAdded?.();
      onClose();
      return;
    }

    addToCart(buildItem(selected));
    toast.success(`${productData.name} added to cart`, {
      action: { label: "View Cart →", onClick: () => { window.location.href = "/cart"; } },
    });
    onAdded?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-foreground/50 flex items-center justify-center max-md:items-end max-md:p-0 p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Choose brand for ${productData.name}`}
    >
      <div
        className="bg-card w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[85vh] max-md:max-w-full max-md:rounded-b-none max-md:rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground leading-snug min-w-0 break-words pt-1.5">
            {isChange ? "Change brand" : "Choose brand"}: {productData.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Brand list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[70vh]">
          {brands.map((b: ArticleBrand) => {
            const oos = b.in_stock === false;
            const isSel = b.id === selectedId;
            const bImg = getBrandImage(b);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => !oos && setSelectedId(b.id)}
                disabled={oos}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                  isSel ? "border-forest bg-forest-light" : "border-transparent hover:bg-muted/50"
                } ${oos ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-warm-cream flex-shrink-0">
                  {bImg && <img src={bImg} alt={b.brand_name || ""} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{b.brand_name || "Brand"}</p>
                  {oos && (
                    <span className="inline-block mt-0.5 text-[10px] font-semibold bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
                      Out of stock
                    </span>
                  )}
                </div>
                <p className="text-coral font-bold text-base flex-shrink-0">{fmt(b.price ?? 0)}</p>
              </button>
            );
          })}
        </div>

        {/* Size + colour pickers (only when the product has them). No
            default selection — the customer must choose before adding. */}
        {(requiresSize || requiresColor) && (
          <div className="px-4 pb-3 space-y-4">
            {requiresSize && (
              <div>
                <div className="text-sm font-semibold text-foreground mb-2">
                  Choose size <span className="text-coral">*</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s: ArticleSize) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => s.in_stock !== false && setSelectedSize(s.size_label)}
                      disabled={s.in_stock === false}
                      className={cn(
                        "px-3 h-9 min-h-9 rounded-lg border-2 text-sm font-medium transition-colors",
                        selectedSize === s.size_label
                          ? "border-forest bg-forest-light text-forest"
                          : "border-coral-blush/40 bg-card text-foreground",
                        s.in_stock === false && "opacity-50 cursor-not-allowed line-through",
                      )}
                    >
                      {s.size_label}
                    </button>
                  ))}
                </div>
                {!selectedSize && (
                  <div className="text-xs text-muted-foreground mt-1.5">Please choose a size to continue</div>
                )}
              </div>
            )}

            {requiresColor && (
              <div>
                <div className="text-sm font-semibold text-foreground mb-2">
                  Choose colour <span className="text-coral">*</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c: ArticleColor) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => c.in_stock !== false && setSelectedColor(c.color_name)}
                      disabled={c.in_stock === false}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 h-9 min-h-9 rounded-lg border-2 text-sm font-medium transition-colors",
                        selectedColor === c.color_name
                          ? "border-forest bg-forest-light text-forest"
                          : "border-coral-blush/40 bg-card text-foreground",
                        c.in_stock === false && "opacity-50 cursor-not-allowed line-through",
                      )}
                    >
                      <span className="inline-block w-3.5 h-3.5 rounded-full border border-border" style={{ backgroundColor: c.color_hex || "#e5e5e5" }} />
                      {c.color_name}
                    </button>
                  ))}
                </div>
                {!selectedColor && (
                  <div className="text-xs text-muted-foreground mt-1.5">Please choose a colour to continue</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-border">
          {selected && (
            <p className="text-xs text-muted-foreground mb-2 truncate">
              Selected: <span className="font-semibold text-foreground">{selected.brand_name}</span> ({fmt(selected.price ?? 0)})
            </p>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-coral text-primary-foreground font-semibold min-h-12 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-coral-dark transition-colors"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
