import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: any) => void;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  clearCart: () => void;
  updateQty: (key: string, newQty: number) => void;
  removeFromCart: (key: string) => void;
  getCartItem: (productId: string | number) => CartItem | undefined;
  totalItems: number;
  subtotal: number;
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
      const key = `${product.id}-${product.selectedBrand?.id || "default"}-${product.selectedSize || ""}`;
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

  const getCartItem = useCallback((productId: string | number) => {
    return cart.find(i => i.id === productId);
  }, [cart]);

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

  return (
    <CartContext.Provider value={{ cart, addToCart, setCart, clearCart, updateQty, removeFromCart, getCartItem, totalItems, subtotal, justAdded, savedItems, saveForLater, moveToCart, removeSaved }}>
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
