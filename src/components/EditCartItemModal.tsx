import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, AlertTriangle } from "lucide-react";
import { useCart, fmt, cartItemImage, type CartItem } from "@/lib/cart";
import { getBrandImage } from "@/lib/brandImage";

/**
 * Inline modal for editing the variant (brand / size / color / qty) of an
 * existing cart line. Mutates the row in place via useCart().updateVariant,
 * which merges with any other row whose variant tuple matches the new
 * selection so we never end up with duplicate lines.
 *
 * Data fetched on open:
 *   - brands_public for the current product (variant-priced rows)
 *   - product_sizes (only consulted when length > 0)
 *   - product_colors (rendered when length > 0)
 */
interface BrandRow {
  id: string;
  brand_name: string;
  price: number;
  in_stock: boolean;
  stock_quantity: number | null;
  image_url: string | null;
  stored_image_url?: string | null;
}

interface SizeRow {
  size_label: string;
  size_code: string | null;
  in_stock: boolean;
}

interface ColorRow {
  color_label: string;
  color_code: string | null;
  in_stock: boolean;
}

export default function EditCartItemModal({
  item,
  onClose,
}: {
  item: CartItem;
  onClose: () => void;
}) {
  const { updateVariant } = useCart();
  const productId = String(item.id);

  // ── Load variant axes for this product ─────────────────────────
  const { data: brands = [] } = useQuery({
    queryKey: ["edit-cart-brands", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brands_public")
        .select("id, brand_name, price, in_stock, stock_quantity, image_url, stored_image_url")
        .eq("product_id", productId)
        .order("price");
      if (error) throw error;
      return (data || []) as BrandRow[];
    },
  });

  const { data: sizes = [] } = useQuery({
    queryKey: ["edit-cart-sizes", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_sizes")
        .select("size_label, size_code, in_stock")
        .eq("product_id", productId)
        .order("display_order");
      if (error) throw error;
      return (data || []) as SizeRow[];
    },
  });

  const { data: colors = [] } = useQuery({
    queryKey: ["edit-cart-colors", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_colors")
        .select("color_label, color_code, in_stock")
        .eq("product_id", productId)
        .order("display_order");
      if (error) throw error;
      return (data || []) as ColorRow[];
    },
  });

  // ── Local form state — seeded from the current line ────────────
  const initialBrandId = item.selectedBrand?.id || null;
  const [brandId, setBrandId] = useState<string | null>(initialBrandId);
  const [size, setSize] = useState<string | null>(item.selectedSize || null);
  const [color, setColor] = useState<string | null>(item.selectedColor || null);
  const [qty, setQty] = useState<number>(item.qty || 1);

  // If the brand row resolves after mount and we have no current brandId,
  // seed from the first in-stock brand so the modal isn't blank.
  useEffect(() => {
    if (!brandId && brands.length > 0) setBrandId(brands[0].id);
  }, [brands, brandId]);

  const selectedBrand = useMemo(
    () => brands.find(b => b.id === brandId) || null,
    [brands, brandId],
  );

  const requiresSize = sizes.length > 0;
  const sizeMissing = requiresSize && !size;
  const brandOos = !!selectedBrand && (!selectedBrand.in_stock || (selectedBrand.price ?? 0) <= 0);
  const cantSave = !selectedBrand || brandOos || sizeMissing;

  const newPrice = selectedBrand?.price ?? item.price ?? 0;
  const priceDelta = newPrice - (item.price || 0);
  const showPriceWarning = !cantSave && priceDelta !== 0;

  const inStockBrandNames = brands
    .filter(b => b.in_stock && (b.price ?? 0) > 0)
    .map(b => b.brand_name);

  const handleSave = () => {
    if (cantSave || !selectedBrand) return;
    const newName = `${(item.name || "").replace(/\s*\([^)]*\)\s*$/, "")} (${selectedBrand.brand_name})`;
    const newKey = updateVariant(item._key, {
      selectedBrand: {
        id: selectedBrand.id,
        label: selectedBrand.brand_name,
        price: selectedBrand.price,
        imageUrl: getBrandImage(selectedBrand),
        inStock: selectedBrand.in_stock,
        stockQuantity: selectedBrand.stock_quantity,
      },
      selectedSize: requiresSize ? size : null,
      selectedColor: colors.length > 0 ? color : null,
      qty,
      price: selectedBrand.price,
      name: newName,
    });
    if (!newKey) {
      toast.error("Could not update cart line");
      return;
    }
    toast.success("Cart updated");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-foreground/60 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold text-sm">Edit · {item.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Current variant strip */}
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border">
            <img
              src={cartItemImage(item)}
              alt={item.name}
              className="w-12 h-12 rounded-md object-cover border border-border bg-card"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
            <div className="text-xs flex-1 min-w-0">
              <p className="font-semibold truncate">Currently</p>
              <p className="text-text-med">
                {item.selectedBrand?.label || "—"}
                {item.selectedSize ? ` · Size ${item.selectedSize}` : ""}
                {item.selectedColor ? ` · ${item.selectedColor}` : ""}
              </p>
              <p className="text-text-light mt-0.5">
                {fmt(item.price)} × {item.qty} = <span className="font-semibold text-foreground">{fmt(item.price * item.qty)}</span>
              </p>
            </div>
          </div>

          {/* Brand */}
          {brands.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-2">Brand</label>
              <div className="flex flex-wrap gap-2">
                {brands.map(b => {
                  const oos = !b.in_stock || (b.price ?? 0) <= 0;
                  const active = brandId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => { if (!oos) setBrandId(b.id); }}
                      disabled={oos}
                      title={oos ? "Out of stock" : ""}
                      className={`min-h-[40px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all ${
                        active
                          ? "border-forest bg-forest text-primary-foreground"
                          : oos
                            ? "border-border bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed line-through"
                            : "border-border bg-card text-foreground hover:border-forest/40"
                      }`}
                    >
                      {b.brand_name}
                      <span className={`ml-1.5 ${active ? "opacity-90" : "text-text-light"}`}>{fmt(b.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size (only if rows exist) */}
          {requiresSize && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-2">
                Size {sizeMissing && <span className="text-coral normal-case tracking-normal">— required</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {sizes.map(s => {
                  const oos = s.in_stock === false;
                  const active = size === s.size_label;
                  return (
                    <button
                      key={s.size_label}
                      onClick={() => { if (!oos) setSize(s.size_label); }}
                      disabled={oos}
                      title={oos ? "Out of stock" : ""}
                      className={`min-h-[40px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] ${
                        active
                          ? "border-forest bg-forest text-primary-foreground"
                          : oos
                            ? "border-border bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed line-through"
                            : "border-border bg-card text-foreground hover:border-forest/40"
                      }`}
                    >
                      {s.size_label}
                    </button>
                  );
                })}
              </div>
              {sizeMissing && (
                <p className="text-[11px] text-coral mt-2">Please select a size.</p>
              )}
            </div>
          )}

          {/* Color (only if rows exist) */}
          {colors.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-2">Colour</label>
              <div className="flex flex-wrap gap-2">
                {colors.map(c => {
                  const oos = c.in_stock === false;
                  const active = color === c.color_label;
                  return (
                    <button
                      key={c.color_label}
                      onClick={() => { if (!oos) setColor(c.color_label); }}
                      disabled={oos}
                      className={`min-h-[40px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] ${
                        active
                          ? "border-forest bg-forest text-primary-foreground"
                          : oos
                            ? "border-border bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed line-through"
                            : "border-border bg-card text-foreground hover:border-forest/40"
                      }`}
                    >
                      {c.color_label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-2">Quantity</label>
            <input
              type="number"
              min={1}
              max={selectedBrand?.stock_quantity ?? undefined}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-32 border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
            {selectedBrand?.stock_quantity != null && (
              <p className="text-[11px] text-text-light mt-1">{selectedBrand.stock_quantity} in stock</p>
            )}
          </div>

          {/* Price change warning */}
          {showPriceWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-[1px] flex-shrink-0" />
              <p>
                Price will {priceDelta > 0 ? "increase" : "decrease"} from <strong>{fmt(item.price)}</strong> to <strong>{fmt(newPrice)}</strong>
                <span className="opacity-80"> (difference: {fmt(Math.abs(priceDelta))})</span>
              </p>
            </div>
          )}

          {/* OOS helper */}
          {brandOos && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <AlertTriangle className="w-4 h-4 mt-[1px] flex-shrink-0" />
              <div>
                <p className="font-semibold">This variant is out of stock.</p>
                {inStockBrandNames.length > 0 && (
                  <p className="opacity-80">Available brands: {inStockBrandNames.join(", ")}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={cantSave}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
