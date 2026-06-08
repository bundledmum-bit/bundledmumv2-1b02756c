import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCart, fmt } from "@/lib/cart";
import { getBrandImage } from "@/lib/brandImage";
import { cheapestBrand, type ProductWithBrands, type ArticleBrand } from "@/components/article/ArticleProductCard";

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
}

export default function BrandPickerModal({ open, onClose, productData, onAdded }: Props) {
  const { addToCart } = useCart();
  const brands = productData?.brands || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pre-select the cheapest in-stock brand each time the sheet opens.
  useEffect(() => {
    if (open) setSelectedId(cheapestBrand(brands)?.id ?? null);
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
  const canAdd = !!selected && selected.in_stock !== false;

  const handleAdd = () => {
    if (!selected || selected.in_stock === false) return;
    const label = selected.brand_name || "Brand";
    addToCart({
      id: productData.id,
      name: `${productData.name} (${label})`,
      price: selected.price ?? 0,
      img: getBrandImage(selected) || undefined,
      selectedBrand: {
        id: selected.id,
        label,
        brand_name: label,
        price: selected.price ?? 0,
        sku: selected.sku ?? null,
        image_url: selected.image_url ?? null,
        imageUrl: getBrandImage(selected),
        inStock: selected.in_stock !== false,
      },
    });
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
            Choose brand: {productData.name}
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
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}
