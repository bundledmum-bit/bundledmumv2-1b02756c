import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { computeAutoFees, type AutoFeesResult } from "@/lib/computeAutoFees";
import { trackEvent } from "@/lib/analytics";
import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { trackEcommerce } from "@/lib/ga";

export interface CartItem {
  id: string | number;
  _key: string;
  name: string;
  price: number;
  qty: number;
  img?: string;
  baseImg?: string;
  brands?: any[];
  selectedBrand?: any;
  selectedSize?: string;
  selectedColor?: string;
  bundleName?: string;
  // ── Bundle support ────────────────────────────────────────────────
  // When type==='bundle', the row represents a customised gift box /
  // recovery kit / maternity bundle. The bundle's child items are
  // captured here for display + checkout expansion. The row's `price`
  // is the customer's computed bundle price; qty is always 1.
  type?: "bundle";
  bundleId?: string;
  bundleLabel?: string;
  bundleSku?: string;
  bundlePrice?: number;
  bundleItems?: Array<{
    productId: string;
    productName: string;
    brandId: string | null;
    brandName: string | null;
    sku?: string | null;
    price: number;
    quantity: number;
    lineTotal: number;
    isDefault?: boolean;
    color?: string | null;
    size?: string | null;
  }>;
  removedDefaultCount?: number;
}

/**
 * Compose the stable cart-line key for a (product, brand, size, color, variant)
 * tuple. Each unique combination is its own cart row so a customer can keep
 * Mamia + Pampers + Huggies of the same product as separate line items.
 * Exported because ProductPage / ProductDetailDrawer need to look up the
 * currently-selected variant without duplicating the key formula.
 */
export function cartItemKey(
  productId: string | number,
  brandId?: string | null,
  size?: string | null,
  color?: string | null,
  variant?: string | null,
): string {
  return [
    String(productId),
    brandId || "no-brand",
    size || "",
    color || "",
    variant || "",
  ].join("|");
}

interface VariantSelector {
  brandId?: string | null;
  size?: string | null;
  color?: string | null;
  variant?: string | null;
}

/**
 * Best-image URL for a cart row. Priority:
 *   1. The currently-selected brand's imageUrl (variant-specific shot)
 *   2. The product-level imageUrl spread onto the cart item at add time
 *   3. item.img when it's already a URL (legacy cart rows)
 *   4. The /placeholder.svg static asset
 */
export function cartItemImage(item: any): string {
  const brandImg = item?.selectedBrand?.imageUrl || item?.selectedBrand?.image_url;
  if (typeof brandImg === "string" && /^https?:\/\//.test(brandImg)) return brandImg;
  const productImg = item?.imageUrl || item?.image_url;
  if (typeof productImg === "string" && /^https?:\/\//.test(productImg)) return productImg;
  if (typeof item?.img === "string" && /^https?:\/\//.test(item.img)) return item.img;
  return "/placeholder.svg";
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: any) => void;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  clearCart: () => void;
  updateQty: (key: string, newQty: number) => void;
  removeFromCart: (key: string) => void;
  /**
   * Look up a cart row. When `selector` is omitted, falls back to the legacy
   * "any line item of this product" match so consumer sites that don't track
   * variants (quiz result cards, etc.) keep working.
   */
  getCartItem: (productId: string | number, selector?: VariantSelector) => CartItem | undefined;
  /**
   * Mutate an existing cart row to a different (brand, size, color) variant
   * and/or quantity. If the new variant key already matches another row in
   * the cart, the two rows are merged (quantities summed) and the original
   * row is removed. Returns the resulting cart-item key.
   */
  updateVariant: (
    oldKey: string,
    next: {
      selectedBrand?: any;
      selectedSize?: string | null;
      selectedColor?: string | null;
      selectedVariant?: string | null;
      qty?: number;
      price?: number;
      name?: string;
    },
  ) => string | null;
  totalItems: number;
  subtotal: number;
  // Auto-applied fee rules (gift wrap + service & packaging), computed
  // server-side via the compute_auto_fees RPC. Null until first resolved.
  autoFees: AutoFeesResult | null;
  justAdded: boolean;
  savedItems: CartItem[];
  saveForLater: (key: string) => void;
  moveToCart: (key: string) => void;
  removeSaved: (key: string) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("bm-cart");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [savedItems, setSavedItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("bm-saved");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => { localStorage.setItem("bm-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem("bm-saved", JSON.stringify(savedItems)); }, [savedItems]);

  // Cross-tab cart sync: when another tab mutates `bm-cart` (typically a
  // clearCart() after a successful order), mirror the change into this
  // tab's React state so the cart panel + checkout snapshot stay
  // truthful. Without this, a customer with two checkout tabs open could
  // see "items in summary" while localStorage is already empty, and the
  // place-order request would silently send `items: []`.
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== "bm-cart") return;
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : [];
        setCart(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCart([]);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const addToCart = useCallback((product: any) => {
    setCart(prev => {
      // Bundles never merge — each customisation may differ, and merging
      // would silently overwrite the customer's previous picks. Stamp a
      // unique _key so every Add-to-Cart click adds a fresh bundle row.
      if (product?.type === "bundle") {
        const key = `bundle-${product.bundleId || product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return [...prev, { ...product, _key: key, qty: 1 }];
      }
      // Variant-aware merge key — same product with a different brand,
      // size, color, or variant axis is a NEW cart row, not a qty bump.
      const key = cartItemKey(
        product.id,
        product.selectedBrand?.id,
        product.selectedSize,
        product.selectedColor,
        product.selectedVariant,
      );
      const existing = prev.find(i => i._key === key);
      if (existing) return prev.map(i => i._key === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, _key: key, qty: 1 }];
    });
    trackEvent("cart_updated", { action: "add", product_id: product.id, product_name: product.name });
    // GA4 add_to_cart — one event per click, quantity is always 1 (qty
    // increments treat each click as a discrete add per the spec).
    try {
      const brand = product.selectedBrand;
      const unitPrice = Number(brand?.price ?? product.price ?? 0);
      trackEcommerce("add_to_cart", {
        currency: "NGN",
        value: unitPrice,
        items: [{
          item_id: String(product.id),
          item_name: product.name,
          item_brand: brand?.label ?? "",
          item_variant: brand?.sku ?? "",
          item_category: product.category ?? "",
          item_category2: product.subcategory ?? "",
          price: unitPrice,
          quantity: 1,
        }],
      });
    } catch (e) {
      console.warn("[ga] add_to_cart failed:", e);
    }
    // Meta Pixel AddToCart — one event per click (qty increment adds one item).
    pixelTrack("AddToCart", pixelMoney(Number(product.selectedBrand?.price ?? product.price ?? 0), {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      contents: [{ id: product.id, quantity: 1 }],
    }));
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 400);
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const updateQty = useCallback((key: string, newQty: number) => {
    if (newQty <= 0) setCart(prev => prev.filter(i => i._key !== key));
    else setCart(prev => prev.map(i => i._key === key ? { ...i, qty: newQty } : i));
  }, []);

  const removeFromCart = useCallback((key: string) => {
    setCart(prev => {
      // Capture the item BEFORE removing so the GA event has full context.
      const item = prev.find(i => i._key === key) as any;
      if (item) {
        try {
          const brand = item.selectedBrand;
          const unitPrice = Number(brand?.price ?? item.price ?? 0);
          const qty = Number(item.qty ?? 1);
          trackEcommerce("remove_from_cart", {
            currency: "NGN",
            value: unitPrice * qty,
            items: [{
              item_id: String(item.id),
              item_name: item.name,
              item_brand: brand?.label ?? "",
              item_variant: brand?.sku ?? "",
              item_category: item.category ?? "",
              item_category2: item.subcategory ?? "",
              price: unitPrice,
              quantity: qty,
            }],
          });
        } catch (e) {
          console.warn("[ga] remove_from_cart failed:", e);
        }
      }
      return prev.filter(i => i._key !== key);
    });
  }, []);

  const getCartItem = useCallback(
    (productId: string | number, selector?: VariantSelector) => {
      // No selector → preserve the original "any row for this product"
      // behaviour for callers like quiz result cards that don't track
      // brand/size selection.
      if (!selector) return cart.find(i => i.id === productId);
      const wantKey = cartItemKey(
        productId,
        selector.brandId,
        selector.size,
        selector.color,
        selector.variant,
      );
      return cart.find(i => i._key === wantKey);
    },
    [cart],
  );

  const updateVariant = useCallback(
    (
      oldKey: string,
      next: {
        selectedBrand?: any;
        selectedSize?: string | null;
        selectedColor?: string | null;
        selectedVariant?: string | null;
        qty?: number;
        price?: number;
        name?: string;
      },
    ): string | null => {
      let resultKey: string | null = null;
      setCart(prev => {
        const idx = prev.findIndex(i => i._key === oldKey);
        if (idx < 0) return prev;
        const old = prev[idx];
        const merged: any = {
          ...old,
          selectedBrand: next.selectedBrand !== undefined ? next.selectedBrand : old.selectedBrand,
          selectedSize: next.selectedSize !== undefined ? next.selectedSize : old.selectedSize,
          selectedColor: next.selectedColor !== undefined ? next.selectedColor : old.selectedColor,
          selectedVariant: next.selectedVariant !== undefined ? next.selectedVariant : (old as any).selectedVariant,
          price: next.price ?? old.price,
          name: next.name ?? old.name,
          qty: Math.max(1, next.qty ?? old.qty),
        };
        const newKey = cartItemKey(
          merged.id,
          merged.selectedBrand?.id,
          merged.selectedSize,
          merged.selectedColor,
          merged.selectedVariant,
        );
        merged._key = newKey;
        resultKey = newKey;
        // If another row already has the new key, merge quantities into it
        // and drop the original. Otherwise just replace in place.
        const dupIdx = prev.findIndex((i, j) => j !== idx && i._key === newKey);
        if (dupIdx >= 0) {
          const next = prev.slice();
          next[dupIdx] = { ...next[dupIdx], qty: (next[dupIdx].qty || 0) + (merged.qty || 0) };
          next.splice(idx, 1);
          return next;
        }
        const out = prev.slice();
        out[idx] = merged as CartItem;
        return out;
      });
      return resultKey;
    },
    [],
  );

  const saveForLater = useCallback((key: string) => {
    setCart(prev => {
      const item = prev.find(i => i._key === key);
      if (item) {
        setSavedItems(s => [...s, item]);
        trackEvent("cart_updated", { action: "save_for_later", product_name: item.name });
      }
      return prev.filter(i => i._key !== key);
    });
  }, []);

  const moveToCart = useCallback((key: string) => {
    setSavedItems(prev => {
      const item = prev.find(i => i._key === key);
      if (item) setCart(c => [...c, item]);
      return prev.filter(i => i._key !== key);
    });
  }, []);

  const removeSaved = useCallback((key: string) => {
    setSavedItems(prev => prev.filter(i => i._key !== key));
  }, []);

  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  // ── Auto-applied fees ─────────────────────────────────────────────
  // Recompute via the DB RPC whenever the cart changes, debounced 300ms
  // so fast quantity edits don't hammer the DB. The RPC is the single
  // source of truth; on failure computeAutoFees returns a safe no-fee
  // fallback so checkout never breaks.
  const [autoFees, setAutoFees] = useState<AutoFeesResult | null>(null);
  // Serialise the fee-relevant slice so the effect only refires on real
  // changes (id/qty/price), not on unrelated cart-row mutations.
  const feeItemsSig = JSON.stringify(
    cart.map((i) => [String(i.id), i.qty, i.price]),
  );
  useEffect(() => {
    if (cart.length === 0) { setAutoFees(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const items = cart.map((i) => ({
        product_id: String(i.id),
        quantity: i.qty,
        unit_price: i.price,
      }));
      const res = await computeAutoFees(items);
      if (!cancelled) setAutoFees(res);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeItemsSig]);

  return (
    <CartContext.Provider value={{ cart, addToCart, setCart, clearCart, updateQty, removeFromCart, getCartItem, updateVariant, totalItems, subtotal, autoFees, justAdded, savedItems, saveForLater, moveToCart, removeSaved }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export const fmt = (n: number) => `₦${n.toLocaleString()}`;

/**
 * Pretty-print the gender/colour key stored on cart and order_items.
 * Falls back to the raw value if a future option is added that this
 * helper doesn't yet recognise.
 */
export const formatColor = (color: string | null | undefined): string => {
  if (!color) return "";
  if (color === "boy") return "Boy (Blue)";
  if (color === "girl") return "Girl (Pink)";
  if (color === "neutral") return "Neutral (White)";
  return color;
};
export const generateOrderId = () => `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const BRANDS_BY_BUDGET: Record<string, number> = { starter: 0, standard: 1, premium: 2 };

export function getBrandForBudget(product: any, budget: string) {
  const brands = product.brands || [];
  if (brands.length === 0) return { id: "default", label: "Standard", price: 0, img: "📦", tier: 1, color: "#E8F5E9", inStock: true } as any;
  const tierIdx = BRANDS_BY_BUDGET[budget] ?? 1;
  const sorted = [...brands].sort((a: any, b: any) => a.tier - b.tier);
  return sorted.find((b: any) => b.tier === tierIdx)
    || sorted.reduce((best: any, b: any) => Math.abs(b.tier - tierIdx) < Math.abs(best.tier - tierIdx) ? b : best, sorted[0]);
}
